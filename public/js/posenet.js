// PoseNet integration for posture tracking
let video;
let poseNet;
let pose;
let isRunning = false;
let videoStream = null;
let socket;

// Initializes PoseNet feature:
// sets up camera toggle and listens for posture updates from the server
function initPoseNet(socketConnection) {
    socket = socketConnection;
    
    // Set up the camera button
    const cameraButton = document.getElementById('toggle-camera');
    cameraButton.addEventListener('click', toggleCamera);

    // Listen for posture updates from the server and update the status if valid data is received
    socket.on('postureUpdate', (data) => {
        if (data.hasPoseData && data.postureStatus) {
            updatePostureStatus(data.postureStatus);
        }
    });
}

//Toggles the camera on and off, starting or stopping PoseNet analysis
async function toggleCamera() {
    const cameraButton = document.getElementById('toggle-camera');
    
    if (!isRunning) {

        // Start PoseNet and camera
        cameraButton.textContent = 'Starting...';
        await setupPoseNet();
        cameraButton.textContent = 'Stop Camera';
        isRunning = true;
    } else {

        // Stop the video stream and PoseNet
        if (videoStream) {
            videoStream.getTracks().forEach(track => track.stop());
            videoStream = null;
            video.srcObject = null;
        }
        
        cameraButton.textContent = 'Start Camera';
        isRunning = false;
    }
}

//// Sets up the webcam, video stream, canvas,
// and loads the PoseNet model to start real-time pose detection
async function setupPoseNet() {
    try {
        video = document.getElementById('video');
        const canvas = document.getElementById('output');
        
        // Set video dimensions
        video.width = 640;
        video.height = 480;
        canvas.width = 640;
        canvas.height = 480;
        
        // Make video visible for debugging but transparent
        video.style.display = "block";
        video.style.position = "absolute";
        video.style.opacity = "0.01";
        video.style.zIndex = "-1";
        
        // Set up video from webcam
        videoStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            },
            audio: false
        });

        // Assign stream to video element
        video.srcObject = videoStream;

        // Wait for video metadata to load before continuing
        return new Promise((resolve, reject) => {
            video.onloadedmetadata = () => {
                console.log('Video metadata loaded');
                console.log('Video dimensions:', video.videoWidth, 'x', video.videoHeight);

                // Start playing the video
                video.play().then(() => {
                    console.log('Video is playing');
                    
                    const ctx = canvas.getContext('2d');
                    
                    // Load PoseNet model
                    console.log('Loading PoseNet model...');
                    loadPoseNetModel().then(net => {
                        console.log('PoseNet model loaded successfully');
                        poseNet = net;

                        // Start detecting poses after a short delay to ensure video is ready
                        setTimeout(() => {
                            detectPose(video, canvas, ctx);
                        }, 1000);
                        resolve();
                    }).catch(error => {
                        console.error('Error loading PoseNet model:', error);
                        reject(error);
                    });
                }).catch(error => {
                    console.error('Error playing video:', error);
                    reject(error);
                });
            };
            
            video.onerror = (error) => {
                console.error('Video error:', error);
                reject(error);
            };
        });
    } catch (error) {
        console.error('Error setting up PoseNet:', error);
        alert('Could not access camera. Please check permissions and try again.');
        throw error;
    }
}

// Loads the PoseNet model with specified configuration
async function loadPoseNetModel() {
    const model = await posenet.load({
        architecture: 'MobileNetV1',
        outputStride: 16,
        inputResolution: { width: 640, height: 480 },
        multiplier: 0.75
    });
    
    return model;
}

