import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// === PASTE YOUR SUPABASE URL AND PUBLIC ANON KEY HERE ===
const SUPABASE_URL = 'https://bcoottemxdthoopmaict.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjb290dGVteGR0aG9vcG1haWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxOTEzMjksImV4cCI6MjA2NTc2NzMyOX0.CVYIdU0AHBDd00IlF5jh0HP264txAGh28LBJxDAA9Ng';
// =========================================================

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let charts = {};

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
    const googleHealthBtn = document.getElementById('google-health-btn');

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
            loadRecentLogs();
            fetchAndRenderCharts(7);
            fetchAndDisplayInsight();
            fetchAndRenderInsightHistory();
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

    if (googleHealthBtn) {
        googleHealthBtn.addEventListener('click', () => {
            // Build the Google Auth URL directly on the front-end to bypass Netlify's caching issue.
            const CLIENT_ID = '370829569323-9phtoufc722qmqcoemefk37f0eojq7op.apps.googleusercontent.com';
            const REDIRECT_URI = 'https://lightcorehealth.netlify.app/.netlify/functions/auth-callback';
            const SCOPES = [
                'https://www.googleapis.com/auth/fitness.activity.readonly',
                'https://www.googleapis.com/auth/fitness.sleep.readonly',
                'https://www.googleapis.com/auth/fitness.blood_pressure.readonly',
                'https://www.googleapis.com/auth/fitness.blood_glucose.readonly'
            ];

            const params = new URLSearchParams({
                client_id: CLIENT_ID,
                redirect_uri: REDIRECT_URI,
                response_type: 'code',
                scope: SCOPES.join(' '),
                access_type: 'offline',
                prompt: 'consent'
            });

            const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

            // Redirect the user to Google for authorization
            window.location.href = authUrl;
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
        
        displayResults(newLog); 
        await loadRecentLogs();
        await fetchAndRenderCharts(7);
        await fetchAndDisplayInsight();
        await fetchAndRenderInsightHistory();
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
        if (!response.ok) throw new Error('Failed to fetch chart data');
        const data = await response.json();
        renderAllCharts(data);
    } catch (error) {
        console.error("Error fetching or rendering charts:", error);
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
    document.getElementById('clarity').innerText = result.Clarity || 'N/A';
    document.getElementById('immune').innerText = result.Immune || 'N/A';
    document.getElementById('physical').innerText = result.PhysicalReadiness || 'N/A';
    document.getElementById('notes').innerText = result.Notes || 'N/A';
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
        td(logData.Log, tr);
        td(logData.Clarity, tr, 'positive');
        td(logData.Immune, tr, 'inverse');
        td(logData.PhysicalReadiness, tr, 'positive');
        td(logData.Notes, tr);
        
        tbody.appendChild(tr);
    });
}

function td(content, parent, scoreType = null) {
    const cell = document.createElement('td');

    if (scoreType) {
        const bubble = document.createElement('span');
        bubble.textContent = content;
        const value = String(content || '').toLowerCase();

        if (scoreType === 'positive') {
            if (value === 'high') bubble.classList.add('score-good');
            else if (value === 'medium') bubble.classList.add('score-neutral');
            else if (value === 'low') bubble.classList.add('score-bad');
        } else if (scoreType === 'inverse') {
            if (value === 'high') bubble.classList.add('score-bad');
            else if (value === 'medium') bubble.classList.add('score-neutral');
            else if (value === 'low') bubble.classList.add('score-good');
        }
        cell.appendChild(bubble);
    } else {
        cell.textContent = content;
    }
    
    parent.appendChild(cell);
}

function openLogModal(logData) {
    document.getElementById('modalDate').textContent = new Date(logData.created_at).toLocaleString();
    document.getElementById('modalLog').textContent = logData.Log;
    
    document.getElementById('modalSleepHours').textContent = logData.sleep_hours || 'N/A';
    document.getElementById('modalSleepQuality').textContent = logData.sleep_quality ? `${logData.sleep_quality} / 5` : 'N/A';
    
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
    const commonOptions = {
        plugins: { 
            legend: { display: false },
            title: { display: true, font: { size: 16, family: 'Inter' }, color: '#9CA3AF' }
        },
        scales: { 
            y: { 
                beginAtZero: true, 
                max: 4,
                grid: { color: 'rgba(255, 255, 255, 0.1)' },
                ticks: {
                    color: '#9CA3AF',
                    stepSize: 1,
                    callback: function(value) {
                        const labels = ['', 'Low', 'Medium', 'High'];
                        return labels[value];
                    }
                }
            },
            x: {
                grid: { display: false },
                ticks: { color: '#9CA3AF' }
            } 
        },
        elements: { line: { tension: 0.4 } }
    };

    const clarityColor = '#38bdf8';
    const immuneColor = '#facc15';
    const physicalColor = '#4ade80';

    renderChart('clarityChart', 'Mental Clarity', data.labels, data.clarityData, clarityColor, commonOptions);
    renderChart('immuneChart', 'Immune Risk', data.labels, data.immuneData, immuneColor, commonOptions);
    renderChart('physicalChart', 'Physical Output', data.labels, data.physicalData, physicalColor, commonOptions);
}

function renderChart(canvasId, label, labels, data, hexColor, options) {
    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }
    const ctx = document.getElementById(canvasId).getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, 0.4)`);
    gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

    charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: label,
                data: data,
                backgroundColor: gradient,
                borderColor: hexColor,
                borderWidth: 2,
                pointRadius: 3,
                pointBackgroundColor: hexColor,
                fill: true,
            }]
        },
        options: {
            ...options,
            plugins: { 
                ...options.plugins,
                title: { 
                    ...options.plugins.title,
                    text: label 
                } 
            }
        }
    });
}