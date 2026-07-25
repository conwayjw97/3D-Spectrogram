import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { vertexShader, solidFragmentShader, wireFragmentShader } from './shaders.js';
import { audioState } from './audio.js';
import { initUI, syncVisualGuides } from './ui.js';
import { COLOUR_SCHEMES, applyColourScheme } from './colours.js';

// 1. Initialise Scene and Viewport Engine
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
camera.position.set(45, 55, 95);
camera.lookAt(0, 0, 0);

// Hover Visualisation Raycasting Engine variables
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
const tooltip = document.getElementById('spectrogramTooltip');

// State tracking for freezing hover guides
let isHoverFrozen = false;
let pointerDownPos = { x: 0, y: 0 };
let pinnedPos = { x: 0, z: 0, pctX: 0, pctZ: 0 };

// --- Mouse / Pointer Event Listeners ---
window.addEventListener('pointerdown', (event) => {
  pointerDownPos = { x: event.clientX, y: event.clientY };
});

window.addEventListener('pointerup', (event) => {
  const dx = Math.abs(event.clientX - pointerDownPos.x);
  const dy = Math.abs(event.clientY - pointerDownPos.y);

  // Distinguish clicks (<5px move) from camera rotation/dragging
  if (dx < 5 && dy < 5) {
    if (isHoverFrozen) {
      // Unfreeze on click
      isHoverFrozen = false;
      updateTooltip();
    } else if (hoverIndicatorGroup && hoverIndicatorGroup.visible) {
      // Lock onto current position on click
      isHoverFrozen = true;
      updateTooltip();
    }
  }
});

window.addEventListener('mousemove', (event) => {
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

  // Position HTML tooltip near mouse only when unfrozen
  if (!isHoverFrozen && tooltip) {
    tooltip.style.left = (event.clientX + 16) + 'px';
    tooltip.style.top = (event.clientY + 16) + 'px';
  }

  updateTooltip();
});

controls.addEventListener('change', () => {
  updateTooltip();
});

// 2. Spectrogram Fixed Boundary Settings
let timeSamples = 128;
let freqSamples = 128;
const width = 100;
const depth = 100;

let lastTime = performance.now();
let timeAccumulator = 0;
let writeIndex = 0;

let audioData, dataTexture, geometry, solidMesh, wireframeMesh;
let frontLine, frontLineGeometry;
let maxSideLine, maxSideLineGeometry, historyAmplitudes;
let avgSideLine, avgSideLineGeometry, historyAvgAmplitudes;
let backLine, backLineGeometry, peakSpectrum;
let hoverIndicatorGroup, hoverLine, hoverHorizontalLine, hoverDot;
let hoverFreqSprite, hoverDbSpriteLeft, hoverDbSpriteRight;

// Group to hold perimeter lines for central visibility management
const perimeterLinesGroup = new THREE.Group();
scene.add(perimeterLinesGroup);

// 3. Reusable Visualiser Element Lifecycle Setup

// --- Dynamic Sprite Helper Functions ---
function createDynamicLabelSprite(customWidth = 128, customHeight = 32) {
  const canvas = document.createElement('canvas');
  canvas.width = customWidth;
  canvas.height = customHeight;
  const ctx = canvas.getContext('2d');
  
  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(spriteMaterial);
  sprite.scale.set(customWidth / 12.8, customHeight / 12.8, 1);
  
  return { sprite, canvas, ctx, texture };
}

function updateSpriteText(labelObj, text) {
  const { ctx, canvas, texture } = labelObj;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'Bold 16px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  texture.needsUpdate = true;
}

