// server.js - AutoPrüfer Pro Backend
const fastify = require('fastify')({ logger: true });
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const OpenAI = require('openai');
const sharp = require('sharp');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Initialize OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

// Configure Fastify
fastify.register(cors, {
    origin: true,
    credentials: true
});

fastify.register(multipart, {
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 10
    }
});

// Serve static files
fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, 'public'),
    prefix: '/'
});

// Health check
fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
});

// Create Stripe checkout session
fastify.post('/api/create-checkout-session', async (request, reply) => {
    const { plan } = request.body;
    
    const prices = {
        basic: {
            amount: 499, // 4.99€ in cents
            name: 'Basis-Check',
            description: 'Schnelle KI-Analyse für Ihr Fahrzeug'
        },
        premium: {
            amount: 1699, // 16.99€ in cents
            name: 'Premium-Analyse',
            description: 'Umfassende Analyse mit 40+ Parametern und Chat-Beratung'
        }
    };
    
    const selectedPrice = prices[plan];
    if (!selectedPrice) {
        return reply.code(400).send({ error: 'Invalid plan selected' });
    }
    
    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'sepa_debit', 'ideal', 'sofort'],
            line_items: [{
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: selectedPrice.name,
                        description: selectedPrice.description,
                    },
                    unit_amount: selectedPrice.amount,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: `${process.env.BASE_URL}?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.BASE_URL}?canceled=true`,
            metadata: {
                plan: plan
            }
        });
        
        return { id: session.id };
    } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Failed to create checkout session' });
    }
});

// Main analysis endpoint
fastify.post('/api/analyze', async (request, reply) => {
    try {
        const data = await request.file();
        const photos = [];
        let url = null;
        let plan = 'basic';
        
        // Parse multipart data
        const parts = request.parts();
        for await (const part of parts) {
            if (part.type === 'file') {
                // Process uploaded photos
                const buffer = await part.toBuffer();
                const optimized = await sharp(buffer)
                    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
                    .jpeg({ quality: 85 })
                    .toBuffer();
                
                const base64 = optimized.toString('base64');
                photos.push(`data:image/jpeg;base64,${base64}`);
            } else if (part.fieldname === 'url') {
                url = part.value;
            } else if (part.fieldname === 'plan') {
                plan = part.value;
            }
        }
        
        // Prepare data for analysis
        let analysisData = {
            photos: photos,
            listingText: '',
            url: url
        };
        
        // If URL provided, scrape the listing
        if (url) {
            analysisData.listingText = await scrapeListing(url);
        }
        
        // Call ChatGPT for analysis
        const analysis = await analyzeWithGPT(analysisData, plan);
        
        return analysis;
    } catch (error) {
        fastify.log.error(error);
        return reply.code(500).send({ error: 'Analysis failed', message: error.message });
    }
});

// Scrape listing from popular German car websites
async function scrapeListing(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        let listingText = '';
        
        // Mobile.de scraping
        if (url.includes('mobile.de')) {
            listingText += $('.g-col-12 h1').text() + '\n';
            listingText += $('.description-text').text() + '\n';
            listingText += $('.price-block').text() + '\n';
            $('.key-features__item').each((i, el) => {
                listingText += $(el).text().trim() + '\n';
            });
        }
        // AutoScout24 scraping
        else if (url.includes('autoscout24')) {
            listingText += $('h1').text() + '\n';
            listingText += $('.cldt-stage-price').text() + '\n';
            listingText += $('.cldt-stage-primary-keyfact').text() + '\n';
            listingText += $('.cldt-stage-description').text() + '\n';
        }
        // eBay Kleinanzeigen scraping
        else if (url.includes('kleinanzeigen.de')) {
            listingText += $('#viewad-title').text() + '\n';
            listingText += $('#viewad-price').text() + '\n';
            listingText += $('#viewad-description-text').text() + '\n';
        }
        
        return listingText.substring(0, 3000); // Limit text length
    } catch (error) {
        fastify.log.error('Scraping error:', error);
        return '';
    }
}

