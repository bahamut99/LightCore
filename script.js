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

  } catch (e) {
    alert("Something went wrong:\n" + e.message);
    console.error(e);
  } finally {
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
    // We now pass the full data objects to renderLogTable
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
 * Each row is now clickable to open a details modal.
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
    
    // Make the entire row clickable
    tr.addEventListener('click', () => openLogModal(logData));

    // Create and append cells for the table view
    // Note: The recent-logs function now returns full objects, not arrays of arrays
    td(new Date(logData.created_at).toLocaleDateString(), tr);
    td(logData.Log, tr);
    td(logData.Clarity, tr, true);
    td(logData.Immune, tr, true);
    td(logData.PhysicalReadiness, tr, true);
    td(logData.Notes, tr);
    
    tbody.appendChild(tr);
  });
}

// Helper function to create and append a <td> element
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
 * Populates and shows the log detail modal.
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

/**
 * Hides the log detail modal.
 */
function closeLogModal() {
    document.getElementById('logModal').style.display = 'none';
}

/**
 * Resets the analyze button and spinner to their default state.
 */
function resetUI() {
  const button = document.getElementById('analyzeBtn');
  spinner.style.display = 'none';
  button.disabled = false;
  button.innerText = "Analyze Log";
}

/**
 * This is the entry point of our application.
 */
document.addEventListener('DOMContentLoaded', () => {
  const analyzeBtn = document.getElementById('analyzeBtn');
  const logTextarea = document.getElementById('log');
  const closeModalBtn = document.getElementById('closeModal');
  const modalOverlay = document.getElementById('logModal');

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

  // Event listeners for closing the modal
  if(closeModalBtn) {
      closeModalBtn.addEventListener('click', closeLogModal);
  }
  if(modalOverlay) {
      // Close modal if user clicks on the dim overlay
      modalOverlay.addEventListener('click', (event) => {
          if (event.target === modalOverlay) {
              closeLogModal();
          }
      });
  }

  loadRecentLogs();
});