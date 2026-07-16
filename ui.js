import * as THREE from 'three';
import { audioState, startAudio, stopAudio } from './audio.js';

let labelSprites = [];
let currentScene = null;
let uiConfig = {};

function createLabelSprite(text, x, y, z) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; 
  canvas.height = 32;
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
  sprite.scale.set(10, 2.5, 1);
  return sprite;
}

export function generateAllAxisLabels() {
  if (!currentScene || !audioState.analyser) return;

  labelSprites.forEach(sprite => currentScene.remove(sprite));
  labelSprites = [];

  const { width, depth, timeSamples } = uiConfig;

  // 1. Frequency Labels (X-Axis) - Scaled relative to both minimum and maximum limits
  const numXLabels = 5;
  const freqSpan = audioState.targetFrequency - audioState.minFrequency;
  for (let i = 0; i < numXLabels; i++) {
    const freq = audioState.minFrequency + (i / (numXLabels - 1)) * freqSpan;
    const text = freq < 1000 ? `${Math.round(freq)} Hz` : `${(freq / 1000).toFixed(1)} kHz`;
    const x = -width / 2 + (i / (numXLabels - 1)) * width;
    
    const sprite = createLabelSprite(text, x, 1.5, depth / 2 + 5);
    currentScene.add(sprite); 
    labelSprites.push(sprite);
  }

  // 2. Amplitude Labels (Y-Axis)
  const dbRange = audioState.analyser.maxDecibels - audioState.analyser.minDecibels;
  for (let i = 0; i < 5; i++) {
    const fraction = i / 4;
    const text = `${Math.round(audioState.analyser.minDecibels + fraction * dbRange)} dB`;
    const y = fraction * 25; 
    
    const sprite = createLabelSprite(text, -width / 2 - 8, y, depth / 2 + 1);
    currentScene.add(sprite); 
    labelSprites.push(sprite);
  }

  // 3. Timeline Labels (Z-Axis)
  const totalSeconds = audioState.timeWindow;
  for (let i = 0; i < 5; i++) {
    const fraction = i / 4;
    const text = fraction === 0 ? 'Now' : `-${(fraction * totalSeconds).toFixed(1)}s`;
    const z = depth / 2 - fraction * depth;
    
    const sprite = createLabelSprite(text, -width / 2 - 8, 1.5, z);
    currentScene.add(sprite); 
    labelSprites.push(sprite);
  }
}

export function initUI(scene, config) {
  currentScene = scene;
  uiConfig = config;

  const startButton = document.getElementById('startButton');
  const minFreqSlider = document.getElementById('minFreqSlider');
  const minFreqLabel = document.getElementById('minFreqLabel');
  const freqSlider = document.getElementById('freqSlider');
  const sliderLabel = document.getElementById('sliderLabel');
  const timeSlider = document.getElementById('timeSlider');
  const timeLabel = document.getElementById('timeLabel');

  startButton.addEventListener('click', () => {
    if (!audioState.isRecording) {
      startButton.textContent = 'Stop';
      startAudio(() => generateAllAxisLabels());
    } else {
      startButton.textContent = 'Start';
      stopAudio();
    }
  });

  // Handle dynamic minimum frequency cutoff modifications
  minFreqSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    audioState.minFrequency = val;
    minFreqLabel.textContent = val < 1000 ? `Min Frequency: ${val} Hz` : `Min Frequency: ${(val / 1000).toFixed(1)} kHz`;
    
    // Lock slider properties so user cannot push minimum value past the maximum window
    freqSlider.min = val + 1000;

    if (audioState.context && audioState.analyser) {
      generateAllAxisLabels();
    }
  });

  // Handle dynamic maximum frequency ceiling modifications
  freqSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    audioState.targetFrequency = val;
    sliderLabel.textContent = `Max Frequency: ${(val / 1000).toFixed(1)} kHz`;
    
    // Lock slider properties so user cannot pull maximum value below the minimum window
    minFreqSlider.max = val - 1000;

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
}