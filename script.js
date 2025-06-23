// This file is the single source of truth for all frontend JavaScript.

// Global object to hold our chart instances. This allows us to destroy them before creating new ones.
let charts = {};

/**
 * Handles the log submission process.
 */
async function submitLog() {
  const entryText = document.getElementById('log').value.trim();
  const button = document.getElementById('analyzeBtn');
  const spinner = document.getElementById('spinner');

  if (!entryText) {
    alert("Please enter a log entry.");
    return;
  }

  button.disabled = true;
  button.innerText = "Analyzing...";
  spinner.style.display = 'inline-block';
  document.getElementById('results').style.display = 'none';

  try {
    const response = await fetch('/.netlify/functions/analyze-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: entryText }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'An unknown error occurred.' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const newLog = await response.json();
    
    displayResults(newLog); 
    await loadRecentLogs();
    // After a new log is submitted, refresh the charts as well
    await fetchAndRenderCharts(7);
    document.querySelector('#btn7day').classList.add('active');
    document.querySelector('#btn30day').classList.remove('active');


  } catch (e) {
    alert("Something went wrong:\n" + e.message);
    console.error(e);
  } finally {
    resetUI();
  }
}

/**
 * Fetches the last 7 logs for the table display.
 */
async function loadRecentLogs() {
  try {
    const response = await fetch('/.netlify/functions/recent-logs');
    if (!response.ok) {
      throw new Error("Failed to load recent logs");
    }
    const recentLogs = await response.json();
    renderLogTable(recentLogs);
  } catch (e) {
    console.error("Failed to load logs:", e.message);
    const tbody = document.querySelector('#logTable tbody');
    tbody.innerHTML = `<tr><td colspan="6" class="error">Could not load recent logs.</td></tr>`;
  }
}

/**
 * Populates the results card with the data from the newly created log.
 */
function displayResults(result) {
  document.getElementById('clarity').innerText = result.Clarity || 'N/A';
  document.getElementById('immune').innerText = result.Immune || 'N/A';
  document.getElementById('physical').innerText = result.PhysicalReadiness || 'N/A';
  document.getElementById('notes').innerText = result.Notes || 'N/A';
  document.getElementById('results').style.display = 'block';
  document.getElementById('log').value = '';
}

/**
 * Renders the rows in the recent logs table.
 */
function renderLogTable(logs) {
  const tbody = document.querySelector('#logTable tbody');
  tbody.innerHTML = '';

  if (!logs || logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No entries found.</td></tr>`;
    return;
  }
  
  logs.forEach(logData => {
    const tr = document.createElement('tr');
    tr.addEventListener('click', () => openLogModal(logData));

    td(new Date(logData.created_at).toLocaleDateString(), tr);
    td(logData.Log, tr);
    td(logData.Clarity, tr, true);
    td(logData.Immune, tr, true);
    td(logData.PhysicalReadiness, tr, true);
    td(logData.Notes, tr);
    
    tbody.appendChild(tr);
  });
}

function td(content, parent, isScore = false) {
    const cell = document.createElement('td');
    cell.textContent = content;
    if (isScore) {
        const value = String(content || '').toLowerCase();
        if (["high", "medium", "low"].includes(value)) {
          cell.classList.add(value);
        }
    }
    parent.appendChild(cell);
}

/**
 * Modal open/close functions
 */
function openLogModal(logData) {
    document.getElementById('modalDate').textContent = new Date(logData.created_at).toLocaleString();
    document.getElementById('modalLog').textContent = logData.Log;
    document.getElementById('modalClarity').textContent = logData.Clarity;
    document.getElementById('modalImmune').textContent = logData.Immune;
    document.getElementById('modalPhysical').textContent = logData.PhysicalReadiness;
    document.getElementById('modalNotes').textContent = logData.Notes;
    document.getElementById('logModal').style.display = 'flex';
}

function closeLogModal() {
    document.getElementById('logModal').style.display = 'none';
}

/**
 * Resets the analyze button and spinner to their default state.
 */
function resetUI() {
  const button = document.getElementById('analyzeBtn');
  const spinner = document.getElementById('spinner');
  button.disabled = false;
  button.innerText = "Analyze Log";
  spinner.style.display = 'none';
}


// === NEW CHARTING FUNCTIONS ===

/**
 * Fetches data from our new endpoint and triggers the chart rendering.
 * @param {number} range - The number of days for the chart (e.g., 7 or 30).
 */
async function fetchAndRenderCharts(range) {
    try {
        const response = await fetch(`/.netlify/functions/get-chart-data?range=${range}`);
        if (!response.ok) throw new Error('Failed to fetch chart data');
        const data = await response.json();
        renderAllCharts(data);
    } catch (error) {
        console.error("Error fetching or rendering charts:", error);
        // You could add an error message to the chart area here
    }
}

/**
 * Main function to render all three charts.
 * @param {object} data - The chart data from our Netlify function.
 */
function renderAllCharts(data) {
    const sharedOptions = {
        plugins: { legend: { display: false } },
        scales: { 
            y: { 
                beginAtZero: true, 
                max: 4, // Max value is 3 (high) + 1 for padding
                ticks: {
                    stepSize: 1,
                    callback: function(value) {
                        const labels = ['', 'Low', 'Medium', 'High'];
                        return labels[value];
                    }
                }
            } 
        },
        elements: { line: { tension: 0.3 } } // Makes the lines smooth
    };

    renderChart('clarityChart', 'Mental Clarity', data.labels, data.clarityData, '#3B82F6', sharedOptions);
    renderChart('immuneChart', 'Immune Risk', data.labels, data.immuneData, '#ca8a04', sharedOptions);
    renderChart('physicalChart', 'Physical Output', data.labels, data.physicalData, '#16a34a', sharedOptions);
}

/**
 * Renders a single chart instance.
 * @param {string} canvasId - The ID of the <canvas> element.
 * @param {string} label - The label for the dataset (e.g., 'Mental Clarity').
 * @param {Array} labels - The x-axis labels (dates).
 * @param {Array} data - The y-axis data (scores).
 * @param {string} color - The line/point color for the chart.
 * @param {object} options - The shared chart options.
 */
function renderChart(canvasId, label, labels, data, color, options) {
    // If a chart instance already exists, destroy it before creating a new one.
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    const ctx = document.getElementById(canvasId).getContext('2d');
    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: color,
                borderColor: color,
                borderWidth: 2,
                pointRadius: 3,
            }]
        },
        options: {
            ...options, // Use the shared options
            plugins: {
                ...options.plugins,
                title: { // Add a specific title to each chart
                    display: true,
                    text: label,
                    font: { size: 16 }
                }
            }
        }
    });
}


/**
 * This is the entry point of our application.
 */
document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const logTextarea = document.getElementById('log');
  const closeModalBtn = document.getElementById('closeModal');
  const modalOverlay = document.getElementById('logModal');
  const btn7day = document.getElementById('btn7day');
  const btn30day = document.getElementById('btn30day');

  // Button listeners
  if (analyzeBtn) analyzeBtn.addEventListener('click', submitLog);
  if(closeModalBtn) closeModalBtn.addEventListener('click', closeLogModal);
  if (btn7day) btn7day.addEventListener('click', () => {
    fetchAndRenderCharts(7);
    btn7day.classList.add('active');
    btn30day.classList.remove('active');
  });
  if (btn30day) btn30day.addEventListener('click', () => {
    fetchAndRenderCharts(30);
    btn30day.classList.add('active');
    btn7day.classList.remove('active');
  });
  
  // Textarea listener
  if (logTextarea) {
    logTextarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitLog();
      }
    });
  }

  // Modal overlay listener
  if(modalOverlay) {
      modalOverlay.addEventListener('click', (event) => {
          if (event.target === modalOverlay) closeLogModal();
      });
  }

  // Initial data load
  loadRecentLogs();
  fetchAndRenderCharts(7); // Load the 7-day chart by default
});