const { createClient } = require('@supabase/supabase-js');

// Group logs by YYYY-MM-DD
const groupByDay = (logs) => {
  const groups = logs.reduce((acc, log) => {
    const date = new Date(log.created_at).toISOString().split('T')[0];
    (acc[date] ||= []).push(log);
    return acc;
  }, {});
  return groups;
};

// Average scores for logs in the same day
const averageLogs = (logGroup) => {
  const totals = logGroup.reduce(
    (acc, log) => {
      acc.clarity += log.clarity_score || 0;
      acc.immune += log.immune_score || 0;
      acc.physical += log.physical_readiness_score || 0;
      acc.count++;
      return acc;
    },
    { clarity: 0, immune: 0, physical: 0, count: 0 }
  );

  const div = totals.count || 1;
  return {
    clarity_score: totals.clarity / div,
    immune_score: totals.immune / div,
    physical_readiness_score: totals.physical / div,
  };
};

exports.handler = async (event) => {
  const token = event.headers.authorization?.split(' ')[1];
  if (!token) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not authorized.' }),
    };
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'User not found.' }),
      };
    }

    const range = parseInt(event.queryStringParameters?.range, 10) || 7;

    // Start at beginning of "today" (server timezone). If you want user-local,
    // pass tz from the client and compute start in that zone.
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (range - 1));
    startDate.setHours(0, 0, 0, 0);

    const { data, error } = await supabase
      .from('daily_logs')
      .select('created_at, clarity_score, immune_score, physical_readiness_score')
      .eq('user_id', user.id)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Supabase select error: ${error.message}`);

    let processed;
    if (range === 1) {
      // 1D view: return raw, non-aggregated points (multiple per day allowed)
      processed = (data || []).map((log) => ({
        created_at: log.created_at, // full timestamp (ISO) for hour-based x-axis
        clarity_score: log.clarity_score ?? 0,
        immune_score: log.immune_score ?? 0,
        physical_readiness_score: log.physical_readiness_score ?? 0,
      }));
    } else {
      // 7D/1M/3M: aggregate multiple logs per day into one averaged point
      const grouped = groupByDay(data || []);
      processed = Object.entries(grouped)
        .map(([date, logs]) => {
          const avg = averageLogs(logs);
          return { created_at: date, ...avg };
        })
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    const labels = processed.map((p) => p.created_at);
    const clarityData = processed.map((p) => p.clarity_score);
    const immuneData = processed.map((p) => p.immune_score);
    const physicalData = processed.map((p) => p.physical_readiness_score);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ labels, clarityData, immuneData, physicalData }),
    };
  } catch (err) {
    console.error('Error in get-chart-data:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