function setupVisualiserElements() {
  perimeterLinesGroup.clear();

  if (solidMesh) {
    scene.remove(solidMesh);
    if (solidMesh.material) solidMesh.material.dispose();
  }
  if (wireframeMesh) {
    scene.remove(wireframeMesh);
    if (wireframeMesh.material) wireframeMesh.material.dispose();
  }
  if (frontLine && frontLine.material) frontLine.material.dispose();
  if (maxSideLine && maxSideLine.material) maxSideLine.material.dispose();
  if (avgSideLine && avgSideLine.material) avgSideLine.material.dispose();
  if (backLine && backLine.material) backLine.material.dispose();

  // Clean up existing hover elements and dynamic textures
  if (hoverIndicatorGroup) {
    scene.remove(hoverIndicatorGroup);
    if (hoverLine && hoverLine.material) hoverLine.material.dispose();
    if (hoverHorizontalLine && hoverHorizontalLine.material) hoverHorizontalLine.material.dispose();
    if (hoverDot && hoverDot.material) hoverDot.material.dispose();
    if (hoverFreqSprite) hoverFreqSprite.texture.dispose();
    if (hoverDbSpriteLeft) hoverDbSpriteLeft.texture.dispose();
    if (hoverDbSpriteRight) hoverDbSpriteRight.texture.dispose();
  }

  if (geometry) geometry.dispose();
  if (dataTexture) dataTexture.dispose();
  if (frontLineGeometry) frontLineGeometry.dispose();
  if (maxSideLineGeometry) maxSideLineGeometry.dispose();
  if (avgSideLineGeometry) avgSideLineGeometry.dispose();
  if (backLineGeometry) backLineGeometry.dispose();
  if (hoverLine && hoverLine.geometry) hoverLine.geometry.dispose();
  if (hoverHorizontalLine && hoverHorizontalLine.geometry) hoverHorizontalLine.geometry.dispose();
  if (hoverDot && hoverDot.geometry) hoverDot.geometry.dispose();

  writeIndex = 0;

  const size = timeSamples * freqSamples;
  audioData = new Uint8Array(4 * size);
  
  dataTexture = new THREE.DataTexture(audioData, freqSamples, timeSamples, THREE.RGBAFormat);
  dataTexture.minFilter = THREE.LinearFilter;
  dataTexture.magFilter = THREE.LinearFilter;
  dataTexture.wrapS = THREE.ClampToEdgeWrapping;
  dataTexture.wrapT = THREE.ClampToEdgeWrapping;
  dataTexture.needsUpdate = true;

  geometry = new THREE.PlaneGeometry(width, depth, freqSamples - 1, timeSamples - 1);
  geometry.rotateX(-Math.PI / 2);

  const activeScheme = COLOUR_SCHEMES[audioState.colorScheme] || COLOUR_SCHEMES.standard;

  const shaderUniforms = {
    u_audioTexture: { value: dataTexture },
    u_writeIndex: { value: 0.0 },
    u_timeSamples: { value: timeSamples },
    u_colorBase: { value: activeScheme.base.clone() },
    u_colorLow:  { value: activeScheme.low.clone() },
    u_colorMid:  { value: activeScheme.mid.clone() },
    u_colorHigh: { value: activeScheme.high.clone() }
  };

  solidMesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(shaderUniforms),
    vertexShader,
    fragmentShader: solidFragmentShader,
    side: THREE.DoubleSide,
    polygonOffset: true, 
    polygonOffsetFactor: 1, 
    polygonOffsetUnits: 1
  }));
  solidMesh.material.uniforms.u_audioTexture.value = dataTexture;
  scene.add(solidMesh);

  // Perimeter Lines
  frontLineGeometry = new THREE.BufferGeometry();
  const frontLinePositions = new Float32Array(freqSamples * 3);
  for (let i = 0; i < freqSamples; i++) {
    frontLinePositions[i * 3] = -width / 2 + (i / (freqSamples - 1)) * width;
    frontLinePositions[i * 3 + 1] = 0;
    frontLinePositions[i * 3 + 2] = depth / 2 + 0.1;
  }
  frontLineGeometry.setAttribute('position', new THREE.BufferAttribute(frontLinePositions, 3));
  frontLine = new THREE.Line(frontLineGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1 }));
  perimeterLinesGroup.add(frontLine);

  maxSideLineGeometry = new THREE.BufferGeometry();
  const maxSideLinePositions = new Float32Array(timeSamples * 3);
  historyAmplitudes = new Float32Array(timeSamples);
  for (let i = 0; i < timeSamples; i++) {
    maxSideLinePositions[i * 3] = -width / 2 - 0.2;
    maxSideLinePositions[i * 3 + 1] = 0;
    maxSideLinePositions[i * 3 + 2] = depth / 2 - (i / (timeSamples - 1)) * depth;
  }
  maxSideLineGeometry.setAttribute('position', new THREE.BufferAttribute(maxSideLinePositions, 3));
  maxSideLine = new THREE.Line(maxSideLineGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1 }));
  perimeterLinesGroup.add(maxSideLine);

  avgSideLineGeometry = new THREE.BufferGeometry();
  const avgSideLinePositions = new Float32Array(timeSamples * 3);
  historyAvgAmplitudes = new Float32Array(timeSamples);
  for (let i = 0; i < timeSamples; i++) {
    avgSideLinePositions[i * 3] = width / 2 + 0.2;
    avgSideLinePositions[i * 3 + 1] = 0;
    avgSideLinePositions[i * 3 + 2] = depth / 2 - (i / (timeSamples - 1)) * depth;
  }
  avgSideLineGeometry.setAttribute('position', new THREE.BufferAttribute(avgSideLinePositions, 3));
  avgSideLine = new THREE.Line(avgSideLineGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1 }));
  perimeterLinesGroup.add(avgSideLine);

  backLineGeometry = new THREE.BufferGeometry();
  const backLinePositions = new Float32Array(freqSamples * 3);
  peakSpectrum = new Float32Array(freqSamples);
  for (let i = 0; i < freqSamples; i++) {
    backLinePositions[i * 3] = -width / 2 + (i / (freqSamples - 1)) * width;
    backLinePositions[i * 3 + 1] = 0;
    backLinePositions[i * 3 + 2] = -depth / 2 - 0.2;
  }
  backLineGeometry.setAttribute('position', new THREE.BufferAttribute(backLinePositions, 3));
  backLine = new THREE.Line(backLineGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1 }));
  perimeterLinesGroup.add(backLine);

  const wireOpacity = Math.max(0.03, 0.6 * (128 / freqSamples));

  wireframeMesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    uniforms: {
      u_audioTexture: { value: dataTexture },
      u_writeIndex: { value: 0.0 },
      u_opacity: { value: wireOpacity },
      u_timeSamples: { value: timeSamples }
    },
    vertexShader, 
    fragmentShader: wireFragmentShader,
    wireframe: true, side: THREE.DoubleSide, transparent: true
  }));
  wireframeMesh.material.uniforms.u_audioTexture.value = dataTexture;
  wireframeMesh.visible = audioState.showWireframe;
  scene.add(wireframeMesh);

  // --- Initialize Refactored Hover Indicators ---
  hoverIndicatorGroup = new THREE.Group();

  // 1. Vertical Line (extends floor Y=0 to far ceiling Y=25)
  const vertGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  hoverLine = new THREE.Line(vertGeom, new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));

  // 2. Horizontal Line (extends across X-axis between timeWindow sides)
  const horizGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  hoverHorizontalLine = new THREE.Line(horizGeom, new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false }));

  // 3. Peak Dot
  hoverDot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false }));

  // 4. Dynamic Label Sprites at Touch Points
  hoverFreqSprite = createDynamicLabelSprite(128, 32);
  hoverDbSpriteLeft = createDynamicLabelSprite(128, 32);
  hoverDbSpriteRight = createDynamicLabelSprite(128, 32);

  hoverIndicatorGroup.add(hoverLine);
  hoverIndicatorGroup.add(hoverHorizontalLine);
  hoverIndicatorGroup.add(hoverDot);
  hoverIndicatorGroup.add(hoverFreqSprite.sprite);
  hoverIndicatorGroup.add(hoverDbSpriteLeft.sprite);
  hoverIndicatorGroup.add(hoverDbSpriteRight.sprite);

  hoverIndicatorGroup.visible = false;
  hoverIndicatorGroup.renderOrder = 999;
  scene.add(hoverIndicatorGroup);

  syncVisualGuides();
}

