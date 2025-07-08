import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// === PASTE YOUR SUPABASE URL AND PUBLIC ANON KEY HERE ===
const SUPABASE_URL = 'https://bcoottemxdthoopmaict.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjb290dGVteGR0aG9vcG1haWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxOTEzMjksImV4cCI6MjA2NTc2NzMyOX0.CVYIdU0AHBDd00IlF5jh0HP264txAGh28LBJxDAA9Ng';
// =========================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let charts = {};

async function handleTokenCallback() {
    if (window.location.hash.includes('access_token')) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const expiresIn = params.get('expires_in');

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            alert('You must be logged in to connect your account.');
            return;
        }

        const expires_at = new Date(Date.now() + parseInt(expiresIn) * 1000).toISOString();

        const integrationData = {
            user_id: user.id,
            provider: 'google-health',
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expires_at,
        };

        const { error } = await supabase
            .from('user_integrations')
            .upsert(integrationData, { onConflict: 'user_id, provider' });
        
        if (error) {
            alert(`Error saving integration: ${error.message}`);
        } else {
            window.location.hash = '';
            checkGoogleHealthConnection();
        }
    }
}

async function checkGoogleHealthConnection() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    
    const { data, error } = await supabase
        .from('user_integrations')
        .select('id')
        .eq('provider', 'google-health')
        .eq('user_id', session.user.id)
        .maybeSingle();
        
    const manualInputs = document.getElementById('manual-sleep-inputs');
    const connectContainer = document.getElementById('google-health-connect');
    const connectedMessage = document.getElementById('google-health-connected');

    if (data) {
        manualInputs.style.display = 'none';
        connectContainer.style.display = 'none';
        connectedMessage.style.display = 'flex';
    } else {
        manualInputs.style.display = 'block';
        connectContainer.style.display = 'flex';
        connectedMessage.style.display = 'none';
    }
}

function showToast(message) {
    const toast = document.getElementById('toast-notification');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

async function acknowledgeNudge(nudgeId) {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { error } = await supabase
        .from('nudges')
        .update({ is_acknowledged: true })
        .eq('id', nudgeId)
        .eq('user_id', session.user.id);
    
    if (error) {
        alert('Could not acknowledge nudge.');
        console.error('Error acknowledging nudge:', error);
    } else {
        document.getElementById('nudge-card').style.display = 'none';
    }
}

async function fetchAndDisplayNudge() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch('/.netlify/functions/get-nudges', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) return;

        const nudge = await response.json();
        const nudgeCard = document.getElementById('nudge-card');

        if (nudge) {
            nudgeCard.style.display = 'block';
            document.getElementById('nudge-headline').textContent = nudge.headline;
            document.getElementById('nudge-body').textContent = nudge.body_text;
            
            const actionsContainer = document.getElementById('nudge-actions');
            actionsContainer.innerHTML = '';

            if (nudge.suggested_actions && nudge.suggested_actions.length > 0) {
                nudge.suggested_actions.forEach(actionText => {
                    const button = document.createElement('button');
                    button.textContent = actionText;
                    button.onclick = () => alert(`Action: ${actionText}`);
                    actionsContainer.appendChild(button);
                });
            }
            
            const dismissButton = document.createElement('button');
            dismissButton.textContent = 'Acknowledge & Dismiss';
            dismissButton.onclick = () => acknowledgeNudge(nudge.id);
            actionsContainer.appendChild(dismissButton);
        } else {
            if (nudgeCard) nudgeCard.style.display = 'none';
        }
    } catch (e) {
        console.error("Error fetching nudge:", e.message);
    }
}

