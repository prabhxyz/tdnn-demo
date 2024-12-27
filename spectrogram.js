// spectrogram.js

// CONFIG
const FFT_SIZE       = 2048;
const NUM_BINS       = 16;
const SHIFT_SPEED_PX = 2;       // how many pixels we shift left each frame
const ONSET_THRESHOLD = 0.3;    // sum amplitude threshold to detect onset
const DB_TO_AMP_DIV  = 20;      // dB -> amplitude = 10^(dB/20)

// DOM elements
let axisCanvas, axisCtx;
let spectCanvas, spectCtx;
let startStopBtn, recordBtn;

// Audio
let audioContext = null;
let analyser     = null;
let freqByteData = null;  // Byte freq data for color
let freqFloatData= null;  // Float freq data for amplitude-based onset

// State
let isSpectOn    = false;  // Are we drawing the spectrogram?
let isRecording  = false;  // Are we coloring frames in "record" mode?
let isFrozen     = false;  // Freeze on "Stop" recording

// Data storage
let recordedCols = [];     // columns if we want to keep them
let framesSinceNoColor = 0; // how many frames since last colored portion

// Onset detection
let colIndex        = 0;
let startTimeMs     = -1;
let customStartTimeMs = -1;

// Canvas for shifting
let tempCanvas, tempCtx;

// Animation loop
let animationId = null;

window.addEventListener('DOMContentLoaded', () => {
  axisCanvas = document.getElementById('axisCanvas');
  axisCtx    = axisCanvas.getContext('2d');
  
  spectCanvas = document.getElementById('spectCanvas');
  spectCtx    = spectCanvas.getContext('2d');

  // For shifting the spectrogram
  tempCanvas = document.createElement('canvas');
  tempCtx    = tempCanvas.getContext('2d');

  startStopBtn = document.getElementById('startStopSpectrogram');
  recordBtn    = document.getElementById('recordBtn');

  startStopBtn.addEventListener('click', onToggleSpectrogram);
  recordBtn.addEventListener('click', onToggleRecord);

  // Size canvases to match CSS
  resizeCanvases();
  window.addEventListener('resize', resizeCanvases);
});

function resizeCanvases() {
  // Match axisCanvas & spectCanvas to their displayed size
  const rect = spectCanvas.getBoundingClientRect();

  axisCanvas.width  = rect.width;
  axisCanvas.height = rect.height;

  spectCanvas.width  = rect.width;
  spectCanvas.height = rect.height;

  tempCanvas.width  = rect.width;
  tempCanvas.height = rect.height;

  // Re-draw the frequency axis
  drawFrequencyAxis();
}

/** Start/Stop Spectrogram button */
async function onToggleSpectrogram() {
  if (!audioContext) {
    await createAudioContext(); // prompt user for mic
    toggleSpectro();
  } else {
    toggleSpectro();
  }
}

function toggleSpectro() {
  if (!audioContext) return;
  if (audioContext.state === 'running') {
    // stop
    audioContext.suspend();
    startStopBtn.textContent = 'Start Spectrogram';
    isSpectOn = false;
    cancelAnimationFrame(animationId);
    animationId = null;
  } else {
    // start
    audioContext.resume();
    startStopBtn.textContent = 'Stop Spectrogram';
    isSpectOn = true;
    // re-start the loop if needed
    if (!animationId) {
      renderLoop();
    }
  }
}

/** Record button: toggles color highlighting */
function onToggleRecord() {
  isRecording = !isRecording;
  if (isRecording) {
    recordBtn.textContent = 'Stop';
    recordBtn.style.backgroundColor = 'var(--danger)';
    isFrozen = false;          // unfreeze if needed
    framesSinceNoColor = 0;
  } else {
    recordBtn.textContent = 'Record';
    recordBtn.style.backgroundColor = 'var(--primary)';
    isFrozen = true;           // freeze spectrogram
    customStartTimeMs = startTimeMs; // for the line positions
  }
}

/** Create the mic audio context + analyser */
async function createAudioContext() {
  audioContext = new AudioContext({ sampleRate: 22050 });
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const source = audioContext.createMediaStreamSource(stream);

  analyser = audioContext.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;

  source.connect(analyser);

  freqByteData = new Uint8Array(analyser.frequencyBinCount);
  freqFloatData= new Float32Array(analyser.frequencyBinCount);

  console.log('AudioContext + Analyser created');
}

