
// Connects to the server and listens for incoming data.
// As soon as new chair data arrives,
// it updates the website visualization in real time.
function initChair(socket) {

    // Listen for incoming chair data from the server
    socket.on('chairData', (data) => {
        console.log('Received chair data:', data);

        // Update the sensor display and posture indicator on the page
        updateChairVisualization(data.sensors);
        updatePostureStatus(data.postureStatus);
    });
}

// Updates sensor display with color, size, and value based on pressure data
function updateChairVisualization(sensors) {

    // Validate input: make sure sensors is a non-empty array
    if (!sensors || !Array.isArray(sensors)) return;
    
    // Find the maximum value to normalize the visualization
    const maxValue = Math.max(...sensors.map(sensor => sensor.value));
    
    // Update each sensor visualization
    sensors.forEach((sensor, index) => {
        const sensorElement = document.getElementById(`sensor${index + 1}`);
        if (!sensorElement) return;
        
        // Calculate intensity based on the sensor value
        const normalizedValue = sensor.value / Math.max(maxValue, 1);
        
        // Use the normalized value to determine color intensity
        const intensity = Math.min(Math.floor(normalizedValue * 100), 100);
        
        // Get a color based on intensity (from yellow to red)
        const hue = Math.max(120 - intensity * 1.2, 0);
        const backgroundColor = `hsl(${hue}, 80%, 70%)`;
        
        // Apply styles to the sensor element
        sensorElement.style.backgroundColor = backgroundColor;
        
        // Scale the size slightly based on pressure
        const scale = 1 + normalizedValue * 0.2;
        sensorElement.style.transform = `scale(${scale})`;
        
        // Display the value
        sensorElement.textContent = `S${index + 1}: ${sensor.value}`;
    });
}

// Update the posture status display based on current status
function updatePostureStatus(status) {
    const statusElement = document.getElementById('posture-status').querySelector('.indicator');
    if (!statusElement) return;
    
    updatePostureClass(statusElement, status);
}