document.addEventListener('DOMContentLoaded', () => {
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
    const googleHealthToggle = document.getElementById('google-health-toggle');

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

    logoutButton.addEventListener('click', async () => {
        await supabase.auth.signOut();
    });

    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            authContainer.style.display = 'none';
            appContainer.style.display = 'block';
            
            handleTokenCallback().then(() => {
                loadRecentLogs();
                fetchAndRenderCharts(7);
              fetchAndRenderChronoDeck(); // This is a new call
                fetchAndDisplayInsight();
                fetchAndRenderInsightHistory();
                checkGoogleHealthConnection();
                fetchAndDisplayNudge();
            });

        } else {
            appContainer.style.display = 'none';
            authContainer.style.display = 'block';
        }
    });

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

    if (googleHealthToggle) {
        googleHealthToggle.addEventListener('change', () => {
            if (googleHealthToggle.checked) {
                window.location.href = '/.netlify/functions/google-auth';
            }
        });
    }
});

async function submitLog() {
    const entryText = document.getElementById('log').value.trim();
    const sleepHours = document.getElementById('sleep-hours').value;
    const sleepQuality = document.getElementById('sleep-quality').value;
    const button = document.getElementById('analyzeBtn');
    const spinner = document.getElementById('spinner');

    if (!entryText) {
        alert("Please enter a log entry.");
        return;
    }

    if (entryText.length < 50) {
        showToast("For best results, try adding a bit more detail to your log.");
    }

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
            body: JSON.stringify({ 
                log: entryText,
                sleep_hours: sleepHours ? parseFloat(sleepHours) : null,
                sleep_quality: sleepQuality ? parseInt(sleepQuality, 10) : null
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'An unknown error occurred.' }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const newLog = await response.json();
        
      // After a new log is submitted, also try to parse its events
      fetch('/.netlify/functions/parse-events', {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ log_id: newLog.id, log_text: newLog.log })
      }).then(() => fetchAndRenderChronoDeck()); // Then re-render the ChronoDeck

        displayResults(newLog); 
        await loadRecentLogs();
        await fetchAndRenderCharts(7);
        await fetchAndDisplayInsight();
        await fetchAndRenderInsightHistory();
        await fetchAndDisplayNudge();
        document.querySelector('#btn7day').classList.add('active');
        document.querySelector('#btn30day').classList.remove('active');

    } catch (e) {
        console.error(e);
        alert("Something went wrong:\n" + e.message);
    } finally {
        resetUI();
    }
}

async function loadRecentLogs() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return; 
        const response = await fetch('/.netlify/functions/recent-logs', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) throw new Error("Failed to load recent logs");
        const recentLogs = await response.json();
        renderLogTable(recentLogs);
    } catch (e) {
        console.error("Failed to load logs:", e.message);
        const tbody = document.querySelector('#logTable tbody');
        tbody.innerHTML = `<tr><td colspan="6" class="error">Could not load recent logs.</td></tr>`;
    }
}

async function fetchAndRenderCharts(range) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const response = await fetch(`/.netlify/functions/get-chart-data?range=${range}`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            if (errorData && errorData.error) {
                throw new Error(errorData.error);
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        renderAllCharts(data);
    } catch (error) {
        console.error("Error fetching or rendering charts:", error);
    }
}

// === NEW FUNCTION TO FETCH CHRONODECK DATA ===
async function fetchAndRenderChronoDeck() {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch(`/.netlify/functions/get-events`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        renderChronoDeckChart(data);
    } catch (error) {
        console.error("Error fetching or rendering ChronoDeck chart:", error);
        const chronosContainer = document.getElementById('chronoChart').parentElement;
        chronosContainer.innerHTML = `<p class="subtle-text" style="text-align: center;">Could not load ChronoDeck data.</p>`;
    }
}

async function fetchAndDisplayInsight() {
    const insightTextElement = document.getElementById('ai-insight-text');
    insightTextElement.textContent = 'Analyzing your data for new patterns...';
    insightTextElement.classList.add('subtle-text');

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        
        const response = await fetch('/.netlify/functions/get-insight', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!response.ok) throw new Error("Failed to fetch insight");
        
        const data = await response.json();

        if (data.insight) {
            insightTextElement.textContent = data.insight;
            insightTextElement.classList.remove('subtle-text');
        } else {
            insightTextElement.textContent = 'Not enough data to generate an insight yet.';
        }

    } catch (e) {
        console.error("Failed to load insight:", e.message);
        insightTextElement.textContent = 'Could not load insight at this time.';
    }
}

