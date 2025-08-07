// backend/stripeWebhook.js
import 'dotenv/config';
import express from 'express';
import { getStripe } from './server.js';  // ВИПРАВЛЕНО!
import { analyzeFromSession } from './analyze.js';
import { resultsStore } from '../utils/store.js';

const router = express.Router();

// Webhook Secret prüfen
const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();
if (!webhookSecret) {
  console.error('Fehler: STRIPE_WEBHOOK_SECRET ist nicht gesetzt oder leer. Bitte Environment-Variable konfigurieren.');
}

router.post('/', async (req, res) => {
  try {
    // 1) Stripe lazy init bei Request-Time
    let stripe;
    try {
      stripe = getStripe(); // ВИКОРИСТОВУЄМО ФУНКЦІЮ З server.js
    } catch (e) {
      console.error('Webhook Stripe-Init Fehler:', e.message);
      return res.status(500).send('Stripe nicht initialisiert (fehlender STRIPE_SECRET_KEY).');
    }

    if (!webhookSecret) {
      return res.status(500).send('STRIPE_WEBHOOK_SECRET fehlt.');
    }

    const sig = req.headers['stripe-signature'];
    if (!sig) {
      return res.status(400).send('Missing stripe-signature header');
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error('Webhook-Signatur ungültig:', err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Nur relevante Events behandeln
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      try {
        await analyzeFromSession(session);
      } catch (e) {
        console.error('Analyse-Fehler für Session', session.id, e);
        resultsStore.set(session.id, { text: 'Analyse fehlgeschlagen. Bitte Support kontaktieren.', plan: session.metadata?.plan || 'unknown' }, 60 * 60 * 1000);
      }
    }

    // 200 OK — Stripe erwartet schnelle Antwort
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook-Handler Fehler:', e);
    res.status(500).send('Serverfehler im Webhook');
  }
});

export default router;