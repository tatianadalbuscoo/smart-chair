// History data handling and visualization
let historyChart;

// Initialize posture history chart and filter functionality
function initHistory() {

    // Set up chart for history visualization
    setupHistoryChart();
    
    // Set up event listeners for history filtering (When the "Filter" button is pressed)
    document.getElementById('filter-btn').addEventListener('click', () => {
        loadHistoryData();
    });
}

// Create and configure the posture history line chart using Chart.js
function setupHistoryChart() {
    const ctx = document.getElementById('history-chart').getContext('2d');
    
    historyChart = new Chart(ctx, {
        type: 'line', // Line chart to show posture trend over time
        data: {
            labels: [],
            datasets: [
                {
                    label: 'Posture Quality (0-100)',
                    data: [],
                    backgroundColor: 'rgba(193, 122, 112, 0.2)',
                    borderColor: 'rgba(193, 122, 112, 1)',
                    borderWidth: 2,
                    tension: 0.3,
                    fill: true  // Fill area under the line
                }
            ]
        },
        options: {
            responsive: true,   // Adapt to container size
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        font: {
                            family: "'EB Garamond', serif"
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y;
                                
                                // Add posture status
                                const status = context.dataset.postureStatus?.[context.dataIndex];
                                if (status) {
                                    label += ` (${formatPostureStatus(status)})`;
                                }
                            }
                            return label;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    title: {
                        display: true,
                        text: 'Posture Quality',
                        font: {
                            family: "'EB Garamond', serif",
                            size: 14
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Time',
                        font: {
                            family: "'EB Garamond', serif",
                            size: 14
                        }
                    },
                    ticks: {
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            }
        }
    });
}

// Update the posture history chart with new filtered data
function updateHistoryChart(historyData) {

    // Ensure the chart and data are available and valid
    if (!historyChart || !historyData || !Array.isArray(historyData)) return;
    
    // Initialize arrays to hold chart data
    const labels = [];
    const values = [];
    const statuses = [];
    
    // Sort data by timestamp (oldest first)
    const sortedData = [...historyData].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    sortedData.forEach(record => {
        // Format the timestamp for display
        labels.push(formatDate(record.timestamp));
        
        // Convert posture status to a numerical value for the chart
        let value = 0;
        switch (record.postureStatus) {
            case 'good':
                value = 90;
                break;
            case 'leaning_forward':
                value = 60;
                break;
            case 'poor':
                value = 30;
                break;
            case 'not_sitting':
                value = 10;
                break;
            default:
                value = 0;
        }
        
        values.push(value);
        statuses.push(record.postureStatus);
    });
    
    // Update chart data
    historyChart.data.labels = labels;
    historyChart.data.datasets[0].data = values;
    historyChart.data.datasets[0].postureStatus = statuses;
    
    historyChart.update();
}

// Updates the posture history table with sorted data,
// formatting each row with timestamp, posture status, and sensor values
function updateHistoryTable(historyData) {
    if (!historyData || !Array.isArray(historyData)) return;
    
    const tableBody = document.getElementById('history-data');
    if (!tableBody) return;
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    // Sort data by timestamp (newest first for the table)
    const sortedData = [...historyData].sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
    );
    
    // Add data rows
    sortedData.forEach(record => {
        const row = document.createElement('tr');
        
        // Date/Time cell
        const timeCell = document.createElement('td');
        timeCell.textContent = formatDate(record.timestamp);
        row.appendChild(timeCell);
        
        // Posture Status cell
        const statusCell = document.createElement('td');
        
        // Create a status indicator span
        const statusIndicator = document.createElement('span');
        statusIndicator.textContent = formatPostureStatus(record.postureStatus);
        statusIndicator.classList.add('indicator');
        updatePostureClass(statusIndicator, record.postureStatus);
        statusCell.appendChild(statusIndicator);
        row.appendChild(statusCell);
        
        // Sensor Data cell
        const sensorCell = document.createElement('td');
        if (record.sensors && Array.isArray(record.sensors)) {
            const sensorValues = record.sensors.map((s, i) => `S${i+1}: ${s.value}`).join(', ');
            sensorCell.textContent = sensorValues;
        } else {
            sensorCell.textContent = 'N/A';
        }
        row.appendChild(sensorCell);
        
        tableBody.appendChild(row);
    });
    
    // Show message if no data
    if (sortedData.length === 0) {
        const emptyRow = document.createElement('tr');
        const emptyCell = document.createElement('td');
        emptyCell.colSpan = 3;
        emptyCell.textContent = 'No posture data available for the selected period.';
        emptyCell.style.textAlign = 'center';
        emptyCell.style.padding = '2rem 0';
        emptyRow.appendChild(emptyCell);
        tableBody.appendChild(emptyRow);
    }
}

// Show posture status with a nice label
function formatPostureStatus(status) {
    switch (status) {
        case 'good':
            return 'Good Posture';
        case 'poor':
            return 'Poor Posture';
        case 'leaning_forward':
            return 'Leaning Forward';
        case 'not_sitting':
            return 'Not Sitting';
        case 'posenet_only':
            return 'PoseNet Analysis';
        default:
            return 'Unknown';
    }
}
