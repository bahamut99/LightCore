import { createClient } from '@supabase/supabase-js';

const scoreMap = { 'high': 3, 'medium': 2, 'low': 1 };

export async function handler(event) {
  // Security Check
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
      .eq('user_id', user.id) // Explicitly query for this user's logs
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) { throw error; }

    const chartData = { labels: [], clarityData: [], immuneData: [], physicalData: [] };
    data.forEach(row => {
      const dateLabel = new Date(row.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
      chartData.labels.push(dateLabel);
      chartData.clarityData.push(scoreMap[row.Clarity?.toLowerCase()] || 0);
      chartData.immuneData.push(scoreMap[row.Immune?.toLowerCase()] || 0);
      chartData.physicalData.push(scoreMap[row.PhysicalReadiness?.toLowerCase()] || 0);
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