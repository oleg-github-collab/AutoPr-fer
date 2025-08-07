// Produktionsserver für Autoprüfer
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import bodyParser from 'body-parser';
import Stripe from 'stripe';

import { uploadsStore, resultsStore, cleanupScheduler } from '../utils/store.js';
import { analyzeFromSession } from './analyze.js';
import stripeWebhookRouter from './stripeWebhook.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Wichtig hinter Proxy (Railway/Render/Heroku/NGINX): erlaubt korrektes req.protocol aus x-forwarded-proto
app.set('trust proxy', 1);

// перед створенням Stripe
const stripeApiKey = (process.env.STRIPE_SECRET_KEY ?? '').trim();
if (!stripeApiKey) {
  console.error('Fehler: STRIPE_SECRET_KEY ist nicht gesetzt oder leer. Bitte Environment-Variable konfigurieren.');
  process.exit(1);
}
const stripe = new Stripe(stripeApiKey, { apiVersion: '2024-06-20' });

const PORT = process.env.PORT || 8080;
const RAW_PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL; // z.B. https://autopr-fer-production.up.railway.app
const TTL_MS = Number(process.env.TTL_MS || 3600000);

// Hilfsfunktionen für absolute URLs
function isAbsoluteUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'http:' || x.protocol === 'https:';
  } catch {
    return false;
  }
}

// Ermittelt die Basis-URL der App. Bevorzugt ENV, sonst aus Request-Headern.
// Fügt automatisch https:// hinzu, falls jemand ENV ohne Schema eingetragen hat.
function getBaseUrl(req) {
  let fromEnv = RAW_PUBLIC_BASE_URL?.trim();
  if (fromEnv) {
    if (!/^https?:\/\//i.test(fromEnv)) {
      fromEnv = 'https://' + fromEnv;
    }
    if (isAbsoluteUrl(fromEnv)) {
      return fromEnv.replace(/\/+$/, '');
    }
  }

  // Fallback über Header (funktioniert hinter Proxy dank app.set('trust proxy', 1))
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').toString().split(',')[0].trim();
  const base = `${proto}://${host}`;
  return base.replace(/\/+$/, '');
}

// .env Validierung
const missing = [];
if (!process.env.STRIPE_SECRET_KEY) missing.push('STRIPE_SECRET_KEY');
if (!process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
if (!process.env.STRIPE_PUBLISHABLE_KEY) missing.push('STRIPE_PUBLISHABLE_KEY');
if (!process.env.STRIPE_WEBHOOK_SECRET) missing.push('STRIPE_WEBHOOK_SECRET');

if (missing.length) {
  console.error('FEHLENDE .env Variablen:', missing.join(', '), '— bitte .env konfigurieren.');
}
if (!RAW_PUBLIC_BASE_URL) {
  console.warn('Hinweis: PUBLIC_BASE_URL ist nicht gesetzt. Es wird automatisch aus Request-Headern ermittelt.');
} else if (!/^https?:\/\//i.test(RAW_PUBLIC_BASE_URL)) {
  console.warn('Hinweis: PUBLIC_BASE_URL ohne Schema gefunden — es wird automatisch https:// vorangestellt.');
}

// CORS (falls nötig)
app.use(cors());

// RAW-Body NUR für Webhook (Stripe-Verifizierung benötigt den unveränderten Body)
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));

// JSON Parser für alle anderen Routen
app.use(express.json({ limit: '5mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Statische Auslieferung der Public-Assets
app.use(express.static(path.join(__dirname, '../public')));

// Speicher/Uploads-Verzeichnis (/tmp wird automatisch bereinigt)
const uploadDir = path.join('/tmp', 'autopruefer_uploads');
fs.mkdirSync(uploadDir, { recursive: true });

// Multer-Konfiguration für Foto-Upload
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const safeName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9_.-]/g, '_');
    cb(null, safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Nur Bilddateien erlaubt'));
    }
    cb(null, true);
  }
});

// Liefert Stripe Publishable Key an das Frontend
app.get('/api/config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY, locale: 'de' });
});

