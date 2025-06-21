// routes/payment.js - Payment Routes

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function routes(fastify, options) {
    // Create checkout session
    fastify.post('/create-checkout', async (request, reply) => {
        const { plan } = request.body;
        
        // Validate plan
        if (!['basic', 'premium'].includes(plan)) {
            return reply.code(400).send({
                error: true,
                message: 'Ungültiger Tarif ausgewählt'
            });
        }
        
        const prices = {
            basic: {
                amount: 499, // 4.99€ in cents
                name: 'Basis-Check',
                description: 'Schnelle KI-Analyse für Ihr Fahrzeug'
            },
            premium: {
                amount: 1699, // 16.99€ in cents
                name: 'Premium-Analyse',
                description: 'Umfassende Analyse mit 40+ Parametern, Vergleichstabelle und Chat-Beratung'
            }
        };
        
        const selectedPrice = prices[plan];
        
        try {
            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card', 'sepa_debit', 'sofort', 'giropay'],
                line_items: [{
                    price_data: {
                        currency: 'eur',
                        product_data: {
                            name: selectedPrice.name,
                            description: selectedPrice.description,
                            metadata: {
                                plan: plan
                            }
                        },
                        unit_amount: selectedPrice.amount,
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                success_url: `${process.env.BASE_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
                cancel_url: `${process.env.BASE_URL}/`,
                metadata: {
                    plan: plan,
                    timestamp: new Date().toISOString()
                },
                // German-specific settings
                locale: 'de',
                billing_address_collection: 'required',
                customer_creation: 'if_required',
                invoice_creation: {
                    enabled: true,
                    invoice_data: {
                        description: `AutoPrüfer Pro ${selectedPrice.name}`,
                        metadata: {
                            service: 'vehicle_analysis'
                        }
                    }
                }
            });
            
            fastify.log.info({
                sessionId: session.id,
                plan: plan,
                amount: selectedPrice.amount
            }, 'Checkout session created');
            
            return {
                id: session.id,
                url: session.url
            };
            
        } catch (error) {
            fastify.log.error(error, 'Stripe checkout error');
            return reply.code(500).send({
                error: true,
                message: 'Fehler beim Erstellen der Zahlungssitzung'
            });
        }
    });
    
    // Stripe webhook
    fastify.post('/webhook/stripe', {
        config: {
            rawBody: true // Need raw body for signature verification
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
        
        // Handle the event
        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object;
                await handleSuccessfulPayment(session, fastify);
                break;
                
            case 'payment_intent.payment_failed':
                const paymentIntent = event.data.object;
                await handleFailedPayment(paymentIntent, fastify);
                break;
                
            default:
                fastify.log.info(`Unhandled event type ${event.type}`);
        }
        
        return { received: true };
    });
    
    // Verify payment status
    fastify.get('/payment/verify/:sessionId', async (request, reply) => {
        const { sessionId } = request.params;
        
        try {
            const session = await stripe.checkout.sessions.retrieve(sessionId);
            
            return {
                paid: session.payment_status === 'paid',
                plan: session.metadata.plan,
                amount: session.amount_total,
                customerEmail: session.customer_details?.email
            };
            
        } catch (error) {
            fastify.log.error(error, 'Session verification error');
            return reply.code(404).send({
                error: true,
                message: 'Zahlungssitzung nicht gefunden'
            });
        }
    });
    
    // Get invoice
    fastify.get('/invoice/:sessionId', async (request, reply) => {
        const { sessionId } = request.params;
        
        try {
            const session = await stripe.checkout.sessions.retrieve(sessionId, {
                expand: ['invoice']
            });
            
            if (!session.invoice) {
                return reply.code(404).send({
                    error: true,
                    message: 'Rechnung nicht verfügbar'
                });
            }
            
            const invoice = session.invoice;
            
            return {
                invoiceNumber: invoice.number,
                pdf: invoice.invoice_pdf,
                hostedUrl: invoice.hosted_invoice_url,
                amount: invoice.amount_paid,
                currency: invoice.currency,
                created: invoice.created
            };
            
        } catch (error) {
            fastify.log.error(error, 'Invoice retrieval error');
            return reply.code(500).send({
                error: true,
                message: 'Fehler beim Abrufen der Rechnung'
            });
        }
    });
}

// Handle successful payment
async function handleSuccessfulPayment(session, fastify) {
    fastify.log.info({
        sessionId: session.id,
        amount: session.amount_total,
        customerEmail: session.customer_details?.email,
        plan: session.metadata.plan
    }, 'Payment successful');
    
    // Here you would:
    // 1. Store payment record in database
    // 2. Send confirmation email
    // 3. Enable analysis for this session
    
    // For now, just log
    if (session.customer_details?.email) {
        // Send confirmation email
        await sendPaymentConfirmation(session.customer_details.email, session.metadata.plan);
    }
}

// Handle failed payment
async function handleFailedPayment(paymentIntent, fastify) {
    fastify.log.warn({
        paymentIntentId: paymentIntent.id,
        amount: paymentIntent.amount,
        error: paymentIntent.last_payment_error
    }, 'Payment failed');
    
    // Here you would:
    // 1. Log failed payment attempt
    // 2. Send notification to customer if email available
}

// Send payment confirmation (placeholder)
async function sendPaymentConfirmation(email, plan) {
    // In production, integrate with email service
    console.log(`Would send confirmation email to ${email} for ${plan} plan`);
}

module.exports = routes;