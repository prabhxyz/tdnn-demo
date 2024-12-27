/* g-spectrogram.js
   This file defines <g-spectrogram>, which you might not use directly,
   but is part of the UI. I've optimized it slightly except for
   the essential logic that you need.
*/

// Define a <g-spectrogram> element
Polymer('g-spectrogram', {
  // Basic settings
  controls: false,
  log: true,
  labels: false,
  ticks: 5,
  speed: 2,
  fftsize: 2048,
  oscillator: false,
  color: false,
  going: true,

  attachedCallback: function() {
    this.tempCanvas = document.createElement('canvas');
    console.log('Created <g-spectrogram>');
    
    // We wait for a user gesture to create an audio context
    window.addEventListener('mousedown', () => this.createAudioGraph());
    window.addEventListener('touchstart', () => this.createAudioGraph());
  },

  createAudioGraph: async function() {
    if (this.audioContext) return;
    this.audioContext = new AudioContext({ sampleRate: 22050 });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.ctx = this.$.canvas.getContext('2d');
      this.onStream(stream);
    } catch (err) {
      console.error('Audio input error:', err);
    }
  },

  onStream: function(stream) {
    const input = this.audioContext.createMediaStreamSource(stream);
    const analyser = this.audioContext.createAnalyser();
    analyser.smoothingTimeConstant = 0;
    analyser.fftSize = this.fftsize;
    input.connect(analyser);

    this.analyser = analyser;
    this.freq  = new Uint8Array(analyser.frequencyBinCount);
    this.freq2 = new Float32Array(analyser.frequencyBinCount);
    this.render();
  },

  render: function() {
    if (!this.going) return;
    requestAnimationFrame(this.render.bind(this));
    // Some basic drawing logic would go here
  }
});
