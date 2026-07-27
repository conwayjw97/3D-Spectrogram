import * as THREE from 'three';
import { audioState, startAudio, stopAudio } from './audio.js';

let labelSprites = [];
let perimeterLabelSprites = []; // Separate array for perimeter line labels
let currentScene = null;
let uiConfig = { width: 100, depth: 100 };
let runtimeLineGroups = {};

function createLabelSprite(text, x, y, z, customWidth = 128, customHeight = 32) {
  const canvas = document.createElement('canvas');
  canvas.width = customWidth; 
  canvas.height = customHeight;
  const ctx = canvas.getContext('2d');
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = 'Bold 16px Arial'; 
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center'; 
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(spriteMaterial);
  
  sprite.position.set(x, y, z);
  sprite.scale.set(customWidth / 12.8, customHeight / 12.8, 1);
  return sprite;
}

// Exported function to allow app.js to control perimeter label visibility
export function setPerimeterLabelsVisible(visible) {
  perimeterLabelSprites.forEach(sprite => {
    sprite.visible = visible;
  });
}

// Consolidated Visibility Synchronisation Logic 
export function syncVisualGuides() {
  const { axisLinesGroup, boxLinesGroup, topLinesGroup, perimeterLinesGroup } = runtimeLineGroups;

  if (audioState.disableAllLinesLabels) {
    // Hide all guides, perimeter lines, and labels when disabled
    if (axisLinesGroup) axisLinesGroup.visible = false;
    if (boxLinesGroup) boxLinesGroup.visible = false;
    if (topLinesGroup) topLinesGroup.visible = false;
    if (perimeterLinesGroup) perimeterLinesGroup.visible = false;
    
    labelSprites.forEach(sprite => sprite.visible = false);
    perimeterLabelSprites.forEach(sprite => sprite.visible = false);
  } else if (audioState.axisLinesOnly) {
    // Restrict display strictly to core structural axes & perimeter
    if (axisLinesGroup) axisLinesGroup.visible = true;
    if (boxLinesGroup) boxLinesGroup.visible = false;
    if (topLinesGroup) topLinesGroup.visible = false;
    if (perimeterLinesGroup) perimeterLinesGroup.visible = true;

    labelSprites.forEach(sprite => sprite.visible = true);
    perimeterLabelSprites.forEach(sprite => sprite.visible = true);
  } else {
    // Standard modes (blueprint, ceiling)
    if (axisLinesGroup) axisLinesGroup.visible = true;
    if (boxLinesGroup) boxLinesGroup.visible = audioState.showBlueprintLines;
    if (topLinesGroup) topLinesGroup.visible = audioState.showBlueprintLines && audioState.showTopLines;
    if (perimeterLinesGroup) perimeterLinesGroup.visible = true;

    labelSprites.forEach(sprite => sprite.visible = true);
    perimeterLabelSprites.forEach(sprite => sprite.visible = true);
  }
}

