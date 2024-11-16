Polymer('g-spectrogram', {
  // Show the controls UI.
  controls: false,
  // Log mode.
  log: true,
  // Show axis labels, and how many ticks.
  labels: false,
  ticks: 5,
  speed: 2,
  // FFT bin size,
  fftsize: 2048,
  oscillator: false,
  color: false,
  going: true,

  // current data, 15 frames of 16 frequency bins
  currDat: tf.zeros([16, 15], dtype='float32'),
  sampledFreqs: [126.2,  275.2, 451.1, 
                  658.6, 903.6, 1192.8, 
                  1534.1, 2412.5, 2973.7, 
                  3636.2, 4418.1, 5341, 
                  6430.3, 7716.1, 9233.7],
  sampledIdx: [5, 12, 19, 28, 39, 51, 65, 103, 127, 155, 189, 228, 274, 329, 394],
  sampledIdxBuckets: [0, 8, 15, 33, 45, 58, 84, 115, 141, 172, 208, 251, 201, 362, 500],
  
  attachedCallback: async function() {
    this.tempCanvas = document.createElement('canvas'),
    console.log('Created spectrogram');
    // console.log('cur dat', this.currDat);

    // Require user gesture before creating audio context, etc.
    window.addEventListener('mousedown', () => this.createAudioGraph());
    window.addEventListener('touchstart', () => this.createAudioGraph());
  },

  extractFrequencies: function(){
    this.analyser.getFloatFrequencyData(this.freq2);
    //this.freq2 = this.freq2.map(x => Math.pow(10, x / 10)); // matlab transformation
    const predFrequencies = Array(16).fill(0);
    var currChunk, numElems;
    count = 0
    idx = 0
    sum = 0;
    var sampledIdxTemp = this.sampledIdxBuckets;
    for (i = 0; i < sampledIdxTemp.length - 1; i++){
      currChunk = this.freq2.slice(sampledIdxTemp[i], sampledIdxTemp[i + 1]);
      numElems = sampledIdxTemp[i + 1] - sampledIdxTemp[i];
      predFrequencies[i] = currChunk.reduce((partialSum, a) => partialSum + a, 0) / numElems;
      if (predFrequencies[i] == 0){
        predFrequencies[i] = this.freq2.slice(this.sampledIdx[i]);
        if (predFrequencies[i] == 0){
          predFrequencies = Math.min(predFrequencies);
        }
      }
    }
    // console.log("this.freq2", this.freq2);
    // console.log("pred freq", predFrequencies);
    return predFrequencies;
  },

  predictModel: async function(){
    // converts from a canvas data object to a tensor
    var dataTensor = tf.transpose(this.currDat, [1, 0]);
    var print = false;

    if (print == true){
      for(var i = 0; i < 15; i ++){
        console.log('currDat',i, this.currDat.dataSync().slice(i*16,(i+1)*16));
      }
    }

    if (print == true){
      for(var i = 0; i < 15; i ++){
        console.log('before transformations',i, dataTensor.dataSync().slice(i*16,(i+1)*16));
      }
    }

    // mean and std transformation
    var subbed = tf.sub(dataTensor, mean);
    var dataTensorNormed = tf.div(subbed, std);
    dataTensorNormed = dataTensorNormed.expandDims(0);

    if (print == true){
      for(var i = 0; i < 15; i ++){
        console.log('right before model',i, dataTensorNormed.dataSync().slice(i*16,(i+1)*16));
      }
    }
    
    // gets model prediction
    var y = model.predict(dataTensorNormed, {batchSize: 1});
    
    // replaces the text in the result tag by the model prediction
    // document.getElementById('pred1').style = "height: "+y.dataSync()[0] * 10 +"vh";
    // document.getElementById('pred2').style = "height: "+y.dataSync()[1] * 10 +"vh";
    // document.getElementById('pred3').style = "height: "+y.dataSync()[2] * 10 +"vh";
    // document.getElementById('pred4').style = "height: "+y.dataSync()[3] * 10 +"vh";

    const classes = ["b", "d", "g", "null"];
    var predictedClass = tf.argMax(y.dataSync()).array()
    .then(predictedClass => {
      document.getElementById("predClass").innerHTML = classes[predictedClass];
      // if(predictedClass != 3){
      //   console.log('predicted class', predictedClass);
      //   console.log(y.dataSync());
      //   // dataTensorNormed.array().then(array => console.log(array));
      // }
      }
    )
    .catch(err =>
      console.log(err));

  },

  createAudioGraph: async function() {
    if (this.audioContext) {
      return;
    }
    // Get input from the microphone.
    this.audioContext = new AudioContext({sampleRate: 22050});
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      this.ctx = this.$.canvas.getContext('2d');
      this.onStream(stream);
    } catch (e) {
      this.onStreamError(e);
    }
  },

  render: function() {
    var n = Date.now();
    // console.log("time diff:", n - this.now);
    this.now = n;
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    var didResize = false;
    // Ensure dimensions are accurate.
    if (this.$.canvas.width != this.width) {
      this.$.canvas.width = this.width;
      this.$.labels.width = this.width;
      didResize = true;
    }
    if (this.$.canvas.height != this.height) {
      this.$.canvas.height = this.height;
      this.$.labels.height = this.height;
      didResize = true;
    }

    // stop button
    document.getElementById('main-spectrogram').onclick = () => {
      if (this.audioContext.state == "running"){
        console.log('clicked, stopping now');
        this.audioContext.suspend().then( () => {
          this.going = false;
        });
      } else if (this.audioContext.state == "suspended"){
        console.log('starting again');
        this.audioContext.resume().then(() => {
          this.going = true;
        });
      }
    }

    if (this.going){
       // predict model here
      var currCol = this.extractFrequencies()
      currCol = tf.transpose(tf.tensor([currCol]));
      var sliced = this.currDat.slice([0, 1], [16, 14]);
      var currDat = tf.concat([sliced, currCol], 1);
      this.currDat = currDat;
      // this.predictModel();

      // this.renderTimeDomain();
      this.renderFreqDomain();
    }
   

    if (this.labels && didResize) {
      this.renderAxesLabels();
    }

    setTimeout(() => {
      requestAnimationFrame(this.render.bind(this));
    }, 0);

    var now = new Date();
    if (this.lastRenderTime_) {
      this.instantaneousFPS = now - this.lastRenderTime_;
    }
    this.lastRenderTime_ = now;
  },

  renderTimeDomain: function() {
    var times = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(times);

    for (var i = 0; i < times.length; i++) {
      var value = times[i];
      var percent = value / 256;
      var barHeight = this.height * percent;
      var offset = this.height - barHeight - 1;
      var barWidth = this.width/times.length;
      this.ctx.fillStyle = 'black';
      this.ctx.fillRect(i * barWidth, offset, 1, 1);
    }
  },

  renderFreqDomain: function() {
    this.analyser.getByteFrequencyData(this.freq);

    // Check if we're getting lots of zeros.
    if (this.freq[0] === 0) {
      //console.warn(`Looks like zeros...`);
    }

    var ctx = this.ctx;
    // Copy the current canvas onto the temp canvas.
    this.tempCanvas.width = this.width;
    this.tempCanvas.height = this.height;
    var tempCtx = this.tempCanvas.getContext('2d');
    tempCtx.drawImage(this.$.canvas, 0, 0, this.width, this.height);

    // Iterate over the frequencies.
    for (var i = 0; i < this.freq.length; i++) {
      var value;
      // Draw each pixel with the specific color.
      if (this.log) {
        logIndex = this.logScale(i, this.freq.length);
        value = this.freq[logIndex];
      } else {
        value = this.freq[i];
      }

      ctx.fillStyle = (this.color ? this.getFullColor(value) : this.getGrayColor(value));

      var percent = i / this.freq.length;
      var y = Math.round(percent * this.height);

      // draw the line at the right side of the canvas
      ctx.fillRect(this.width - this.speed, this.height - y,
                   this.speed, this.speed);
    }

    // Translate the canvas.
    ctx.translate(-this.speed, 0);
    // Draw the copied image.
    ctx.drawImage(this.tempCanvas, 0, 0, this.width, this.height,
                  0, 0, this.width, this.height);

    // Reset the transformation matrix.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  },

  /**
   * Given an index and the total number of entries, return the
   * log-scaled value.
   */
  logScale: function(index, total, opt_base) {
    var base = opt_base || 2;
    var logmax = this.logBase(total + 1, base);
    var exp = logmax * index / total;
    return Math.round(Math.pow(base, exp) - 1);
  },

  undoLogScale: function(val, total, opt_base){
    var base = opt_base || 2;
    var exp = this.logBase(val, base);
    var logmax = this.logBase(total + 1, base);
    var index = exp * total / logmax;
    return index;
  },

  logBase: function(val, base) {
    return Math.log(val) / Math.log(base);
  },

  renderAxesLabels: function() {
    if (!this.audioContext) {
      return;
    }
    var canvas = this.$.labels;
    canvas.width = this.width;
    canvas.height = this.height;
    var ctx = canvas.getContext('2d');
    var startFreq = 440;
    var nyquist = this.audioContext.sampleRate/2;
    var endFreq = nyquist - startFreq;
    var step = (endFreq - startFreq) / this.ticks;
    var yLabelOffset = 5;
    // Render the vertical frequency axis.
    for (var i = 0; i <= this.ticks; i++) {
      var freq = startFreq + (step * i);
      // Get the y coordinate from the current label.
      var index = this.freqToIndex(freq);
      var percent = index / this.getFFTBinCount();
      var y = (1-percent) * this.height;
      var x = this.width - 60;
      // Get the value for the current y coordinate.
      var label;
      if (this.log) {
        // Handle a logarithmic scale.
        var logIndex = this.logScale(index, this.getFFTBinCount());
        // Never show 0 Hz.
        freq = Math.max(1, this.indexToFreq(logIndex));
      }
      var label = this.formatFreq(freq);
      var units = this.formatUnits(freq);
      ctx.font = '16px Inconsolata';
      // Draw the value.
      ctx.textAlign = 'right';
      ctx.fillText(label, x, y + yLabelOffset);
      // Draw the units.
      ctx.textAlign = 'left';
      ctx.fillText(units, x + 10, y + yLabelOffset);
      // Draw a tick mark.
      ctx.fillRect(x + 40, y, 30, 2);
    }
  },

  clearAxesLabels: function() {
    var canvas = this.$.labels;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, this.width, this.height);
  },

  formatFreq: function(freq) {
    return (freq >= 1000 ? (freq/1000).toFixed(1) : Math.round(freq));
  },

  formatUnits: function(freq) {
    return (freq >= 1000 ? 'KHz' : 'Hz');
  },

  indexToFreq: function(index) {
    var nyquist = this.audioContext.sampleRate/2;
    return nyquist/this.getFFTBinCount() * index;
  },

  freqToIndex: function(frequency) {
    var nyquist = this.audioContext.sampleRate/2;
    return Math.round(frequency/nyquist * this.getFFTBinCount());
  },

  getFFTBinCount: function() {
    return this.fftsize / 2;
  },

  onStream: function(stream) {
    var input = this.audioContext.createMediaStreamSource(stream);
    var analyser = this.audioContext.createAnalyser();
    analyser.smoothingTimeConstant = 0;
    analyser.fftSize = this.fftsize;

    // Connect graph.
    input.connect(analyser);

    this.analyser = analyser;
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.freq2 = new Float32Array(this.analyser.frequencyBinCount);

    // Setup a timer to visualize some stuff.
    this.render();
  },

  onStreamError: function(e) {
    console.error(e);
  },

  getGrayColor: function(value) {
    return 'rgb(V, V, V)'.replace(/V/g, 255 - value);
  },

  getFullColor: function(value) {
    var fromH = 62;
    var toH = 0;
    var percent = value / 255;
    var delta = percent * (toH - fromH);
    var hue = fromH + delta;
    return 'hsl(H, 100%, 50%)'.replace(/H/g, hue);
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
