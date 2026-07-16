import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { vertexShader, fragmentShader } from './shaders.js';
import { audioState } from './audio.js';
import { initUI } from './ui.js';

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

// 2. Spectrogram Layout Settings
const timeSamples = 128;
const freqSamples = 128;
const width = 100;
const depth = 100;

// 3. Setup Audio Allocation Texture Maps
const size = timeSamples * freqSamples;
const audioData = new Uint8Array(4 * size);
const dataTexture = new THREE.DataTexture(audioData, freqSamples, timeSamples, THREE.RGBAFormat);
dataTexture.needsUpdate = true;

// 4. Assemble Main Mesh Terrain Geometry
const geometry = new THREE.PlaneGeometry(width, depth, freqSamples - 1, timeSamples - 1);
geometry.rotateX(-Math.PI / 2);

// Material A: The solid surface carrying your VU-meter gradient shader
const solidMaterial = new THREE.ShaderMaterial({
  uniforms: { u_audioTexture: { value: dataTexture } },
  vertexShader,
  fragmentShader, // Uses your dynamic colour gradient logic
  wireframe: false,
  side: THREE.DoubleSide,
  
  // Enable polygon offset to push the solid faces back and prevent z-fighting
  polygonOffset: true,
  polygonOffsetFactor: 1,
  polygonOffsetUnits: 1
});

const solidMesh = new THREE.Mesh(geometry, solidMaterial);
scene.add(solidMesh);

// Material B: The wireframe overlay using the same deformation logic
const wireframeMaterial = new THREE.ShaderMaterial({
  uniforms: { u_audioTexture: { value: dataTexture } },
  vertexShader, // Must use the same vertex shader to deform identically
  
  // Using a custom inline fragment shader for high-contrast dark grid lines
  fragmentShader: `
    void main() {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.6); // Sharp, semi-transparent black grid
    }
  `,
  wireframe: true,
  side: THREE.DoubleSide,
  transparent: true
});

const wireframeMesh = new THREE.Mesh(geometry, wireframeMaterial);
scene.add(wireframeMesh);

// 5. Construct Live Analysis Edge Lines
const frontLineGeometry = new THREE.BufferGeometry();
const frontLinePositions = new Float32Array(freqSamples * 3);
for (let i = 0; i < freqSamples; i++) {
  frontLinePositions[i * 3] = -width / 2 + (i / (freqSamples - 1)) * width;
  frontLinePositions[i * 3 + 1] = 0;
  frontLinePositions[i * 3 + 2] = depth / 2 + 0.1;
}
frontLineGeometry.setAttribute('position', new THREE.BufferAttribute(frontLinePositions, 3));
const frontLine = new THREE.Line(frontLineGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 10 }));
scene.add(frontLine);

const sideLineGeometry = new THREE.BufferGeometry();
const sideLinePositions = new Float32Array(timeSamples * 3);
const historyAmplitudes = new Float32Array(timeSamples);
for (let i = 0; i < timeSamples; i++) {
  sideLinePositions[i * 3] = -width / 2 - 0.2;
  sideLinePositions[i * 3 + 1] = 0;
  sideLinePositions[i * 3 + 2] = depth / 2 - (i / (timeSamples - 1)) * depth;
}
sideLineGeometry.setAttribute('position', new THREE.BufferAttribute(sideLinePositions, 3));
const sideLine = new THREE.Line(sideLineGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 10 }));
scene.add(sideLine);

// 6. Draw Baseline Structural Guide Frames
function createAxisLine(start, end) {
  const lineGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...start), new THREE.Vector3(...end)]);
  scene.add(new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color: 0xffffff })));
}
createAxisLine([-width / 2, 0.1, depth / 2], [width / 2, 0.1, depth / 2]);
createAxisLine([-width / 2, 0, depth / 2], [-width / 2, 25, depth / 2]);
createAxisLine([-width / 2, 0.1, depth / 2], [-width / 2, 0.1, -depth / 2]);

// 7. Initialise User Interface and Pass Dimensions
initUI(scene, { width, depth, freqSamples, timeSamples });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 8. Core Animation Loop Execution
function animate() {
  requestAnimationFrame(animate);
  controls.update();

  if (audioState.isRecording && audioState.analyser) {
    audioState.analyser.getByteFrequencyData(audioState.dataArray);
    const maxIndex = Math.floor((audioState.targetFrequency / audioState.context.sampleRate) * audioState.analyser.fftSize);

    // Roll historical lines down texture frames
    for (let i = timeSamples - 1; i > 0; i--) {
      const rowOffset = i * freqSamples * 4;
      const prevRowOffset = (i - 1) * freqSamples * 4;
      for (let j = 0; j < freqSamples * 4; j++) {
        audioData[rowOffset + j] = audioData[prevRowOffset + j];
      }
    }

    for (let i = timeSamples - 1; i > 0; i--) {
      historyAmplitudes[i] = historyAmplitudes[i - 1];
    }

    let peakAmplitude = 0;
    const linePositions = frontLineGeometry.attributes.position.array;

    for (let i = 0; i < freqSamples; i++) {
      const mappedIndex = Math.min(Math.floor((i / (freqSamples - 1)) * maxIndex), audioState.dataArray.length - 1);
      const val = audioState.dataArray[mappedIndex]; 
      if (val > peakAmplitude) peakAmplitude = val;
      
      const index = i * 4;
      audioData[index] = val;
      audioData[index + 1] = val;
      audioData[index + 2] = val;
      audioData[index + 3] = 255;

      linePositions[i * 3 + 1] = (val / 255.0) * 25.0;
    }

    historyAmplitudes[0] = (peakAmplitude / 255.0) * 25.0;
    const sidePositions = sideLineGeometry.attributes.position.array;
    for (let i = 0; i < timeSamples; i++) {
      sidePositions[i * 3 + 1] = historyAmplitudes[i];
    }
    
    dataTexture.needsUpdate = true;
    frontLineGeometry.attributes.position.needsUpdate = true;
    sideLineGeometry.attributes.position.needsUpdate = true;
  }

  renderer.render(scene, camera);
}

// Boot frame system execution loop
animate();