export function generateAllAxisLabels() {
  if (!currentScene) return;

  // Clear existing label sprites from scene
  labelSprites.forEach(sprite => currentScene.remove(sprite));
  labelSprites = [];

  // Extract dimensions from module-scoped uiConfig
  const width = uiConfig.width || 100;
  const depth = uiConfig.depth || 100;

  // 1. Generate X-Axis Frequency Labels (Linear vs Logarithmic)
  const numXLabels = 8;
  const minF = audioState.frequencyScale === 'logarithmic' 
    ? Math.max(20, audioState.minFrequency || 0) 
    : (audioState.minFrequency || 0);
  const maxF = audioState.targetFrequency || 10000;

  for (let i = 0; i < numXLabels; i++) {
    let freq;
    const norm = i / (numXLabels - 1);

    if (audioState.frequencyScale === 'logarithmic') {
      freq = minF * Math.pow(maxF / minF, norm);
    } else {
      freq = minF + norm * (maxF - minF);
    }

    const text = freq < 1000 ? `${Math.round(freq)} Hz` : `${(freq / 1000).toFixed(1)} kHz`;
    const x = -width / 2 + norm * width;

    const spriteFront = createLabelSprite(text, x, 1.5, depth / 2 + 5, 128, 32);
    currentScene.add(spriteFront);
    labelSprites.push(spriteFront);

    const spriteBack = createLabelSprite(text, x, 1.5, -depth / 2 - 5, 128, 32);
    currentScene.add(spriteBack);
    labelSprites.push(spriteBack);
  }

  // 2. Amplitude Labels (Y-Axis)
  const minDb = audioState.analyser ? audioState.analyser.minDecibels : -100;
  const maxDb = audioState.analyser ? audioState.analyser.maxDecibels : -30;
  const dbRange = maxDb - minDb;

  for (let i = 0; i < 5; i++) {
    const fraction = i / 4;
    const text = `${Math.round(minDb + fraction * dbRange)} dB`;
    const y = fraction * 25; 
    
    const spriteLeftFront = createLabelSprite(text, -width / 2 - 8, y, depth / 2 + 1, 128, 32);
    currentScene.add(spriteLeftFront); 
    labelSprites.push(spriteLeftFront);

    const spriteRightBack = createLabelSprite(text, width / 2 + 8, y, -depth / 2 - 1, 128, 32);
    currentScene.add(spriteRightBack); 
    labelSprites.push(spriteRightBack);
  }

  // 3. Timeline Labels (Z-Axis)
  const totalSeconds = audioState.timeWindow || 5;
  for (let i = 0; i < 5; i++) {
    const fraction = i / 4;
    const text = fraction === 0 ? 'Now' : `-${(fraction * totalSeconds).toFixed(1)}s`;
    const z = depth / 2 - fraction * depth;
    
    const spriteLeftTimeline = createLabelSprite(text, -width / 2 - 4, 1.5, z, 128, 32);
    currentScene.add(spriteLeftTimeline); 
    labelSprites.push(spriteLeftTimeline);

    const spriteRightTimeline = createLabelSprite(text, width / 2 + 4, 1.5, z, 128, 32);
    currentScene.add(spriteRightTimeline); 
    labelSprites.push(spriteRightTimeline);
  }

  // 4. Perimeter Explanatory Labels
  const currentSpecLabel = createLabelSprite('Current Spectrogram', 0, 1.5, depth / 2 + 10, 256, 32);
  currentScene.add(currentSpecLabel);
  perimeterLabelSprites.push(currentSpecLabel);

  const maxSpecLabel = createLabelSprite('Max Spectrogram (Peak Hold)', 0, 1.5, -depth / 2 - 10, 256, 32);
  currentScene.add(maxSpecLabel);
  perimeterLabelSprites.push(maxSpecLabel);

  const zSpecLabel = createLabelSprite('Max Amplitude', -width / 2 - 14, 1.5, 0, 256, 32);
  currentScene.add(zSpecLabel);
  perimeterLabelSprites.push(zSpecLabel);

  const zAverageSpecLabel = createLabelSprite('Average Amplitude', width / 2 + 14, 1.5, 0, 256, 32);
  currentScene.add(zAverageSpecLabel);
  perimeterLabelSprites.push(zAverageSpecLabel);

  // Re-apply visibility checks onto elements following recalculations
  syncVisualGuides();
}

