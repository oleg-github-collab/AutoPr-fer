// app.js - AutoPrüfer Pro Enhanced Application

// Global state management
const state = {
    currentScreen: 'uploadScreen',
    selectedFiles: [],
    selectedPlan: null,
    analysisResult: null,
    stripe: null,
    vehicleType: null,
    promoCode: null,
    pricingSession: null,
    analysisToken: null,
    cookieConsent: {
        necessary: true,
        functional: false,
        analytics: false,
        marketing: false
    },
    mousePosition: { x: 0, y: 0 }
};

// Configuration
const config = {
    stripeKey: 'pk_test_YOUR_STRIPE_KEY', // Replace with your key
    apiBaseUrl: '/api',
    maxFiles: 10,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    supportedPlatforms: ['mobile.de', 'autoscout24', 'kleinanzeigen.de'],
    vehicleTypes: {
        'luxury': { name: 'Premium (BMW, Mercedes, Audi)', modifier: 1.2 },
        'standard': { name: 'Standard (VW, Ford, Opel)', modifier: 1.0 },
        'commercial': { name: 'Nutzfahrzeuge', modifier: 1.5 },
        'classic': { name: 'Oldtimer', modifier: 1.3 }
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    registerServiceWorker();
    checkCookieConsent();
    handlePaymentReturn();
    initializeAnimations();
});

function initializeApp() {
    // Initialize Stripe
    state.stripe = Stripe(config.stripeKey);
    
    // Set initial theme
    applyTheme();
    
    // Initialize tooltips
    initializeTooltips();
    
    // Detect vehicle type from URL if present
    detectVehicleType();
}

function setupEventListeners() {
    // File handling
    const photoInput = document.getElementById('photoInput');
    const photoCard = document.getElementById('photoUploadCard');
    
    photoInput.addEventListener('change', handlePhotoSelect);
    photoCard.addEventListener('dragover', handleDragOver);
    photoCard.addEventListener('dragleave', handleDragLeave);
    photoCard.addEventListener('drop', handleDrop);
    
    // URL input with debounce
    const urlInput = document.getElementById('urlInput');
    let urlTimeout;
    urlInput.addEventListener('input', (e) => {
        clearTimeout(urlTimeout);
        urlTimeout = setTimeout(() => handleUrlInput(e), 500);
    });
    
    // Analyze button
    document.getElementById('analyzeBtn').addEventListener('click', startAnalysis);
    
    // Vehicle type selector
    document.querySelectorAll('.vehicle-type-option').forEach(option => {
        option.addEventListener('click', () => selectVehicleType(option.dataset.type));
    });
    
    // Promo code input
    const promoInput = document.getElementById('promoCodeInput');
    if (promoInput) {
        promoInput.addEventListener('input', (e) => {
            clearTimeout(promoTimeout);
            promoTimeout = setTimeout(() => validatePromoCode(e.target.value), 500);
        });
    }
    
    // Mobile gestures
    setupMobileGestures();
    
    // Mouse tracking for interactive effects
    setupMouseTracking();
    
    // Smooth scroll
    setupSmoothScroll();
    
    // Keyboard shortcuts
    setupKeyboardShortcuts();
}

// Enhanced animations
function initializeAnimations() {
    // Intersection Observer for scroll animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '50px'
    };
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);
    
    document.querySelectorAll('.animate-on-scroll').forEach(el => {
        observer.observe(el);
    });
    
    // Parallax effects
    window.addEventListener('scroll', () => {
        requestAnimationFrame(updateParallax);
    });
}

function updateParallax() {
    const scrolled = window.pageYOffset;
    const parallaxElements = document.querySelectorAll('.parallax');
    
    parallaxElements.forEach(el => {
        const speed = el.dataset.speed || 0.5;
        const yPos = -(scrolled * speed);
        el.style.transform = `translateY(${yPos}px)`;
    });
}

