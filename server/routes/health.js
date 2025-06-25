// routes/health.js - Health Check Routes

const os = require('os');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function routes(fastify, options) {
    // Basic health check
    fastify.get('/health', async (request, reply) => {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || '2.0.0'
        };
    });
    
    // Detailed health check
    fastify.get('/health/detailed', async (request, reply) => {
        const health = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: process.env.npm_package_version || '2.0.0',
            node: {
                version: process.version,
                memory: process.memoryUsage(),
                pid: process.pid
            },
            system: {
                loadavg: os.loadavg(),
                freemem: os.freemem(),
                totalmem: os.totalmem(),
                cpus: os.cpus().length,
                platform: os.platform(),
                hostname: os.hostname()
            },
            services: {
                database: 'ok', // Placeholder
                openai: 'unknown',
                stripe: 'unknown',
                storage: 'ok'
            }
        };
        
        // Check external services
        const serviceChecks = await checkExternalServices();
        health.services = { ...health.services, ...serviceChecks };
        
        // Determine overall health
        const hasIssues = Object.values(health.services).some(status => status !== 'ok');
        if (hasIssues) {
            health.status = 'degraded';
            reply.code(503);
        }
        
        return health;
    });
    
    // Liveness probe (for k8s)
    fastify.get('/health/live', async (request, reply) => {
        return {
            status: 'alive',
            timestamp: new Date().toISOString()
        };
    });
    
    // Readiness probe (for k8s)
    fastify.get('/health/ready', async (request, reply) => {
        try {
            // Check if essential services are available
            const checks = await Promise.all([
                checkOpenAI(),
                checkStripe()
            ]);
            
            const isReady = checks.every(check => check);
            
            if (!isReady) {
                return reply.code(503).send({
                    status: 'not_ready',
                    timestamp: new Date().toISOString()
                });
            }
            
            return {
                status: 'ready',
                timestamp: new Date().toISOString()
            };
            
        } catch (error) {
            return reply.code(503).send({
                status: 'error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });
    
    // Metrics endpoint
    fastify.get('/metrics', async (request, reply) => {
        const metrics = {
            timestamp: new Date().toISOString(),
            process: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage()
            },
            nodejs: {
                version: process.version,
                versions: process.versions
            },
            requests: {
                total: fastify.requestCounter || 0,
                active: fastify.activeRequests || 0,
                errors: fastify.errorCounter || 0
            },
            analysis: {
                total: fastify.analysisCounter || 0,
                basic: fastify.basicAnalysisCounter || 0,
                premium: fastify.premiumAnalysisCounter || 0,
                failed: fastify.failedAnalysisCounter || 0
            },
            payments: {
                total: fastify.paymentCounter || 0,
                successful: fastify.successfulPaymentCounter || 0,
                failed: fastify.failedPaymentCounter || 0
            }
        };
        
        // Format as Prometheus metrics if requested
        if (request.headers.accept === 'text/plain') {
            return formatPrometheusMetrics(metrics);
        }
        
        return metrics;
    });
}

// Check external services
async function checkExternalServices() {
    const results = {};
    
    // Check OpenAI
    try {
        const openaiStatus = await checkOpenAI();
        results.openai = openaiStatus ? 'ok' : 'error';
    } catch (error) {
        results.openai = 'error';
    }
    
    // Check Stripe
    try {
        const stripeStatus = await checkStripe();
        results.stripe = stripeStatus ? 'ok' : 'error';
    } catch (error) {
        results.stripe = 'error';
    }
    
    return results;
}

// Check OpenAI API
async function checkOpenAI() {
    if (!process.env.OPENAI_API_KEY) {
        return false;
    }
    
    try {
        // Make a minimal API call
        const OpenAI = require('openai');
        const openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        });
        
        const response = await openai.models.list();
        return response.data && response.data.length > 0;
    } catch (error) {
        console.error('OpenAI health check failed:', error.message);
        return false;
    }
}

// Check Stripe API
async function checkStripe() {
    if (!process.env.STRIPE_SECRET_KEY) {
        return false;
    }
    
    try {
        // Simple API call to check connectivity
        const response = await stripe.products.list({ limit: 1 });
        return true;
    } catch (error) {
        console.error('Stripe health check failed:', error.message);
        return false;
    }
}

// Format metrics for Prometheus
function formatPrometheusMetrics(metrics) {
    let output = '';
    
    // Process metrics
    output += `# HELP process_uptime_seconds Process uptime in seconds\n`;
    output += `# TYPE process_uptime_seconds gauge\n`;
    output += `process_uptime_seconds ${metrics.process.uptime}\n\n`;
    
    output += `# HELP process_memory_heap_used_bytes Process heap memory usage\n`;
    output += `# TYPE process_memory_heap_used_bytes gauge\n`;
    output += `process_memory_heap_used_bytes ${metrics.process.memory.heapUsed}\n\n`;
    
    // Request metrics
    output += `# HELP http_requests_total Total HTTP requests\n`;
    output += `# TYPE http_requests_total counter\n`;
    output += `http_requests_total ${metrics.requests.total}\n\n`;
    
    output += `# HELP http_requests_active Active HTTP requests\n`;
    output += `# TYPE http_requests_active gauge\n`;
    output += `http_requests_active ${metrics.requests.active}\n\n`;
    
    // Analysis metrics
    output += `# HELP analysis_total Total analyses performed\n`;
    output += `# TYPE analysis_total counter\n`;
    output += `analysis_total{type="all"} ${metrics.analysis.total}\n`;
    output += `analysis_total{type="basic"} ${metrics.analysis.basic}\n`;
    output += `analysis_total{type="premium"} ${metrics.analysis.premium}\n`;
    output += `analysis_total{type="failed"} ${metrics.analysis.failed}\n\n`;
    
    // Payment metrics
    output += `# HELP payments_total Total payment attempts\n`;
    output += `# TYPE payments_total counter\n`;
    output += `payments_total{status="all"} ${metrics.payments.total}\n`;
    output += `payments_total{status="successful"} ${metrics.payments.successful}\n`;
    output += `payments_total{status="failed"} ${metrics.payments.failed}\n`;
    
    return output;
}

module.exports = routes;