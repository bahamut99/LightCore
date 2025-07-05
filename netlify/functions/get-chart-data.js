const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event, context) => {
    const token = event.headers.authorization?.split(' ')[1];
    if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'Not authorized.' }) };

    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) return { statusCode: 401, body: JSON.stringify({ error: 'User not found.' }) };

    const range = parseInt(event.queryStringParameters.range) || 7;
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

        if (error) throw error;

        const labels = data.map(log => new Date(log.created_at).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }));
        const clarityData = data.map(log => log.clarity_score);
        const immuneData = data.map(log => log.immune_score);
        const physicalData = data.map(log => log.physical_readiness_score);

        return {
            statusCode: 200,
            body: JSON.stringify({ labels, clarityData, immuneData, physicalData }),
        };
    } catch (error) {
        console.error('Error fetching chart data:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to fetch chart data' }),
        };
    }
};