// Mouse tracking for interactive effects
function setupMouseTracking() {
    document.addEventListener('mousemove', (e) => {
        state.mousePosition = { x: e.clientX, y: e.clientY };
        
        // Update CSS variables for mouse position
        document.documentElement.style.setProperty('--mouse-x', `${e.clientX}px`);
        document.documentElement.style.setProperty('--mouse-y', `${e.clientY}px`);
        
        // Interactive cards
        updateInteractiveCards(e);
    });
}

function updateInteractiveCards(e) {
    const cards = document.querySelectorAll('.upload-card, .plan-card');
    
    cards.forEach(card => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        // Update CSS variables for gradient effect
        card.style.setProperty('--x', `${x}px`);
        card.style.setProperty('--y', `${y}px`);
    });
}

// Mobile gestures
function setupMobileGestures() {
    let touchStartX = 0;
    let touchEndX = 0;
    
    document.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
    });
    
    document.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
    });
    
    function handleSwipe() {
        const swipeThreshold = 50;
        const diff = touchStartX - touchEndX;
        
        if (Math.abs(diff) > swipeThreshold) {
            if (diff > 0) {
                // Swipe left
                handleSwipeLeft();
            } else {
                // Swipe right
                handleSwipeRight();
            }
        }
    }
}

function handleSwipeLeft() {
    // Navigate to next screen or slide
    if (state.currentScreen === 'uploadScreen' && !document.getElementById('analyzeBtn').disabled) {
        startAnalysis();
    }
}

function handleSwipeRight() {
    // Navigate to previous screen
    const backBtn = document.querySelector('.back-btn');
    if (backBtn && !backBtn.hidden) {
        backBtn.click();
    }
}

// Keyboard shortcuts
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Enter to submit
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const activeButton = document.querySelector('.btn-primary:not(:disabled)');
            if (activeButton) activeButton.click();
        }
        
        // Escape to close modals
        if (e.key === 'Escape') {
            const openModal = document.querySelector('.modal.show');
            if (openModal) {
                closeModal(openModal.id);
            }
        }
    });
}

// Vehicle type detection and selection
function detectVehicleType() {
    const urlInput = document.getElementById('urlInput');
    if (urlInput && urlInput.value) {
        const url = urlInput.value.toLowerCase();
        
        // Auto-detect luxury brands
        const luxuryBrands = ['bmw', 'mercedes', 'audi', 'porsche', 'jaguar', 'maserati'];
        const commercialTypes = ['transporter', 'sprinter', 'crafter', 'transit'];
        
        for (const brand of luxuryBrands) {
            if (url.includes(brand)) {
                selectVehicleType('luxury');
                return;
            }
        }
        
        for (const type of commercialTypes) {
            if (url.includes(type)) {
                selectVehicleType('commercial');
                return;
            }
        }
    }
}

function selectVehicleType(type) {
    state.vehicleType = type;
    
    // Update UI
    document.querySelectorAll('.vehicle-type-option').forEach(option => {
        option.classList.toggle('selected', option.dataset.type === type);
    });
    
    // Recalculate price if plan selected
    if (state.selectedPlan) {
        calculateDynamicPrice();
    }
    
    showToast(`Fahrzeugtyp: ${config.vehicleTypes[type].name}`, 'info');
}

// Enhanced file handling
function handlePhotoSelect(event) {
    const files = Array.from(event.target.files);
    validateAndAddFiles(files);
}

function handleDragOver(event) {
    event.preventDefault();
    event.currentTarget.classList.add('drag-over');
}

function handleDragLeave(event) {
    event.currentTarget.classList.remove('drag-over');
}

function handleDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove('drag-over');
    
    const files = Array.from(event.dataTransfer.files);
    validateAndAddFiles(files);
}

