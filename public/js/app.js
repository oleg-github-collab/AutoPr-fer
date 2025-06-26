// app.js - AutoPrüfer Pro Main Application

// Global state
const state = {
    currentScreen: 'uploadScreen',
    selectedFiles: [],
    selectedPlan: null,
    analysisResult: null,
    stripe: null,
    cookieConsent: {
        necessary: true,
        functional: false,
        analytics: false,
        marketing: false
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    registerServiceWorker();
    checkCookieConsent();
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
    
    // Add smooth scroll behavior
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
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

// Cookie consent management
function checkCookieConsent() {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) {
        setTimeout(() => {
            document.getElementById('cookieBanner').classList.add('show');
        }, 1000);
    } else {
        state.cookieConsent = JSON.parse(consent);
        applyCookieSettings();
    }
}

function acceptAllCookies() {
    state.cookieConsent = {
        necessary: true,
        functional: true,
        analytics: true,
        marketing: true
    };
    saveCookieConsent();
    document.getElementById('cookieBanner').classList.remove('show');
    closeModal('cookieSettingsModal');
    showToast('Cookie-Einstellungen gespeichert', 'success');
}

function saveSelectedCookies() {
    state.cookieConsent = {
        necessary: true,
        functional: document.getElementById('functionalCookies').checked,
        analytics: document.getElementById('analyticsCookies').checked,
        marketing: document.getElementById('marketingCookies').checked
    };
    saveCookieConsent();
    document.getElementById('cookieBanner').classList.remove('show');
    closeModal('cookieSettingsModal');
    showToast('Cookie-Einstellungen gespeichert', 'success');
}

function saveCookieConsent() {
    localStorage.setItem('cookieConsent', JSON.stringify(state.cookieConsent));
    applyCookieSettings();
}

function applyCookieSettings() {
    // Apply cookie settings based on user preferences
    if (state.cookieConsent.analytics) {
        // Initialize analytics (e.g., Google Analytics)
        initializeAnalytics();
    }
    
    if (state.cookieConsent.marketing) {
        // Initialize marketing tools
        initializeMarketing();
    }
}

function initializeAnalytics() {
    // Placeholder for analytics initialization
    console.log('Analytics initialized');
}

function initializeMarketing() {
    // Placeholder for marketing tools initialization
    console.log('Marketing tools initialized');
}

// Modal management
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        
        // Update cookie settings modal checkboxes
        if (modalId === 'cookieSettingsModal') {
            document.getElementById('functionalCookies').checked = state.cookieConsent.functional;
            document.getElementById('analyticsCookies').checked = state.cookieConsent.analytics;
            document.getElementById('marketingCookies').checked = state.cookieConsent.marketing;
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }
}

// Screen navigation
function showScreen(screenId) {
    // Hide all screens
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // Show selected screen with animation
    setTimeout(() => {
        document.getElementById(screenId).classList.add('active');
        state.currentScreen = screenId;
        
        // Update UI based on screen
        if (screenId === 'analysisScreen') {
            simulateAnalysisProgress();
        }
    }, 100);
}

