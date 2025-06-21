// routes/analysis.js - Analysis Route

const openaiService = require('../services/openai');
const scraperService = require('../services/scraper');
const imageProcessor = require('../services/imageProcessor');
const { validateAnalysisRequest } = require('../utils/validator');

async function routes(fastify, options) {
    // Main analysis endpoint
    fastify.post('/analyze', {
        preHandler: async (request, reply) => {
            // Validate request
            const validation = await validateAnalysisRequest(request);
            if (!validation.valid) {
                return reply.code(400).send({
                    error: true,
                    message: validation.message
                });
            }
        }
    }, async (request, reply) => {
        try {
            const parts = request.parts();
            const photos = [];
            let url = null;
            let plan = 'basic';
            
            // Parse multipart data
            for await (const part of parts) {
                if (part.type === 'file' && part.fieldname === 'photos') {
                    const processedImage = await imageProcessor.processImage(part);
                    photos.push(processedImage);
                } else if (part.fieldname === 'url') {
                    url = part.value;
                } else if (part.fieldname === 'plan') {
                    plan = part.value;
                }
            }
            
            // Prepare analysis data
            const analysisData = {
                photos,
                url,
                plan,
                listingText: ''
            };
            
            // Scrape listing if URL provided
            if (url) {
                analysisData.listingText = await scraperService.scrapeListing(url);
            }
            
            // Perform AI analysis
            const analysis = await openaiService.analyzeVehicle(analysisData);
            
            // For premium plan, add competitor comparison
            if (plan === 'premium') {
                analysis.comparison = await generateComparison(analysisData);
            }
            
            // Log successful analysis
            fastify.log.info({
                plan,
                photosCount: photos.length,
                hasUrl: !!url,
                verdict: analysis.verdict
            }, 'Analysis completed');
            
            return {
                success: true,
                ...analysis
            };
            
        } catch (error) {
            fastify.log.error(error, 'Analysis failed');
            throw error;
        }
    });
    
    // Get analysis status (for polling)
    fastify.get('/analysis/:id', async (request, reply) => {
        const { id } = request.params;
        
        // In production, this would check a database or cache
        // For now, return mock status
        return {
            id,
            status: 'completed',
            progress: 100
        };
    });
}

// Generate competitor comparison for premium plan
async function generateComparison(analysisData) {
    // Extract vehicle info from listing or use AI to identify
    const vehicleInfo = await openaiService.extractVehicleInfo(analysisData);
    
    // Get competitor models
    const competitors = getCompetitorModels(vehicleInfo);
    
    // Build comparison table
    const comparison = await Promise.all(competitors.map(async (competitor) => {
        const marketData = await getMarketData(competitor);
        
        return {
            model: competitor.name,
            price: formatPrice(marketData.avgPrice),
            consumption: `${marketData.consumption}L`,
            insurance: formatPrice(marketData.insurance),
            reliability: marketData.reliability,
            recommended: evaluateRecommendation(marketData, vehicleInfo)
        };
    }));
    
    // Add analyzed vehicle as first entry
    comparison.unshift({
        model: `${vehicleInfo.make} ${vehicleInfo.model} (Analysiert)`,
        price: formatPrice(vehicleInfo.price),
        consumption: `${vehicleInfo.consumption || '5.5'}L`,
        insurance: formatPrice(vehicleInfo.insurance || 1200),
        reliability: vehicleInfo.reliability || 4,
        recommended: true
    });
    
    return comparison;
}

// Get competitor models based on vehicle class
function getCompetitorModels(vehicleInfo) {
    const competitorMap = {
        'compact_premium': [
            { name: 'Mercedes C-Klasse', class: 'C' },
            { name: 'Audi A4', class: 'A4' },
            { name: 'VW Passat', class: 'Passat' }
        ],
        'suv_premium': [
            { name: 'Mercedes GLC', class: 'GLC' },
            { name: 'Audi Q5', class: 'Q5' },
            { name: 'VW Tiguan', class: 'Tiguan' }
        ],
        'compact': [
            { name: 'VW Golf', class: 'Golf' },
            { name: 'Ford Focus', class: 'Focus' },
            { name: 'Opel Astra', class: 'Astra' }
        ]
    };
    
    // Determine vehicle class
    const vehicleClass = determineVehicleClass(vehicleInfo);
    return competitorMap[vehicleClass] || competitorMap['compact'];
}

// Get market data for a vehicle
async function getMarketData(vehicle) {
    // In production, this would query real market data APIs
    // For now, return realistic mock data
    const mockData = {
        'Mercedes C-Klasse': {
            avgPrice: 26500,
            consumption: 5.2,
            insurance: 1350,
            reliability: 4,
            maintenance: 1800
        },
        'Audi A4': {
            avgPrice: 25800,
            consumption: 5.4,
            insurance: 1280,
            reliability: 3,
            maintenance: 1600
        },
        'VW Passat': {
            avgPrice: 22900,
            consumption: 5.1,
            insurance: 980,
            reliability: 4,
            maintenance: 1200
        }
    };
    
    return mockData[vehicle.name] || {
        avgPrice: 20000,
        consumption: 6.0,
        insurance: 1000,
        reliability: 3,
        maintenance: 1000
    };
}

// Determine vehicle class
function determineVehicleClass(vehicleInfo) {
    const { make, model, segment } = vehicleInfo;
    
    if (['BMW', 'Mercedes', 'Audi'].includes(make)) {
        if (['3er', 'C-Klasse', 'A4'].some(m => model.includes(m))) {
            return 'compact_premium';
        }
        if (['X3', 'GLC', 'Q5'].some(m => model.includes(m))) {
            return 'suv_premium';
        }
    }
    
    return 'compact';
}

// Evaluate recommendation
function evaluateRecommendation(marketData, vehicleInfo) {
    // Simple logic: recommend if good value
    const priceRatio = vehicleInfo.price / marketData.avgPrice;
    const reliabilityGood = marketData.reliability >= 4;
    const consumptionGood = marketData.consumption < 6;
    
    return priceRatio < 1.1 && (reliabilityGood || consumptionGood);
}

// Format price for display
function formatPrice(price) {
    return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(price).replace('€', '').trim() + '€';
}

module.exports = routes;