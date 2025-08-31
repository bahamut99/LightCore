// /.netlify/functions/get-chart-data.js
const { createClient } = require('@supabase/supabase-js');

// --- helpers -------------------------------------------------

// Build ISO for "start of day in TZ, shifted by N days back from today"
// daysBack: 0 = today, 1 = yesterday, etc. (negative gives tomorrow, etc.)
function startOfDayUTCISO(tz, daysBack = 0) {
  const now = new Date();

  // Get today's Y-M-D in the user's TZ
  const ymdFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [Y, M, D] = ymdFmt.format(now).split('-').map(Number);

  // Move back by N days in a TZ-agnostic way
  const approx = new Date(Date.UTC(Y, M - 1, D - daysBack, 12, 0, 0)); // noon avoids DST edge cases

  // Get offset for that calendar day in the TZ (handles DST)
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'shortOffset',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(approx);

  const year = +parts.find(p => p.type === 'year').value;
  const month = +parts.find(p => p.type === 'month').value;
  const day = +parts.find(p => p.type === 'day').value;
  const tzName = parts.find(p => p.type === 'timeZoneName').value; // e.g. "GMT-7" or "GMT+5:30"

  const m = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  let offsetMin = 0;
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    const h = parseInt(m[2], 10);
    const mm = m[3] ? parseInt(m[3], 10) : 0;
    offsetMin = sign * (h * 60 + mm);
  }

  // UTC time for "local midnight" = local 00:00 minus the zone offset
  const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMin * 60 * 1000;
  return new Date(utcMs).toISOString();
}

// Group logs by YYYY-MM-DD (in UTC string form we produce)
const groupByDay = (logs) =>
  logs.reduce((acc, log) => {
    const date = new Date(log.created_at).toISOString().slice(0, 10);
    (acc[date] ||= []).push(log);
    return acc;
  }, {});

const averageLogs = (group) => {
  const t = group.reduce(
    (a, l) => {
      a.c += l.clarity_score || 0;
      a.i += l.immune_score || 0;
      a.p += l.physical_readiness_score || 0;
      a.n++;
      return a;
    },
    { c: 0, i: 0, p: 0, n: 0 }
  );
  const n = t.n || 1;
  return {
    clarity_score: t.c / n,
    immune_score: t.i / n,
    physical_readiness_score: t.p / n,
  };
};

// --- handler -------------------------------------------------

exports.handler = async (event) => {
  const token = event.headers.authorization?.split(' ')[1];
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };
    }

    const range = parseInt(event.queryStringParameters?.range, 10) || 7;
    const tz = event.queryStringParameters?.tz || 'UTC';

    // Window: [start-of-(today - (range-1)) ... start-of-tomorrow)
    const startIso = startOfDayUTCISO(tz, range - 1);
    const endIso = startOfDayUTCISO(tz, -1);

    const { data, error } = await supabase
      .from('daily_logs')
      .select('created_at, clarity_score, immune_score, physical_readiness_score')
      .eq('user_id', user.id)
      .gte('created_at', startIso)
      .lt('created_at', endIso)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Supabase select error: ${error.message}`);

    let processed;
    if (range === 1) {
      // 1D: keep raw points (multiple per day)
      processed = (data || []).map((l) => ({
        created_at: l.created_at,
        clarity_score: l.clarity_score ?? 0,
        immune_score: l.immune_score ?? 0,
        physical_readiness_score: l.physical_readiness_score ?? 0,
      }));
    } else {
      // 7D/1M/3M: daily averages
      const grouped = groupByDay(data || []);
      processed = Object.entries(grouped)
        .map(([date, logs]) => ({ created_at: date, ...averageLogs(logs) }))
        .sort((a, b) => (a.created_at > b.created_at ? 1 : -1));
    }

    const labels = processed.map(p => p.created_at);
    const clarityData = processed.map(p => p.clarity_score);
    const immuneData = processed.map(p => p.immune_score);
    const physicalData = processed.map(p => p.physical_readiness_score);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ labels, clarityData, immuneData, physicalData }),
    };
  } catch (err) {
    console.error('Error in get-chart-data:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