function validateAndAddFiles(files) {
    const validFiles = [];
    const errors = [];
    
    files.forEach(file => {
        if (!file.type.startsWith('image/')) {
            errors.push(`${file.name}: Nur Bilddateien erlaubt`);
            return;
        }
        
        if (file.size > config.maxFileSize) {
            errors.push(`${file.name}: Zu groß (max. 10MB)`);
            return;
        }
        
        // Check for duplicates
        const isDuplicate = state.selectedFiles.some(f => 
            f.name === file.name && f.size === file.size
        );
        
        if (isDuplicate) {
            errors.push(`${file.name}: Bereits hinzugefügt`);
            return;
        }
        
        validFiles.push(file);
    });
    
    // Show errors
    if (errors.length > 0) {
        showToast(errors[0], 'error');
    }
    
    // Add valid files
    if (validFiles.length > 0) {
        if (state.selectedFiles.length + validFiles.length > config.maxFiles) {
            showToast(`Maximal ${config.maxFiles} Bilder erlaubt`, 'error');
            return;
        }
        
        state.selectedFiles = [...state.selectedFiles, ...validFiles];
        updateFilesPreview();
        checkAnalyzeButton();
        
        // Auto-detect vehicle type from first image
        if (state.selectedFiles.length === 1) {
            analyzeImageForVehicleType(validFiles[0]);
        }
    }
}

// AI-powered vehicle type detection from image
async function analyzeImageForVehicleType(file) {
    // This would call a computer vision API in production
    // For now, we'll use file name heuristics
    const fileName = file.name.toLowerCase();
    
    if (fileName.includes('bmw') || fileName.includes('mercedes') || fileName.includes('audi')) {
        selectVehicleType('luxury');
    } else if (fileName.includes('oldtimer') || fileName.includes('classic')) {
        selectVehicleType('classic');
    }
}

// Enhanced URL input handling
async function handleUrlInput(event) {
    const url = event.target.value.trim();
    
    if (!url) {
        event.target.classList.remove('error', 'success');
        checkAnalyzeButton();
        return;
    }
    
    // Validate URL
    if (!isValidUrl(url)) {
        event.target.classList.add('error');
        event.target.classList.remove('success');
        showToast('Ungültige URL', 'error');
        checkAnalyzeButton();
        return;
    }
    
    // Check if supported platform
    const isSupported = config.supportedPlatforms.some(platform => 
        url.toLowerCase().includes(platform)
    );
    
    if (!isSupported) {
        event.target.classList.add('error');
        showToast('Diese Plattform wird noch nicht unterstützt', 'warning');
    } else {
        event.target.classList.remove('error');
        event.target.classList.add('success');
        
        // Auto-detect vehicle type
        detectVehicleType();
        
        // Preview listing info
        previewListing(url);
    }
    
    checkAnalyzeButton();
}

// Preview listing information
async function previewListing(url) {
    try {
        const response = await fetch(`${config.apiBaseUrl}/preview-listing`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        
        if (response.ok) {
            const preview = await response.json();
            showListingPreview(preview);
        }
    } catch (error) {
        console.error('Preview error:', error);
    }
}

function showListingPreview(preview) {
    // Show a small preview of the listing
    const previewHtml = `
        <div class="listing-preview glass-morphism">
            <h4>${preview.title || 'Fahrzeug erkannt'}</h4>
            <p>${preview.price || ''} • ${preview.year || ''} • ${preview.mileage || ''}</p>
        </div>
    `;
    
    // Insert preview near URL input
    const urlCard = document.querySelector('.url-input').closest('.upload-card');
    const existing = urlCard.querySelector('.listing-preview');
    if (existing) existing.remove();
    
    urlCard.insertAdjacentHTML('beforeend', previewHtml);
}

// Dynamic pricing with promo codes
async function calculateDynamicPrice() {
    if (!state.selectedPlan) return;
    
    try {
        const response = await fetch(`${config.apiBaseUrl}/calculate-price`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                plan: state.selectedPlan,
                vehicleType: state.vehicleType || 'standard',
                promoCode: state.promoCode
            })
        });
        
        if (!response.ok) {
            throw new Error('Preisberechnung fehlgeschlagen');
        }
        
        const pricing = await response.json();
        state.pricingSession = pricing;
        
        updatePriceDisplay(pricing);
        
    } catch (error) {
        console.error('Pricing error:', error);
        showToast('Fehler bei der Preisberechnung', 'error');
    }
}

