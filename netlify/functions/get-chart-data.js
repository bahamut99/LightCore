import { createClient } from '@supabase/supabase-js';

const scoreMap = {
  'high': 3,
  'medium': 2,
  'low': 1
};

export async function handler(event) {
    // We will add the security check here in the final step.

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    const rangeInDays = parseInt(event.queryStringParameters?.range, 10) || 7;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - rangeInDays);

    const { data, error } = await supabase
      .from('daily_logs')
      // === THE FIX IS HERE: We now select the new sleep columns ===
      .select('created_at, Clarity, Immune, PhysicalReadiness, sleep_hours, sleep_quality')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    const chartData = {
      labels: [],
      clarityData: [],
      immuneData: [],
      physicalData: []
      // We can add sleepData arrays here in the future
    };

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