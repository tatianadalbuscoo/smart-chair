
// Web framework for creating APIs and web servers
const express = require('express');

// Core Node module to create HTTP server
const http = require('http');

// Real-time communication via WebSockets
const socketIo = require('socket.io');

// MongoDB object modeling tool
const mongoose = require('mongoose');

// Loads environment variables from .env file
require('dotenv').config();

const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

// Initialize Express app and HTTP server
const app = express();
const server = http.createServer(app); // Create HTTP server with Express app
const io = socketIo(server);  // Attach Socket.IO to the server for WebSocket communication

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Set the MongoDB connection URI (from env or default to localhost)
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/smartchair';

// Connect to MongoDB using Mongoose
mongoose.connect(MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define the schema for posture data documents
const PostureDataSchema = new mongoose.Schema({
  chairId: String,
  timestamp: { type: Date, default: Date.now }, // When the data was recorded
  sensors: [{ value: Number }],
  poseData: Object,
  postureStatus: String
});

const PostureData = mongoose.model('PostureData', PostureDataSchema);

// Evaluate posture based on sensor data
function evaluatePosture(sensorData, poseData = null) {
  const sensorValues = sensorData.map(s => s.value);
  
  // Check if weight distribution is balanced
  const leftSide = sensorValues[0] + sensorValues[2];
  const rightSide = sensorValues[1] + sensorValues[3];
  
  const difference = Math.abs(leftSide - rightSide);
  const totalWeight = sensorValues.reduce((sum, val) => sum + val, 0);
  
  // If total weight is too low, person is not sitting
  if (totalWeight < 200) {
    return 'not_sitting';
  }
  
  // If imbalance exceeds 30% of total weight, posture is poor
  if (difference > totalWeight * 0.3) {
    return 'poor';
  }
  
  // Check if weight is distributed toward the back (good support)
  const backWeight = sensorValues[2] + sensorValues[3];
  const frontWeight = sensorValues[0] + sensorValues[1];
  
  if (backWeight < frontWeight * 0.8) {
    return 'leaning_forward';
  }

  return 'good';
}

// Function to analyze posture from PoseNet keypoints
function analyzePoseNetPosture(keypoints) {

  // Get key body parts for posture analysis
  const nose = keypoints.find(kp => kp.part === 'nose');
  const leftShoulder = keypoints.find(kp => kp.part === 'leftShoulder');
  const rightShoulder = keypoints.find(kp => kp.part === 'rightShoulder');
  const leftEar = keypoints.find(kp => kp.part === 'leftEar');
  const rightEar = keypoints.find(kp => kp.part === 'rightEar');

  // Check if we have enough data for analysis
  if (!nose || !leftShoulder || !rightShoulder ||
      nose.score < 0.5 || leftShoulder.score < 0.5 || rightShoulder.score < 0.5) {
    return 'insufficient_data';
  }

  // Calculate shoulder alignment (should be relatively horizontal)
  const shoulderDiff = Math.abs(leftShoulder.position.y - rightShoulder.position.y);
  const shoulderDistance = Math.abs(leftShoulder.position.x - rightShoulder.position.x);

  // If shoulders are severely tilted (more than 20% of shoulder width difference in height)
  if (shoulderDiff > shoulderDistance * 0.2) {
    return 'poor';
  }

  // Calculate head forward position relative to shoulders
  const shoulderCenterY = (leftShoulder.position.y + rightShoulder.position.y) / 2;
  const headForwardRatio = (nose.position.y - shoulderCenterY) / shoulderDistance;

  // If head is too far forward (forward head posture)
  if (headForwardRatio < -0.3) {
    return 'leaning_forward';
  }

  // Check for head tilt using ears if available
  if (leftEar && rightEar && leftEar.score > 0.5 && rightEar.score > 0.5) {
    const earDiff = Math.abs(leftEar.position.y - rightEar.position.y);
    const earDistance = Math.abs(leftEar.position.x - rightEar.position.x);

    // Significant head tilt
    if (earDiff > earDistance * 0.3) {
      return 'poor';
    }
  }

  return 'good';
}

// Routes

// Route to check if the server is running correctly (health check endpoint)
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});


// Endpoint to receive ESP32 data
app.post('/chair', async (req, res) => {
  try {
    console.log('Received chair data:', req.body);
    
    const sensorData = req.body.sensors;
    const chairId = req.body.id || 'unknown';
    
    if (!sensorData || !Array.isArray(sensorData)) {
      console.error('Invalid sensor data format:', req.body);
      return res.status(400).json({ error: 'Invalid sensor data format' });
    }
    
    // Evaluate posture based on sensor data
    const postureStatus = evaluatePosture(sensorData);
    
    // Create a record in the database
    const postureRecord = new PostureData({
      chairId,
      sensors: sensorData,
      postureStatus
    });
    
    await postureRecord.save();
    console.log('Data saved to database');
    
    // Emit the data to connected clients via Socket.io
    io.emit('chairData', {
      chairId,
      sensors: sensorData,
      timestamp: new Date(),
      postureStatus
    });
    
    res.status(200).json({ 
      message: 'Data received successfully',
      postureStatus
    });
  } catch (error) {
    console.error('Error processing chair data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});


// Endpoint to receive PoseNet data
app.post('/posenet', async (req, res) => {
  try {
    console.log('Received PoseNet data');
    
    const { chairId, keypoints } = req.body;
    
    if (!keypoints || !Array.isArray(keypoints)) {
      return res.status(400).json({ error: 'Invalid keypoints data' });
    }
    
    // Analyze posture from PoseNet data
    const posePosture = analyzePoseNetPosture(keypoints);
    
    // Save PoseNet data to database
    const postureRecord = new PostureData({
      chairId,
      poseData: { keypoints },
      postureStatus: posePosture
    });
    
    await postureRecord.save();
    console.log('PoseNet data saved to database');
    
    // Emit to connected clients
    io.emit('postureUpdate', {
      chairId,
      postureStatus: posePosture,
      hasPoseData: true,
      timestamp: new Date()
    });
    
    res.json({ 
      message: 'PoseNet data received successfully',
      postureStatus: posePosture
    });
  } catch (error) {
    console.error('Error processing PoseNet data:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get historical posture data
app.get('/api/history/:chairId', async (req, res) => {
  try {
    const { chairId } = req.params;
    const { limit = 100, from, to } = req.query;
    
    const query = { chairId };
    
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }
    
    const history = await PostureData.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .select('-__v');
    
    res.json(history);
  } catch (error) {
    console.error('Error retrieving history:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('Client connected');
  
  // Handle incoming PoseNet data via Socket.IO
  socket.on('poseData', async (data) => {
    try {
      console.log('Received PoseNet data via Socket.IO');
      
      const { chairId, keypoints } = data;
      
      if (!keypoints || !Array.isArray(keypoints)) {
        console.error('Invalid keypoints data received via socket');
        return;
      }
      
      // Analyze posture from PoseNet data
      const posePosture = analyzePoseNetPosture(keypoints);
      console.log(`PoseNet posture analysis: ${posePosture}`);
      
      // Save PoseNet data to database
      const postureRecord = new PostureData({
        chairId,
        poseData: { keypoints },
        postureStatus: posePosture
      });
      
      await postureRecord.save();
      
      // Emit to all connected clients
      io.emit('postureUpdate', {
        chairId,
        postureStatus: posePosture,
        hasPoseData: true,
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error processing PoseNet data via socket:', error);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

