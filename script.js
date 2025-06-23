// This file is the single source of truth for all frontend JavaScript.

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

  // --- Update UI to show loading state ---
  button.disabled = true;
  button.innerText = "Analyzing...";
  spinner.style.display = 'inline-block';
  document.getElementById('results').style.display = 'none';

  try {
    // --- Call the secure backend function ---
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
    
    // --- Display new data and refresh the logs table ---
    displayResults(newLog); 
    await loadRecentLogs();

  } catch (e) {
    alert("Something went wrong:\n" + e.message);
    console.error(e);
  } finally {
    // --- Reset UI regardless of success or failure ---
    resetUI();
  }
}

/**
 * Fetches the last 7 logs from our secure Netlify function.
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
  document.getElementById('log').value = ''; // Clear the textarea
}

/**
 * Renders the rows in the recent logs table.
 */
function renderLogTable(rows) {
  const tbody = document.querySelector('#logTable tbody');
  tbody.innerHTML = ''; // Clear existing rows

  if (!rows || rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center;">No entries found.</td></tr>`;
    return;
  }
  
  rows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach((cell, index) => {
      const td = document.createElement('td');
      
      if (index === 0) {
          td.textContent = new Date(cell).toLocaleDateString();
      } else {
          td.textContent = cell;
      }

      td.title = cell;

      if ([2, 3, 4].includes(index)) {
        const value = String(cell || '').toLowerCase();
        if (["high", "medium", "low"].includes(value)) {
          td.classList.add(value);
        }
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
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

/**
 * This is the entry point of our application.
 */
document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const logTextarea = document.getElementById('log');

  if (analyzeBtn) {
    analyzeBtn.addEventListener('click', submitLog);
  }
  
  if (logTextarea) {
    logTextarea.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submitLog();
      }
    });
  }

  loadRecentLogs();
});