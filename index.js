// index.js
// I wrote these comments to explain how the spectrogram and record toggles work.

document.addEventListener('DOMContentLoaded', () => {
  // Get references to the Start/Stop and Record buttons
  const startStopBtn = document.getElementById('startStopSpectrogram');
  const recordBtn    = document.getElementById('recordBtn');
  // Access the <g-spectrogram-mini> element
  const miniSpec     = document.getElementById('miniSpec');
  
  let isSpectrogramOn = false; // Keep track of audio context state
  let isRecording      = false; // Keep track of "Record" toggle

  // This toggles the spectrogram audio context
  startStopBtn.addEventListener('click', async () => {
    // If the spectrogram's audio context doesn't exist, create it
    if (!miniSpec.audioContext) {
      await miniSpec.createAudioGraph();
    }
    
    if (miniSpec.audioContext.state === 'running') {
      // Suspend => effectively stops microphone processing
      await miniSpec.audioContext.suspend();
      startStopBtn.textContent = 'Start Spectrogram';
      isSpectrogramOn = false;
    } else {
      // Resume => restarts mic input + spectrogram
      await miniSpec.audioContext.resume();
      startStopBtn.textContent = 'Stop Spectrogram';
      isSpectrogramOn = true;
    }
  });

  // This toggles recording (green → red, and we color the spectrogram)
  recordBtn.addEventListener('click', () => {
    isRecording = !isRecording;
    if (isRecording) {
      // Start recording
      recordBtn.textContent = 'Stop';
      recordBtn.style.backgroundColor = 'var(--danger)';
      miniSpec.writing = true;   // color highlight
      miniSpec.stopped = false;  // keep spectrogram scrolling
    } else {
      // Stop recording
      recordBtn.textContent = 'Record';
      recordBtn.style.backgroundColor = 'var(--primary)';
      miniSpec.writing = false;  // no color
      miniSpec.stopped = true;   // freeze, draw onset lines
      // The original code draws a blue line at start_time_ms plus cyan lines
      miniSpec.custom_start_time_ms = miniSpec.start_time_ms;
    }
  });
});