/** The main animation loop */
function renderLoop() {
  animationId = requestAnimationFrame(renderLoop);

  // If spectrogram is off or no analyser => do nothing
  if (!isSpectOn || !analyser) return;

  if (isFrozen) {
    // If we are frozen => show onset lines, no shifting
    drawFrozen();
    return;
  }

  // SHIFT the spectrogram left
  tempCtx.drawImage(spectCanvas, 0, 0);

  // Get new freq data
  analyser.getFloatFrequencyData(freqFloatData);
  analyser.getByteFrequencyData(freqByteData);

  const colFloat = extractFrequenciesFloat(freqFloatData, NUM_BINS);
  const colByte  = extractFrequenciesByte(freqByteData, NUM_BINS);

  // Draw the new column on the right edge
  for (let i = 0; i < NUM_BINS; i++) {
    let y = Math.round( (i / NUM_BINS) * spectCanvas.height );
    
    // If we are recording => color; else => grayscale
    let pixelColor = isRecording ? getFullColor(colByte[i]) : getGrayColor(colByte[i]);
    spectCtx.fillStyle = pixelColor;
    
    // Each bin is ~ spectCanvas.height/NUM_BINS tall
    spectCtx.fillRect(
      spectCanvas.width - SHIFT_SPEED_PX,
      spectCanvas.height - y - spectCanvas.height/NUM_BINS,
      SHIFT_SPEED_PX,
      spectCanvas.height / NUM_BINS
    );
  }

  // Shift
  spectCtx.translate(-SHIFT_SPEED_PX, 0);
  spectCtx.drawImage(tempCanvas, 0, 0);
  spectCtx.setTransform(1, 0, 0, 1, 0, 0);

  // If recording => store this col
  if (isRecording) {
    recordedCols.push(colFloat);
  } else {
    framesSinceNoColor++;
  }

  // Onset detection
  detectOnset(colFloat);
}

/** Extract a coarse (16 bin) float frequency array */
function extractFrequenciesFloat(fullData, numBins) {
  const binSize = Math.floor(fullData.length / numBins);
  const out = new Array(numBins).fill(0);

  for (let i = 0; i < numBins; i++) {
    const start = i * binSize;
    const end   = (i === numBins - 1) ? fullData.length : start + binSize;
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += fullData[j];
    }
    out[i] = sum / (end - start);
  }
  return out;
}

/** Extract a coarse (16 bin) *byte* frequency array */
function extractFrequenciesByte(fullData, numBins) {
  const binSize = Math.floor(fullData.length / numBins);
  const out = new Array(numBins).fill(0);

  for (let i = 0; i < numBins; i++) {
    const start = i * binSize;
    const end   = (i === numBins - 1) ? fullData.length : start + binSize;
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += fullData[j];
    }
    out[i] = sum / (end - start);
  }
  return out;
}

/** Simple amplitude-based onset detection */
function detectOnset(col) {
  colIndex++;
  // Convert dB to amplitude
  let sumAmp = 0;
  for (let db of col) {
    let amp = Math.pow(10, db / DB_TO_AMP_DIV);
    sumAmp += amp;
  }
  if (sumAmp > ONSET_THRESHOLD && startTimeMs < 0) {
    startTimeMs = colIndex * 10 - 20;
    console.log("Onset detected at ms:", startTimeMs);
  }
}

/** Freeze the spectrogram and draw the lines */
function drawFrozen() {
  // Copy current spectrogram
  tempCtx.drawImage(spectCanvas, 0, 0);

  let totalCols = recordedCols.length; 
  let horizShift = (totalCols + framesSinceNoColor) * SHIFT_SPEED_PX;

  // Blue line for overall start
  tempCtx.fillStyle = 'rgb(0, 0, 255)';
  tempCtx.fillRect(spectCanvas.width - horizShift, 0, 3, spectCanvas.height);

  // Cyan lines for onset
  let onsetShift = horizShift - (customStartTimeMs / 10) * SHIFT_SPEED_PX;
  tempCtx.fillStyle = 'rgb(0,255,255)';
  tempCtx.fillRect(spectCanvas.width - onsetShift, 0, 3, spectCanvas.height);

  let offsetShift = horizShift - ((customStartTimeMs/10) + 15) * SHIFT_SPEED_PX;
  tempCtx.fillRect(spectCanvas.width - offsetShift, 0, 3, spectCanvas.height);

  // Overwrite
  spectCtx.drawImage(tempCanvas, 0, 0);
}

/** Gray color ramp for non-recording state */
function getGrayColor(value) {
  // value in [0..255], invert for a grayscale style
  const v = 255 - value;
  return `rgb(${v}, ${v}, ${v})`;
}

/** Hue ramp from 62 -> 0 for recorded frames */
function getFullColor(value) {
  const fromH = 62;
  const toH   = 0;
  const ratio = value / 255;
  const hue   = fromH + ratio * (toH - fromH);
  return `hsl(${hue}, 100%, 50%)`;
}

/** Draw frequency axis on the left side, with 4 or 5 ticks. 
    For simplicity, let’s just do [250, 500, 1000, 2000, 4000, 8000].
    We'll do a log scale.
*/
function drawFrequencyAxis() {
  if (!axisCtx) return;
  axisCtx.clearRect(0, 0, axisCanvas.width, axisCanvas.height);

  axisCtx.fillStyle = '#000';
  axisCtx.font = '14px Arial';
  axisCtx.textAlign = 'right';

  // We'll define a small array of freq ticks
  const freqTicks = [250, 500, 1000, 2000, 4000, 8000];
  const maxFreq = 8000; // up to 8k
  for (let f of freqTicks) {
    // log scale approach => y = canvas.height * (1 - log(f)/log(maxFreq))
    const y = axisCanvas.height * (1 - (Math.log(f) / Math.log(maxFreq)));
    // Draw freq label
    axisCtx.fillText(f < 1000 ? `${f} Hz` : `${f/1000} kHz`, 40, y);
    // small horizontal line
    axisCtx.fillRect(45, y, 8, 2);
  }
}