async function fetchAndRenderInsightHistory() {
    const container = document.getElementById('insight-history-container');
    container.innerHTML = '<p class="subtle-text">Loading history...</p>';

    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const response = await fetch('/.netlify/functions/get-past-insights', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });

        if (!response.ok) throw new Error("Failed to fetch insight history");

        const insights = await response.json();

        container.innerHTML = ''; 

        if (!insights || insights.length === 0) {
            container.innerHTML = '<p class="subtle-text">No saved insights yet.</p>';
            return;
        }

        insights.forEach(insight => {
            const details = document.createElement('details');
            details.classList.add('insight-item');

            const summary = document.createElement('summary');
            summary.textContent = new Date(insight.created_at).toLocaleDateString();

            const p = document.createElement('p');
            p.textContent = insight.insight_text;

            details.appendChild(summary);
            details.appendChild(p);
            container.appendChild(details);
        });

    } catch (e) {
        console.error("Failed to load insight history:", e.message);
        container.innerHTML = '<p class="error-message">Could not load history.</p>';
    }
}


function displayResults(result) {
    document.getElementById('clarity').innerText = `${result.clarity_score}/10 (${result.clarity_label || 'N/A'})`;
    document.getElementById('immune').innerText = `${result.immune_score}/10 (${result.immune_label || 'N/A'})`;
    document.getElementById('physical').innerText = `${result.physical_readiness_score}/10 (${result.physical_readiness_label || 'N/A'})`;
    document.getElementById('notes').innerText = result.ai_notes || 'N/A';
    document.getElementById('results').style.display = 'block';
    document.getElementById('log').value = '';
    document.getElementById('sleep-hours').value = '';
    document.getElementById('sleep-quality').value = '';
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

        td(new Date(logData.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }), tr);
        td(logData.log, tr);
        td(logData.clarity_label, tr, 'score', logData.clarity_color);
        td(logData.immune_label, tr, 'score', logData.immune_color);
        td(logData.physical_readiness_label, tr, 'score', logData.physical_readiness_color);
        td(logData.ai_notes, tr);
        
        tbody.appendChild(tr);
    });
}

function td(content, parent, type = null, color = '') {
    const cell = document.createElement('td');
    
    if (type === 'score') {
        const span = document.createElement('span');
        span.className = 'score-bubble';
        span.textContent = content || 'N/A';
        
        if (color) {
            span.style.color = color;
            // Create RGBA from hex color for the background
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);
            span.style.backgroundColor = `rgba(${r}, ${g}, ${b}, 0.1)`;
        } else {
             span.style.backgroundColor = 'rgba(107, 114, 128, 0.1)';
             span.style.color = '#6B7280';
        }

        cell.appendChild(span);
    } else {
        cell.textContent = content;
    }
    
    parent.appendChild(cell);
}

function openLogModal(logData) {
    document.getElementById('modalDate').textContent = new Date(logData.created_at).toLocaleString();
    document.getElementById('modalLog').textContent = logData.log;
    
    document.getElementById('modalSleepHours').textContent = logData.sleep_hours || 'N/A';
    document.getElementById('modalSleepQuality').textContent = logData.sleep_quality ? `${logData.sleep_quality} / 5` : 'N/A';
    
    document.getElementById('modalClarity').textContent = `${logData.clarity_score}/10 (${logData.clarity_label || 'N/A'})`;
    document.getElementById('modalImmune').textContent = `${logData.immune_score}/10 (${logData.immune_label || 'N/A'})`;
    document.getElementById('modalPhysical').textContent = `${logData.physical_readiness_score}/10 (${logData.physical_readiness_label || 'N/A'})`;
    document.getElementById('modalNotes').textContent = logData.ai_notes;
    
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
    const commonOptions = {
        plugins: { 
            legend: { display: false },
            tooltip: {
                enabled: true,
                mode: 'index',
                intersect: false,
            }
        },
        scales: { 
            y: { 
                beginAtZero: true, 
                max: 10,
                ticks: {
                    color: '#9CA3AF',
                    stepSize: 2,
                }
            },
            x: {
                type: 'time',
              time: {
                  unit: 'day',
                  tooltipFormat: 'MMM d',
              },
              grid: { display: false },
                ticks: { color: '#9CA3AF' }
            } 
        },
        maintainAspectRatio: false,
    };

    renderChart('clarityChart', 'Mental Clarity', data.labels, data.clarityData, '#38bdf8', commonOptions);
    renderChart('immuneChart', 'Immune Risk', data.labels, data.immuneData, '#facc15', commonOptions);
    renderChart('physicalChart', 'Physical Output', data.labels, data.physicalData, '#4ade80', commonOptions);
}

