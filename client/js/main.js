// Main application script
// Initializes app modules and connects to server once the page is fully loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Socket.IO
    const socket = io();
    
    // Set up Socket.IO event listeners
    socket.on('connect', () => {
        console.log('Connected to server');
    });
    
    // Initialize modules
    initChair(socket);
    initPoseNet(socket);
    initHistory();
    
    // Set current date in the date filters
    setupDateFilters();
});

// Set default date filters to last 7 days and load history data
function setupDateFilters() {
    const today = new Date();
    const fromDate = new Date();

    // Set "from" date to 7 days ago
    fromDate.setDate(today.getDate() - 7);

    // Populate the date inputs with the default values
    document.getElementById('from-date').valueAsDate = fromDate;
    document.getElementById('to-date').valueAsDate = today;

    // Add event listener to filter button
    document.getElementById('filter-btn').addEventListener('click', () => {
        loadHistoryData();
    });
    
    // Initial load of history data
    loadHistoryData();
}

// Loads history data based on selected date range
function loadHistoryData() {
    const fromDate = document.getElementById('from-date').value;
    const toDate = document.getElementById('to-date').value;

    // Fetch data for the selected chair and date range
    fetchHistory('CHAIR01', fromDate, toDate);
}

// Fetches posture history data from the server and updates the chart/table
function fetchHistory(chairId, from, to) {
    const url = `/api/history/${chairId}?from=${from}&to=${to}`;
    
    fetch(url)
        .then(response => response.json())
        .then(data => {
            // Update the table and chart with the fetched data
            updateHistoryTable(data);
            updateHistoryChart(data);
        })
        .catch(error => {
            console.error('Error fetching history:', error);
        });
}

// Formats a date string into a readable format (e.g., "Apr 27, 2025, 14:30")
function formatDate(dateString) {
    const options = { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
}

// Update the status class for posture indicators
function updatePostureClass(element, status) {
    element.classList.remove('good', 'poor', 'leaning_forward', 'not_sitting');

    if (['good', 'poor', 'leaning_forward', 'not_sitting'].includes(status)) {
        element.classList.add(status);
    }

    let statusText = 'Unknown';
    let adviceText = 'Posture not recognized.';

    switch (status) {
        case 'good':
            statusText = 'Good Posture';
            adviceText = 'Great job! Keep your back straight and relaxed, with your shoulders aligned.';
            break;
        case 'poor':
            statusText = 'Poor Posture';
            adviceText = 'Your shoulders appear unbalanced. Straighten your back and distribute your weight evenly.';
            break;
        case 'leaning_forward':
            statusText = 'Leaning Forward';
            adviceText = 'Your head is too far forward. Pull your chin back and align your ears with your shoulders.';
            break;
        case 'not_sitting':
            statusText = 'Not Sitting';
            adviceText = 'No sitting posture detected. Make sure you’re seated and visible to the camera.';
            break;
    }

    // Update side panel next to the video
    const panel = document.getElementById('posture-feedback');
    if (panel) {
        panel.className = `posture-box ${status}`;
        document.getElementById('feedback-status').textContent = statusText;
        document.getElementById('feedback-description').textContent = adviceText;
    }
}




