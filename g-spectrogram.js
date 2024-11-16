Polymer('g-spectrogram', {
  // Configuration options
  controls: false,
  log: true,
  labels: false,
  ticks: 5,
  speed: 2,
  fftsize: 2048,
  oscillator: false,
  color: false,
  going: true,

  // Initial state data
  currDat: tf.zeros([16, 15], dtype='float32'),
  sampledFreqs: [126.2, 275.2, 451.1, 658.6, 903.6, 1192.8, 1534.1, 2412.5, 2973.7, 3636.2, 4418.1, 5341, 6430.3, 7716.1, 9233.7],
  sampledIdx: [5, 12, 19, 28, 39, 51, 65, 103, 127, 155, 189, 228, 274, 329, 394],
  sampledIdxBuckets: [0, 8, 15, 33, 45, 58, 84, 115, 141, 172, 208, 251, 201, 362, 500],

  attachedCallback: function() {
    this.tempCanvas = document.createElement('canvas');
    console.log('Created spectrogram');
    
    // Wait for user gesture to initialize the audio graph
    window.addEventListener('mousedown', () => this.createAudioGraph());
    window.addEventListener('touchstart', () => this.createAudioGraph());
  },

  // Extracts the average frequencies from the frequency bins
  extractFrequencies: function() {
    this.analyser.getFloatFrequencyData(this.freq2);
    const predFrequencies = Array(16).fill(0);
    
    for (let i = 0; i < this.sampledIdxBuckets.length - 1; i++) {
      const currChunk = this.freq2.slice(this.sampledIdxBuckets[i], this.sampledIdxBuckets[i + 1]);
      const numElems = this.sampledIdxBuckets[i + 1] - this.sampledIdxBuckets[i];
      predFrequencies[i] = currChunk.reduce((partialSum, a) => partialSum + a, 0) / numElems;

      if (predFrequencies[i] === 0) {
        predFrequencies[i] = Math.min(...this.freq2.slice(this.sampledIdx[i]));
      }
    }
    
    return predFrequencies;
  },

  // Predict the class based on the model and current data
  predictModel: async function() {
    let dataTensor = tf.transpose(this.currDat, [1, 0]);

    // Normalize the data
    const subbed = tf.sub(dataTensor, mean);
    let dataTensorNormed = tf.div(subbed, std);
    dataTensorNormed = dataTensorNormed.expandDims(0);

    // Predict the class using the model
    const y = model.predict(dataTensorNormed, { batchSize: 1 });

    const classes = ["b", "d", "g", "null"];
    try {
      const predictedClass = await tf.argMax(y.dataSync()).array();
      document.getElementById("predClass").innerHTML = classes[predictedClass];
    } catch (err) {
      console.error(err);
    }
  },

  // Create an audio context and start capturing microphone input
  createAudioGraph: async function() {
    if (this.audioContext) return;

    this.audioContext = new AudioContext({ sampleRate: 22050 });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.ctx = this.$.canvas.getContext('2d');
      this.onStream(stream);
    } catch (e) {
      this.onStreamError(e);
    }
  },

  // Main render loop
  render: function() {
    const n = Date.now();
    this.now = n;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    let didResize = false;
    if (this.$.canvas.width !== this.width) {
      this.$.canvas.width = this.width;
      this.$.labels.width = this.width;
      didResize = true;
    }
    if (this.$.canvas.height !== this.height) {
      this.$.canvas.height = this.height;
      this.$.labels.height = this.height;
      didResize = true;
    }

    // Stop button toggle
    document.getElementById('main-spectrogram').onclick = () => {
      if (this.audioContext.state === "running") {
        console.log('Stopping audio context');
        this.audioContext.suspend().then(() => {
          this.going = false;
        });
      } else if (this.audioContext.state === "suspended") {
        console.log('Resuming audio context');
        this.audioContext.resume().then(() => {
          this.going = true;
        });
      }
    }

    if (this.going) {
      let currCol = this.extractFrequencies();
      currCol = tf.transpose(tf.tensor([currCol]));
      let sliced = this.currDat.slice([0, 1], [16, 14]);
      this.currDat = tf.concat([sliced, currCol], 1);
      this.renderFreqDomain();
    }

    if (this.labels && didResize) {
      this.renderAxesLabels();
    }

    setTimeout(() => {
      requestAnimationFrame(this.render.bind(this));
    }, 0);

    const now = new Date();
    if (this.lastRenderTime_) {
      this.instantaneousFPS = now - this.lastRenderTime_;
    }
    this.lastRenderTime_ = now;
  },

  renderFreqDomain: function() {
    this.analyser.getByteFrequencyData(this.freq);
    const ctx = this.ctx;

    this.tempCanvas.width = this.width;
    this.tempCanvas.height = this.height;
    const tempCtx = this.tempCanvas.getContext('2d');
    tempCtx.drawImage(this.$.canvas, 0, 0, this.width, this.height);

    // Iterate over the frequencies and render them
    for (let i = 0; i < this.freq.length; i++) {
      const value = this.log ? this.freq[this.logScale(i, this.freq.length)] : this.freq[i];
      const color = this.color ? this.getFullColor(value) : this.getGrayColor(value);
      const percent = i / this.freq.length;
      const y = Math.round(percent * this.height);

      ctx.fillStyle = color;
      ctx.fillRect(this.width - this.speed, this.height - y, this.speed, this.speed);
    }

    ctx.translate(-this.speed, 0);
    ctx.drawImage(this.tempCanvas, 0, 0, this.width, this.height, 0, 0, this.width, this.height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },

  logScale: function(index, total, opt_base = 2) {
    const logmax = this.logBase(total + 1, opt_base);
    const exp = logmax * index / total;
    return Math.round(Math.pow(opt_base, exp) - 1);
  },

  logBase: function(val, base) {
    return Math.log(val) / Math.log(base);
  },

  renderAxesLabels: function() {
    if (!this.audioContext) return;

    const canvas = this.$.labels;
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');
    const startFreq = 440;
    const nyquist = this.audioContext.sampleRate / 2;
    const endFreq = nyquist - startFreq;
    const step = (endFreq - startFreq) / this.ticks;
    const yLabelOffset = 5;

    for (let i = 0; i <= this.ticks; i++) {
      const freq = startFreq + (step * i);
      const index = this.freqToIndex(freq);
      const percent = index / this.getFFTBinCount();
      const y = (1 - percent) * this.height;
      const x = this.width - 60;

      let label = freq;
      if (this.log) {
        const logIndex = this.logScale(index, this.getFFTBinCount());
        label = Math.max(1, this.indexToFreq(logIndex));
      }

      const units = this.formatUnits(freq);
      ctx.font = '16px Inconsolata';
      ctx.textAlign = 'right';
      ctx.fillText(this.formatFreq(label), x, y + yLabelOffset);
      ctx.textAlign = 'left';
      ctx.fillText(units, x + 10, y + yLabelOffset);
      ctx.fillRect(x + 40, y, 30, 2);
    }
  },

  formatFreq: function(freq) {
    return freq >= 1000 ? (freq / 1000).toFixed(1) : Math.round(freq);
  },

  formatUnits: function(freq) {
    return freq >= 1000 ? 'KHz' : 'Hz';
  },

  indexToFreq: function(index) {
    const nyquist = this.audioContext.sampleRate / 2;
    return nyquist / this.getFFTBinCount() * index;
  },

  freqToIndex: function(frequency) {
    const nyquist = this.audioContext.sampleRate / 2;
    return Math.round(frequency / nyquist * this.getFFTBinCount());
  },

  getFFTBinCount: function() {
    return this.fftsize / 2;
  },

  onStream: function(stream) {
    const input = this.audioContext.createMediaStreamSource(stream);
    const analyser = this.audioContext.createAnalyser();
    analyser.smoothingTimeConstant = 0;
    analyser.fftSize = this.fftsize;
    input.connect(analyser);

    this.analyser = analyser;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.freq2 = new Float32Array(this.analyser.frequencyBinCount);

    this.render();
  },

  onStreamError: function(e) {
    console.error(e);
  },

  getGrayColor: function(value) {
    return `rgb(${255 - value}, ${255 - value}, ${255 - value})`;
  },

  getFullColor: function(value) {
    const fromH = 62;
    const toH = 0;
    const percent = value / 255;
    const delta = percent * (toH - fromH);
    const hue = fromH + delta;
    return `hsl(${hue}, 100%, 50%)`;
  },
  
  logChanged: function() {
    if (this.labels) {
      this.renderAxesLabels();
    }
  },

  ticksChanged: function() {
    if (this.labels) {
      this.renderAxesLabels();
    }
  },

  labelsChanged: function() {
    if (this.labels) {
      this.renderAxesLabels();
    } else {
      this.clearAxesLabels();
    }
  }
});
