import { createClient } from '@supabase/supabase-js';

// This map is for scores where "high" is good.
const positiveScoreMap = { 'high': 3, 'medium': 2, 'low': 1 };

// === NEW: This is an inverted map just for Immune Risk ===
// Now, a "low" risk will show up as a high value on the chart.
const inverseScoreMap = { 'high': 1, 'medium': 2, 'low': 3 };

export async function handler(event) {
  // Security Check (no changes here)
  const authHeader = event.headers.authorization;
  if (!authHeader) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Authorization header required.' }) };
  }
  const token = authHeader.replace('Bearer ', '');
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: Invalid token.' }) };
  }

  try {
    const rangeInDays = parseInt(event.queryStringParameters?.range, 10) || 7;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - rangeInDays);

    const { data, error } = await supabase
      .from('daily_logs')
      .select('created_at, Clarity, Immune, PhysicalReadiness, sleep_hours, sleep_quality')
      .eq('user_id', user.id)
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) { throw error; }

    const chartData = {
      labels: [],
      clarityData: [],
      immuneData: [],
      physicalData: []
    };

    data.forEach(row => {
      const dateLabel = new Date(row.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
      chartData.labels.push(dateLabel);

      // Clarity and Physical still use the positive map
      chartData.clarityData.push(positiveScoreMap[row.Clarity?.toLowerCase()] || 0);
      chartData.physicalData.push(positiveScoreMap[row.PhysicalReadiness?.toLowerCase()] || 0);
      
      // === THE FIX IS HERE: Immune Risk now uses the new inverse map ===
      chartData.immuneData.push(inverseScoreMap[row.Immune?.toLowerCase()] || 0);
    });

    return {
      statusCode: 200,
      body: JSON.stringify(chartData),
    };
  } catch (error) {
    console.error("Error in get-chart-data function:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
}