setupVisualiserElements();

// 4. Draw Fixed Blueprint Structural Guides
const boxLinesGroup = new THREE.Group();
const topLinesGroup = new THREE.Group();
scene.add(boxLinesGroup);
scene.add(topLinesGroup);

function createAxisLine(start, end, targetGroup) {
  const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...start), new THREE.Vector3(...end)]);
  const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1 }));
  targetGroup.add(line);
}

// Complete Blueprint Box Framing (Base & Vertical Corner Posts)
createAxisLine([-width / 2, 0,  depth / 2], [ width / 2, 0,  depth / 2], boxLinesGroup);
createAxisLine([-width / 2, 0,  depth / 2], [-width / 2, 25,  depth / 2], boxLinesGroup);
createAxisLine([-width / 2, 0, -depth / 2], [-width / 2, 0,  depth / 2], boxLinesGroup);
createAxisLine([ width / 2, 0,  depth / 2], [ width / 2, 0, -depth / 2], boxLinesGroup);
createAxisLine([ width / 2, 0, -depth / 2], [-width / 2, 0, -depth / 2], boxLinesGroup);
createAxisLine([-width / 2, 0, -depth / 2], [-width / 2, 25, -depth / 2], boxLinesGroup);
createAxisLine([ width / 2, 0, -depth / 2], [ width / 2, 25, -depth / 2], boxLinesGroup);
createAxisLine([ width / 2, 0,  depth / 2], [ width / 2, 25,  depth / 2], boxLinesGroup);