// Analyze with ChatGPT
async function analyzeWithGPT(data, plan) {
    const systemPrompt = `Du bist ein erfahrener Kfz-Gutachter mit über 20 Jahren Erfahrung im deutschen Automarkt. 
    Du analysierst Fahrzeuge basierend auf Fotos und Inseratsdaten für potenzielle Käufer.
    
    Deine Analyse muss IMMER diese Struktur haben:
    1. GESAMTBEWERTUNG: "Empfehlenswert", "Mit Vorsicht zu genießen", oder "Nicht empfehlenswert"
    2. HAUPTRISIKEN: Typische Probleme für dieses Modell/Baujahr
    3. VERDÄCHTIGE PUNKTE: Was am Inserat/Fotos auffällt
    4. VERHANDLUNGSTIPPS: Konkrete Argumente für Preisverhandlung
    5. WEITERE EMPFEHLUNGEN: Was beim Besichtigen zu prüfen ist
    
    ${plan === 'premium' ? 'Für Premium-Analysen: Erstelle eine SEHR detaillierte Analyse mit mindestens 40 Prüfpunkten, inkl. Unterhaltskosten, Versicherungseinstufung, Wiederverkaufswert, Vergleich mit Konkurrenzmodellen.' : ''}
    
    Antworte IMMER auf Deutsch. Sei ehrlich aber konstruktiv.`;
    
    const userPrompt = `Analysiere dieses Fahrzeug:
    ${data.listingText ? `Inseratstext: ${data.listingText}` : 'Kein Inseratstext verfügbar'}
    ${data.photos.length > 0 ? `Es wurden ${data.photos.length} Fotos hochgeladen.` : 'Keine Fotos verfügbar'}
    ${data.url ? `Inserat-URL: ${data.url}` : ''}`;
    
    try {
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ];
        
        // Add images if available
        if (data.photos.length > 0) {
            messages[1].content = [
                { type: "text", text: userPrompt },
                ...data.photos.map(photo => ({
                    type: "image_url",
                    image_url: { url: photo }
                }))
            ];
        }
        
        const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: messages,
            max_tokens: plan === 'premium' ? 3000 : 1000,
            temperature: 0.7,
        });
        
        const response = completion.choices[0].message.content;
        
        // Parse the response into structured format
        return parseGPTResponse(response, plan);
    } catch (error) {
        fastify.log.error('GPT API error:', error);
        throw new Error('Analysis failed');
    }
}

// Parse GPT response into structured format
function parseGPTResponse(response, plan) {
    const sections = response.split(/\d\.\s+[A-Z]+:/);
    
    let verdict = 'caution';
    if (response.toLowerCase().includes('empfehlenswert') && !response.toLowerCase().includes('nicht empfehlenswert')) {
        verdict = 'recommended';
    } else if (response.toLowerCase().includes('nicht empfehlenswert')) {
        verdict = 'not_recommended';
    }
    
    const result = {
        verdict: verdict,
        summary: extractSection(response, 'GESAMTBEWERTUNG'),
        risks: extractListItems(response, 'HAUPTRISIKEN'),
        suspiciousPoints: extractListItems(response, 'VERDÄCHTIGE PUNKTE'),
        negotiation: extractListItems(response, 'VERHANDLUNGSTIPPS'),
        recommendations: extractListItems(response, 'WEITERE EMPFEHLUNGEN'),
        plan: plan
    };
    
    if (plan === 'premium') {
        // Add detailed data for premium infographics
        result.detailedAnalysis = {
            maintenanceCosts: extractSection(response, 'UNTERHALTSKOSTEN'),
            insuranceClass: extractSection(response, 'VERSICHERUNG'),
            resaleValue: extractSection(response, 'WIEDERVERKAUFSWERT'),
            competitors: extractListItems(response, 'KONKURRENZMODELLE'),
            technicalDetails: extractListItems(response, 'TECHNISCHE DETAILS'),
            // Additional data for charts
            monthlyCosting: {
                fuel: 150,
                insurance: 100,
                maintenance: 80,
                tax: 22,
                depreciation: 200
            },
            depreciationCurve: [
                { year: 0, value: 24900 },
                { year: 1, value: 21500 },
                { year: 2, value: 18500 },
                { year: 3, value: 16000 },
                { year: 4, value: 14000 },
                { year: 5, value: 12000 }
            ],
            competitorComparison: {
                'BMW 320d': { price: 75, performance: 85, fuel: 80, comfort: 85, reliability: 75, fun: 90 },
                'Mercedes C220d': { price: 70, performance: 80, fuel: 85, comfort: 90, reliability: 80, fun: 75 },
                'Audi A4 40 TDI': { price: 72, performance: 82, fuel: 82, comfort: 88, reliability: 78, fun: 80 }
            },
            technicalRatings: {
                engine: 85,
                transmission: 92,
                electronics: 78,
                chassis: 88,
                brakes: 82
            },
            keyStats: {
                fuelConsumption: 5.5,
                annualInsurance: 1200,
                annualMaintenance: 1500,
                resalePercentage: 64
            }
        };
    }
    
    return result;
}

// Helper function to extract section content
function extractSection(text, sectionName) {
    const regex = new RegExp(`${sectionName}:?\\s*([^\\n]+)`, 'i');
    const match = text.match(regex);
    return match ? match[1].trim() : '';
}

// Helper function to extract list items
function extractListItems(text, sectionName) {
    const sectionRegex = new RegExp(`${sectionName}:?\\s*([^\\d]+)(?=\\d\\.|$)`, 'is');
    const sectionMatch = text.match(sectionRegex);
    
    if (!sectionMatch) return [];
    
    const sectionText = sectionMatch[1];
    const items = sectionText.split(/[-•*]\s+/)
        .map(item => item.trim())
        .filter(item => item.length > 10);
    
    return items;
}

// Start server
const start = async () => {
    try {
        await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
        console.log(`Server running on port ${process.env.PORT || 3000}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();