// Upload-Endpoint (optional, Foto)
app.post('/api/upload', upload.single('photo'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Kein Foto hochgeladen.' });

    const id = path.parse(req.file.filename).name; // Zeitstempel-Name ohne Ext
    const ext = path.extname(req.file.filename);
    const filePath = path.join(uploadDir, req.file.filename);
    const expiresAt = Date.now() + TTL_MS;

    uploadsStore.set(id, { filePath, ext }, TTL_MS);

    // Öffentliche URL, damit OpenAI Vision die Datei abrufen kann (immer absolut mit Schema)
    const baseUrl = getBaseUrl(req);
    const publicUrl = new URL(`/uploads/${id}`, baseUrl).toString();

    res.json({ uploadId: id, url: publicUrl, expiresAt });
  } catch (e) {
    console.error('Upload-Fehler:', e);
    res.status(500).json({ error: 'Upload fehlgeschlagen.' });
  }
});

// Öffentliche Auslieferung hochgeladener Bilder (Read-Only)
app.get('/uploads/:id', (req, res) => {
  const id = req.params.id;
  const entry = uploadsStore.get(id);
  if (!entry) return res.status(404).send('Nicht gefunden');
  const { filePath } = entry;
  if (!fs.existsSync(filePath)) return res.status(410).send('Datei abgelaufen');
  res.sendFile(filePath);
});

// Checkout-Session erstellen
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { plan, vehicleData, uploadId } = req.body || {};
    if (!plan || !vehicleData) {
      return res.status(400).json({ error: 'Plan oder Fahrzeugdaten fehlen.' });
    }

    const prices = {
      basic: 499,    // €4.99
      standard: 999, // €9.99
      premium: 2499  // €24.99
    };

    if (!prices[plan]) {
      return res.status(400).json({ error: 'Ungültiger Plan.' });
    }

    // Beschreibung kürzen für Stripe-Metadaten
    const safeDesc = (vehicleData.description || '').slice(0, 450);

    // Metadaten klein halten
    const metadata = {
      plan,
      brand: (vehicleData.brand || '').slice(0, 60),
      model: (vehicleData.model || '').slice(0, 60),
      year: String(vehicleData.year || ''),
      mileage: String(vehicleData.mileage || ''),
      price: String(vehicleData.price || ''),
      city: (vehicleData.city || '').slice(0, 60),
      vin: (vehicleData.vin || '').slice(0, 60),
      description: safeDesc,
      uploadId: uploadId || ''
    };

    // Erfolgs- und Abbruch-URLs immer als absolute URLs mit Schema bauen
    const baseUrl = getBaseUrl(req);
    const successUrl = new URL('/?success=true&session_id={CHECKOUT_SESSION_ID}', baseUrl).toString();
    const cancelUrl = new URL('/?canceled=true', baseUrl).toString();

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      locale: 'de',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Autoprüfer ${plan.charAt(0).toUpperCase() + plan.slice(1)}`,
              description: plan === 'basic' ? 'Schnellanalyse' : plan === 'standard' ? 'Detailanalyse' : 'Vollgutachten (PDF inklusive)'
            },
            unit_amount: prices[plan]
          },
          quantity: 1
        }
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata
    });

    // Für Stripe.js-Redirect im Frontend wird sessionId verwendet
    res.json({ sessionId: session.id });
  } catch (e) {
    console.error('Checkout-Fehler:', e);
    res.status(500).json({ error: 'Checkout fehlgeschlagen', details: e.message });
  }
});

// Ergebnis für eine Session abfragen (Polling vom Success-Screen)
app.get('/api/result', async (req, res) => {
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: 'session_id fehlt.' });

  const entry = resultsStore.get(sessionId);
  if (!entry) {
    return res.json({ status: 'pending' });
  }
  const { text, pdfPath, plan } = entry;

  // PDF-Link immer absolut mit Schema
  const baseUrl = getBaseUrl(req);
  const pdfUrl = pdfPath ? new URL(`/reports/${sessionId}`, baseUrl).toString() : null;

  res.json({ status: 'ready', plan, text, pdfUrl });
});

// Reports ausliefern
app.get('/reports/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const entry = resultsStore.get(sessionId);
  if (!entry || !entry.pdfPath) return res.status(404).send('Report nicht gefunden');
  if (!fs.existsSync(entry.pdfPath)) return res.status(410).send('Report abgelaufen');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Autopruefer-${sessionId}.pdf"`);
  fs.createReadStream(entry.pdfPath).pipe(res);
});

// Stripe Webhook mounten (muss vor JSON-Parser stehen -> oben raw gesetzt)
app.use('/api/stripe/webhook', stripeWebhookRouter);

// Fallback: index.html für alle Routen (SPA-Feeling)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Cleanup-Intervall starten
cleanupScheduler();

app.listen(PORT, () => {
  console.log(`Autoprüfer läuft auf Port ${PORT}`);
});