// app.js - AutoPrüfer Pro Main Application

// Global state
const state = {
    currentScreen: 'uploadScreen',
    selectedFiles: [],
    selectedPlan: null,
    analysisResult: null,
    stripe: null
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    registerServiceWorker();
});

function initializeApp() {
    // Initialize Stripe
    state.stripe = Stripe('pk_test_YOUR_STRIPE_KEY'); // Replace with your key
    
    // Event listeners
    document.getElementById('photoInput').addEventListener('change', handlePhotoSelect);
    document.getElementById('urlInput').addEventListener('input', handleUrlInput);
    document.getElementById('analyzeBtn').addEventListener('click', startAnalysis);
    
    // Drag and drop
    const photoCard = document.getElementById('photoUploadCard');
    photoCard.addEventListener('dragover', handleDragOver);
    photoCard.addEventListener('drop', handleDrop);
    
    // Prevent default mobile behaviors
    document.addEventListener('gesturestart', e => e.preventDefault());
}

// Service Worker for PWA
async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/sw.js');
        } catch (error) {
            console.log('SW registration failed');
        }
    }
}

// Screen navigation
function showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show selected screen
    document.getElementById(screenId).classList.add('active');
    state.currentScreen = screenId;
    
    // Update UI based on screen
    if (screenId === 'analysisScreen') {
        simulateAnalysisProgress();
    }
}

// File handling
function handlePhotoSelect(event) {
    const files = Array.from(event.target.files);
    addFiles(files);
}

function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
}

function handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    const files = Array.from(event.dataTransfer.files);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    addFiles(imageFiles);
}

function addFiles(files) {
    state.selectedFiles = [...state.selectedFiles, ...files];
    updateFilesPreview();
    checkAnalyzeButton();
}

function removeFile(index) {
    state.selectedFiles.splice(index, 1);
    updateFilesPreview();
    checkAnalyzeButton();
}