function updatePriceDisplay(pricing) {
    // Update price in UI
    const priceElements = document.querySelectorAll(`.plan-card[data-plan="${state.selectedPlan}"] .plan-price`);
    
    priceElements.forEach(el => {
        const originalPrice = pricing.originalPrice / 100;
        const finalPrice = pricing.finalPrice / 100;
        
        if (pricing.savings) {
            el.innerHTML = `
                <span class="original-price">€${originalPrice.toFixed(2)}</span>
                <span class="discounted-price">€${finalPrice.toFixed(2)}</span>
                <span class="discount-badge">${pricing.discount}</span>
            `;
        } else {
            el.innerHTML = `
                <span class="currency">€</span>
                <span class="amount">${finalPrice.toFixed(2)}</span>
            `;
        }
    });
}

// Promo code validation
let promoTimeout;
async function validatePromoCode(code) {
    if (!code) {
        state.promoCode = null;
        document.getElementById('promoStatus').innerHTML = '';
        if (state.selectedPlan) calculateDynamicPrice();
        return;
    }
    
    // Show loading state
    document.getElementById('promoStatus').innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    // Simulate API call - in production this would validate server-side
    setTimeout(() => {
        const validCodes = ['FIRSTTIME', 'AUTOPRO10', 'PREMIUM50', 'BLACKFRIDAY'];
        const isValid = validCodes.includes(code.toUpperCase());
        
        if (isValid) {
            state.promoCode = code.toUpperCase();
            document.getElementById('promoStatus').innerHTML = 
                '<i class="fas fa-check-circle text-success"></i> Code angewendet';
            showToast('Promo-Code aktiviert!', 'success');
            
            if (state.selectedPlan) calculateDynamicPrice();
        } else {
            state.promoCode = null;
            document.getElementById('promoStatus').innerHTML = 
                '<i class="fas fa-times-circle text-danger"></i> Ungültiger Code';
        }
    }, 500);
}

// Enhanced analysis flow
function startAnalysis() {
    if (!state.cookieConsent.necessary) {
        showToast('Bitte akzeptieren Sie zuerst die notwendigen Cookies', 'error');
        document.getElementById('cookieBanner').classList.add('show');
        return;
    }
    
    // Validate inputs
    if (state.selectedFiles.length === 0 && !document.getElementById('urlInput').value) {
        showToast('Bitte laden Sie Fotos hoch oder geben Sie eine URL ein', 'error');
        return;
    }
    
    // Show vehicle type selector if not selected
    if (!state.vehicleType) {
        showVehicleTypeModal();
        return;
    }
    
    showScreen('planScreen');
    
    // Pre-calculate prices
    ['basic', 'premium'].forEach(plan => {
        state.selectedPlan = plan;
        calculateDynamicPrice();
    });
    state.selectedPlan = null;
}

function showVehicleTypeModal() {
    const modal = `
        <div class="vehicle-type-modal glass-morphism">
            <h3>Wählen Sie Ihren Fahrzeugtyp</h3>
            <div class="vehicle-type-grid">
                ${Object.entries(config.vehicleTypes).map(([type, info]) => `
                    <div class="vehicle-type-card" onclick="selectVehicleTypeAndContinue('${type}')">
                        <i class="fas fa-car"></i>
                        <h4>${info.name}</h4>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    // Show modal
    showModalContent(modal);
}

function selectVehicleTypeAndContinue(type) {
    selectVehicleType(type);
    closeCurrentModal();
    showScreen('planScreen');
}

