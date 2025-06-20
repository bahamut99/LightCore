import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://bcoottemxdthoopmaict.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjb290dGVteGR0aG9vcG1haWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxOTEzMjksImV4cCI6MjA2NTc2NzMyOX0.CVYIdU0AHBDd00IlF5jh0HP264txAGh28LBJxDAA9Ng';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ${process.env.OPENAI_API_KEY}'
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'user',
            content: `Analyze this health log and return 3 scores (mental clarity, immune risk, physical output) and a short note:\n\n"${entry}"`
          }
        ]
      })
    });

    const result = await response.json();
    const text = result.choices?.[0]?.message?.content ?? 'Analysis failed';

    // Parse values
    const scores = text.match(/clarity:\s*(\w+)/i)?.[1] ?? 'unknown';
    const immune = text.match(/immune:\s*(\w+)/i)?.[1] ?? 'unknown';
    const physical = text.match(/physical:\s*(\w+)/i)?.[1] ?? 'unknown';
    const note = text.split('\n').slice(-1)[0];

    // Store in Supabase
    await supabase.from('daily_logs').insert([
      {
        Date: new Date().toISOString(),
        Log: entry,
        Clarity: scores,
        Immune: immune,
        'Physical Readiness': physical,
        Notes: note
      }
    ]);

    displayResults([scores, immune, physical, note]);
    await loadRecentLogs();
    document.getElementById('log').value = '';
  } catch (e) {
    alert("Something went wrong:\n" + e.message);
    console.error(e);
  } finally {
    resetUI();
  }
}

// Reset UI state
function resetUI() {
  const button = document.getElementById('analyzeBtn');
  const spinner = document.getElementById('spinner');
  button.disabled = false;
  button.innerText = "Analyze Log";
  button.style.opacity = 1;
  spinner.style.display = 'none';
}

// Display AI results
function displayResults(result) {
  document.getElementById('clarity').innerText = result[0];
  document.getElementById('immune').innerText = result[1];
  document.getElementById('physical').innerText = result[2];
  document.getElementById('notes').innerText = result[3];
  document.getElementById('results').style.display = 'block';
}

// Load last 7 logs from Supabase
async function loadRecentLogs() {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('Date, Log, Clarity, Immune, Physical Readiness, Notes')
    .order('Date', { ascending: false })
    .limit(7);

  if (error) {
    console.error("Error fetching logs:", error);
    return;
  }

  renderLogTable(data.map(row => [
    new Date(row.Date).toLocaleDateString(),
    row.Log,
    row.Clarity,
    row.Immune,
    row['Physical Readiness'],
    row.Notes
  ]));
}

// Render logs to the table
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
        const val = cell.toLowerCase();
        if (["high", "medium", "low"].includes(val)) {
          td.classList.add(val);
        }
      }

      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

window.onload = loadRecentLogs;