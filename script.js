import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://bcoottemxdthoopmaict.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjb290dGVteGR0aG9vcG1haWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxOTEzMjksImV4cCI6MjA2NTc2NzMyOX0.CVYIdU0AHBDd00IlF5jh0HP264txAGh28LBJxDAA9Ng';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ log: entry }) // Explicit for safety
    });

    let result;
    try {
      result = await response.json();
    } catch (err) {
      console.error("Failed to parse JSON response", err);
      alert("Something went wrong: Invalid response format");
      return;
    }

    const text = result.message?.trim() ?? '';

    if (
      !text.toLowerCase().includes('clarity:') ||
      !text.toLowerCase().includes('immune:') ||
      !text.toLowerCase().includes('physical:')
    ) {
      throw new Error("GPT response did not contain expected scoring keywords.");
    }

    function convertScore(num) {
  const n = parseInt(num, 10);
  if (isNaN(n)) return 'unknown';
  if (n >= 8) return 'high';
  if (n >= 5) return 'medium';
  return 'low';
}

const clarityRaw = text.match(/clarity:\s*(\d+)/i)?.[1];
const immuneRaw = text.match(/immune:\s*(\d+)/i)?.[1];
const physicalRaw = text.match(/physical:\s*(\d+)/i)?.[1];

const scores = convertScore(clarityRaw);
const immune = convertScore(immuneRaw);
const physical = convertScore(physicalRaw);
    const note = text.split('\n').slice(-1)[0] ?? 'No note provided.';

    if ([scores, immune, physical].includes('unknown')) {
      throw new Error("GPT failed to extract one or more scores.");
    }

    await supabase.from('daily_logs').insert([
      {
        Date: new Date().toISOString(),
        Log: entry,
        Clarity: scores,
        Immune: immune,
        PhysicalReadiness: physical,
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

function resetUI() {
  const button = document.getElementById('analyzeBtn');
  const spinner = document.getElementById('spinner');
  button.disabled = false;
  button.innerText = "Analyze Log";
  button.style.opacity = 1;
  spinner.style.display = 'none';
}

function displayResults(result) {
  if (!Array.isArray(result) || result.includes(undefined)) {
    console.warn("Invalid result structure:", result);
    return;
  }

  document.getElementById('clarity').innerText = result[0];
  document.getElementById('immune').innerText = result[1];
  document.getElementById('physical').innerText = result[2];
  document.getElementById('notes').innerText = result[3];
  document.getElementById('results').style.display = 'block';
}

async function loadRecentLogs() {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('Date, Log, Clarity, Immune, PhysicalReadiness, Notes')
    .order('Date', { ascending: false })
    .limit(7);

  if (error) {
    console.error("Error fetching logs:", error);
    return;
  }

  console.log("Fetched logs:", data);

  const rows = Array.isArray(data)
    ? data.map(row => [
        new Date(row.Date).toLocaleDateString(),
        row.Log,
        row.Clarity,
        row.Immune,
        row.PhysicalReadiness,
        row.Notes
      ])
    : [];

  renderLogTable(rows);
}

function renderLogTable(rows) {
  const tbody = document.querySelector('#logTable tbody');
  tbody.innerHTML = '';

  if (!Array.isArray(rows) || rows.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = "No entries found.";
    td.style.textAlign = 'center';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach(row => {
    if (!Array.isArray(row) || row.length !== 6) {
      console.warn("Skipping malformed row:", row);
      return;
    }

    const tr = document.createElement('tr');

    row.forEach((cell, index) => {
      const td = document.createElement('td');
      td.textContent = cell ?? '';
      td.title = cell ?? '';

      if ([2, 3, 4].includes(index)) {
        const val = String(cell ?? '').toLowerCase();
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