import { createClient } from '@supabase/supabase-js';

// This function converts text scores into numbers for charting
const scoreMap = {
  'high': 3,
  'medium': 2,
  'low': 1
};

export async function handler(event) {
  // Initialize Supabase client from environment variables
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );

  try {
    // 1. === Get Date Range from URL ===
    const rangeInDays = parseInt(event.queryStringParameters?.range, 10) || 7;
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - rangeInDays);

    // 2. === Query the Database ===
    const { data, error } = await supabase
      .from('daily_logs')
      .select('created_at, Clarity, Immune, PhysicalReadiness')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    // 3. === Transform Data for Chart.js ===
    const chartData = {
      labels: [],
      clarityData: [],
      immuneData: [],
      physicalData: []
    };

    data.forEach(row => {
      const dateLabel = new Date(row.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
      chartData.labels.push(dateLabel);

      // === THE FIX IS HERE ===
      // We add a '?' (optional chaining) to safely handle cases where the value might be null.
      // If row.Clarity is null, row.Clarity?.toLowerCase() will result in 'undefined' instead of crashing.
      // The '|| 0' then correctly turns that 'undefined' into a 0 for the chart.
      chartData.clarityData.push(scoreMap[row.Clarity?.toLowerCase()] || 0);
      chartData.immuneData.push(scoreMap[row.Immune?.toLowerCase()] || 0);
      chartData.physicalData.push(scoreMap[row.PhysicalReadiness?.toLowerCase()] || 0);
    });

    // 4. === Return the Formatted Data ===
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