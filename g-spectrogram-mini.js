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
  data_whole: tf.zeros([16, 1], dtype='float32'),
  frames_since_last_coloured: 0,
  custom_start_time_ms: -1,
  amplitude_over_thresh: false,
  amplitude_thresh: -1500,
  prev_max: 0,
  stopped: false, 

  // current data, 15 frames of 16 frequency bins
  currDat: tf.zeros([16, 15], dtype='float32'),
  currDat2: tf.zeros([16, 1], dtype='float32'),
  sampledFreqs: [126.2,  275.2, 451.1, 
                  658.6, 903.6, 1192.8, 
                  1534.1, 2412.5, 2973.7, 
                  3636.2, 4418.1, 5341, 
                  6430.3, 7716.1, 9233.7],
  sampledIdx: [5, 12, 19, 28, 39, 51, 65, 103, 127, 155, 189, 228, 274, 329, 394],
  sampledIdxBuckets: [0, 8, 15, 33, 45, 58, 84, 115, 141, 172, 208, 251, 201, 362, 500],
  mouseOnPred: false,
  
  attachedCallback: async function() {
    this.tempCanvas = document.createElement('canvas'),
    this.tempCanvas2 = document.createElement('canvas'),
    console.log('Created spectrogram');
    // console.log('cur dat', this.currDat);

    // Require user gesture before creating audio context, etc.
    window.addEventListener('mousedown', () => this.createAudioGraph());
    window.addEventListener('touchstart', () => this.createAudioGraph());

    // tf.print(mean)
    // tf.print(std)

    self.model = await tf.loadLayersModel('tfjs_model/model.json');

    console.log('loaded model')
    // console.log(model);
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

  extractFrequenciesByte: function(){
    this.analyser.getByteFrequencyData(this.freq);
    const predFrequencies = Array(16).fill(0);
    var currChunk, numElems;
    count = 0
    idx = 0
    sum = 0;
    var sampledIdxTemp = this.sampledIdxBuckets;
    for (i = 0; i < sampledIdxTemp.length - 1; i++){
      currChunk = this.freq.slice(sampledIdxTemp[i], sampledIdxTemp[i + 1]);
      numElems = sampledIdxTemp[i + 1] - sampledIdxTemp[i];
      predFrequencies[i] = currChunk.reduce((partialSum, a) => partialSum + a, 0) / numElems;
      if (predFrequencies[i] == 0){
        predFrequencies[i] = this.freq.slice(this.sampledIdx[i]);
        if (predFrequencies[i] == 0){
          predFrequencies = Math.min(predFrequencies);
        }
      }
    }
    // console.log("this.freq", this.freq);
    // console.log("pred freq", predFrequencies);
    return predFrequencies;
  },

  sumColumns: async function(matrix) {
    const numRows = matrix.length;
    const numCols = matrix[0].length; // Assuming all rows have the same number of columns
    
    const columnSums = new Array(numCols).fill(0);
  
    for (let col = 0; col < numCols; col++) {
      for (let row = 0; row < numRows; row++) {
        columnSums[col] += 10**(matrix[row][col]);
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

  customMax: async function(arguments) {
    if (arguments.length === 0) {
      return undefined; // Return undefined if no arguments are provided
    }
  
    let max = -Infinity; // Start with a very low value
    for (let i = 1; i < arguments.length; i++) {
      if (arguments[i] > max) {
        max = arguments[i];
      }
    }
    return max;
  },

  findMaxFreq: async function(data){
    this.start_time_ms = -1;

    this.sumColumns(data, axis=0).then((col_sums) => {
      this.customMax(col_sums).then((max_col_sum) => {
        var array_2 = Array(col_sums);
        for(var i = 0, length = col_sums.length; i < length; i++){
            array_2[i] = col_sums[i] / max_col_sum;
        }
        console.log(array_2);
        this.argwhere(array_2).then((thresh_indexes) => {
          start_time_ms = thresh_indexes[0]*10 - 20;
          // to capture onset in msec
          console.log(start_time_ms);
          this.start_time_ms = start_time_ms;
        });
      });
    });
  },

  storeData: async function(){
    var start_time_ms = -1;
    if(this.custom_start_time_ms == -1){
      start_time_ms = this.start_time_ms;
    } else {
      start_time_ms = this.custom_start_time_ms;
    }
    localStorage.setItem("currDat", this.currDat.arraySync());
    localStorage.setItem("dataWhole", this.data_whole.arraySync());
    console.log('dataWhole shape', this.data_whole.shape);
    localStorage.setItem("dataTensorNormedArr", dataTensorNormed.arraySync());
    localStorage.setItem("dataTensorNormed", JSON.stringify(dataTensorNormed.arraySync()));
    localStorage.setItem("starttime", start_time_ms);
    console.log('stored');
    // return (self.currDat, self.dataTensorNormed);
  },

  predictModel: async function(data){
    // converts from a canvas data object to a tensor

    this.start_time_ms = -1;
 
    // sum columns
    var matrix = data
    const numRows = matrix.length;
    const numCols = matrix[0].length; // Assuming all rows have the same number of columns
    
    const columnSums = new Array(numCols).fill(0);
  
    for (let col = 0; col < numCols; col++) {
      for (let row = 0; row < numRows; row++) {
        columnSums[col] += 10**(matrix[row][col]);
      }
    }

    // custom max
    var arguments = columnSums
    if (arguments.length === 0) {
      return undefined; // Return undefined if no arguments are provided
    }
    let max = -Infinity; // Start with a very low value
    for (let i = 1; i < arguments.length; i++) {
      if (arguments[i] > max) {
        max = arguments[i];
      }
    }
    
    // normalize
    var array_2 = Array(columnSums);
    for(var i = 0, length = columnSums.length; i < length; i++){
        array_2[i] = columnSums[i] / max;
    }

    // find max
    const thresh_indexes = [];
    for (let i = 2; i < array_2.length; i++) {
      if (array_2[i] > this.thresh) {
        thresh_indexes.push(i);
      }
    }
    
    start_time_ms = thresh_indexes[0]*10 - 20;
    // to capture onset in msec
    this.start_time_ms = start_time_ms;

    start_time_ms = this.start_time_ms;
    var start_frame = start_time_ms / 10;
    data = tf.transpose(tf.tensor(data), [0, 1]);
    var the_dat = data.slice([0, start_frame], [16, 15]);
    // normalize
    // tf.print(the_dat.slice([0, 0], [16, 1]));
    var mean = tf.mean(the_dat);
    var std = tf.moments(the_dat).variance.sqrt();
    var normed_the_dat = tf.div(tf.sub(the_dat, mean), std);
    var dataTensor = tf.stack([normed_the_dat]);

    var dataTensorNormedTransposed = tf.transpose(dataTensor, [0, 2, 1]);
    
    // // gets model prediction
    var y = model.predict(dataTensorNormedTransposed, {batchSize: 1});
    
    // var y = self.model.predict(dataTensorNormedTransposed);
    y = y.dataSync()
    // console.log(y);
    var max_y = Math.max.apply(null, y);
    var min_y = Math.min.apply(null, y);
    var y_scaled = [0, 0, 0];
    for (i=0; i<3; i++){
      y_scaled[i] = (y[i] - min_y) / (max_y - min_y);
    }
    
    // replaces the text in the result tag by the model prediction
    document.getElementById('pred1').style = "height: "+y_scaled[0] * 30 +"vh";
    document.getElementById('pred2').style = "height: "+y_scaled[1] * 30 +"vh";
    document.getElementById('pred3').style = "height: "+y_scaled[2] * 30 +"vh";
    document.getElementById('pred1_text').innerHTML = y[0].toLocaleString(
      undefined, { minimumFractionDigits: 2 , maximumFractionDigits :2});
    document.getElementById('pred2_text').innerHTML = y[1].toLocaleString(
      undefined, { minimumFractionDigits: 2 , maximumFractionDigits :2});
    document.getElementById('pred3_text').innerHTML = y[2].toLocaleString(
      undefined, { minimumFractionDigits: 2 , maximumFractionDigits :2});

    // localStorage.setItem("currDat", the_dat.arraySync());
    // localStorage.setItem("dataTensorNormedArr", dataTensorNormed.arraySync());
    // localStorage.setItem("dataTensorNormed", JSON.stringify(dataTensorNormed.arraySync()));
    // console.log('stored');

    const classes = ["b", "d", "g", "null"];
    var predictedClass = tf.argMax(y).array()
    .then(predictedClass => {
      document.getElementById("predClass").innerHTML = classes[predictedClass];
      }
    )
    .catch(err =>
      console.log(err));

    // setTimeout(() => {
    //   document.getElementById('pred1').style = "height: "+1 +"vh";
    //   document.getElementById('pred2').style = "height: "+1 +"vh";
    //   document.getElementById('pred3').style = "height: "+1 +"vh";
    // }, 1000);
  },

  predictModel_noSegment: async function(){
    // converts from a canvas data object to a tensor
    var start_frame = this.custom_start_time_ms / 10;

    // start_frame = 34;
    var the_dat = this.currDat.slice([0, start_frame], [16, 15]);
    // mean and std transformation

    var mean = tf.mean(the_dat);
    var std = tf.moments(the_dat).variance.sqrt();
    var normed_the_dat = tf.div(tf.sub(the_dat, mean), std);
    var dataTensor = tf.stack([normed_the_dat]);
    self.dataTensorNormed = dataTensor;
    var dataTensorNormedTransposed = tf.transpose(dataTensor, [0, 2, 1]);

    // gets model prediction
    var y = self.model.predict(dataTensorNormedTransposed);
    y = y.dataSync()
    var y_scaled = [0, 0, 0];
    var max_y = Math.max.apply(null, y);
    var min_y = Math.min.apply(null, y);
    for (i=0; i<3; i++){
      y_scaled[i] = (y[i] - min_y) / (max_y - min_y);
    }

    // replaces the text in the result tag by the model prediction
    document.getElementById('pred1').style = "height: "+y_scaled[0] * 30 +"vh";
    document.getElementById('pred2').style = "height: "+y_scaled[1] * 30 +"vh";
    document.getElementById('pred3').style = "height: "+y_scaled[2] * 30 +"vh";
    document.getElementById('pred1_text').innerHTML = y[0].toLocaleString(
      undefined, { minimumFractionDigits: 2 , maximumFractionDigits :2});
      document.getElementById('pred2_text').innerHTML = y[1].toLocaleString(
        undefined, { minimumFractionDigits: 2 , maximumFractionDigits :2});
        document.getElementById('pred3_text').innerHTML = y[2].toLocaleString(
          undefined, { minimumFractionDigits: 2 , maximumFractionDigits :2});

    localStorage.setItem("dataTensorNormedArr", dataTensorNormed.arraySync());
    localStorage.setItem("dataTensorNormed", JSON.stringify(dataTensorNormed.arraySync()));

    const classes = ["b", "d", "g", "null"];
    var predictedClass = tf.argMax(y).array()
    .then(predictedClass => {
      document.getElementById("predClass").innerHTML = classes[predictedClass];
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

    document.getElementById('start-stop-btn').onclick = () => {
      if (this.stopped){
        this.stopped = false;
        document.getElementById('predict-btn').style.color = "border: 3px solid var(--c2); var(--c2)";
        document.getElementById('start-stop-btn').innerHTML = "Pause";
      } else {
        this.stopped = true;
        document.getElementById('predict-btn').style.color = "border: 3px solid var(--c1); var(--c1)";
        document.getElementById('start-stop-btn').innerHTML = "Resume";
        // data_whole shape: 16 times length
        // console.log("this data whole array sync", this.data_whole.arraySync());
        this.custom_start_time_ms = this.start_time_ms;
      }
    }
    document.getElementById('spec-left').onclick = () => {
      console.log('left clicked');
      this.custom_start_time_ms -= 10;
      this.predictModel_noSegment();
    }

    document.getElementById('spec-right').onclick = () => {
      console.log('right clicked');
      this.custom_start_time_ms += 10;
      this.predictModel_noSegment();
    }

    document.getElementById('spec-pred').onclick = () => {
      console.log('predicting!!');
      this.predictModel_noSegment();
    }

    document.getElementById('download').onclick = () => {
      console.log('downloading selected segment');
      this.currDat = tf.zeros([16, 1], dtype='float32');
      var link = document.createElement('a');
      var data_pre = this.data_whole.arraySync();
      var str = "";
      for (row in data_pre) {
        str += data_pre[row].toString();
        str += '\n';
      }
      var data = new Blob([str], {type: 'text/plain'});
      textFile = window.URL.createObjectURL(data);
      console.log('File written successfully to', textFile);
      link.href = textFile;
      file_name = this.custom_start_time_ms.toString() + "data.txt"
      link.download = file_name;
      link.click();
    }

    let predict_btn = document.getElementById('predict-btn');

    // predicting
    var currCol = this.extractFrequencies();
    currCol = tf.transpose(tf.tensor([currCol]));
    var currDat = tf.concat([this.currDat, currCol], 1);
    this.currDat = currDat;

    if (this.writing == false && this.stopped == false){
      this.frames_since_last_coloured ++;
    } else if (this.writing == true && this.stopped == false){
      var data_whole = tf.concat([this.data_whole, currCol], 1);
      this.data_whole = data_whole;
    }

    document.getElementById('predict-btn').onclick = () => {
      console.log('should reset height');
      document.getElementById('pred1').style = "height: 1vh";
      document.getElementById('pred2').style = "height: 1vh";
      document.getElementById('pred3').style = "height: 1vh";
      document.getElementById('pred1_text').innerHTML = "";
      document.getElementById('pred2_text').innerHTML = "";
      document.getElementById('pred3_text').innerHTML = "";
      document.getElementById("predClass").innerHTML = "";
      if (this.writing == false){
        this.currDat = tf.zeros([16, 1], dtype='float32');
        this.writing = true;
        this.color = true;
        document.getElementById('predict-btn').style.color = "border: 3px solid var(--c2); var(--c2)";
        this.frames_since_last_coloured = 0;
        this.data_whole = tf.zeros([16, 1], dtype='float32');
      } else {
        this.writing = false;
        this.color = false;
        document.getElementById('predict-btn').style.color = "border: 3px solid var(--c1); var(--c1)";
        var data_pre = data_whole.arraySync();
        this.predictModel(data_pre);
        this.stopped = true;
        document.getElementById('start-stop-btn').innerHTML = "Resume";
        this.custom_start_time_ms = this.start_time_ms;
      }
    }

    if (this.stopped){
      document.getElementById('start-stop-btn').onclick = () => {
        this.stopped = false;
        document.getElementById('predict-btn').style.color = "border: 3px solid var(--c2); var(--c2)";
        document.getElementById('start-stop-btn').innerHTML = "Pause";
      }
    }

    // this.renderTimeDomain();
    if (this.going){
      this.renderFreqDomain();
    }

    if (this.labels && didResize) {
      this.renderAxesLabels();
    }

    setTimeout(() => {
      requestAnimationFrame(this.render.bind(this));
      var currCol = this.extractFrequencies();
      currCol = tf.transpose(tf.tensor([currCol]));
      var currDat = tf.concat([this.currDat, currCol], 1);
      this.currDat = currDat;

      var currDat2 = tf.concat([this.currDat2, currCol], 1);
      // find max
      currCol = currCol.arraySync();
      let amp = 0;
      for (let i = 2; i < currCol.length; i++) {
        if(parseFloat(-currCol[i]) == Infinity){
          amp = 0;
          break;
        }
        amp += parseFloat(currCol[i]);
      }
      if (amp > this.amplitude_thresh) {
        this.amplitude_over_thresh = true;
      } else {
        this.amplitude_over_thresh = false;
      }
      
      this.currDat2 = currDat2;

    }, 10);
    
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
    this.analyser.getFloatFrequencyData(this.freq2);

    // Check if we're getting lots of zeros.
    if (this.freq[0] === 0) {
      //console.warn(`Looks like zeros...`);
    }

    var ctx = this.ctx;
    // Copy the current canvas onto the temp canvas.

    // not stopped case: keep plotting
    if (this.stopped == false){
      this.tempCanvas.width = this.width;
      this.tempCanvas.height = this.height;
      var tempCtx = this.tempCanvas.getContext('2d');
      var tempCtx2 = this.tempCanvas2.getContext('2d');
      tempCtx.drawImage(this.$.canvas, 0, 0, this.width, this.height);
      tempCtx2.drawImage(this.$.canvas, 0, 0, this.width, this.height);

      // Iterate over the frequencies.
      var freq16 = this.extractFrequenciesByte();
      for (var i = 0; i < 16; i++) {
        var value;
        // Draw each pixel with the specific color.
        if (this.log) {
          logIndex = this.logScale(i, 16);
          value = freq16[logIndex];
        } else {
          value = freq16[i];
        }

        ctx.fillStyle = (this.color ? this.getFullColor(value) : this.getGrayColor(value));

        var percent = i / 16;
        var y = Math.round(percent * this.height + 80);

        // draw the line at the right side of the canvas
        ctx.fillRect(this.width - this.speed, this.height - y,
                    this.speed, this.height / 16);
      }

      // Translate the canvas.
      ctx.translate(-this.speed, 0);
      // Draw the copied image.
      ctx.drawImage(this.tempCanvas, 0, 0, this.width, this.height,
                    0, 0, this.width, this.height);

      // Reset the transformation matrix.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else {
      this.tempCanvas2.width = this.width;
      this.tempCanvas2.height = this.height;
      var tempCtx2 = this.tempCanvas2.getContext('2d');
      tempCtx2.drawImage(this.tempCanvas, 0, 0, this.width, this.height);

      // draw start time line
      tempCtx2.fillStyle = 'rgb(0, 0, 255)';
      var horiz = this.data_whole.shape[1];
      var horiz_shift = (horiz + this.frames_since_last_coloured) * this.speed 
      tempCtx2.fillRect(this.width - horiz_shift, 0, 5, this.height);
      var horiz_shift_start = horiz_shift - this.custom_start_time_ms / 10 * this.speed;
      tempCtx2.fillStyle = 'rgb(0, 255, 255)';
      tempCtx2.fillRect(this.width - horiz_shift_start, 0, 5, this.height);

      var horiz_shift_start1 = horiz_shift - (this.custom_start_time_ms / 10 + 15) * this.speed;
      tempCtx2.fillRect(this.width - horiz_shift_start1, 0, 5, this.height);
      
      // Translate the canvas.
      ctx.drawImage(this.tempCanvas2, 0, 0, this.width, this.height,
                    0, 0, this.width, this.height);

      // Reset the transformation matrix.
      // ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
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