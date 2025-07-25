// Note: We are using the global Supabase object from the CDN script
const { createClient } = supabase;

const SUPABASE_URL = 'https://bcoottemxdthoopmaict.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjb290dGVteGR0aG9vcG1haWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxOTEzMjksImV4cCI6MjA2NTc2NzMyOX0.CVYIdU0AHBDd00IlF5jh0HP264txAGh28LBJxDAA9Ng';

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const INSIGHTS_PER_PAGE = 20;
let currentPage = 1;
let dateRange = { start: null, end: null };
let totalInsights = 0;

const insightsContainer = document.getElementById('insights-container');
const prevBtn = document.getElementById('prev-page-btn');
const nextBtn = document.getElementById('next-page-btn');
const pageInfo = document.getElementById('page-info');
const exportBtn = document.getElementById('export-csv-btn');
const loadingSpinner = document.getElementById('loading-spinner');

flatpickr("#date-range-picker", {
    mode: "range",
    dateFormat: "Y-m-d",
    onChange: function(selectedDates) {
        if (selectedDates.length === 2) {
            dateRange.start = selectedDates[0];
            dateRange.end = selectedDates[1];
        } else if (selectedDates.length === 0) {
            dateRange.start = null;
            dateRange.end = null;
        }
        currentPage = 1;
        fetchAndRenderInsights();
    }
});

async function fetchAndRenderInsights() {
    loadingSpinner.style.display = 'block';
    insightsContainer.innerHTML = '';
    
    const { data: { session } } = await db.auth.getSession();
    if (!session) {
        insightsContainer.innerHTML = '<p class="error-message">You must be logged in to view your history.</p>';
        loadingSpinner.style.display = 'none';
        return;
    }

    const offset = (currentPage - 1) * INSIGHTS_PER_PAGE;
    let url = `/.netlify/functions/get-past-insights?limit=${INSIGHTS_PER_PAGE}&offset=${offset}`;
    if (dateRange.start && dateRange.end) {
        url += `&startDate=${dateRange.start.toISOString()}&endDate=${dateRange.end.toISOString()}`;
    }

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) throw new Error('Failed to fetch insights.');
        
        const { insights, count } = await response.json();
        totalInsights = count;

        if (insights.length === 0) {
            insightsContainer.innerHTML = '<p class="subtle-text">No insights found for the selected period.</p>';
        } else {
            renderInsights(insights);
        }
        renderPagination();

    } catch (error) {
        insightsContainer.innerHTML = `<p class="error-message">${error.message}</p>`;
    } finally {
        loadingSpinner.style.display = 'none';
    }
}

function renderInsights(insights) {
    const fragment = document.createDocumentFragment();
    insights.forEach(insight => {
        const card = document.createElement('div');
        card.className = 'insight-card';
        const date = document.createElement('h3');
        date.textContent = new Date(insight.created_at).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
        const text = document.createElement('p');
        text.textContent = insight.insight_text;
        card.appendChild(date);
        card.appendChild(text);
        fragment.appendChild(card);
    });
    insightsContainer.appendChild(fragment);
}

function renderPagination() {
    const totalPages = Math.ceil(totalInsights / INSIGHTS_PER_PAGE);
    pageInfo.textContent = `Page ${currentPage} of ${totalPages || 1}`;
    
    prevBtn.disabled = currentPage === 1;
    nextBtn.disabled = currentPage >= totalPages;
}

async function exportToCSV() {
    const { data: { session } } = await db.auth.getSession();
    if (!session) { alert('You must be logged in to export data.'); return; }
    let url = `/.netlify/functions/get-past-insights?limit=1000`;
    if (dateRange.start && dateRange.end) {
        url += `&startDate=${dateRange.start.toISOString()}&endDate=${dateRange.end.toISOString()}`;
    }
    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${session.access_token}` } });
        if (!response.ok) throw new Error('Failed to fetch data for export.');
        
        const { insights } = await response.json();
        if (insights.length === 0) { alert('No data to export.'); return; }

        let csvContent = "data:text/csv;charset=utf-8,Date,Insight\r\n";
        insights.forEach(row => {
            const date = new Date(row.created_at).toISOString().split('T')[0];
            const insight = `"${row.insight_text.replace(/"/g, '""')}"`;
            csvContent += `${date},${insight}\r\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "lightcore_insights.csv");
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (error) {
        alert(`Export failed: ${error.message}`);
    }
}

prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; fetchAndRenderInsights(); } });
nextBtn.addEventListener('click', () => { currentPage++; fetchAndRenderInsights(); });
exportBtn.addEventListener('click', exportToCSV);

fetchAndRenderInsights();