export function initUI(scene, config, lineGroups = {}) {
  currentScene = scene;
  uiConfig = config;
  runtimeLineGroups = lineGroups;

  const startButton = document.getElementById('startButton');
  const sourceSelect = document.getElementById('sourceSelect');
  const minFreqSlider = document.getElementById('minFreqSlider');
  const minFreqLabel = document.getElementById('minFreqLabel');
  const freqSlider = document.getElementById('freqSlider');
  const sliderLabel = document.getElementById('sliderLabel');
  const timeSlider = document.getElementById('timeSlider');
  const timeLabel = document.getElementById('timeLabel');
  const wireframeToggle = document.getElementById('wireframeToggle');
  const visualisationSelect = document.getElementById('visualisationSelect');
  const colorSchemeSelect = document.getElementById('colorSchemeSelect');
  const freqScaleSelect = document.getElementById('freqScaleSelect');

  if (freqScaleSelect) {
    // Sync the dropdown with the current default state on startup
    freqScaleSelect.value = audioState.frequencyScale || 'logarithmic';

    freqScaleSelect.addEventListener('change', (e) => {
      audioState.frequencyScale = e.target.value;
      
      // Regenerate axis labels so the X-axis markings reflect the scale change
      generateAllAxisLabels();
    });
  }

  sourceSelect.value = audioState.sourceType || 'mic';

  if (visualisationSelect) {
    if (audioState.disableAllLinesLabels) visualisationSelect.value = 'none';
    else if (audioState.axisLinesOnly) visualisationSelect.value = 'axis';
    else if (audioState.showBlueprintLines && audioState.showTopLines) visualisationSelect.value = 'ceiling';
    else visualisationSelect.value = 'ceiling';
  }

  if (colorSchemeSelect) {
    const schemeMapping = ['standard', 'synthwave', 'glacier', 'magma', 'cyberpunk'];
    colorSchemeSelect.value = schemeMapping[audioState.colorScheme] || 'standard';
  }

  startButton.addEventListener('click', () => {
    if (!audioState.isRecording) {
      startButton.textContent = 'Stop';
      startAudio(() => generateAllAxisLabels());
    } else {
      startButton.textContent = 'Start';
      stopAudio();
    }
  });

  sourceSelect.addEventListener('change', (e) => {
    const wasRecording = audioState.isRecording;
    if (wasRecording) {
      stopAudio();
      startButton.textContent = 'Start';
    }
    audioState.sourceType = e.target.value;
  });

  minFreqSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    audioState.minFrequency = val;
    minFreqLabel.textContent = val < 1000 ? `Min Frequency: ${val} Hz` : `Min Frequency: ${(val / 1000).toFixed(1)} kHz`;
    freqSlider.min = val + 1000;

    const currentMaxVal = parseInt(freqSlider.value);
    if (audioState.targetFrequency !== currentMaxVal) {
      audioState.targetFrequency = currentMaxVal;
      sliderLabel.textContent = `Max Frequency: ${(currentMaxVal / 1000).toFixed(1)} kHz`;
    }

    if (audioState.context && audioState.analyser) {
      generateAllAxisLabels();
    }
  });

  freqSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    audioState.targetFrequency = val;
    sliderLabel.textContent = `Max Frequency: ${(val / 1000).toFixed(1)} kHz`;
    minFreqSlider.max = val - 1000;

    const currentMinVal = parseInt(minFreqSlider.value);
    if (audioState.minFrequency !== currentMinVal) {
      audioState.minFrequency = currentMinVal;
      minFreqLabel.textContent = currentMinVal < 1000 ? `Min Frequency: ${currentMinVal} Hz` : `Min Frequency: ${(currentMinVal / 1000).toFixed(1)} kHz`;
    }

    if (audioState.context && audioState.analyser) {
      generateAllAxisLabels();
    }
  });

  timeSlider.addEventListener('input', (e) => {
    const seconds = parseFloat(e.target.value);
    audioState.timeWindow = seconds;
    timeLabel.textContent = `Time Window: ${seconds.toFixed(1)}s`;
    if (audioState.context && audioState.analyser) {
      generateAllAxisLabels();
    }
  });

  wireframeToggle.addEventListener('change', (e) => {
    audioState.showWireframe = e.target.checked;
  });

  if (visualisationSelect) {
    visualisationSelect.addEventListener('change', (e) => {
      const mode = e.target.value;

      audioState.showBlueprintLines = false;
      audioState.showTopLines = false;
      audioState.axisLinesOnly = false;
      audioState.disableAllLinesLabels = false;

      switch (mode) {
        case 'blueprint':
          audioState.showBlueprintLines = true;
          break;
        case 'ceiling':
          audioState.showBlueprintLines = true;
          audioState.showTopLines = true;
          break;
        case 'axis':
          audioState.axisLinesOnly = true;
          break;
        case 'none':
          audioState.disableAllLinesLabels = true;
          break;
      }

      syncVisualGuides();
    });
  }

  if (colorSchemeSelect) {
    colorSchemeSelect.addEventListener('change', (e) => {
      const choice = e.target.value;
      switch (choice) {
        case 'standard':  audioState.colorScheme = 0; break;
        case 'synthwave': audioState.colorScheme = 1; break;
        case 'glacier':   audioState.colorScheme = 2; break;
        case 'magma':     audioState.colorScheme = 3; break;
        case 'cyberpunk': audioState.colorScheme = 4; break;
      }
    });
  }

  syncVisualGuides();
}