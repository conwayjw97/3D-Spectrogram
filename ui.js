import * as THREE from 'three';
import { audioState, startAudio, stopAudio } from './audio.js';

let labelSprites = [];
let currentScene = null;
let uiConfig = {};

// Helper to dynamically generate a text sprite via 2D Canvas
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

// Regenerates text labels across all three coordinate axes
export function generateAllAxisLabels() {
  if (!currentScene || !audioState.analyser) return;

  // Clear existing label sprites from the scene graph
  labelSprites.forEach(sprite => currentScene.remove(sprite));
  labelSprites = [];

  const { width, depth, freqSamples, timeSamples } = uiConfig;

  // 1. Frequency Labels (X-Axis)
  const numXLabels = 20;
  for (let i = 0; i < numXLabels; i++) {
    const freq = (i / (numXLabels - 1)) * audioState.targetFrequency;
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
  const totalSeconds = (timeSamples * 16.67) / 1000;
  for (let i = 0; i < 5; i++) {
    const fraction = i / 4;
    const text = fraction === 0 ? 'Now' : `-${(fraction * totalSeconds).toFixed(1)}s`;
    const z = depth / 2 - fraction * depth;
    
    const sprite = createLabelSprite(text, -width / 2 - 8, 1.5, z);
    currentScene.add(sprite); 
    labelSprites.push(sprite);
  }
}

// Initialises the UI layer by caching the scene context and mounting listeners
export function initUI(scene, config) {
  currentScene = scene;
  uiConfig = config;

  const startButton = document.getElementById('startButton');
  const freqSlider = document.getElementById('freqSlider');
  const sliderLabel = document.getElementById('sliderLabel');

  // Handle stream toggle interactions
  startButton.addEventListener('click', () => {
    if (!audioState.isRecording) {
      startButton.textContent = 'Stop';
      // Generate labels once hardware metrics are confirmed on stream success
      startAudio(() => generateAllAxisLabels());
    } else {
      startButton.textContent = 'Start';
      stopAudio();
    }
  });

  // Handle dynamic frequency capping modifications
  freqSlider.addEventListener('input', (e) => {
    audioState.targetFrequency = parseInt(e.target.value);
    sliderLabel.textContent = `Max Frequency: ${(audioState.targetFrequency / 1000).toFixed(1)} kHz`;
    
    if (audioState.context && audioState.analyser) {
      generateAllAxisLabels();
    }
  });
}