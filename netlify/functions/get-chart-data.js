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
    // We'll look for a query like "?range=30". Default to 7 days if not provided.
    const rangeInDays = parseInt(event.queryStringParameters?.range, 10) || 7;
    
    // Calculate the start date for the query
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - rangeInDays);

    // 2. === Query the Database ===
    const { data, error } = await supabase
      .from('daily_logs')
      .select('created_at, Clarity, Immune, PhysicalReadiness')
      // .gte() means "greater than or equal to"
      .gte('created_at', startDate.toISOString())
      // We must order by date ascending for the chart to draw correctly
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    // 3. === Transform Data for Chart.js ===
    // We need to convert our database rows into an object with arrays for labels and data.
    const chartData = {
      labels: [],
      clarityData: [],
      immuneData: [],
      physicalData: []
    };

    data.forEach(row => {
      // Format the date label as "MM/DD"
      const dateLabel = new Date(row.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' });
      chartData.labels.push(dateLabel);

      // Convert text scores to numbers using our scoreMap, defaulting to 0 if null/unknown
      chartData.clarityData.push(scoreMap[row.Clarity.toLowerCase()] || 0);
      chartData.immuneData.push(scoreMap[row.Immune.toLowerCase()] || 0);
      chartData.physicalData.push(scoreMap[row.PhysicalReadiness.toLowerCase()] || 0);
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