// Enhanced checkout process
async function selectPlan(plan) {
    state.selectedPlan = plan;
    
    // Show loading state
    showToast('Zahlungsprozess wird vorbereitet...', 'info');
    
    try {
        // First calculate final price
        await calculateDynamicPrice();
        
        if (!state.pricingSession) {
            throw new Error('Preisberechnung fehlgeschlagen');
        }
        
        // Create checkout session
        const response = await fetch(`${config.apiBaseUrl}/create-checkout`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: state.pricingSession.sessionId,
                customerEmail: localStorage.getItem('customerEmail') || '',
                metadata: {
                    filesCount: state.selectedFiles.length,
                    hasUrl: !!document.getElementById('urlInput').value
                }
            })
        });
        
        if (!response.ok) {
            throw new Error('Checkout-Erstellung fehlgeschlagen');
        }
        
        const session = await response.json();
        
        // Store data for after payment
        sessionStorage.setItem('analysisData', JSON.stringify({
            files: state.selectedFiles.map(f => f.name),
            url: document.getElementById('urlInput').value,
            plan: plan,
            vehicleType: state.vehicleType
        }));
        
        // Redirect to Stripe Checkout
        const result = await state.stripe.redirectToCheckout({
            sessionId: session.id
        });
        
        if (result.error) {
            throw new Error(result.error.message);
        }
        
    } catch (error) {
        console.error('Checkout error:', error);
        showToast(error.message || 'Fehler beim Checkout', 'error');
    }
}

// Payment verification and analysis
async function handlePaymentReturn() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    const analysisSession = urlParams.get('analysis_session');
    
    if (!sessionId) return;
    
    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);
    
    try {
        showToast('Zahlung wird verifiziert...', 'info');
        
        // Verify payment
        const response = await fetch(`${config.apiBaseUrl}/payment/verify/${sessionId}`);
        
        if (!response.ok) {
            throw new Error('Verifizierung fehlgeschlagen');
        }
        
        const result = await response.json();
        
        if (!result.paid) {
            throw new Error('Zahlung nicht abgeschlossen');
        }
        
        // Store analysis token
        state.analysisToken = result.analysisToken;
        
        // Restore analysis data
        const analysisData = JSON.parse(sessionStorage.getItem('analysisData') || '{}');
        
        // Show invoice option
        if (result.invoiceUrl) {
            showToast('Rechnung verfügbar', 'success');
            localStorage.setItem('lastInvoiceUrl', result.invoiceUrl);
        }
        
        // Start analysis
        showToast('Zahlung erfolgreich! Analyse wird gestartet...', 'success');
        
        // Restore state and perform analysis
        state.selectedPlan = analysisData.plan;
        state.vehicleType = analysisData.vehicleType;
        
        performAnalysis();
        
    } catch (error) {
        console.error('Payment verification error:', error);
        showToast('Fehler bei der Zahlungsverifizierung', 'error');
        showScreen('uploadScreen');
    }
}

