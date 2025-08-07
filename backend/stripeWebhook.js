import express from 'express';
import Stripe from 'stripe';
import { analyzeFromSession } from './analyze.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });

router.post('/', async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error(`⚠️  Webhook-Verifizierung fehlgeschlagen: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      // Analyse asynchron starten
      analyzeFromSession(session).catch((e) => console.error('Analyse-Fehler:', e));
    }
    res.json({ received: true });
  } catch (e) {
    console.error('Webhook-Handler-Fehler:', e);
    res.status(500).json({ error: 'Interner Fehler' });
  }
});

export default router;