// Detects human pose from the video stream using PoseNet,
// draws it on canvas, and sends analysis to server
async function detectPose(video, canvas, ctx) {

    // Stop if camera or model isn't active
    if (!isRunning || !poseNet) return;
    
    try {
        // Detect poses
        const poses = await poseNet.estimateMultiplePoses(video, {
            flipHorizontal: true,
            maxDetections: 1, // Only detect one person (the user)
            scoreThreshold: 0.6,
            nmsRadius: 20
        });
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // First draw an initial background so we know canvas is working
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw the video frame (mirrored)
        if (video.readyState >= 2) {  // HAVE_CURRENT_DATA or better
            ctx.save();
            ctx.scale(-1, 1);
            ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
            ctx.restore();
            
            // Add a debugging message directly on canvas
            if (!poses || poses.length === 0) {
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillRect(canvas.width/2 - 140, canvas.height/2 - 15, 280, 30);
                ctx.fillStyle = 'white';
                ctx.font = '14px Arial';
                ctx.textAlign = 'center';
                ctx.fillText('Looking for you... Stand in view of camera', canvas.width/2, canvas.height/2);
            }
        } else {

            // Video not ready yet, draw message
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(canvas.width/2 - 100, canvas.height/2 - 15, 200, 30);
            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('Camera starting...', canvas.width/2, canvas.height/2);
        }
        
        // If we detected a pose, draw it and send it to the server
        if (poses.length > 0) {
            pose = poses[0];
            drawPose(pose, ctx);
            analyzePose(pose);
        }
        
        // Continue detecting
        requestAnimationFrame(() => detectPose(video, canvas, ctx));
    } catch (error) {
        console.error('Error detecting pose:', error);

        // Continue anyway
        requestAnimationFrame(() => detectPose(video, canvas, ctx));
    }
}

// Draws the detected pose on canvas using circles for keypoints and lines for the skeleton
function drawPose(pose, ctx) {
    if (!pose) return;

    // Draw each keypoint as a small circle if confidence is high enough
    pose.keypoints.forEach(keypoint => {
        if (keypoint.score > 0.5) {
            ctx.beginPath();
            ctx.arc(keypoint.position.x, keypoint.position.y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = 'aqua';
            ctx.fill();
        }
    });

    // Define the connections between keypoints
    //(skeleton)
    const skeleton = [
        ['nose', 'leftEye'], ['leftEye', 'leftEar'], ['nose', 'rightEye'],
        ['rightEye', 'rightEar'], ['nose', 'leftShoulder'], 
        ['nose', 'rightShoulder'], ['leftShoulder', 'rightShoulder']
    ];

    // Draw lines between connected keypoints to form the skeleton
    ctx.strokeStyle = 'aqua';
    ctx.lineWidth = 2;
    
    skeleton.forEach(pair => {
        const partA = getKeypoint(pose.keypoints, pair[0]);
        const partB = getKeypoint(pose.keypoints, pair[1]);
        
        if (partA && partB && partA.score > 0.5 && partB.score > 0.5) {
            ctx.beginPath();
            ctx.moveTo(partA.position.x, partA.position.y);
            ctx.lineTo(partB.position.x, partB.position.y);
            ctx.stroke();
        }
    });
}

// Returns the keypoint object with the given name (e.g., 'leftShoulder')
function getKeypoint(keypoints, name) {
    return keypoints.find(keypoint => keypoint.part === name);
}

// This function analyzes the pose data and sends it to the server
// Sends pose data to the server every 1 second for further analysis
function analyzePose(pose) {
    if (!pose || !socket) return;
    
    // Only send data every 1 second to avoid flooding the server
    if (!analyzePose.lastSent || (Date.now() - analyzePose.lastSent) > 1000) {
        analyzePose.lastSent = Date.now();
        
        // Send pose data to server for analysis (via socket for real-time analysis)
        socket.emit('poseData', {
            chairId: 'CHAIR01',
            keypoints: pose.keypoints
        });
        
        // For development purposes, you can also use the API endpoint
        fetch('/posenet', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chairId: 'CHAIR01',
                keypoints: pose.keypoints
            })
        }).catch(error => {
            console.error('Error sending pose data:', error);
        });
    }
}