function updateFilesPreview() {
    const preview = document.getElementById('filesPreview');
    const filesList = document.getElementById('filesList');
    
    if (state.selectedFiles.length === 0) {
        preview.classList.add('hidden');
        return;
    }
    
    preview.classList.remove('hidden');
    filesList.innerHTML = state.selectedFiles.map((file, index) => `
        <div class="file-item">
            <span>${file.name}</span>
            <button onclick="removeFile(${index})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

// URL input handling
function handleUrlInput(event) {
    checkAnalyzeButton();
}

function checkAnalyzeButton() {
    const urlInput = document.getElementById('urlInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    const hasFiles = state.selectedFiles.length > 0;
    const hasUrl = urlInput.value.trim().length > 0;
    
    analyzeBtn.disabled = !hasFiles && !hasUrl;
}

// Analysis flow
function startAnalysis() {
    showScreen('planScreen');
}

function selectPlan(plan) {
    state.selectedPlan = plan;
    checkout(plan);
}

async function checkout(plan) {
    try {
        showToast('Verbindung zu Stripe wird hergestellt...');
        
        const formData = new FormData();
        formData.append('plan', plan);
        
        const response = await fetch('/api/create-checkout', {
            method: 'POST',
            body: formData
        });
        
        const session = await response.json();
        
        // For demo purposes, simulate successful payment
        // In production, redirect to Stripe Checkout
        simulatePaymentSuccess();
        
        /* Production code:
        const result = await state.stripe.redirectToCheckout({
            sessionId: session.id
        });
        
        if (result.error) {
            showToast(result.error.message, 'error');
        }
        */
    } catch (error) {
        showToast('Fehler beim Checkout', 'error');
    }
}

function simulatePaymentSuccess() {
    showToast('Zahlung erfolgreich!', 'success');
    setTimeout(() => {
        performAnalysis();
    }, 1000);
}

async function performAnalysis() {
    showScreen('analysisScreen');
    
    const formData = new FormData();
    state.selectedFiles.forEach(file => {
        formData.append('photos', file);
    });
    
    const urlInput = document.getElementById('urlInput');
    if (urlInput.value) {
        formData.append('url', urlInput.value);
    }
    
    formData.append('plan', state.selectedPlan);
    
    try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Mock result for demo
        const mockResult = generateMockResult();
        
        /* Production code:
        const response = await fetch('/api/analyze', {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        */
        
        state.analysisResult = mockResult;
        showResults(mockResult);
    } catch (error) {
        showToast('Fehler bei der Analyse', 'error');
    }
}

// Analysis progress animation
function simulateAnalysisProgress() {
    const steps = ['step1', 'step2', 'step3'];
    const titles = [
        'Fotos werden analysiert...',
        'KI verarbeitet Daten...',
        'Bericht wird erstellt...'
    ];
    
    let currentStep = 0;
    
    const interval = setInterval(() => {
        if (currentStep < steps.length) {
            // Update active step
            document.querySelectorAll('.step').forEach(step => {
                step.classList.remove('active');
            });
            document.getElementById(steps[currentStep]).classList.add('active');
            
            // Update progress text
            document.getElementById('progressTitle').textContent = titles[currentStep];
            
            currentStep++;
        } else {
            clearInterval(interval);
        }
    }, 1000);
}

// Show results
function showResults(result) {
    showScreen('resultsScreen');
    
    const content = document.getElementById('resultsContent');
    
    if (state.selectedPlan === 'premium') {
        content.innerHTML = generatePremiumResults(result);
        // Initialize charts and animations after DOM update
        setTimeout(() => {
            initializeCharts(result);
            animateStats(result);
            animateProgressBars();
        }, 100);
    } else {
        content.innerHTML = generateBasicResults(result);
    }
}

// Generate basic results HTML
function generateBasicResults(result) {
    const verdictClass = result.verdict === 'recommended' ? 'recommended' : 
                        result.verdict === 'caution' ? 'caution' : 'not-recommended';
    
    const verdictIcon = result.verdict === 'recommended' ? '✅' : 
                       result.verdict === 'caution' ? '⚠️' : '❌';
    
    return `
        <div class="result-card verdict-card ${verdictClass}">
            <div class="verdict-icon">${verdictIcon}</div>
            <h3>${result.summary}</h3>
        </div>
        
        ${result.risks ? `
            <div class="result-card">
                <h4>🔍 Identifizierte Risiken</h4>
                <ul>
                    ${result.risks.map(risk => `<li>${risk}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
        
        ${result.negotiation ? `
            <div class="result-card">
                <h4>💰 Verhandlungstipps</h4>
                <ul>
                    ${result.negotiation.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
        
        ${result.recommendations ? `
            <div class="result-card">
                <h4>💡 Weitere Empfehlungen</h4>
                <ul>
                    ${result.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
    `;
}

// Generate premium results HTML
function generatePremiumResults(result) {
    const basicHTML = generateBasicResults(result);
    
    return `
        ${basicHTML}
        
        <!-- Comparison Table -->
        <div class="result-card">
            <h4>🚗 Vergleich mit Alternativen</h4>
            <div class="comparison-table">
                <table>
                    <thead>
                        <tr>
                            <th>Modell</th>
                            <th>Preis</th>
                            <th>Verbrauch</th>
                            <th>Versicherung</th>
                            <th>Zuverlässigkeit</th>
                            <th>Empfehlung</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${result.comparison.map(car => `
                            <tr>
                                <td class="car-name">${car.model}</td>
                                <td>${car.price}</td>
                                <td>${car.consumption}</td>
                                <td>${car.insurance}</td>
                                <td>${car.reliability}/5</td>
                                <td>${car.recommended ? '<span class="highlight">✓</span>' : '—'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        
        <!-- Statistics -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-icon">⛽</div>
                <div class="stat-value" id="fuelStat">0</div>
                <div class="stat-label">L/100km</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🛡️</div>
                <div class="stat-value" id="insuranceStat">0</div>
                <div class="stat-label">€/Jahr</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🔧</div>
                <div class="stat-value" id="maintenanceStat">0</div>
                <div class="stat-label">€/Jahr</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">📈</div>
                <div class="stat-value" id="resaleStat">0</div>
                <div class="stat-label">% nach 3J</div>
            </div>
        </div>
        
        <!-- Charts -->
        <div class="charts-grid">
            <div class="chart-card">
                <h4>Monatliche Kosten</h4>
                <canvas id="costChart" width="400" height="300"></canvas>
            </div>
            <div class="chart-card">
                <h4>Wertverlust</h4>
                <canvas id="depreciationChart" width="400" height="300"></canvas>
            </div>
        </div>
        
        <!-- Technical Ratings -->
        <div class="result-card">
            <h4>⚙️ Technische Bewertung</h4>
            <div class="progress-item">
                <div class="progress-header">
                    <span>Motor</span>
                    <span>85%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%" data-width="85%"></div>
                </div>
            </div>
            <div class="progress-item">
                <div class="progress-header">
                    <span>Getriebe</span>
                    <span>92%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%" data-width="92%"></div>
                </div>
            </div>
            <div class="progress-item">
                <div class="progress-header">
                    <span>Elektronik</span>
                    <span>78%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width: 0%" data-width="78%"></div>
                </div>
            </div>
        </div>
    `;
}

// Initialize charts
function initializeCharts(result) {
    // Cost Chart
    const costCtx = document.getElementById('costChart')?.getContext('2d');
    if (costCtx) {
        new Chart(costCtx, {
            type: 'doughnut',
            data: {
                labels: ['Kraftstoff', 'Versicherung', 'Wartung', 'Steuer', 'Wertverlust'],
                datasets: [{
                    data: [150, 100, 80, 22, 200],
                    backgroundColor: [
                        '#3b82f6',
                        '#10b981',
                        '#f59e0b',
                        '#ef4444',
                        '#8b5cf6'
                    ]
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: '#fff' }
                    }
                }
            }
        });
    }
    
    // Depreciation Chart
    const depCtx = document.getElementById('depreciationChart')?.getContext('2d');
    if (depCtx) {
        new Chart(depCtx, {
            type: 'line',
            data: {
                labels: ['Jetzt', '1 Jahr', '2 Jahre', '3 Jahre'],
                datasets: [{
                    label: 'Wert',
                    data: [24900, 21500, 18500, 16000],
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        ticks: { 
                            color: '#fff',
                            callback: value => value.toLocaleString('de-DE') + '€'
                        },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    },
                    x: {
                        ticks: { color: '#fff' },
                        grid: { color: 'rgba(255, 255, 255, 0.1)' }
                    }
                }
            }
        });
    }
}

// Animate statistics
function animateStats(result) {
    const stats = [
        { id: 'fuelStat', value: 5.5 },
        { id: 'insuranceStat', value: 1200 },
        { id: 'maintenanceStat', value: 1500 },
        { id: 'resaleStat', value: 64 }
    ];
    
    stats.forEach(stat => {
        const element = document.getElementById(stat.id);
        if (element) {
            const countUp = new countUp.CountUp(stat.id, stat.value, {
                duration: 2,
                separator: '.',
                decimal: ',',
                decimalPlaces: stat.value < 10 ? 1 : 0
            });
            if (!countUp.error) {
                countUp.start();
            }
        }
    });
}

// Animate progress bars
function animateProgressBars() {
    const progressBars = document.querySelectorAll('.progress-fill');
    progressBars.forEach((bar, index) => {
        setTimeout(() => {
            bar.style.width = bar.getAttribute('data-width');
        }, index * 200);
    });
}

// Toast notifications
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Share results
function shareResults() {
    if (navigator.share) {
        navigator.share({
            title: 'AutoPrüfer Pro Analyse',
            text: 'Ich habe mein Auto mit AutoPrüfer Pro analysiert!',
            url: window.location.href
        });
    } else {
        showToast('Teilen ist auf diesem Gerät nicht verfügbar');
    }
}

// Reset app
function resetApp() {
    state.selectedFiles = [];
    state.selectedPlan = null;
    state.analysisResult = null;
    
    document.getElementById('photoInput').value = '';
    document.getElementById('urlInput').value = '';
    updateFilesPreview();
    checkAnalyzeButton();
    
    showScreen('uploadScreen');
}

// Mock data generator for demo
function generateMockResult() {
    return {
        verdict: 'caution',
        summary: 'Mit Vorsicht zu genießen - einige Punkte sollten geprüft werden',
        risks: [
            'Steuerkette sollte bei diesem Kilometerstand geprüft werden',
            'AGR-Ventil könnte Probleme machen',
            'Bremsscheiben vermutlich bald fällig'
        ],
        negotiation: [
            'Steuerketten-Inspektion als Argument (1500-2500€)',
            'Große Inspektion fällig (800-1200€)',
            'Realistischer Spielraum: 1000-1500€'
        ],
        recommendations: [
            'Unbedingt Probefahrt mit kaltem Motor',
            'Service-Historie komplett prüfen',
            'OBD-Diagnose durchführen lassen'
        ],
        comparison: [
            {
                model: 'BMW 320d (Analysiert)',
                price: '24.900€',
                consumption: '5.5L',
                insurance: '1.200€',
                reliability: 4,
                recommended: true
            },
            {
                model: 'Mercedes C220d',
                price: '26.500€',
                consumption: '5.2L',
                insurance: '1.350€',
                reliability: 4,
                recommended: false
            },
            {
                model: 'Audi A4 40 TDI',
                price: '25.800€',
                consumption: '5.4L',
                insurance: '1.280€',
                reliability: 3,
                recommended: false
            },
            {
                model: 'VW Passat 2.0 TDI',
                price: '22.900€',
                consumption: '5.1L',
                insurance: '980€',
                reliability: 4,
                recommended: true
            }
        ]
    };
}