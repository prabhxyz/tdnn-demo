// Load TensorFlow model
async function loadModel() {
  console.log('loading model');
  try {
    const model = await tf.loadLayersModel('https://drive.google.com/file/d/1IU0sxZdo6hDRAFzbUmh_8k8d5pCNPG7_/view?usp=sharing');
    console.log('Model loaded');
    return model;
  } catch (error) {
    console.error('Error loading model:', error);
    throw error; // Rethrow the error to handle it where this function is called
  }
}

// Make a prediction using the loaded model
function predictModel(freqData) {
  const prediction = model.predict(freqData);
  const predictedValue = prediction.argMax(1).dataSync();
  document.getElementById('model_data').innerHTML = `Prediction: ${predictedValue}`;
}

let going = false;
const webaudio_tooling_obj = function () {
  let audioContext;
  let microphone_stream = null;
  let analyserNode = null;
  const BUFF_SIZE = 16384;

  // Handle stopping recording
  document.getElementById('stop-rec').addEventListener('click', () => {
    document.getElementById('stop-rec').style.display = "none";
    document.getElementById('start-rec').style.display = "block";
    audioContext.close();
    going = false;
  });

  // Handle starting recording
  document.getElementById('start-rec').addEventListener('click', async () => {
    console.log('Starting recording...');
    going = true;
    audioContext = new AudioContext();
    document.getElementById("spectrogram").innerHTML = "";

    console.log("Audio is starting up ...");

    document.getElementById('start-rec').style.display = "none";
    document.getElementById('stop-rec').style.display = "block";

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      startAudioProcessing(stream);
    } catch (e) {
      alert('Error capturing audio.');
    }
  });

  // Start audio processing and spectrogram drawing
  function startAudioProcessing(stream) {
    // Create an analyser node
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;

    // Connect stream to analyser
    const sourceNode = audioContext.createMediaStreamSource(stream);
    sourceNode.connect(analyserNode);

    const frequencyData = new Uint8Array(analyserNode.frequencyBinCount);

    // Setup canvas for drawing the spectrogram
    const canvas = document.getElementById('spectrogram');
    const context = canvas.getContext('2d');
    canvas.width = window.innerWidth / 2;
    canvas.height = window.innerHeight / 2;
    context.clearRect(0, 0, canvas.width, canvas.height);

    // Draw spectrogram
    function drawSpectrogram(frequencyData) {
      const binWidth = canvas.width / frequencyData.length;
      const binHeight = canvas.height / analyserNode.fftSize;

      frequencyData.forEach((value, i) => {
        const x = i * binWidth;
        const y = canvas.height - value * binHeight;
        const width = binWidth;
        const height = value * binHeight;

        context.fillStyle = `rgb(${255 - value}, ${value}, 0)`;
        context.fillRect(x, y, width, height);
      });
    }

    // Update and draw spectrogram
    function updateSpectrogram() {
      analyserNode.getByteFrequencyData(frequencyData);
      drawSpectrogram(frequencyData);
      if (going) {
        requestAnimationFrame(updateSpectrogram);
      }
    }

    // Start drawing the spectrogram
    updateSpectrogram();
  }

  // Transform frequency data for better processing
  function transformFrequencyData(frequencyData, canvasHeight) {
    const numBins = frequencyData.length;
    const logFrequencies = [];

    for (let i = 0; i < numBins; i++) {
      logFrequencies.push(Math.log(i + 1) / Math.log(numBins + 1));
    }

    return Array.from({ length: canvasHeight }, (_, i) => frequencyData[Math.floor((i / canvasHeight) * numBins)]);
  }

  // Helper function to show some data
  function showSomeData(givenTypedArray, numRowToDisplay, label) {
    const sizeBuffer = givenTypedArray.length;
    const maxIndex = Math.min(numRowToDisplay, sizeBuffer);

    for (let index = 0; index < maxIndex; index++) {
      document.getElementById("spectrogram").innerHTML += givenTypedArray[index] + ", ";
    }

    document.getElementById("spectrogram").innerHTML += "<br>";
  }

  // Process microphone buffer (for FFT)
  function processMicrophoneBuffer(event) {
    const microphoneOutputBuffer = event.inputBuffer.getChannelData(0);
    showSomeData(microphoneOutputBuffer, 5, "from getChannelData");
  }

  // Start microphone stream
  function startMicrophone(stream) {
    const gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);

    microphone_stream = audioContext.createMediaStreamSource(stream);
    microphone_stream.connect(gainNode);

    const scriptProcessorNode = audioContext.createScriptProcessor(BUFF_SIZE, 1, 1);
    scriptProcessorNode.onaudioprocess = processMicrophoneBuffer;

    microphone_stream.connect(scriptProcessorNode);

    document.getElementById('volume').addEventListener('change', function () {
      gainNode.gain.value = this.value;
      console.log("Current volume: ", this.value);
    });

    // Setup FFT
    const scriptProcessorFftNode = audioContext.createScriptProcessor(2048, 1, 1);
    scriptProcessorFftNode.connect(gainNode);

    analyserNode.smoothingTimeConstant = 0;
    analyserNode.fftSize = 2048;

    microphone_stream.connect(analyserNode);
    analyserNode.connect(scriptProcessorFftNode);

    scriptProcessorFftNode.onaudioprocess = () => {
      const array = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteFrequencyData(array);
      if (microphone_stream.playbackState === microphone_stream.PLAYING_STATE) {
        showSomeData(array, 16, "from FFT");
      }
    };
  }
}();