// File handling
function handlePhotoSelect(event) {
    const files = Array.from(event.target.files);
    
    // Validate file types and sizes
    const validFiles = files.filter(file => {
        if (!file.type.startsWith('image/')) {
            showToast('Bitte nur Bilddateien hochladen', 'error');
            return false;
        }
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            showToast('Datei zu groß (max. 10MB)', 'error');
            return false;
        }
        return true;
    });
    
    addFiles(validFiles);
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
    if (state.selectedFiles.length + files.length > 10) {
        showToast('Maximal 10 Bilder erlaubt', 'error');
        return;
    }
    
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
            <div class="file-info">
                <i class="fas fa-image"></i>
                <span>${file.name}</span>
                <span class="file-size">${formatFileSize(file.size)}</span>
            </div>
            <button class="file-remove" onclick="removeFile(${index})">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `).join('');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// URL input handling
function handleUrlInput(event) {
    const url = event.target.value.trim();
    
    // Validate URL format
    if (url && !isValidUrl(url)) {
        event.target.classList.add('error');
    } else {
        event.target.classList.remove('error');
    }
    
    checkAnalyzeButton();
}

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

function checkAnalyzeButton() {
    const urlInput = document.getElementById('urlInput');
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    const hasFiles = state.selectedFiles.length > 0;
    const hasValidUrl = urlInput.value.trim().length > 0 && isValidUrl(urlInput.value.trim());
    
    analyzeBtn.disabled = !hasFiles && !hasValidUrl;
}

// Analysis flow
function startAnalysis() {
    if (!state.cookieConsent.necessary) {
        showToast('Bitte akzeptieren Sie zuerst die notwendigen Cookies', 'error');
        document.getElementById('cookieBanner').classList.add('show');
        return;
    }
    
    showScreen('planScreen');
}

function selectPlan(plan) {
    state.selectedPlan = plan;
    checkout(plan);
}

async function checkout(plan) {
    try {
        showToast('Verbindung zu Zahlungsanbieter wird hergestellt...', 'info');
        
        const formData = new FormData();
        formData.append('plan', plan);
        
        // Add files and URL to formData
        state.selectedFiles.forEach(file => {
            formData.append('photos', file);
        });
        
        const urlInput = document.getElementById('urlInput');
        if (urlInput.value) {
            formData.append('url', urlInput.value);
        }
        
        const response = await fetch('/api/create-checkout', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Checkout fehlgeschlagen');
        }
        
        const session = await response.json();
        
        // Redirect to Stripe Checkout
        const result = await state.stripe.redirectToCheckout({
            sessionId: session.id
        });
        
        if (result.error) {
            showToast(result.error.message, 'error');
        }
    } catch (error) {
        console.error('Checkout error:', error);
        showToast('Fehler beim Checkout. Bitte versuchen Sie es erneut.', 'error');
    }
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
        const response = await fetch('/api/analyze', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error('Analyse fehlgeschlagen');
        }
        
        const result = await response.json();
        state.analysisResult = result;
        showResults(result);
    } catch (error) {
        console.error('Analysis error:', error);
        showToast('Fehler bei der Analyse. Bitte versuchen Sie es erneut.', 'error');
        showScreen('uploadScreen');
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
    const subtitles = [
        'Bildqualität wird geprüft',
        'Fahrzeugdetails werden erkannt',
        'Ergebnisse werden zusammengestellt'
    ];
    
    let currentStep = 0;
    
    const updateProgress = () => {
        if (currentStep < steps.length) {
            // Update active step
            document.querySelectorAll('.step').forEach(step => {
                step.classList.remove('active', 'completed');
            });
            
            // Mark previous steps as completed
            for (let i = 0; i < currentStep; i++) {
                document.getElementById(steps[i]).classList.add('completed');
            }
            
            // Mark current step as active
            document.getElementById(steps[currentStep]).classList.add('active');
            
            // Update progress text
            document.getElementById('progressTitle').textContent = titles[currentStep];
            document.getElementById('progressSubtitle').textContent = subtitles[currentStep];
            
            currentStep++;
            setTimeout(updateProgress, 2000);
        } else {
            // All steps completed - wait for actual results
            document.getElementById('progressTitle').textContent = 'Analyse abgeschlossen!';
            document.getElementById('progressSubtitle').textContent = 'Ergebnisse werden geladen...';
        }
    };
    
    updateProgress();
}

// Show results
function showResults(result) {
    showScreen('resultsScreen');
    
    const content = document.getElementById('resultsContent');
    
    if (state.selectedPlan === 'premium') {
        content.innerHTML = generatePremiumResults(result);
        // Initialize charts and animations after DOM update
        setTimeout(() => {
            if (result.charts) {
                initializeCharts(result.charts);
            }
            if (result.stats) {
                animateStats(result.stats);
            }
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
        <div class="result-card verdict-card glass-morphism ${verdictClass}">
            <div class="verdict-icon">${verdictIcon}</div>
            <h3>${result.summary}</h3>
            <p class="verdict-details">${result.details || ''}</p>
        </div>
        
        ${result.risks && result.risks.length > 0 ? `
            <div class="result-card glass-morphism">
                <h4><i class="fas fa-exclamation-triangle"></i> Identifizierte Risiken</h4>
                <ul class="result-list">
                    ${result.risks.map(risk => `<li>${risk}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
        
        ${result.negotiation && result.negotiation.length > 0 ? `
            <div class="result-card glass-morphism">
                <h4><i class="fas fa-euro-sign"></i> Verhandlungstipps</h4>
                <ul class="result-list">
                    ${result.negotiation.map(tip => `<li>${tip}</li>`).join('')}
                </ul>
            </div>
        ` : ''}
        
        ${result.recommendations && result.recommendations.length > 0 ? `
            <div class="result-card glass-morphism">
                <h4><i class="fas fa-lightbulb"></i> Weitere Empfehlungen</h4>
                <ul class="result-list">
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
        
        ${result.comparison && result.comparison.length > 0 ? `
        <!-- Comparison Table -->
        <div class="result-card glass-morphism">
            <h4><i class="fas fa-car"></i> Vergleich mit Alternativen</h4>
            <div class="comparison-table-wrapper">
                <table class="comparison-table">
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
                                <td>
                                    <div class="rating">
                                        ${generateStarRating(car.reliability)}
                                    </div>
                                </td>
                                <td>${car.recommended ? '<span class="highlight">✓ Empfohlen</span>' : '—'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
        ` : ''}
        
        ${result.stats ? `
        <!-- Statistics -->
        <div class="stats-grid">
            <div class="stat-card glass-morphism">
                <div class="stat-icon">⛽</div>
                <div class="stat-value" id="fuelStat">0</div>
                <div class="stat-label">L/100km</div>
            </div>
            <div class="stat-card glass-morphism">
                <div class="stat-icon">🛡️</div>
                <div class="stat-value" id="insuranceStat">0</div>
                <div class="stat-label">€/Jahr</div>
            </div>
            <div class="stat-card glass-morphism">
                <div class="stat-icon">🔧</div>
                <div class="stat-value" id="maintenanceStat">0</div>
                <div class="stat-label">€/Jahr</div>
            </div>
            <div class="stat-card glass-morphism">
                <div class="stat-icon">📈</div>
                <div class="stat-value" id="resaleStat">0</div>
                <div class="stat-label">% nach 3J</div>
            </div>
        </div>
        ` : ''}
        
        ${result.charts ? `
        <!-- Charts -->
        <div class="charts-grid">
            <div class="chart-card glass-morphism">
                <h4>Monatliche Kosten</h4>
                <div class="chart-container">
                    <canvas id="costChart"></canvas>
                </div>
            </div>
            <div class="chart-card glass-morphism">
                <h4>Wertverlauf</h4>
                <div class="chart-container">
                    <canvas id="depreciationChart"></canvas>
                </div>
            </div>
        </div>
        ` : ''}
        
        ${result.technical && result.technical.length > 0 ? `
        <!-- Technical Ratings -->
        <div class="result-card glass-morphism">
            <h4><i class="fas fa-cog"></i> Technische Bewertung</h4>
            ${result.technical.map(item => `
                <div class="progress-item">
                    <div class="progress-header">
                        <span>${item.name}</span>
                        <span>${item.value}%</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: 0%" data-width="${item.value}%"></div>
                    </div>
                </div>
            `).join('')}
        </div>
        ` : ''}
    `;
}

function generateStarRating(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            stars += '<i class="fas fa-star"></i>';
        } else {
            stars += '<i class="far fa-star"></i>';
        }
    }
    return stars;
}

// Initialize charts
function initializeCharts(chartData) {
    // Set default chart options
    Chart.defaults.color = '#ffffff';
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.1)';
    
    // Cost Chart
    const costCtx = document.getElementById('costChart')?.getContext('2d');
    if (costCtx && chartData.costs) {
        new Chart(costCtx, {
            type: 'doughnut',
            data: {
                labels: chartData.costs.labels,
                datasets: [{
                    data: chartData.costs.data,
                    backgroundColor: [
                        '#3b82f6',
                        '#10b981',
                        '#f59e0b',
                        '#ef4444',
                        '#8b5cf6'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            font: {
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.label + ': €' + context.parsed.toLocaleString('de-DE');
                            }
                        }
                    }
                }
            }
        });
    }
    
    // Depreciation Chart
    const depCtx = document.getElementById('depreciationChart')?.getContext('2d');
    if (depCtx && chartData.depreciation) {
        new Chart(depCtx, {
            type: 'line',
            data: {
                labels: chartData.depreciation.labels,
                datasets: [{
                    label: 'Fahrzeugwert',
                    data: chartData.depreciation.data,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return '€' + context.parsed.y.toLocaleString('de-DE');
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        ticks: {
                            callback: function(value) {
                                return '€' + value.toLocaleString('de-DE');
                            }
                        },
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        }
                    },
                    x: {
                        grid: {
                            color: 'rgba(255, 255, 255, 0.05)'
                        }
                    }
                }
            }
        });
    }
}

// Animate statistics
function animateStats(stats) {
    if (stats.fuel) {
        animateNumber('fuelStat', stats.fuel, 1);
    }
    if (stats.insurance) {
        animateNumber('insuranceStat', stats.insurance, 0);
    }
    if (stats.maintenance) {
        animateNumber('maintenanceStat', stats.maintenance, 0);
    }
    if (stats.resale) {
        animateNumber('resaleStat', stats.resale, 0);
    }
}

function animateNumber(elementId, endValue, decimalPlaces) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const countUp = new countUp.CountUp(elementId, endValue, {
        duration: 2,
        separator: '.',
        decimal: ',',
        decimalPlaces: decimalPlaces
    });
    
    if (!countUp.error) {
        countUp.start();
    }
}

// Animate progress bars
function animateProgressBars() {
    const progressBars = document.querySelectorAll('.progress-fill');
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const bar = entry.target;
                setTimeout(() => {
                    bar.style.width = bar.getAttribute('data-width');
                }, 100);
                observer.unobserve(bar);
            }
        });
    }, { threshold: 0.1 });
    
    progressBars.forEach(bar => observer.observe(bar));
}

// Download report
async function downloadReport() {
    if (!state.analysisResult) {
        showToast('Kein Bericht verfügbar', 'error');
        return;
    }
    
    try {
        showToast('Bericht wird erstellt...', 'info');
        
        const response = await fetch('/api/download-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                analysisId: state.analysisResult.id,
                plan: state.selectedPlan
            })
        });
        
        if (!response.ok) {
            throw new Error('Download fehlgeschlagen');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AutoPruefer_Bericht_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showToast('Bericht heruntergeladen', 'success');
    } catch (error) {
        console.error('Download error:', error);
        showToast('Fehler beim Herunterladen', 'error');
    }
}

// Toast notifications
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast glass-morphism ${type}`;
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Share results
function shareResults() {
    if (!state.analysisResult) return;
    
    const shareData = {
        title: 'AutoPrüfer Pro Analyse',
        text: `Meine Fahrzeuganalyse: ${state.analysisResult.summary}`,
        url: window.location.href
    };
    
    if (navigator.share && navigator.canShare(shareData)) {
        navigator.share(shareData)
            .then(() => showToast('Erfolgreich geteilt', 'success'))
            .catch(err => {
                if (err.name !== 'AbortError') {
                    console.error('Share error:', err);
                    copyToClipboard();
                }
            });
    } else {
        copyToClipboard();
    }
}

function copyToClipboard() {
    const text = `Ich habe mein Auto mit AutoPrüfer Pro analysiert! ${window.location.href}`;
    
    if (navigator.clipboard) {
        navigator.clipboard.writeText(text)
            .then(() => showToast('Link kopiert', 'success'))
            .catch(() => showToast('Kopieren fehlgeschlagen', 'error'));
    } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        
        try {
            document.execCommand('copy');
            showToast('Link kopiert', 'success');
        } catch (err) {
            showToast('Kopieren fehlgeschlagen', 'error');
        }
        
        document.body.removeChild(textarea);
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
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Handle payment success return (from Stripe)
function handlePaymentReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    
    if (sessionId) {
        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);
        
        // Verify payment and start analysis
        verifyPaymentAndAnalyze(sessionId);
    }
}

async function verifyPaymentAndAnalyze(sessionId) {
    try {
        showToast('Zahlung wird verifiziert...', 'info');
        
        const response = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sessionId })
        });
        
        if (!response.ok) {
            throw new Error('Verifizierung fehlgeschlagen');
        }
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Zahlung erfolgreich!', 'success');
            state.selectedPlan = result.plan;
            performAnalysis();
        } else {
            throw new Error('Zahlung nicht erfolgreich');
        }
    } catch (error) {
        console.error('Payment verification error:', error);
        showToast('Fehler bei der Zahlungsverifizierung', 'error');
        showScreen('uploadScreen');
    }
}

// Call on page load to handle Stripe returns
handlePaymentReturn();