// Enhanced analysis with token
async function performAnalysis() {
    showScreen('analysisScreen');
    
    // Start progress animation
    startAnalysisAnimation();
    
    const formData = new FormData();
    
    // Add files
    state.selectedFiles.forEach(file => {
        formData.append('photos', file);
    });
    
    // Add URL
    const urlInput = document.getElementById('urlInput');
    if (urlInput.value) {
        formData.append('url', urlInput.value);
    }
    
    // Add analysis parameters
    formData.append('plan', state.selectedPlan);
    formData.append('vehicleType', state.vehicleType);
    formData.append('analysisToken', state.analysisToken);
    
    try {
        const response = await fetch(`${config.apiBaseUrl}/analyze`, {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${state.analysisToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('Analyse fehlgeschlagen');
        }
        
        const result = await response.json();
        state.analysisResult = result;
        
        // Enhance result with animations
        prepareResultAnimations(result);
        
        showResults(result);
        
    } catch (error) {
        console.error('Analysis error:', error);
        showToast('Fehler bei der Analyse', 'error');
        showScreen('uploadScreen');
    }
}

// Enhanced analysis animation
function startAnalysisAnimation() {
    const steps = [
        { id: 'step1', title: 'Bilder werden analysiert...', subtitle: 'KI erkennt Fahrzeugdetails' },
        { id: 'step2', title: 'Datenbank wird durchsucht...', subtitle: 'Vergleich mit Millionen von Fahrzeugen' },
        { id: 'step3', title: 'Bericht wird erstellt...', subtitle: 'Personalisierte Empfehlungen werden generiert' }
    ];
    
    let currentStep = 0;
    
    const animateStep = () => {
        if (currentStep < steps.length) {
            // Update steps
            document.querySelectorAll('.step').forEach((step, index) => {
                step.classList.remove('active', 'completed');
                if (index < currentStep) {
                    step.classList.add('completed');
                } else if (index === currentStep) {
                    step.classList.add('active');
                }
            });
            
            // Update text with typewriter effect
            const step = steps[currentStep];
            typewriterEffect('progressTitle', step.title);
            typewriterEffect('progressSubtitle', step.subtitle);
            
            currentStep++;
            setTimeout(animateStep, 2500);
        }
    };
    
    animateStep();
}

// Typewriter effect
function typewriterEffect(elementId, text) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.textContent = '';
    let index = 0;
    
    const type = () => {
        if (index < text.length) {
            element.textContent += text.charAt(index);
            index++;
            setTimeout(type, 30);
        }
    };
    
    type();
}

// Prepare result animations
function prepareResultAnimations(result) {
    // Add animation delays
    if (result.comparison) {
        result.comparison.forEach((car, index) => {
            car.animationDelay = index * 0.1;
        });
    }
    
    if (result.technical) {
        result.technical.forEach((item, index) => {
            item.animationDelay = index * 0.15;
        });
    }
}

// Enhanced results display
function showResults(result) {
    showScreen('resultsScreen');
    
    const content = document.getElementById('resultsContent');
    
    // Generate content based on plan
    const html = state.selectedPlan === 'premium' 
        ? generatePremiumResults(result) 
        : generateBasicResults(result);
    
    content.innerHTML = html;
    
    // Initialize interactive elements
    setTimeout(() => {
        if (state.selectedPlan === 'premium') {
            initializePremiumFeatures(result);
        }
        initializeResultAnimations();
    }, 100);
}

// Initialize premium features
function initializePremiumFeatures(result) {
    // Initialize charts with animations
    if (result.charts) {
        initializeCharts(result.charts);
    }
    
    // Animate statistics
    if (result.stats) {
        animateStats(result.stats);
    }
    
    // Progress bars
    animateProgressBars();
    
    // Interactive comparison table
    initializeComparisonTable();
    
    // Chat feature
    if (result.chatEnabled) {
        initializeChatFeature();
    }
}

// Interactive comparison table
function initializeComparisonTable() {
    const rows = document.querySelectorAll('.comparison-table tbody tr');
    
    rows.forEach((row, index) => {
        row.style.animationDelay = `${index * 0.1}s`;
        row.classList.add('fade-in-up');
        
        // Hover effect
        row.addEventListener('mouseenter', () => {
            row.style.transform = 'scale(1.02)';
            row.style.boxShadow = '0 4px 20px rgba(0, 102, 255, 0.2)';
        });
        
        row.addEventListener('mouseleave', () => {
            row.style.transform = 'scale(1)';
            row.style.boxShadow = 'none';
        });
    });
}

// Initialize chat feature
function initializeChatFeature() {
    const chatButton = document.getElementById('chatButton');
    if (!chatButton) return;
    
    chatButton.addEventListener('click', () => {
        openChatModal();
    });
}

function openChatModal() {
    const modal = `
        <div class="chat-modal glass-morphism">
            <div class="chat-header">
                <h3>KI-Berater</h3>
                <span class="chat-credits">10 Fragen verfügbar</span>
            </div>
            <div class="chat-messages" id="chatMessages">
                <div class="chat-message bot">
                    <p>Hallo! Ich bin Ihr persönlicher KI-Berater. Stellen Sie mir Fragen zu Ihrer Fahrzeuganalyse.</p>
                </div>
            </div>
            <div class="chat-input-container">
                <input type="text" id="chatInput" placeholder="Ihre Frage..." class="chat-input">
                <button onclick="sendChatMessage()" class="chat-send">
                    <i class="fas fa-paper-plane"></i>
                </button>
            </div>
        </div>
    `;
    
    showModalContent(modal);
    
    // Focus input
    setTimeout(() => {
        document.getElementById('chatInput').focus();
    }, 100);
}

// Download enhanced report
async function downloadReport() {
    if (!state.analysisResult) {
        showToast('Keine Analyse verfügbar', 'error');
        return;
    }
    
    try {
        showToast('Premium-Bericht wird erstellt...', 'info');
        
        const response = await fetch(`${config.apiBaseUrl}/generate-report`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.analysisToken}`
            },
            body: JSON.stringify({
                analysisId: state.analysisResult.id,
                plan: state.selectedPlan,
                includeCharts: true,
                format: 'pdf'
            })
        });
        
        if (!response.ok) {
            throw new Error('Berichterstellung fehlgeschlagen');
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `AutoPruefer_Premium_Bericht_${new Date().toISOString().split('T')[0]}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showToast('Premium-Bericht heruntergeladen', 'success');
        
        // Track download
        trackEvent('report_downloaded', { plan: state.selectedPlan });
        
    } catch (error) {
        console.error('Download error:', error);
        showToast('Fehler beim Erstellen des Berichts', 'error');
    }
}

// Analytics tracking
function trackEvent(eventName, parameters = {}) {
    if (state.cookieConsent.analytics && window.gtag) {
        gtag('event', eventName, parameters);
    }
}

// Enhanced toast notifications
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    
    // Remove existing classes
    toast.className = 'toast glass-morphism';
    
    // Add type class
    toast.classList.add(type);
    
    // Set content with icon
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        warning: 'fas fa-exclamation-triangle',
        info: 'fas fa-info-circle'
    };
    
    toast.innerHTML = `
        <i class="${icons[type] || icons.info}"></i>
        <span>${message}</span>
    `;
    
    // Show toast
    toast.classList.add('show');
    
    // Hide after duration
    clearTimeout(toast.hideTimeout);
    toast.hideTimeout = setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

