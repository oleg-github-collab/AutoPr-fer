// routes/payment.js - Enhanced Payment Routes with Dynamic Pricing

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

// Payment session storage (in production use Redis)
const paymentSessions = new Map();

async function routes(fastify, options) {
    // Dynamic pricing endpoint
    fastify.post('/calculate-price', async (request, reply) => {
        const { plan, promoCode, vehicleType } = request.body;
        
        // Base prices in cents
        let basePrice = {
            basic: 499,
            premium: 1699
        };
        
        // Vehicle type modifiers
        const vehicleModifiers = {
            'luxury': 1.2,      // BMW, Mercedes, Audi
            'standard': 1.0,    // VW, Ford, Opel
            'commercial': 1.5,  // Vans, trucks
            'classic': 1.3      // Oldtimers
        };
        
        // Calculate dynamic price
        let finalPrice = basePrice[plan];
        if (vehicleType && vehicleModifiers[vehicleType]) {
            finalPrice = Math.round(finalPrice * vehicleModifiers[vehicleType]);
        }
        
        // Apply promo codes
        let discount = 0;
        if (promoCode) {
            const validPromoCodes = {
                'FIRSTTIME': 0.2,      // 20% off
                'AUTOPRO10': 0.1,      // 10% off
                'PREMIUM50': 0.5,      // 50% off premium only
                'BLACKFRIDAY': 0.3     // 30% off
            };
            
            if (validPromoCodes[promoCode.toUpperCase()]) {
                if (promoCode === 'PREMIUM50' && plan !== 'premium') {
                    return reply.code(400).send({
                        error: true,
                        message: 'Dieser Code gilt nur für Premium-Analysen'
                    });
                }
                discount = validPromoCodes[promoCode.toUpperCase()];
            }
        }
        
        const discountAmount = Math.round(finalPrice * discount);
        finalPrice = finalPrice - discountAmount;
        
        // Store session data
        const sessionId = crypto.randomBytes(16).toString('hex');
        paymentSessions.set(sessionId, {
            plan,
            originalPrice: basePrice[plan],
            finalPrice,
            discount,
            discountAmount,
            vehicleType,
            promoCode,
            created: Date.now()
        });
        
        // Clean old sessions (older than 1 hour)
        for (const [key, value] of paymentSessions.entries()) {
            if (Date.now() - value.created > 3600000) {
                paymentSessions.delete(key);
            }
        }
        
        return {
            sessionId,
            originalPrice: basePrice[plan],
            finalPrice,
            discount: discount * 100 + '%',
            discountAmount,
            savings: discountAmount > 0
        };
    });
    
    // Create checkout session with dynamic pricing
    fastify.post('/create-checkout', async (request, reply) => {
        const { sessionId, customerEmail, metadata = {} } = request.body;
        
        // Retrieve session data
        const sessionData = paymentSessions.get(sessionId);
        if (!sessionData) {
            return reply.code(400).send({
                error: true,
                message: 'Sitzung abgelaufen. Bitte aktualisieren Sie die Seite.'
            });
        }
        
        const { plan, finalPrice, originalPrice, discount, vehicleType, promoCode } = sessionData;
        
        const planNames = {
            basic: 'Basis-Check',
            premium: 'Premium-Analyse'
        };
        
        try {
            // Create Stripe checkout session
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card', 'sepa_debit', 'sofort', 'giropay', 'ideal', 'bancontact'],
                line_items: [{
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: planNames[plan],
                            description: `KI-gestützte Fahrzeuganalyse${vehicleType ? ' für ' + vehicleType : ''}`,
                            images: [`${process.env.BASE_URL}/logo-512.png`],
                            metadata: {
                                plan,
                                vehicleType: vehicleType || 'standard'
                            }
                        },
                        unit_amount: finalPrice,
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}&analysis_session=${sessionId}`,
                cancel_url: `${process.env.BASE_URL}/?canceled=true`,
                customer_email: customerEmail,
                metadata: {
                    plan,
                    sessionId,
                    vehicleType,
                    promoCode,
                    originalPrice,
                    finalPrice,
                    discount: discount.toString(),
                    ...metadata
                },
                payment_intent_data: {
                    metadata: {
                        plan,
                        sessionId
                    }
                },
                locale: 'de',
                billing_address_collection: 'required',
                shipping_address_collection: {
                    allowed_countries: ['DE', 'AT', 'CH', 'NL', 'BE', 'LU', 'FR']
                },
                submit_type: 'pay',
                phone_number_collection: {
                    enabled: true
                },
                invoice_creation: {
                    enabled: true,
                    invoice_data: {
                        description: `AutoPrüfer Pro ${planNames[plan]}`,
                        metadata: {
                            service: 'vehicle_analysis',
                            plan,
                            vehicleType
                        },
                        custom_fields: [{
                            name: 'Fahrzeugtyp',
                            value: vehicleType || 'Standard'
                        }],
                        footer: 'Vielen Dank für Ihr Vertrauen in AutoPrüfer Pro!'
                    }
                },
                // Enable tax collection
                automatic_tax: {
                    enabled: true
                },
                // Customization
                custom_text: {
                    submit: {
                        message: 'Ihre Analyse wird sofort nach Zahlungseingang durchgeführt.'
                    }
                }
            });
            
            // Update session with Stripe session ID
            sessionData.stripeSessionId = session.id;
            paymentSessions.set(sessionId, sessionData);
            
            fastify.log.info({
                stripeSessionId: session.id,
                analysisSessionId: sessionId,
                plan,
                amount: finalPrice,
                discount: discount * 100 + '%'
            }, 'Checkout session created');
            
            return {
                id: session.id,
                url: session.url
            };
            
        } catch (error) {
            fastify.log.error(error, 'Stripe checkout error');
            return reply.code(500).send({
                error: true,
                message: 'Fehler beim Erstellen der Zahlungssitzung',
                details: process.env.NODE_ENV === 'development' ? error.message : undefined
            });
        }
    });
    
    // Stripe webhook for payment confirmation
    fastify.post('/webhook/stripe', {
        config: {
            rawBody: true
        }
    }, async (request, reply) => {
        const sig = request.headers['stripe-signature'];
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
        
        let event;
        
        try {
            event = stripe.webhooks.constructEvent(
                request.rawBody,
                sig,
                webhookSecret
            );
        } catch (err) {
            fastify.log.error(err, 'Webhook signature verification failed');
            return reply.code(400).send({
                error: true,
                message: 'Webhook signature verification failed'
            });
        }
        
        // Handle events
        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object;
                await handleSuccessfulPayment(session, fastify);
                break;
                
            case 'checkout.session.expired':
                const expiredSession = event.data.object;
                await handleExpiredSession(expiredSession, fastify);
                break;
                
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                fastify.log.info({ paymentIntentId: paymentIntent.id }, 'Payment succeeded');
                break;
                
            case 'payment_intent.payment_failed':
                const failedPayment = event.data.object;
                await handleFailedPayment(failedPayment, fastify);
                break;
                
            case 'invoice.payment_succeeded':
                const invoice = event.data.object;
                fastify.log.info({ invoiceId: invoice.id }, 'Invoice paid');
                break;
                
            default:
                fastify.log.info(`Unhandled event type ${event.type}`);
        }
        
        return { received: true };
    });
    
    // Verify payment and get analysis token
    fastify.get('/payment/verify/:sessionId', async (request, reply) => {
        const { sessionId } = request.params;
        
        try {
            const session = await stripe.checkout.sessions.retrieve(sessionId, {
                expand: ['payment_intent', 'customer', 'invoice']
            });
            
            if (session.payment_status !== 'paid') {
                return reply.code(402).send({
                    error: true,
                    message: 'Zahlung noch nicht abgeschlossen',
                    status: session.payment_status
                });
            }
            
            // Generate analysis token
            const analysisToken = crypto.randomBytes(32).toString('hex');
            const analysisData = {
                token: analysisToken,
                plan: session.metadata.plan,
                vehicleType: session.metadata.vehicleType,
                created: Date.now(),
                expiresAt: Date.now() + 86400000, // 24 hours
                customerEmail: session.customer_details?.email,
                invoiceUrl: session.invoice?.hosted_invoice_url
            };
            
            // Store analysis token (in production use Redis with TTL)
            paymentSessions.set(`analysis:${analysisToken}`, analysisData);
            
            return {
                paid: true,
                analysisToken,
                plan: session.metadata.plan,
                amount: session.amount_total,
                currency: session.currency,
                customerEmail: session.customer_details?.email,
                customerName: session.customer_details?.name,
                invoiceUrl: session.invoice?.hosted_invoice_url,
                invoicePdf: session.invoice?.pdf
            };
            
        } catch (error) {
            fastify.log.error(error, 'Session verification error');
            return reply.code(404).send({
                error: true,
                message: 'Zahlungssitzung nicht gefunden'
            });
        }
    });
    
    // Validate analysis token
    fastify.post('/validate-analysis-token', async (request, reply) => {
        const { token } = request.body;
        
        const analysisData = paymentSessions.get(`analysis:${token}`);
        
        if (!analysisData) {
            return reply.code(401).send({
                error: true,
                message: 'Ungültiger oder abgelaufener Token'
            });
        }
        
        if (Date.now() > analysisData.expiresAt) {
            paymentSessions.delete(`analysis:${token}`);
            return reply.code(401).send({
                error: true,
                message: 'Token abgelaufen'
            });
        }
        
        return {
            valid: true,
            plan: analysisData.plan,
            vehicleType: analysisData.vehicleType,
            remainingTime: analysisData.expiresAt - Date.now()
        };
    });
    
    // Get available payment methods for country
    fastify.get('/payment-methods/:country', async (request, reply) => {
        const { country } = request.params;
        
        const paymentMethods = {
            'DE': ['card', 'sepa_debit', 'sofort', 'giropay'],
            'AT': ['card', 'sepa_debit', 'sofort'],
            'CH': ['card', 'sepa_debit'],
            'NL': ['card', 'sepa_debit', 'ideal'],
            'BE': ['card', 'sepa_debit', 'bancontact'],
            'FR': ['card', 'sepa_debit'],
            'default': ['card']
        };
        
        return {
            country,
            methods: paymentMethods[country] || paymentMethods.default,
            preferred: country === 'DE' ? 'sepa_debit' : 'card'
        };
    });
}

// Enhanced payment success handler
async function handleSuccessfulPayment(session, fastify) {
    fastify.log.info({
        sessionId: session.id,
        amount: session.amount_total,
        currency: session.currency,
        customerEmail: session.customer_details?.email,
        plan: session.metadata.plan,
        discount: session.metadata.discount
    }, 'Payment successful');
    
    // Send confirmation email
    if (session.customer_details?.email) {
        await sendPaymentConfirmation(
            session.customer_details.email,
            session.metadata.plan,
            {
                amount: session.amount_total / 100,
                currency: session.currency.toUpperCase(),
                invoiceUrl: session.invoice?.hosted_invoice_url,
                customerName: session.customer_details.name
            }
        );
    }
    
    // Track metrics
    fastify.paymentCounter = (fastify.paymentCounter || 0) + 1;
    fastify.successfulPaymentCounter = (fastify.successfulPaymentCounter || 0) + 1;
    
    // Store payment record (implement database storage)
    await storePaymentRecord(session);
}

// Handle expired checkout sessions
async function handleExpiredSession(session, fastify) {
    fastify.log.warn({
        sessionId: session.id,
        plan: session.metadata.plan
    }, 'Checkout session expired');
    
    // Clean up session data
    if (session.metadata.sessionId) {
        paymentSessions.delete(session.metadata.sessionId);
    }
}

// Enhanced failed payment handler
async function handleFailedPayment(paymentIntent, fastify) {
    fastify.log.warn({
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        error: paymentIntent.last_payment_error,
        declineCode: paymentIntent.last_payment_error?.decline_code
    }, 'Payment failed');
    
    fastify.failedPaymentCounter = (fastify.failedPaymentCounter || 0) + 1;
    
    // Send notification for high-value failed payments
    if (paymentIntent.amount > 1000) { // Over 10€
        await notifyFailedHighValuePayment(paymentIntent);
    }
}

// Enhanced email confirmation
async function sendPaymentConfirmation(email, plan, details) {
    // In production, integrate with email service like SendGrid
    const emailContent = {
        to: email,
        subject: 'Ihre AutoPrüfer Pro Analyse ist bereit!',
        template: 'payment_confirmation',
        data: {
            customerName: details.customerName || 'Kunde',
            plan: plan === 'premium' ? 'Premium-Analyse' : 'Basis-Check',
            amount: `${details.amount} ${details.currency}`,
            invoiceUrl: details.invoiceUrl,
            analysisLink: `${process.env.BASE_URL}/analysis`,
            supportEmail: 'support@autoprufer-pro.de'
        }
    };
    
    console.log('Would send email:', emailContent);
    // await emailService.send(emailContent);
}

// Store payment record (implement with your database)
async function storePaymentRecord(session) {
    const record = {
        stripeSessionId: session.id,
        paymentIntentId: session.payment_intent,
        amount: session.amount_total,
        currency: session.currency,
        plan: session.metadata.plan,
        vehicleType: session.metadata.vehicleType,
        discount: parseFloat(session.metadata.discount || 0),
        customerEmail: session.customer_details?.email,
        customerName: session.customer_details?.name,
        invoiceId: session.invoice,
        created: new Date()
    };
    
    // await db.payments.insert(record);
    console.log('Would store payment record:', record);
}

// Notify about high-value failed payments
async function notifyFailedHighValuePayment(paymentIntent) {
    console.log('High-value payment failed:', {
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        error: paymentIntent.last_payment_error?.message
    });
    // Implement Slack/Discord notification
}

module.exports = routes;