// Upper Structural Bounds (Ceiling)
createAxisLine([-width / 2, 25,  depth / 2], [ width / 2, 25,  depth / 2], topLinesGroup);
createAxisLine([ width / 2, 25,  depth / 2], [ width / 2, 25, -depth / 2], topLinesGroup);
createAxisLine([ width / 2, 25, -depth / 2], [-width / 2, 25, -depth / 2], topLinesGroup);
createAxisLine([-width / 2, 25, -depth / 2], [-width / 2, 25,  depth / 2], topLinesGroup);

// 5. Initialise User Controls & Precision Listener
initUI(
  scene,
  { width, depth, freqSamples, timeSamples },
  { boxLinesGroup, topLinesGroup, perimeterLinesGroup }
);

const precisionSlider = document.getElementById('precisionSlider');
const precisionLabel = document.getElementById('precisionLabel');

precisionSlider.addEventListener('input', (e) => {
  const val = e.target.value;
  precisionLabel.textContent = `Mesh Precision: ${val}x${val}`;
});

precisionSlider.addEventListener('change', (e) => {
  const val = parseInt(e.target.value);
  
  // Frequency samples can be as high as desired for horizontal precision
  freqSamples = val; 
  
  // Time samples must be capped at 60 frames per second to match the render loop
  const maxTimeSamples = Math.floor(audioState.timeWindow * 60);
  timeSamples = Math.min(val, maxTimeSamples);
  
  setupVisualiserElements();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Dedicated Raycasting Calculation Engine
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const intersectionPoint = new THREE.Vector3();

// Optional helper to style indicator when pinned vs active
function updateTooltipVisuals() {
  if (isHoverFrozen) {
    hoverDot.material.color.setHex(0xffcc00); // Yellow dot when frozen
    if (tooltip && !tooltip.innerHTML.includes('📌 [PINNED]')) {
      tooltip.innerHTML = `<div style="color: #ffcc00; font-weight: bold; margin-bottom: 2px;">📌 [PINNED]</div>` + tooltip.innerHTML;
    }
  } else {
    hoverDot.material.color.setHex(0xffffff); // Standard white dot
  }
}

// --- Dynamic Raycasting & Real-time Update Loop ---
function updateTooltip() {
  if (!tooltip) return;

  let x, z, pctX, pctZ;
  let isValid = false;

  if (isHoverFrozen) {
    // 1. Lock horizontal position to pinned coordinates
    x = pinnedPos.x;
    z = pinnedPos.z;
    pctX = pinnedPos.pctX;
    pctZ = pinnedPos.pctZ;
    isValid = true;
  } else if (solidMesh && solidMesh.visible) {
    // 2. Otherwise raycast to track mouse position
    raycaster.setFromCamera(mouse, camera);
    const hit = raycaster.ray.intersectPlane(floorPlane, intersectionPoint);

    if (hit && Math.abs(intersectionPoint.x) <= width / 2 && Math.abs(intersectionPoint.z) <= depth / 2) {
      x = intersectionPoint.x;
      z = intersectionPoint.z;
      pctX = Math.max(0, Math.min(1, (x + width / 2) / width));
      pctZ = Math.max(0, Math.min(1, (depth / 2 - z) / depth));

      // Save valid position in case user clicks to pin
      pinnedPos = { x, z, pctX, pctZ };
      isValid = true;
    }
  }

  if (isValid) {
    // Read audio data at (X, Z) — CONTINUOUSLY RUNS IN REAL TIME EVEN WHEN PINNED
    const freqIndex = Math.floor(pctX * (freqSamples - 1));
    const timeIndex = Math.floor(pctZ * (timeSamples - 1));
    const dataIndex = (timeIndex * freqSamples + freqIndex) * 4;

    const byteValue = audioData ? audioData[dataIndex] : 0;
    const peakY = (byteValue / 255.0) * 25.0;

    // Update Vertical Line (X, Z stay fixed, Y spans floor to ceiling)
    const vertPositions = hoverLine.geometry.attributes.position.array;
    vertPositions[0] = x; vertPositions[1] = 0;  vertPositions[2] = z;
    vertPositions[3] = x; vertPositions[4] = 25; vertPositions[5] = z;
    hoverLine.geometry.attributes.position.needsUpdate = true;

    // Update Horizontal Line (Spans X-axis at dynamic peakY height)
    const horizPositions = hoverHorizontalLine.geometry.attributes.position.array;
    horizPositions[0] = -width / 2; horizPositions[1] = peakY; horizPositions[2] = z;
    horizPositions[3] =  width / 2; horizPositions[4] = peakY; horizPositions[5] = z;
    hoverHorizontalLine.geometry.attributes.position.needsUpdate = true;

    // Hover Dot position & color (Yellow when pinned, White when active)
    hoverDot.position.set(x, peakY, z);
    hoverDot.material.color.setHex(isHoverFrozen ? 0xffcc00 : 0xffffff);

    // Audio Value Calculations
    const minF = audioState.minFrequency || 0;
    const maxF = audioState.targetFrequency || 10000;
    const frequencyHz = minF + pctX * (maxF - minF);
    const timeOffsetSec = pctZ * audioState.timeWindow;

    const dbMin = audioState.analyser ? audioState.analyser.minDecibels : -100;
    const dbMax = audioState.analyser ? audioState.analyser.maxDecibels : -30;
    const currentDb = dbMin + (byteValue / 255.0) * (dbMax - dbMin);

    const freqText = frequencyHz < 1000 ? `${Math.round(frequencyHz)} Hz` : `${(frequencyHz / 1000).toFixed(2)} kHz`;
    const timeText = pctZ < 0.01 ? "Now" : `-${timeOffsetSec.toFixed(2)}s`;
    const dbText = `${Math.round(currentDb)} dB`;

    // Position & Render 3D Touch Point Sprites
    hoverFreqSprite.sprite.position.set(x, 26, z);
    updateSpriteText(hoverFreqSprite, freqText);

    // Side dB labels dynamically move up/down with peakY
    hoverDbSpriteLeft.sprite.position.set(-width / 2 - 5, peakY, z);
    updateSpriteText(hoverDbSpriteLeft, dbText);

    hoverDbSpriteRight.sprite.position.set(width / 2 + 5, peakY, z);
    updateSpriteText(hoverDbSpriteRight, dbText);

    hoverIndicatorGroup.visible = true;

    // Update HTML Tooltip dynamically every frame
    tooltip.style.display = 'block';
    const pinnedHeader = isHoverFrozen ? `<div style="color: #ffcc00; font-weight: bold; margin-bottom: 2px;">📌 [PINNED]</div>` : '';
    tooltip.innerHTML = `
      ${pinnedHeader}
      <strong>Freq:</strong> ${freqText}<br/>
      <strong>Time:</strong> ${timeText}<br/>
      <strong>Volume:</strong> ${dbText}
    `;
  } else {
    tooltip.style.display = 'none';
    hoverIndicatorGroup.visible = false;
  }
}

// 6. Dynamic Frame Render Engine Loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  if (wireframeMesh) {
    wireframeMesh.visible = audioState.showWireframe;
  }

  if (solidMesh) {
    applyColourScheme(solidMesh.material, audioState.colorScheme);
  }

  if (audioState.isRecording && audioState.analyser) {
    audioState.analyser.getByteFrequencyData(audioState.dataArray);

    const minIndex = Math.floor((audioState.minFrequency / audioState.context.sampleRate) * audioState.analyser.fftSize);
    const maxIndex = Math.floor((audioState.targetFrequency / audioState.context.sampleRate) * audioState.analyser.fftSize);
    const indexRange = Math.max(1, maxIndex - minIndex);

    const currentFrameData = new Float32Array(freqSamples);
    let currentFramePeak = 0;
    let currentFrameSum = 0;
    const linePositions = frontLineGeometry.attributes.position.array;

    for (let i = 0; i < freqSamples; i++) {
      const continuousIndex = minIndex + (i / (freqSamples - 1)) * indexRange;
      const indexLow = Math.floor(continuousIndex);
      const indexHigh = Math.min(indexLow + 1, audioState.dataArray.length - 1);
      const weight = continuousIndex - indexLow;
      
      const val = audioState.dataArray[indexLow] * (1.0 - weight) + audioState.dataArray[indexHigh] * weight;
      
      currentFrameData[i] = val;
      if (val > currentFramePeak) currentFramePeak = val;
      currentFrameSum += val;
      
      linePositions[i * 3 + 1] = (val / 255.0) * 25.0;
    }
    const currentFrameAvg = currentFrameSum / freqSamples;
    frontLineGeometry.attributes.position.needsUpdate = true;

    const now = performance.now();
    const targetInterval = (audioState.timeWindow * 1000) / timeSamples;
        
    // Use an 'if' statement instead of 'while' to prevent multiple writes per frame
    if (now - lastTime >= targetInterval) {
      // Increment by targetInterval to maintain consistent timing
      lastTime += targetInterval;
      
      // Prevent the timer from falling infinitely behind if the browser tab is minimised
      if (now - lastTime > 100) {
        lastTime = now;
      }

      const rowSize = freqSamples * 4;
      audioData.copyWithin(rowSize, 0, audioData.length - rowSize);

      for (let i = timeSamples - 1; i > 0; i--) {
        historyAmplitudes[i] = historyAmplitudes[i - 1];
        historyAvgAmplitudes[i] = historyAvgAmplitudes[i - 1];
      }

      for (let i = 0; i < freqSamples; i++) {
        const val = currentFrameData[i];
        const index = i * 4;
        audioData[index]     = val;
        audioData[index + 1] = val;
        audioData[index + 2] = val;
        audioData[index + 3] = 255;
      }

      historyAmplitudes[0] = (currentFramePeak / 255.0) * 25.0;
      historyAvgAmplitudes[0] = (currentFrameAvg / 255.0) * 25.0;

      for (let j = 0; j < freqSamples; j++) {
        let maxBinVal = 0;
        for (let i = 0; i < timeSamples; i++) {
          const checkOffset = i * freqSamples * 4;
          const val = audioData[checkOffset + j * 4];
          if (val > maxBinVal) maxBinVal = val;
        }
        peakSpectrum[j] = (maxBinVal / 255.0) * 25.0;
      }

      solidMesh.material.uniforms.u_writeIndex.value = 0.0;
      wireframeMesh.material.uniforms.u_writeIndex.value = 0.0;
      dataTexture.needsUpdate = true;
    }

    const maxSidePositions = maxSideLineGeometry.attributes.position.array;
    const avgSidePositions = avgSideLineGeometry.attributes.position.array;
    const backPositions = backLineGeometry.attributes.position.array;

    for (let i = 0; i < timeSamples; i++) {
      maxSidePositions[i * 3 + 1] = historyAmplitudes[i];
      avgSidePositions[i * 3 + 1] = historyAvgAmplitudes[i];
    }
    for (let i = 0; i < freqSamples; i++) {
      backPositions[i * 3 + 1] = peakSpectrum[i];
    }

    maxSideLineGeometry.attributes.position.needsUpdate = true;
    avgSideLineGeometry.attributes.position.needsUpdate = true;
    backLineGeometry.attributes.position.needsUpdate = true;
  }

  updateTooltip();
  renderer.render(scene, camera);
}

animate();