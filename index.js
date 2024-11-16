// defines a TF model load function
function loadModel(){	
  console.log('loading model');
  	
  // loads the model
  model = tf.loadLayersModel('https://drive.google.com/file/d/1IU0sxZdo6hDRAFzbUmh_8k8d5pCNPG7_/view?usp=sharing');   
  
  // model.then(function (res) {
  //   // warm start the model. speeds up the first inference
  //   model.predict(tf.zeros([1, 15, 16]))
  //   console.log('sample loaded to be' + model.predict(tf.zeros([1, 15, 16])));
  //   console.log(prediction);
  // }, function (err) {
  //     console.log(err);
  // });
  
  
  // return model
  return model
}

function predictModel(freqData){

  // gets model prediction
  y = model.predict(freqData);
  
  // replaces the text in the result tag by the model prediction
  document.getElementById('model_data').innerHTML = "Prediction: " + y.argMax(1).dataSync();
}

var going = false;
var webaudio_tooling_obj = function () {
	var audioContext;
	var audioInput = null,
      microphone_stream = null,
      gain_node = null,
      script_processor_node = null,
      script_processor_fft_node = null,
      analyserNode = null;
  var BUFF_SIZE = 16384;

  document.getElementById('stop-rec').addEventListener('click', function () {
    document.getElementById('stop-rec').style = "display: none";
      document.getElementById('start-rec').style = "display: block";
      audioContext.close();
      going = false;
  });

	document.getElementById('start-rec').addEventListener('click', function () {
    console.log('button pressed');
    loadModel();
    going = true;
    audioContext = new AudioContext();
    document.getElementById("spectrogram").innerHTML = "";

    console.log("audio is starting up ...");

    document.getElementById('start-rec').style = "display: none";
    document.getElementById('stop-rec').style = "display: block";

    

    if (!navigator.getUserMedia)
      navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia || navigator.msGetUserMedia;

    if (navigator.getUserMedia){
    	console.log('line 43')
      navigator.getUserMedia({audio:true}, 
        function(stream) {
            console.log('line 46');
            // start_microphone(stream);
            // chat gpt code below

            // Create an AnalyserNode object
            var analyserNode = audioContext.createAnalyser();
            analyserNode.fftSize = 2048;
            
            // Connect the AnalyserNode to the audio input stream
            var sourceNode = audioContext.createMediaStreamSource(stream);
            sourceNode.connect(analyserNode);
            
            // Get the frequency data
            var frequencyData = new Uint8Array(analyserNode.frequencyBinCount);
            analyserNode.getByteFrequencyData(frequencyData);

            // document.getElementById("spectrogram").innerHTML = frequencyData;

            // Create a canvas element and a 2D drawing context
            var canvas = document.getElementById('spectrogram');
            var context = canvas.getContext('2d');
            
            // Set the canvas dimensions and clear the canvas
            canvas.width = window.innerWidth / 2;
            canvas.height = window.innerHeight / 2;
            context.clearRect(0, 0, canvas.width, canvas.height);
            console.log(canvas.width, canvas.height)

            // Get the frequency data and draw the spectrogram
            function drawSpectrogram(canvas, context, frequencyData) {
              // Create a new image data object
              // var imageData = context.createImageData(canvas.width, canvas.height);
            
              // // Loop through the frequency data array
              // for (var i = 0; i < frequencyData.length; i++) {
              //   // Set the pixel value for the current frequency and time bin
              //   var value = frequencyData[i];
              //   var color = getColor(value);
              //   var x = i % canvas.width;
              //   var y = canvas.height - Math.floor(i / canvas.width);
              //   setPixel(imageData, x, canvas.height - y, color);
              // }
            
              // // Put the image data on the canvas
              // context.putImageData(imageData, 0, 0);
              
              var binWidth = canvas.width / frequencyData.length;
              var binHeight = canvas.height / analyserNode.fftSize;
              // Loop through the frequency bins and draw the spectrogram
              for (var i = 0; i < frequencyData.length; i++) {
                var x = i * binWidth;
                var y = canvas.height - frequencyData[i] * binHeight;
                var width = binWidth;
                var height = frequencyData[i] * binHeight;
                
                context.fillStyle = 'rgb(' + (255 - frequencyData[i]) + ', ' + frequencyData[i] + ', 0)';
                context.fillRect(x, y, width, height);
              }
            }

            function updateSpectrogram() {
              // Get the current frequency data from the analyser node
              analyserNode.getByteFrequencyData(frequencyData);

              // if (frequencyData[0] === 0) {
              //   console.warn(`Looks like zeros...`);
              // }
  
              // Use the frequency data array as needed
              document.getElementById('spectrogram_data').innerHTML = frequencyData;
              // document.getElementById('model_data').innerHTML = 0;
              // predictModel(frequencyData);

              // Draw the frequency data as a spectrogram on the canvas
              drawSpectrogram(canvas, context, frequencyData);
              // Schedule the next update to occur at the next animation frame
              requestAnimationFrame(updateSpectrogram);
            }
            
            // Call the updateSpectrogram function to start the animation loop
            if (going){
              updateSpectrogram();
            }
            
            // // Start drawing the spectrogram
            // drawSpectrogram();
                
          },
        function(e) {
          alert('Error capturing audio.');
        }
      )

    } else { alert('getUserMedia not supported in this browser.'); }

	});

  function transformFrequencyData(frequencyData, canvasHeight) {
    // Compute the log frequencies
    var numBins = frequencyData.length;
    var logFrequencies = [];
    for (var i = 0; i < numBins; i++) {
      var logFrequency = Math.log(i + 1) / Math.log(numBins + 1);
      logFrequencies.push(logFrequency);
    }
  
    // Compute the transformed frequency data
    var transformedData = [];
    for (var i = 0; i < canvasHeight; i++) {
      var logFrequency = i / canvasHeight;
      var index = Math.floor(logFrequency * numBins);
      var value = frequencyData[index];
      transformedData.push(value);
    }
  
    return transformedData;
  }

  function getColor(value) {
    var fromH = 62;
    var toH = 0;
    var percent = value / 255;
    var delta = percent * (toH - fromH);
    var hue = fromH + delta;
    return 'hsl(H, 100%, 50%)'.replace(/H/g, hue);
  }

  // Helper function to set a pixel value in an image data object
function setPixel(imageData, x, y, color) {
  var index = (x + y * imageData.width) * 4;
  imageData.data[index + 0] = color[0];
  imageData.data[index + 1] = color[1];
  imageData.data[index + 2] = color[2];
  imageData.data[index + 3] = 255;
}

  function show_some_data(given_typed_array, num_row_to_display, label) {

      var size_buffer = given_typed_array.length;
      var index = 0;
      var max_index = num_row_to_display;

      // console.log("__________ " + label);
      console.log(given_typed_array.length, given_typed_array[0].length);


      for (; index < max_index && index < size_buffer; index += 1) {
      document.getElementById("spectrogram").innerHTML += given_typed_array[index] + ", ";
      // console.table(given_typed_array);
      }
      // console.log(given_typed_array);
      document.getElementById("spectrogram").innerHTML += "<br>"
    }

  function process_microphone_buffer(event) { // invoked by event loop

      var i, N, inp, microphone_output_buffer;

      microphone_output_buffer = event.inputBuffer.getChannelData(0); // just mono - 1 channel for now

      // microphone_output_buffer  <-- this buffer contains current gulp of data size BUFF_SIZE

      show_some_data(microphone_output_buffer, 5, "from getChannelData");
    }

    function start_microphone(stream){

      gain_node = audioContext.createGain();
      gain_node.connect( audioContext.destination );
      // gain_node.getAudioContext().resume();

      microphone_stream = audioContext.createMediaStreamSource(stream);
      microphone_stream.connect(gain_node); 

      script_processor_node = audioContext.createScriptProcessor(BUFF_SIZE, 1, 1);
      script_processor_node.onaudioprocess = process_microphone_buffer;

      microphone_stream.connect(script_processor_node);

      // --- enable volume control for output speakers

      document.getElementById('volume').addEventListener('change', function() {

          var curr_volume = this.value;
          gain_node.gain.value = curr_volume;

          console.log("curr_volume ", curr_volume);
      });
      console.log('line 104');

      // --- setup FFT

      script_processor_fft_node = audioContext.createScriptProcessor(2048, 1, 1);
      script_processor_fft_node.connect(gain_node);

      analyserNode = audioContext.createAnalyser();
      analyserNode.smoothingTimeConstant = 0;
      analyserNode.fftSize = 2048;

      microphone_stream.connect(analyserNode);

      analyserNode.connect(script_processor_fft_node);

      console.log(microphone_stream);
      console.log("analyserNode");
      console.log(analyserNode);

      script_processor_fft_node.onaudioprocess = function() {

        // get the average for the first channel
        var array = new Uint8Array(analyserNode.frequencyBinCount);
        analyserNode.getByteFrequencyData(array);

        console.log('line 124');
        console.log("freq bin count", analyserNode.frequencyBinCount);

        // draw the spectrogram
    	if (microphone_stream.playbackState == microphone_stream.PLAYING_STATE) {
            show_some_data(array, 16, "from fft");
        }
      };

      // script_processor_node.onaudioprocess();
    }

  }(); 
  // webaudio_tooling_obj = function()