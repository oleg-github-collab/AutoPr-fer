const stripe = Stripe('pk_live_YOUR_PUBLISHABLE_KEY'); // Replace with your key

document.getElementById('vehicleForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const vehicleData = {
        brand: formData.get('brand'),
        model: formData.get('model'),
        year: formData.get('year'),
        mileage: formData.get('mileage'),
        price: formData.get('price'),
        city: formData.get('city'),
        vin: formData.get('vin'),
        description: formData.get('description')
    };
    
    const selectedPlan = document.querySelector('input[name="plan"]:checked').value;
    
    // Show loading
    document.getElementById('loadingSpinner').classList.remove('hidden');
    
    try {
        // Create checkout session
        const response = await fetch('/api/create-checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                plan: selectedPlan,
                vehicleData: vehicleData
            })
        });
        
        const { sessionId } = await response.json();
        
        // Redirect to Stripe Checkout
        const { error } = await stripe.redirectToCheckout({ sessionId });
        
        if (error) {
            alert('Fehler: ' + error.message);
            document.getElementById('loadingSpinner').classList.add('hidden');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
        document.getElementById('loadingSpinner').classList.add('hidden');
    }
});

// Handle success page
if (window.location.pathname === '/success.html') {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    
    if (sessionId) {
        // Poll for results
        checkForResults(sessionId);
    }
}

async function checkForResults(sessionId) {
    let attempts = 0;
    const maxAttempts = 30;
    
    const interval = setInterval(async () => {
        attempts++;
        
        try {
            const response = await fetch(`/api/results/${sessionId}`);
            if (response.ok) {
                const result = await response.json();
                displayResults(result);
                clearInterval(interval);
            }
        } catch (error) {
            console.error('Error fetching results:', error);
        }
        
        if (attempts >= maxAttempts) {
            clearInterval(interval);
            alert('Zeitüberschreitung. Bitte kontaktieren Sie den Support.');
        }
    }, 2000);
}

function displayResults(result) {
    document.getElementById('loadingSpinner').classList.add('hidden');
    document.getElementById('resultsSection').classList.remove('hidden');
    
    // Format and display analysis
    const analysisDiv = document.getElementById('analysisResult');
    analysisDiv.innerHTML = formatAnalysis(result.analysis);
    
    // Show PDF download if available
    if (result.pdfUrl) {
        document.getElementById('pdfDownload').classList.remove('hidden');
        document.getElementById('pdfLink').href = result.pdfUrl;
    }
}

function formatAnalysis(text) {
    // Convert markdown-style formatting to HTML
    return text
        .replace(/## (.*)/g, '<h3 class="text-xl font-bold mt-4 mb-2">$1</h3>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/- (.*)/g, '<li class="ml-4">$1</li>')
        .replace(/\n\n/g, '</p><p class="mb-3">')
        .replace(/^/, '<p class="mb-3">')
        .replace(/$/, '</p>');
}