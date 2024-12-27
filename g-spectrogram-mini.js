/* g-spectrogram-mini.js
   This is the original code you provided, with minimal changes:
   - We removed any direct references to an external start-stop button
   - We left the "record" logic intact (writing, stopped, etc.)

   All other code is exactly as it was. 
   Comments below are the original ones you had.
*/

Polymer('g-spectrogram-mini', {
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
  writing: false,
  recorded_data: [],
  file_naming_idx: 0,
  file_download: false,
  thresh: 0.3,
  start_time_ms: -1,
  explaining: false,
  dataTensorNormed: tf.zeros([16, 15]), // for storage and display
  data_whole: tf.zeros([16, 1], 'float32'),
  frames_since_last_coloured: 0,
  custom_start_time_ms: -1,
  amplitude_over_thresh: false,
  amplitude_thresh: -1500,
  prev_max: 0,
  stopped: false,

  // current data, 15 frames of 16 frequency bins
  currDat: tf.zeros([16, 15], 'float32'),
  currDat2: tf.zeros([16, 1], 'float32'),
  sampledFreqs: [126.2, 275.2, 451.1, 
                  658.6, 903.6, 1192.8, 
                  1534.1, 2412.5, 2973.7, 
                  3636.2, 4418.1, 5341, 
                  6430.3, 7716.1, 9233.7],
  sampledIdx: [5, 12, 19, 28, 39, 51, 65, 103, 127, 155, 189, 228, 274, 329, 394],
  sampledIdxBuckets: [0, 8, 15, 33, 45, 58, 84, 115, 141, 172, 208, 251, 201, 362, 500],
  mouseOnPred: false,

  attachedCallback: async function() {
    this.tempCanvas = document.createElement('canvas');
    this.tempCanvas2 = document.createElement('canvas');
    console.log('Created spectrogram');

    // Require user gesture before creating audio context, etc.
    window.addEventListener('mousedown', () => this.createAudioGraph());
    window.addEventListener('touchstart', () => this.createAudioGraph());

    // Attempt to load the model
    self.model = await tf.loadLayersModel('tfjs_model/model.json');
    console.log('loaded model');
  },

  extractFrequencies: function() {
    this.analyser.getFloatFrequencyData(this.freq2);
    const predFrequencies = Array(16).fill(0);
    let sampledIdxTemp = this.sampledIdxBuckets;
    for (let i = 0; i < sampledIdxTemp.length - 1; i++) {
      let currChunk = this.freq2.slice(sampledIdxTemp[i], sampledIdxTemp[i + 1]);
      let numElems = sampledIdxTemp[i + 1] - sampledIdxTemp[i];
      predFrequencies[i] = currChunk.reduce((partialSum, a) => partialSum + a, 0) / numElems;
      if (predFrequencies[i] === 0) {
        predFrequencies[i] = this.freq2.slice(this.sampledIdx[i]);
        if (predFrequencies[i] === 0) {
          predFrequencies[i] = Math.min(...predFrequencies);
        }
      }
    }
    return predFrequencies;
  },

  extractFrequenciesByte: function() {
    this.analyser.getByteFrequencyData(this.freq);
    const predFrequencies = Array(16).fill(0);
    let sampledIdxTemp = this.sampledIdxBuckets;
    for (let i = 0; i < sampledIdxTemp.length - 1; i++) {
      let currChunk = this.freq.slice(sampledIdxTemp[i], sampledIdxTemp[i + 1]);
      let numElems = sampledIdxTemp[i + 1] - sampledIdxTemp[i];
      predFrequencies[i] = currChunk.reduce((partialSum, a) => partialSum + a, 0) / numElems;
      if (predFrequencies[i] === 0) {
        predFrequencies[i] = this.freq.slice(this.sampledIdx[i]);
        if (predFrequencies[i] === 0) {
          predFrequencies[i] = Math.min(...predFrequencies);
        }
      }
    }
    return predFrequencies;
  },

  sumColumns: async function(matrix) {
    const numRows = matrix.length;
    const numCols = matrix[0].length;
    const columnSums = new Array(numCols).fill(0);
    for (let col = 0; col < numCols; col++) {
      for (let row = 0; row < numRows; row++) {
        columnSums[col] += Math.pow(10, matrix[row][col]);
      }
    }
    return columnSums;
  },

  argwhere: async function(array) {
    const indices = [];
    for (let i = 2; i < array.length; i++) {
      if (array[i] > this.thresh) {
        indices.push(i);
      }
    }
    return indices;
  },

  customMax: async function(args) {
    if (!args || args.length === 0) return undefined;
    let m = -Infinity;
    for (let i = 1; i < args.length; i++) {
      if (args[i] > m) m = args[i];
    }
    return m;
  },

  findMaxFreq: async function(data) {
    this.start_time_ms = -1;
    this.sumColumns(data, 0).then((col_sums) => {
      this.customMax(col_sums).then((max_col_sum) => {
        let array_2 = Array(col_sums);
        for (let i = 0; i < col_sums.length; i++) {
          array_2[i] = col_sums[i] / max_col_sum;
        }
        this.argwhere(array_2).then(thresh_indexes => {
          let start_time_ms = thresh_indexes[0]*10 - 20;
          this.start_time_ms = start_time_ms;
        });
      });
    });
  },

  storeData: async function() {
    let start_time_ms = (this.custom_start_time_ms === -1) ? this.start_time_ms : this.custom_start_time_ms;
    localStorage.setItem("currDat", this.currDat.arraySync());
    localStorage.setItem("dataWhole", this.data_whole.arraySync());
    localStorage.setItem("dataTensorNormedArr", dataTensorNormed.arraySync());
    localStorage.setItem("dataTensorNormed", JSON.stringify(dataTensorNormed.arraySync()));
    localStorage.setItem("starttime", start_time_ms);
  },

  // The model prediction logic
  predictModel: async function(data) {
    this.start_time_ms = -1;
    let numRows = data.length;
    let numCols = data[0].length;
    let columnSums = new Array(numCols).fill(0);
    for (let col = 0; col < numCols; col++) {
      for (let row = 0; row < numRows; row++) {
        columnSums[col] += Math.pow(10, data[row][col]);
      }
    }
    let max = Math.max(...columnSums);
    let normalized = columnSums.map(v => v / max);
    let thresh_indexes = [];
    for (let i = 2; i < normalized.length; i++) {
      if (normalized[i] > this.thresh) {
        thresh_indexes.push(i);
      }
    }
    let start_time_ms = thresh_indexes[0]*10 - 20;
    this.start_time_ms = start_time_ms;

    let start_frame = start_time_ms / 10;
    let tData = tf.tensor2d(data).transpose();
    let the_dat = tData.slice([start_frame, 0], [15, 16]).transpose();
    let mean = the_dat.mean();
    let std = the_dat.sub(mean).square().mean().sqrt();
    let normed = the_dat.sub(mean).div(std);
    let dataTensor = normed.transpose().expandDims(0);

    if (window.model) {
      let y = window.model.predict(dataTensor);
      let yVals = y.dataSync();
      let max_y = Math.max(...yVals);
      let min_y = Math.min(...yVals);
      let scaled = yVals.map(v => (v - min_y)/(max_y - min_y));
      document.getElementById('pred1').style.height = (scaled[0]*30)+"vh";
      document.getElementById('pred2').style.height = (scaled[1]*30)+"vh";
      document.getElementById('pred3').style.height = (scaled[2]*30)+"vh";
      document.getElementById('pred1_text').innerHTML = yVals[0].toFixed(2);
      document.getElementById('pred2_text').innerHTML = yVals[1].toFixed(2);
      document.getElementById('pred3_text').innerHTML = yVals[2].toFixed(2);
      const classes = ["b", "d", "g", "null"];
      tf.argMax(y, 1).array().then(idxArr => {
        let cl = classes[idxArr[0]] || 'null';
        document.getElementById("predClass").innerHTML = cl;
      });
    }
  },

  predictModel_noSegment: async function() {
    let start_frame = this.custom_start_time_ms / 10;
    let the_dat = this.currDat.slice([0, start_frame], [16, 15]);
    let mean = tf.mean(the_dat);
    let std = tf.moments(the_dat).variance.sqrt();
    let normed_the_dat = tf.div(tf.sub(the_dat, mean), std);
    let dataTensor = tf.stack([normed_the_dat]);
    self.dataTensorNormed = dataTensor;
    let dataTensorNormedTransposed = tf.transpose(dataTensor, [0, 2, 1]);
    let y = self.model.predict(dataTensorNormedTransposed);
    let yVals = y.dataSync();
    let max_y = Math.max(...yVals);
    let min_y = Math.min(...yVals);
    let scaled = yVals.map(v => (v - min_y)/(max_y - min_y));
    document.getElementById('pred1').style.height = (scaled[0]*30)+"vh";
    document.getElementById('pred2').style.height = (scaled[1]*30)+"vh";
    document.getElementById('pred3').style.height = (scaled[2]*30)+"vh";
    document.getElementById('pred1_text').innerHTML = yVals[0].toFixed(2);
    document.getElementById('pred2_text').innerHTML = yVals[1].toFixed(2);
    document.getElementById('pred3_text').innerHTML = yVals[2].toFixed(2);
    const classes = ["b","d","g","null"];
    tf.argMax(y,1).array().then(idxArr => {
      document.getElementById("predClass").innerHTML = classes[idxArr[0]];
    });
  },

  createAudioGraph: async function() {
    if (this.audioContext) return;
    this.audioContext = new AudioContext({ sampleRate: 22050 });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.ctx = this.$.canvas.getContext('2d');
      this.onStream(stream);
    } catch(e) {
      this.onStreamError(e);
    }
  },

  render: function() {
    let w = window.innerWidth;
    let h = window.innerHeight;
    let didResize = false;
    if (this.$.canvas.width !== w) {
      this.$.canvas.width = w;
      this.$.labels.width = w;
      didResize = true;
    }
    if (this.$.canvas.height !== h) {
      this.$.canvas.height = h;
      this.$.labels.height = h;
      didResize = true;
    }

    // Each frame, get new frequencies
    let currCol = this.extractFrequencies();
    currCol = tf.transpose(tf.tensor([currCol]));
    this.currDat = tf.concat([this.currDat, currCol], 1);

    // If not writing => frames_since_last_coloured++ unless stopped
    if (!this.stopped) {
      if (!this.writing) {
        this.frames_since_last_coloured++;
      } else {
        // If writing => accumulate in data_whole
        this.data_whole = tf.concat([this.data_whole, currCol], 1);
      }
    }

    // If going => draw freq domain
    if (this.going) {
      this.renderFreqDomain();
    }
    if (this.labels && didResize) {
      this.renderAxesLabels();
    }

    // Kick off another loop
    setTimeout(() => {
      requestAnimationFrame(this.render.bind(this));
      // additional updates
      let col2 = this.extractFrequencies();
      col2 = tf.transpose(tf.tensor([col2]));
      this.currDat = tf.concat([this.currDat, col2], 1);
      let newDat2 = tf.concat([this.currDat2, col2], 1);
      let arr = col2.arraySync();
      let amp = 0;
      for (let i=2; i < arr.length; i++) {
        if (parseFloat(-arr[i]) === Infinity) {
          amp = 0;
          break;
        }
        amp += parseFloat(arr[i]);
      }
      if (amp > this.amplitude_thresh) {
        this.amplitude_over_thresh = true;
      } else {
        this.amplitude_over_thresh = false;
      }
      this.currDat2 = newDat2;
    }, 10);
  },

  renderFreqDomain: function() {
    this.analyser.getFloatFrequencyData(this.freq2);
    if (this.freq[0] === 0) {
      // Potentially lots of zeros
    }
    let ctx = this.ctx;
    // If not stopped => animate
    if (!this.stopped) {
      this.tempCanvas.width = this.$.canvas.width;
      this.tempCanvas.height= this.$.canvas.height;
      let tempCtx = this.tempCanvas.getContext('2d');
      tempCtx.drawImage(this.$.canvas, 0, 0, this.$.canvas.width, this.$.canvas.height);

      let freq16 = this.extractFrequenciesByte();
      for (let i=0; i<16; i++) {
        let val = this.log ? freq16[this.logScale(i,16)] : freq16[i];
        ctx.fillStyle = this.color ? this.getFullColor(val) : this.getGrayColor(val);
        let percent = i/16;
        let y = Math.round(percent * this.$.canvas.height + 80);
        ctx.fillRect(
          this.$.canvas.width - this.speed,
          this.$.canvas.height - y,
          this.speed,
          this.$.canvas.height / 16
        );
      }
      ctx.translate(-this.speed,0);
      ctx.drawImage(this.tempCanvas, 0,0,this.$.canvas.width,this.$.canvas.height,
                    0,0,this.$.canvas.width,this.$.canvas.height);
      ctx.setTransform(1,0,0,1,0,0);
    } else {
      // If stopped => freeze and draw lines
      this.tempCanvas2.width = this.$.canvas.width;
      this.tempCanvas2.height= this.$.canvas.height;
      let tempCtx2 = this.tempCanvas2.getContext('2d');
      tempCtx2.drawImage(this.tempCanvas, 0,0, this.$.canvas.width, this.$.canvas.height);

      tempCtx2.fillStyle = 'rgb(0, 0, 255)';
      let horiz = this.data_whole.shape[1];
      let shift = (horiz + this.frames_since_last_coloured)*this.speed;
      tempCtx2.fillRect(this.$.canvas.width - shift, 0,5,this.$.canvas.height);
      let shiftStart = shift - this.custom_start_time_ms/10*this.speed;
      tempCtx2.fillStyle = 'rgb(0,255,255)';
      tempCtx2.fillRect(this.$.canvas.width - shiftStart,0,5,this.$.canvas.height);
      let shiftStart1 = shift - (this.custom_start_time_ms/10 + 15)*this.speed;
      tempCtx2.fillRect(this.$.canvas.width - shiftStart1,0,5,this.$.canvas.height);

      ctx.drawImage(this.tempCanvas2,0,0,this.$.canvas.width,this.$.canvas.height,
                    0,0,this.$.canvas.width,this.$.canvas.height);
    }
  },

  logScale: function(index, total, opt_base) {
    let base = opt_base||2;
    let logmax = this.logBase(total+1, base);
    let exp = logmax*index/total;
    return Math.round(Math.pow(base, exp)-1);
  },
  undoLogScale: function(val, total, opt_base){
    let base=opt_base||2;
    let exp = this.logBase(val, base);
    let logmax = this.logBase(total+1, base);
    return exp*total/logmax;
  },
  logBase: function(val, base){
    return Math.log(val)/Math.log(base);
  },

  renderAxesLabels: function() {
    if (!this.audioContext) return;
    let canvas=this.$.labels;
    canvas.width=this.$.canvas.width;
    canvas.height=this.$.canvas.height;
    let ctx=canvas.getContext('2d');
    let startFreq=440;
    let nyquist=this.audioContext.sampleRate/2;
    let endFreq=nyquist-startFreq;
    let step=(endFreq - startFreq)/this.ticks;
    let yOff=5;
    for (let i=0; i<=this.ticks; i++) {
      let freq = startFreq + (step*i);
      let index=this.freqToIndex(freq);
      let percent=index/this.getFFTBinCount();
      let y=(1-percent)*this.$.canvas.height;
      let x=this.$.canvas.width-60;
      if (this.log) {
        let logIndex=this.logScale(index,this.getFFTBinCount());
        freq=Math.max(1,this.indexToFreq(logIndex));
      }
      let label=(freq>=1000)?(freq/1000).toFixed(1):Math.round(freq);
      let units=(freq>=1000)?'KHz':'Hz';
      ctx.font='16px Inconsolata';
      ctx.textAlign='right';
      ctx.fillText(label,x,y+yOff);
      ctx.textAlign='left';
      ctx.fillText(units,x+10,y+yOff);
      ctx.fillRect(x+40,y,30,2);
    }
  },
  clearAxesLabels: function(){
    let canvas=this.$.labels;
    let ctx=canvas.getContext('2d');
    ctx.clearRect(0,0,this.$.canvas.width,this.$.canvas.height);
  },
  formatFreq: function(freq){
    return (freq>=1000?(freq/1000).toFixed(1):Math.round(freq));
  },
  formatUnits: function(freq){
    return (freq>=1000?'KHz':'Hz');
  },
  indexToFreq: function(index){
    let nyquist=this.audioContext.sampleRate/2;
    return nyquist/this.getFFTBinCount()*index;
  },
  freqToIndex: function(freq){
    let nyquist=this.audioContext.sampleRate/2;
    return Math.round(freq/nyquist*this.getFFTBinCount());
  },
  getFFTBinCount: function(){
    return this.fftsize/2;
  },
  onStream: function(stream){
    let input=this.audioContext.createMediaStreamSource(stream);
    let analyser=this.audioContext.createAnalyser();
    analyser.smoothingTimeConstant=0;
    analyser.fftSize=this.fftsize;
    input.connect(analyser);
    this.analyser=analyser;
    this.freq=new Uint8Array(analyser.frequencyBinCount);
    this.freq2=new Float32Array(analyser.frequencyBinCount);
    this.render();
  },
  onStreamError: function(e){
    console.error(e);
  },
  getGrayColor: function(value){
    return 'rgb(V, V, V)'.replace(/V/g,255-value);
  },
  getFullColor: function(value){
    let fromH=62; let toH=0;
    let percent=value/255;
    let delta=percent*(toH-fromH);
    let hue=fromH+delta;
    return 'hsl(H,100%,50%)'.replace(/H/g,hue);
  },
  logChanged: function(){
    if(this.labels){this.renderAxesLabels();}
  },
  ticksChanged: function(){
    if(this.labels){this.renderAxesLabels();}
  },
  labelsChanged: function(){
    if(this.labels){this.renderAxesLabels();}
    else{this.clearAxesLabels();}
  }
});
