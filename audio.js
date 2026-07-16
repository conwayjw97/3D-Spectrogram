export const audioState = {
  context: null,
  analyser: null,
  dataArray: null,
  isRecording: false,
  minFrequency: 0,        // Tracking parameter for low end frequency cutoff
  targetFrequency: 10000, // Tracking parameter for high end frequency cutoff
  timeWindow: 2.0         // Initialised at 2.0 seconds
};

export function startAudio(onSuccess) {
  if (!audioState.context) {
    audioState.context = new (window.AudioContext || window.webkitAudioContext)();
    audioState.analyser = audioState.context.createAnalyser();
    
    audioState.analyser.fftSize = 2048; 
    audioState.analyser.minDecibels = -100;
    audioState.analyser.maxDecibels = -30;

    const bufferLength = audioState.analyser.frequencyBinCount; 
    audioState.dataArray = new Uint8Array(bufferLength);

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const source = audioState.context.createMediaStreamSource(stream);
        source.connect(audioState.analyser);
        audioState.isRecording = true;
        if (onSuccess) onSuccess();
      })
      .catch(err => {
        console.error('Microphone access denied:', err);
      });
  } else {
    audioState.context.resume();
    audioState.isRecording = true;
    if (onSuccess) onSuccess();
  }
}

export function stopAudio() {
  if (audioState.context) {
    audioState.context.close();
    audioState.context = null;
    audioState.analyser = null;
    audioState.dataArray = null;
    audioState.isRecording = false;
  }
}