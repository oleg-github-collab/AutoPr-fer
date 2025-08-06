const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { analyzeVehicle } = require('./analyze');

async function createCheckoutSession(plan, vehicleData) {
  const prices = {
    basic: process.env.STRIPE_PRICE_BASIC,
    standard: process.env.STRIPE_PRICE_STANDARD,
    premium: process.env.STRIPE_PRICE_PREMIUM
  };

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price: prices[plan],
      quantity: 1,
    }],
    mode: 'payment',
    success_url: `${process.env.SERVER_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${process.env.SERVER_URL}/`,
    metadata: {
      plan: plan,
      vehicleData: JSON.stringify(vehicleData)
    },
    locale: 'de'
  });

  return session;
}

async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    try {
      const vehicleData = JSON.parse(session.metadata.vehicleData);
      const plan = session.metadata.plan;
      
      // Trigger analysis
      const result = await analyzeVehicle(vehicleData, plan, null);
      
      // Store result temporarily (in production, use Redis or similar)
      global.analysisResults = global.analysisResults || {};
      global.analysisResults[session.id] = result;
      
    } catch (error) {
      console.error('Error processing successful payment:', error);
    }
  }

  res.json({ received: true });
}

module.exports = { createCheckoutSession, handleStripeWebhook };