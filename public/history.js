const SUPABASE_URL = 'https://izbjadizahqlfrdqofyw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6YmphZGl6YWhxbGZyZHFvZnl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyMDE1OTksImV4cCI6MjA2OTc3NzU5OX0.sCoMYav2kGtopZsmijAJojBgoN_ay-ddAVYT3I-l6o0';

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
const dateDisplay = document.getElementById('date-display-text');
const clearDateBtn = document.getElementById('clear-date-filter');

let flatpickrInstance;

flatpickrInstance = flatpickr("#date-filter-container", {
    mode: "range",
    dateFormat: "Y-m-d",
    altInput: false,
    onClose: function(selectedDates) {
        if (selectedDates.length === 2) {
            dateRange.start = selectedDates[0];
            dateRange.end = selectedDates[1];
            updateDateDisplay(selectedDates);
            clearDateBtn.style.display = 'inline-block';
            currentPage = 1;
            fetchAndRenderInsights();
        }
    }
});

function updateDateDisplay(dates) {
    const options = { month: 'short', day: 'numeric', year: 'numeric' };
    const startDate = dates[0].toLocaleDateString('en-US', options);
    const endDate = dates[1].toLocaleDateString('en-US', options);
    dateDisplay.textContent = `${startDate} - ${endDate}`;
}

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
        // --- THIS IS THE FIX ---
        // Create a new date object for the end date to avoid modifying the original
        const endOfDay = new Date(dateRange.end);
        // Set the time to the last millisecond of the day in the user's local timezone
        endOfDay.setHours(23, 59, 59, 999);
        
        url += `&startDate=${dateRange.start.toISOString()}&endDate=${endOfDay.toISOString()}`;
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
    if (!session) { 
        alert('You must be logged in to export data.'); 
        return; 
    }
    
    let url = `/.netlify/functions/get-past-insights?limit=1000`;
    if (dateRange.start && dateRange.end) {
        const endOfDay = new Date(dateRange.end);
        endOfDay.setHours(23, 59, 59, 999);
        url += `&startDate=${dateRange.start.toISOString()}&endDate=${endOfDay.toISOString()}`;
    }

    try {
        const response = await fetch(url, { headers: { 'Authorization': `Bearer ${session.access_token}` } });
        if (!response.ok) throw new Error('Failed to fetch data for export.');
        
        const { insights } = await response.json();
        if (insights.length === 0) { 
            alert('No data to export for the selected period.'); 
            return; 
        }

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

function clearFilter() {
    dateRange.start = null;
    dateRange.end = null;
    flatpickrInstance.clear();
    dateDisplay.textContent = 'All Time';
    clearDateBtn.style.display = 'none';
    currentPage = 1;
    fetchAndRenderInsights();
}

// Attach event listeners
prevBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; fetchAndRenderInsights(); } });
nextBtn.addEventListener('click', () => { currentPage++; fetchAndRenderInsights(); });
exportBtn.addEventListener('click', exportToCSV);
clearDateBtn.addEventListener('click', clearFilter);

// Initial data fetch
fetchAndRenderInsights();