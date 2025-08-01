const { createClient } = require('@supabase/supabase-js');

// Helper function to group logs by calendar date
const groupByDay = (logs) => {
    const groups = logs.reduce((acc, log) => {
        const date = new Date(log.created_at).toISOString().split('T')[0];
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(log);
        return acc;
    }, {});
    return groups;
};

// Helper function to average the scores for a group of logs
const averageLogs = (logGroup) => {
    const totals = logGroup.reduce((acc, log) => {
        acc.clarity_score += log.clarity_score || 0;
        acc.immune_score += log.immune_score || 0;
        acc.physical_readiness_score += log.physical_readiness_score || 0;
        acc.count++;
        return acc;
    }, { clarity_score: 0, immune_score: 0, physical_readiness_score: 0, count: 0 });

    return {
        clarity_score: totals.count > 0 ? totals.clarity_score / totals.count : 0,
        immune_score: totals.count > 0 ? totals.immune_score / totals.count : 0,
        physical_readiness_score: totals.count > 0 ? totals.physical_readiness_score / totals.count : 0,
    };
};

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    const range = parseInt(event.queryStringParameters.range) || 7;
    const aggregate = event.queryStringParameters.aggregate === 'daily'; // Check for aggregation flag

    const today = new Date();
    const startDate = new Date();
    startDate.setDate(today.getDate() - (range - 1));
    startDate.setHours(0, 0, 0, 0);

    try {
        const { data, error } = await supabase
            .from('daily_logs')
            .select('created_at, clarity_score, immune_score, physical_readiness_score')
            .eq('user_id', user.id)
            .gte('created_at', startDate.toISOString())
            .order('created_at', { ascending: true });

        if (error) throw new Error(`Supabase select error: ${error.message}`);

        let processedData = data;

        // If aggregation is requested, group and average the data
        if (aggregate && data.length > 0) {
            const groupedByDay = groupByDay(data);
            processedData = Object.entries(groupedByDay).map(([date, logs]) => {
                const averagedScores = averageLogs(logs);
                return {
                    created_at: date, // The date is now the key
                    ...averagedScores
                };
            });
        }

        const labels = processedData.map(log => log.created_at);
        const clarityData = processedData.map(log => log.clarity_score);
        const immuneData = processedData.map(log => log.immune_score);
        const physicalData = processedData.map(log => log.physical_readiness_score);

        return {
            statusCode: 200,
            body: JSON.stringify({ labels, clarityData, immuneData, physicalData }),
        };
    } catch (error) {
        console.error('Error fetching chart data:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message }),
        };
    }
};