// Utility functions
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return ['http:', 'https:'].includes(url.protocol);
    } catch (_) {
        return false;
    }
}

function generateStarRating(rating) {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            stars.push('<i class="fas fa-star"></i>');
        } else if (i - 0.5 <= rating) {
            stars.push('<i class="fas fa-star-half-alt"></i>');
        } else {
            stars.push('<i class="far fa-star"></i>');
        }
    }
    return stars.join('');
}

// Initialize tooltips
function initializeTooltips() {
    const tooltips = document.querySelectorAll('[data-tooltip]');
    
    tooltips.forEach(element => {
        element.addEventListener('mouseenter', showTooltip);
        element.addEventListener('mouseleave', hideTooltip);
    });
}

function showTooltip(event) {
    const text = event.target.dataset.tooltip;
    const tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.textContent = text;
    
    document.body.appendChild(tooltip);
    
    const rect = event.target.getBoundingClientRect();
    tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
    tooltip.style.top = rect.top - tooltip.offsetHeight - 10 + 'px';
    
    setTimeout(() => tooltip.classList.add('show'), 10);
}

function hideTooltip() {
    const tooltips = document.querySelectorAll('.tooltip');
    tooltips.forEach(tooltip => tooltip.remove());
}

// Theme management
function applyTheme() {
    const theme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    showToast(`Theme: ${newTheme === 'dark' ? 'Dunkel' : 'Hell'}`, 'info');
}

// Initialize result animations
function initializeResultAnimations() {
    // Animate verdict icon
    const verdictIcon = document.querySelector('.verdict-icon');
    if (verdictIcon) {
        verdictIcon.classList.add('animate-bounce-in');
    }
    
    // Stagger animations for result cards
    const cards = document.querySelectorAll('.result-card');
    cards.forEach((card, index) => {
        card.style.animationDelay = `${index * 0.1}s`;
        card.classList.add('animate-fade-in-up');
    });
    
    // Animate progress bars
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

// Smooth scroll setup
function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({ 
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Export functions for global access
window.selectPlan = selectPlan;
window.removeFile = removeFile;
window.showScreen = showScreen;
window.resetApp = resetApp;
window.downloadReport = downloadReport;
window.shareResults = shareResults;
window.openModal = openModal;
window.closeModal = closeModal;
window.acceptAllCookies = acceptAllCookies;
window.saveSelectedCookies = saveSelectedCookies;
window.selectVehicleTypeAndContinue = selectVehicleTypeAndContinue;
window.showToast = showToast;