// === NEW FUNCTION TO RENDER THE CHRONODECK CHART ===
function renderChronoDeckChart(data) {
    const canvasId = 'chronoChart';
    const chartContainer = document.getElementById(canvasId).parentElement;
    
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    
    if (!data || data.length === 0) {
        chartContainer.innerHTML = '<p class="subtle-text" style="text-align: center; padding-top: 4rem;">No timed events like "Workout" or "Meal" have been logged yet. Try adding one to your daily log!</p>';
        return;
    }

    const ctx = document.getElementById(canvasId).getContext('2d');

    const eventsByType = data.reduce((acc, event) => {
        const type = event.event_type;
        if (!acc[type]) {
            acc[type] = [];
        }
        const eventDate = new Date(event.event_time);
        acc[type].push(eventDate.getHours() + eventDate.getMinutes() / 60);
        return acc;
    }, {});

    const averages = Object.keys(eventsByType).map(type => {
        const hours = eventsByType[type];
        const avg = hours.reduce((a, b) => a + b, 0) / hours.length;
        return { type, avg };
    });

    const averageLineValue = averages.length > 0 ? averages.reduce((sum, curr) => sum + curr.avg, 0) / averages.length : 0;

    const colorMap = {
      'Workout': '#38bdf8',
      'Meal': '#4ade80',
      'Caffeine': '#facc15',
      'Sleep': '#a78bfa'
    };

    charts[canvasId] = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: averages.map(a => a.type),
            datasets: [{
                label: 'Average Event Time (Hour of Day)',
                data: averages.map(a => a.avg),
                backgroundColor: averages.map(a => colorMap[a.type] || '#6B7280'),
                borderRadius: 4
            }]
        },
        options: {
            scales: {
                y: {
                    beginAtZero: true,
                    max: 24,
                    title: { display: true, text: 'Hour of Day (24h)', color: '#9CA3AF' },
                    ticks: { color: '#9CA3AF', stepSize: 4 }
                },
                x: {
                    grid: { display: false },
                    ticks: { color: '#9CA3AF' }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                const hours = Math.floor(context.parsed.y);
                                const minutes = Math.round((context.parsed.y - hours) * 60);
                                label += `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
                            }
                            return label;
                        }
                    }
                },
                annotation: {
                    annotations: {
                        line1: {
                            type: 'line',
                            yMin: averageLineValue,
                            yMax: averageLineValue,
                            borderColor: '#ef4444',
                            borderWidth: 2,
                            borderDash: [6, 6],
                            label: {
                                content: 'Overall Avg',
                                enabled: true,
                                position: 'end',
                                backgroundColor: 'rgba(239, 68, 68, 0.7)',
                                font: { size: 10 }
                            }
                        }
                    }
                }
            },
            maintainAspectRatio: false,
        }
    });
}


function renderChart(canvasId, label, labels, data, hexColor, options) {
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    const ctx = document.getElementById(canvasId).getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.4)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels.map(l => new Date(l)),
            datasets: [{
                label: label,
                data: data,
                backgroundColor: gradient,
                borderColor: hexColor,
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: hexColor,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            ...options,
            plugins: {
                ...options.plugins,
                title: {
                    display: true,
                    text: label,
                    color: '#9CA3AF',
                    font: { size: 16, family: 'Inter' }
                }
            }
        }
    });
}