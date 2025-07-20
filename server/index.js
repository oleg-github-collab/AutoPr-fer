// server/index.js - AutoPrüfer Pro Server

require('dotenv').config();
const fastify = require('fastify')({ 
    logger: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
    }
});

// Plugins
const cors = require('@fastify/cors');
const multipart = require('@fastify/multipart');
const staticFiles = require('@fastify/static');
const path = require('path');

// Routes
const analysisRoutes = require('./routes/analysis');
const paymentRoutes = require('./routes/payment');
const healthRoutes = require('./routes/health');

// Register plugins
async function registerPlugins() {
    await fastify.register(cors, {
        origin: true,
        credentials: true
    });

    await fastify.register(multipart, {
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB
            files: 10
        }
    });

    await fastify.register(staticFiles, {
        root: path.join(__dirname, '..', 'public'),
        prefix: '/'
    });

    // Serve frontend configuration
    fastify.get('/config.js', async (request, reply) => {
        const publishable = process.env.STRIPE_PUBLISHABLE_KEY || '';
        reply.type('application/javascript')
            .send(`window.STRIPE_PUBLISHABLE_KEY = '${publishable}';`);
    });
}

// Register routes
async function registerRoutes() {
    await fastify.register(analysisRoutes, { prefix: '/api' });
    await fastify.register(paymentRoutes, { prefix: '/api' });
    await fastify.register(healthRoutes, { prefix: '/api' });
}

// Error handler
fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error(error);
    
    const statusCode = error.statusCode || 500;
    const message = statusCode === 500 
        ? 'Ein Fehler ist aufgetreten' 
        : error.message;
    
    reply.status(statusCode).send({
        error: true,
        message: message,
        statusCode: statusCode
    });
});

// Start server
const start = async () => {
    try {
        await registerPlugins();
        await registerRoutes();
        
        const port = process.env.PORT || 3000;
        const host = process.env.HOST || '0.0.0.0';
        
        await fastify.listen({ port, host });
        
        console.log(`
        🚗 AutoPrüfer Pro Server läuft!
        🌐 URL: http://localhost:${port}
        📊 Umgebung: ${process.env.NODE_ENV || 'development'}
        `);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
    fastify.log.info('SIGTERM empfangen, fahre Server herunter...');
    await fastify.close();
    process.exit(0);
});

start();