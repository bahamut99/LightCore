import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://bcoottemxdthoopmaict.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJjb290dGVteGR0aG9vcG1haWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAxOTEzMjksImV4cCI6MjA2NTc2NzMyOX0.CVYIdU0AHBDd00IlF5jh0HP264txAGh28LBJxDAA9Ng';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DOM Elements
const displayView = document.getElementById('display-goal-view');
const createView = document.getElementById('create-goal-view');
const formView = document.getElementById('form-goal-view');
const goalText = document.getElementById('goal-text');
const goalForm = document.getElementById('goal-form');
const goalValueInput = document.getElementById('goal-value');
const editBtn = document.getElementById('edit-goal-btn');
const createBtn = document.getElementById('create-goal-btn');
const cancelBtn = document.getElementById('cancel-btn');
const loadingSpinner = document.getElementById('loading-spinner');

let currentGoal = null;

function showView(view) {
    displayView.style.display = 'none';
    createView.style.display = 'none';
    formView.style.display = 'none';
    view.style.display = 'block';
}

async function fetchAndDisplayGoal() {
    loadingSpinner.style.display = 'block';
    
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        window.location.href = 'index.html'; // Redirect if not logged in
        return;
    }

    try {
        const response = await fetch('/.netlify/functions/get-goals', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
        });
        if (!response.ok) throw new Error('Could not fetch goal.');

        currentGoal = await response.json();

        if (currentGoal) {
            goalText.textContent = `log your health data ${currentGoal.goal_value} times per week`;
            goalValueInput.value = currentGoal.goal_value;
            showView(displayView);
        } else {
            showView(createView);
        }
    } catch (error) {
        alert(error.message);
    } finally {
        loadingSpinner.style.display = 'none';
    }
}

async function handleSaveGoal(event) {
    event.preventDefault();
    loadingSpinner.style.display = 'block';

    const { data: { session } } = await supabase.auth.getSession();
    const newGoal = {
        goal_type: 'log_frequency',
        goal_value: parseInt(goalValueInput.value, 10)
    };

    try {
        const response = await fetch('/.netlify/functions/set-goal', {
            method: 'POST',
            headers: { 
                'Authorization': `Bearer ${session.access_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(newGoal)
        });
        if (!response.ok) throw new Error('Failed to save goal.');
        
        await fetchAndDisplayGoal(); // Refresh the view

    } catch (error) {
        alert(error.message);
    } finally {
        loadingSpinner.style.display = 'none';
    }
}

// Event Listeners
editBtn.addEventListener('click', () => showView(formView));
createBtn.addEventListener('click', () => showView(formView));
cancelBtn.addEventListener('click', () => {
    if (currentGoal) {
        showView(displayView);
    } else {
        showView(createView);
    }
});
goalForm.addEventListener('submit', handleSaveGoal);

// Initial Load
fetchAndDisplayGoal();