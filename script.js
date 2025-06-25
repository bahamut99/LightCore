import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// === PASTE YOUR SUPABASE URL AND PUBLIC ANON KEY HERE ===
const SUPABASE_URL = 'https://bcoottemxdthoopmaict.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjb290dGVteGR0aG9vcG1haWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxOTEzMjksImV4cCI6MjA2NTc2NzMyOX0.CVYIdU0AHBDd00IlF5jh0HP264txAGh28LBJxDAA9Ng';
// =========================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Global object to hold our chart instances.
let charts = {};

// This is now the main entry point for the application, ensuring all HTML is loaded first.
document.addEventListener('DOMContentLoaded', () => {
    // === UI ELEMENT REFERENCES ===
    const authContainer = document.getElementById('auth-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const logoutButton = document.getElementById('logout-button');
    const showSignupLink = document.getElementById('show-signup');
    const showLoginLink = document.getElementById('show-login');
    const authError = document.getElementById('auth-error');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const logTextarea = document.getElementById('log');
    const closeModalBtn = document.getElementById('closeModal');
    const modalOverlay = document.getElementById('logModal');
    const btn7day = document.getElementById('btn7day');
    const btn30day = document.getElementById('btn30day');

    // === AUTHENTICATION LOGIC ===

    // Sign Up Handler
    signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
            authError.textContent = error.message;
            authError.style.display = 'block';
        } else {
            authError.style.display = 'none';
            alert('Success! Please check your email for a confirmation link.');
        }
    });

    // Login Handler
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
            authError.textContent = error.message;
            authError.style.display = 'block';
        } else {
            authError.style.display = 'none';
        }
    });

    // Logout Handler
    logoutButton.addEventListener('click', async () => {
        await supabase.auth.signOut();
    });

    // Session State Listener
    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            authContainer.style.display = 'none';
            appContainer.style.display = 'block';
            loadRecentLogs();
            fetchAndRenderCharts(7);
        } else {
            appContainer.style.display = 'none';
            authContainer.style.display = 'block';
        }
    });

    // === UI TOGGLING & OTHER EVENT LISTENERS ===
    
    showSignupLink.addEventListener('click', (e) => {
        e.preventDefault();
        loginForm.style.display = 'none';
        signupForm.style.display = 'block';
        showSignupLink.style.display = 'none';
        showLoginLink.style.display = 'block';
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        signupForm.style.display = 'none';
        loginForm.style.display = 'block';
        showLoginLink.style.display = 'none';
        showSignupLink.style.display = 'block';
    });

    if (analyzeBtn) analyzeBtn.addEventListener('click', submitLog);
    
    if (logTextarea) {
        logTextarea.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submitLog();
            }
        });
    }

    if(closeModalBtn) closeModalBtn.addEventListener('click', closeLogModal);

    if(modalOverlay) {
        modalOverlay.addEventListener('click', (event) => {
            if (event.target === modalOverlay) closeLogModal();
        });
    }

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
});


// === DATA AND DASHBOARD FUNCTIONS (Mostly Unchanged) ===

async function submitLog() {
  const entryText = document.getElementById('log').value.trim();
  const button = document.getElementById('analyzeBtn');
  const spinner = document.getElementById('spinner');

  if (!entryText) { alert("Please enter a log entry."); return; }

  button.disabled = true;
  button.innerText = "Analyzing...";
  spinner.style.display = 'inline-block';
  document.getElementById('results').style.display = 'none';

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/.netlify/functions/analyze-log', {
      method: 'POST',
      headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({ log: entryText }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'An unknown error occurred.' }));
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    const newLog = await response.json();
    displayResults(newLog); 
    await loadRecentLogs();
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

async function loadRecentLogs() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const response = await fetch('/.netlify/functions/recent-logs', {
        headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    if (!response.ok) throw new Error("Failed to load recent logs");
    const recentLogs = await response.json();
    renderLogTable(recentLogs);
  } catch (e) {
    console.error("Failed to load logs:", e.message);
  }
}

async function fetchAndRenderCharts(range) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        const response = await fetch(`/.netlify/functions/get-chart-data?range=${range}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch chart data');
        const data = await response.json();
        renderAllCharts(data);
    } catch (error) {
        console.error("Error fetching or rendering charts:", error);
    }
}

function displayResults(result) {
  document.getElementById('clarity').innerText = result.Clarity || 'N/A';
  document.getElementById('immune').innerText = result.Immune || 'N/A';
  document.getElementById('physical').innerText = result.PhysicalReadiness || 'N/A';
  document.getElementById('notes').innerText = result.Notes || 'N/A';
  document.getElementById('results').style.display = 'block';
  document.getElementById('log').value = '';
}

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
        if (["high", "medium", "low"].includes(value)) cell.classList.add(value);
    }
    parent.appendChild(cell);
}

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

function resetUI() {
  const button = document.getElementById('analyzeBtn');
  const spinner = document.getElementById('spinner');
  button.disabled = false;
  button.innerText = "Analyze Log";
  spinner.style.display = 'none';
}

function renderAllCharts(data) {
    const sharedOptions = { /* ... Chart options ... */ };
    // Chart rendering functions from before...
    const commonOptions = {
        plugins: { legend: { display: false } },
        scales: { 
            y: { 
                beginAtZero: true, 
                max: 4,
                ticks: {
                    stepSize: 1,
                    callback: function(value) {
                        const labels = ['', 'Low', 'Medium', 'High'];
                        return labels[value];
                    }
                }
            } 
        },
        elements: { line: { tension: 0.3 } }
    };
    renderChart('clarityChart', 'Mental Clarity', data.labels, data.clarityData, '#3B82F6', commonOptions);
    renderChart('immuneChart', 'Immune Risk', data.labels, data.immuneData, '#ca8a04', commonOptions);
    renderChart('physicalChart', 'Physical Output', data.labels, data.physicalData, '#16a34a', commonOptions);
}

function renderChart(canvasId, label, labels, data, color, options) {
    if (charts[canvasId]) charts[canvasId].destroy();
    const ctx = document.getElementById(canvasId).getContext('2d');
    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label, data: data, backgroundColor: color,
                borderColor: color, borderWidth: 2, pointRadius: 3,
            }]
        },
        options: {
            ...options,
            plugins: { ...options.plugins, title: { display: true, text: label, font: { size: 16 } } }
        }
    });
}

// Initial setup listener
document.addEventListener('DOMContentLoaded', () => {
  const closeModalBtn = document.getElementById('closeModal');
  const modalOverlay = document.getElementById('logModal');
  const btn7day = document.getElementById('btn7day');
  const btn30day = document.getElementById('btn30day');

  // Event listeners for UI elements that are always present
  if(closeModalBtn) closeModalBtn.addEventListener('click', closeLogModal);
  if(modalOverlay) {
      modalOverlay.addEventListener('click', (event) => {
          if (event.target === modalOverlay) closeLogModal();
      });
  }
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
});