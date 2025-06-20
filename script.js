const SUPABASE_URL = 'https://bcoottemxdthoopmaict.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjb290dGVteGR0aG9vcG1haWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxOTEzMjksImV4cCI6MjA2NTc2NzMyOX0.CVYIdU0AHBDd00IlF5jh0HP264txAGh28LBJxDAA9Ng';

let supabase;

window.onload = async () => {
  // Load Supabase via CDN if not already loaded
  if (!window.supabase) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js';
    script.onload = () => {
      supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      loadRecentLogs();
    };
    document.head.appendChild(script);
  } else {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    loadRecentLogs();
  }
};

// Submit a log entry
async function submitLog() {
  const entry = document.getElementById('log').value.trim();
  const button = document.getElementById('analyzeBtn');
  const spinner = document.getElementById('spinner');

  if (!entry) {
    alert("Please enter a log entry.");
    return;
  }

  button.disabled = true;
  button.innerText = "Analyzing...";
  button.style.opacity = 0.7;
  spinner.style.display = 'inline-block';
  document.getElementById('results').style.display = 'none';

  try {
    const response = await fetch('/.netlify/functions/analyze-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ log: entry })
    });

    if (!response.ok) throw new Error("Failed to analyze");

    const data = await response.json();
    const result = data.result;

    await supabase.from('daily_logs').insert([
      {
        date: new Date().toISOString(),
        log: entry,
        clarity: result[0],
        immune: result[1],
        physical: result[2],
        notes: result[3]
      }
    ]);

    displayResults(result);
    await loadRecentLogs();
    document.getElementById('log').value = '';
  } catch (e) {
    alert("Something went wrong:\n" + e.message);
    console.error(e);
  } finally {
    resetUI();
  }
}

function resetUI() {
  const button = document.getElementById('analyzeBtn');
  const spinner = document.getElementById('spinner');
  button.disabled = false;
  button.innerText = "Analyze Log";
  button.style.opacity = 1;
  spinner.style.display = 'none';
}

function displayResults(result) {
  document.getElementById('clarity').innerText = result[0];
  document.getElementById('immune').innerText = result[1];
  document.getElementById('physical').innerText = result[2];
  document.getElementById('notes').innerText = result[3];
  document.getElementById('results').style.display = 'block';
}

async function loadRecentLogs() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from('daily_logs')
    .select('date, log, clarity, immune, physical, notes')
    .order('date', { ascending: false })
    .limit(7);

  if (error) {
    console.error("Error fetching logs:", error);
    return;
  }

  renderLogTable(data.map(row => [
    new Date(row.date).toLocaleDateString(),
    row.log,
    row.clarity,
    row.immune,
    row.physical,
    row.notes
  ]));
}

function renderLogTable(rows) {
  const tbody = document.querySelector('#logTable tbody');
  tbody.innerHTML = '';
  rows.forEach(row => {
    const tr = document.createElement('tr');
    row.forEach((cell, index) => {
      const td = document.createElement('td');
      td.textContent = cell;
      td.title = cell;
      if ([2, 3, 4].includes(index)) {
        const norm = cell.toLowerCase();
        if (["high", "medium", "low"].includes(norm)) {
          td.classList.add(norm);
        }
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}