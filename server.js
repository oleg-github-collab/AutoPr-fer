// server.js - Виправлений сервер з покращеною обробкою помилок
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const cron = require('node-cron');
const OpenAI = require('openai');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI Setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Global storage for results
const analysisResults = new Map();

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use('/temp', express.static('temp'));

// Special handling for Stripe webhooks - raw body needed
app.use('/api/stripe-webhook', express.raw({ type: 'application/json' }));

// JSON parsing for other routes
app.use(express.json());

// Multer setup für Bildupload
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    await fs.mkdir('temp', { recursive: true });
    cb(null, 'temp/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Nur Bilder sind erlaubt'));
    }
  }
});

// Import helper functions
const { analyzeVehicle } = require('./backend/analyze');
const { getPrompt } = require('./backend/prompts');

// ========== SIMPLIFIED STRIPE CHECKOUT ==========
app.post('/api/create-checkout', async (req, res) => {
  console.log('Creating checkout session...');
  console.log('Request body:', req.body);
  
  try {
    const { plan, vehicleData } = req.body;
    
    // Validate input
    if (!plan || !vehicleData) {
      return res.status(400).json({ 
        error: 'Missing required data',
        details: 'Plan and vehicle data are required'
      });
    }
    
    // Define prices in cents
    const prices = {
      basic: 499,      // 4.99 EUR
      standard: 999,   // 9.99 EUR
      premium: 2499    // 24.99 EUR
    };
    
    const planNames = {
      basic: 'Basic Analyse',
      standard: 'Standard Analyse',
      premium: 'Premium Analyse mit PDF'
    };
    
    if (!prices[plan]) {
      return res.status(400).json({ 
        error: 'Invalid plan',
        details: `Plan "${plan}" is not valid`
      });
    }
    
    // Create Stripe session with simplified configuration
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Autoprüfer ${planNames[plan]}`,
              description: `${vehicleData.brand} ${vehicleData.model} (${vehicleData.year})`,
              images: ['https://autopr-fer-production.up.railway.app/logo.png']
            },
            unit_amount: prices[plan],
          },
          quantity: 1,
        },
      ],
      success_url: `${process.env.SERVER_URL || 'https://autopr-fer-production.up.railway.app'}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.SERVER_URL || 'https://autopr-fer-production.up.railway.app'}/?canceled=true`,
      metadata: {
        plan: plan,
        vehicleData: JSON.stringify(vehicleData)
      },
      locale: 'de',
      customer_email: vehicleData.email || undefined,
    });
    
    console.log('Checkout session created:', session.id);
    
    // Return the session ID
    res.json({ 
      sessionId: session.id,
      url: session.url 
    });
    
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      details: error.message,
      type: error.type
    });
  }
});

// ========== STRIPE WEBHOOK HANDLER ==========
app.post('/api/stripe-webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  
  try {
    // If webhook secret is not set, accept all events (development mode)
    if (process.env.STRIPE_WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } else {
      // Parse the raw body for development
      event = JSON.parse(req.body.toString());
      console.warn('⚠️ Webhook signature verification skipped (no webhook secret)');
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  console.log('Webhook received:', event.type);
  
  // Handle the checkout.session.completed event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.log('Payment successful for session:', session.id);
    
    try {
      // Parse metadata
      const vehicleData = JSON.parse(session.metadata.vehicleData);
      const plan = session.metadata.plan;
      
      // Start analysis
      console.log(`Starting ${plan} analysis...`);
      
      // Do analysis asynchronously
      analyzeVehicle(vehicleData, plan, null)
        .then(result => {
          analysisResults.set(session.id, result);
          console.log(`Analysis completed for session ${session.id}`);
          
          // Auto-cleanup after 1 hour
          setTimeout(() => {
            analysisResults.delete(session.id);
          }, 3600000);
        })
        .catch(error => {
          console.error('Analysis failed:', error);
          analysisResults.set(session.id, {
            success: false,
            error: 'Analyse fehlgeschlagen. Bitte kontaktieren Sie den Support.',
            plan: plan
          });
        });
        
    } catch (error) {
      console.error('Error processing payment:', error);
    }
  }
  
  res.json({ received: true });
});

// ========== RESULTS ENDPOINT ==========
app.get('/api/results/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const result = analysisResults.get(sessionId);
  
  if (result) {
    res.json(result);
  } else {
    res.status(404).json({ 
      error: 'Results not ready',
      message: 'Analysis is still in progress or session not found'
    });
  }
});

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: {
      hasOpenAI: !!process.env.OPENAI_API_KEY,
      hasStripe: !!process.env.STRIPE_SECRET_KEY,
      hasWebhook: !!process.env.STRIPE_WEBHOOK_SECRET
    }
  });
});

// ========== TEST ENDPOINT (Development only) ==========
if (process.env.NODE_ENV !== 'production') {
  app.post('/api/test-analyze', upload.single('image'), async (req, res) => {
    try {
      const vehicleData = JSON.parse(req.body.vehicleData || '{}');
      const plan = req.body.plan || 'basic';
      const imagePath = req.file ? req.file.path : null;
      
      const result = await analyzeVehicle(vehicleData, plan, imagePath);
      
      // Cleanup
      if (imagePath) {
        setTimeout(async () => {
          try {
            await fs.unlink(imagePath);
          } catch (err) {
            console.error('Error deleting temp file:', err);
          }
        }, 5000);
      }
      
      res.json(result);
    } catch (error) {
      console.error('Test analysis error:', error);
      res.status(500).json({ error: error.message });
    }
  });
}

// ========== ERROR HANDLING ==========
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV !== 'production' ? err.message : 'Something went wrong'
  });
});

// ========== CLEANUP CRON JOB ==========
cron.schedule('0 * * * *', async () => {
  console.log('Running cleanup...');
  try {
    await fs.mkdir('temp', { recursive: true });
    const files = await fs.readdir('temp');
    const now = Date.now();
    
    for (const file of files) {
      const filePath = path.join('temp', file);
      const stats = await fs.stat(filePath);
      if (now - stats.mtime.getTime() > 3600000) {
        await fs.unlink(filePath);
        console.log(`Deleted: ${file}`);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║       AUTOPRÜFER SERVER STARTED       ║
╠═══════════════════════════════════════╣
║ Port: ${PORT.toString().padEnd(32)}║
║ URL: ${(process.env.SERVER_URL || 'http://localhost:' + PORT).padEnd(33)}║
║ Environment: ${(process.env.NODE_ENV || 'development').padEnd(25)}║
╠═══════════════════════════════════════╣
║ Status:                               ║
║ ✓ Server running                      ║
║ ${process.env.OPENAI_API_KEY ? '✓' : '✗'} OpenAI configured                   ║
║ ${process.env.STRIPE_SECRET_KEY ? '✓' : '✗'} Stripe configured                   ║
║ ${process.env.STRIPE_WEBHOOK_SECRET ? '✓' : '⚠'} Webhook secret configured          ║
╚═══════════════════════════════════════╝
  `);
  
  // Warning messages
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️  WARNING: OpenAI API key not configured');
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.warn('⚠️  WARNING: Stripe secret key not configured');
  }
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.warn('⚠️  WARNING: Stripe webhook secret not configured (webhooks will work but are not secure)');
  }
});

// ========== SIMPLIFIED ANALYZE MODULE ==========
// backend/analyze.js
async function analyzeVehicle(vehicleData, plan, imagePath) {
  // Mock implementation for testing
  // Replace with actual OpenAI implementation
  
  const mockAnalysis = {
    basic: `
## Preisbewertung
Der Preis von ${vehicleData.price}€ für einen ${vehicleData.brand} ${vehicleData.model} aus ${vehicleData.year} erscheint marktgerecht.

## Wichtige Checkpunkte
- Serviceheft vollständig vorhanden
- Zustand der Bremsen prüfen
- Ölstand und -qualität kontrollieren
- Reifenprofil messen (min. 4mm empfohlen)
- Elektronik komplett testen

## Typische Schwachstellen
Bei diesem Modell sind folgende Punkte bekannt:
- Steuerkette kann ab 100.000km Probleme machen
- Turbolader anfällig bei mangelnder Wartung
- Rost an den Radläufen möglich

## Kaufempfehlung
Das Fahrzeug macht einen soliden Eindruck. Bei ${vehicleData.mileage}km Laufleistung ist mit normalen Verschleißerscheinungen zu rechnen. Faire Preisvorstellung wäre ${Math.round(vehicleData.price * 0.95)}€.
    `,
    standard: `
## Marktanalyse & Preisbewertung
Der geforderte Preis von ${vehicleData.price}€ liegt im mittleren Preissegment für dieses Modell.
Marktübersicht:
- Minimum: ${Math.round(vehicleData.price * 0.85)}€
- Durchschnitt: ${Math.round(vehicleData.price * 0.95)}€
- Maximum: ${Math.round(vehicleData.price * 1.1)}€

## Technische Bewertung
Kilometerstand von ${vehicleData.mileage}km ist für Baujahr ${vehicleData.year} als normal einzustufen.
Durchschnitt für dieses Alter: ${Math.round((new Date().getFullYear() - vehicleData.year) * 15000)}km

## Verhandlungsstrategie
Folgende Argumente können Sie nutzen:
1. Kilometerstand rechtfertigt 5% Nachlass
2. Anstehende Wartung (geschätzt 800-1200€)
3. Winterreifen nicht dabei: -300€
4. Kleine Mängel: -500€

Realistisches Verhandlungsziel: ${Math.round(vehicleData.price * 0.9)}€

## Alternative Fahrzeuge
Vergleichbare Modelle:
- VW Golf (ähnliche Ausstattung): ${Math.round(vehicleData.price * 0.95)}€
- Ford Focus: ${Math.round(vehicleData.price * 0.9)}€
- Opel Astra: ${Math.round(vehicleData.price * 0.85)}€

## Fazit
Solides Angebot mit Verhandlungsspielraum. Bei Preis unter ${Math.round(vehicleData.price * 0.92)}€ zuschlagen!
    `,
    premium: `
# Premium Fahrzeuganalyse

## Executive Summary
✓ Fahrzeug grundsätzlich empfehlenswert
✓ Preis mit Verhandlung akzeptabel
✓ Technischer Zustand altersgerecht
⚠️ Wartungshistorie prüfen
⚠️ Verschleißteile beachten

## 1. Umfassende Marktanalyse

### Preisbewertung
Aktueller Marktwert für ${vehicleData.brand} ${vehicleData.model} (${vehicleData.year}):
- Händlerankauf: ${Math.round(vehicleData.price * 0.75)}€
- Privatverkauf Minimum: ${Math.round(vehicleData.price * 0.85)}€
- Durchschnittspreis: ${Math.round(vehicleData.price * 0.95)}€
- Händlerverkauf: ${Math.round(vehicleData.price * 1.15)}€

Der geforderte Preis von ${vehicleData.price}€ ist somit als ${vehicleData.price < vehicleData.price * 0.95 ? 'günstig' : 'fair'} einzustufen.

### Preisentwicklung
- Letztes Jahr: +2.3%
- Prognose nächstes Jahr: -5% bis -8%
- Saisonaler Höchststand: März-Mai
- Saisonaler Tiefstand: November-Januar

## 2. Technische Tiefenanalyse

### Motor & Antrieb
- Erwartete Restlaufleistung: ${Math.max(50000, 250000 - vehicleData.mileage)}km
- Ölwechsel-Intervall: 15.000km oder jährlich
- Zahnriemen/Steuerkette: Wechsel bei 120.000km (Kosten: 600-900€)

### Getriebe & Fahrwerk
- Kupplung Lebensdauer: ca. 150.000km
- Stoßdämpfer: Wechsel bei 80.000-100.000km empfohlen
- Bremsen: Scheiben alle 50.000km, Beläge alle 30.000km

## 3. Kostenanalyse (5 Jahre)

### Jahr 1
- Wartung & Inspektion: 400€
- Verschleißteile: 300€
- Unvorhergesehenes: 500€
- Versicherung: 800€
- Steuer: 200€
- Kraftstoff (15.000km): 1.500€
**Gesamt Jahr 1: 3.700€**

### Jahre 2-5
- Durchschnittlich pro Jahr: 3.200€
- Gesamt 5 Jahre: 16.500€
- Kosten pro km: 0,22€

## 4. Detaillierte Kaufberatung

### Besichtigungs-Checkliste
**Karosserie:**
□ Lackdicke messen (Unfallspuren)
□ Spaltmaße prüfen
□ Unterboden auf Rost
□ Türdichtungen kontrollieren

**Motor:**
□ Kaltstart durchführen
□ Öl-Zustand prüfen
□ Kühlwasser kontrollieren
□ Abgasfarbe beobachten

**Probefahrt:**
□ Kupplung testen
□ Bremsen prüfen (auch Vollbremsung)
□ Lenkung (Spiel, Geräusche)
□ Alle Gänge durchschalten

### Verhandlungsstrategie
**Starke Argumente:**
1. Wartungsstau: -800€
2. Fehlende Winterreifen: -400€
3. Kleine Lackschäden: -300€
4. Barzahlung: -500€

**Maximaler Kaufpreis:** ${Math.round(vehicleData.price * 0.88)}€
**Fairer Preis:** ${Math.round(vehicleData.price * 0.92)}€
**Schnäppchen ab:** ${Math.round(vehicleData.price * 0.85)}€

## 5. Alternativen-Vergleich

| Modell | Preis | Unterhalt | Zuverlässigkeit | Wertverlust |
|--------|-------|-----------|-----------------|-------------|
| ${vehicleData.brand} ${vehicleData.model} | ${vehicleData.price}€ | Mittel | Gut | Normal |
| VW Golf | ${Math.round(vehicleData.price * 1.05)}€ | Mittel | Sehr gut | Gering |
| Ford Focus | ${Math.round(vehicleData.price * 0.9)}€ | Niedrig | Gut | Hoch |
| Mazda 3 | ${Math.round(vehicleData.price * 1.1)}€ | Niedrig | Sehr gut | Gering |

## 6. Zukunftsprognose

### Wertentwicklung (5 Jahre)
- Jahr 1: -15% (${Math.round(vehicleData.price * 0.85)}€)
- Jahr 2: -10% (${Math.round(vehicleData.price * 0.765)}€)
- Jahr 3: -8% (${Math.round(vehicleData.price * 0.704)}€)
- Jahr 4: -7% (${Math.round(vehicleData.price * 0.655)}€)
- Jahr 5: -6% (${Math.round(vehicleData.price * 0.615)}€)

### Optimaler Wiederverkaufszeitpunkt
Nach 2-3 Jahren, wenn noch Restgarantie vorhanden und Kilometerstand unter 100.000km.

## 7. Finales Gutachten

### Gesamtbewertung: Note 2,3 (Gut)

**Vorteile:**
+ Beliebtes Modell mit gutem Wiederverkaufswert
+ Ausgereifte Technik
+ Gutes Preis-Leistungs-Verhältnis
+ Ersatzteile günstig verfügbar
+ Werkstatt-Netz gut ausgebaut

**Nachteile:**
- Durchschnittlicher Kraftstoffverbrauch
- Mäßige Fahrdynamik
- Innenraum-Qualität könnte besser sein
- Assistenzsysteme nicht auf neuestem Stand

### Kaufempfehlung
✅ **KAUFEMPFEHLUNG** bei Preis unter ${Math.round(vehicleData.price * 0.93)}€

**Nächste Schritte:**
1. Termin vereinbaren (idealerweise vormittags)
2. Mechaniker zur Besichtigung mitnehmen
3. Probefahrt mind. 30 Minuten
4. Kaufvertrag prüfen lassen
5. Fahrzeug direkt nach Kauf in Werkstatt checken

---
*Dieses Gutachten wurde mit KI-Unterstützung erstellt und ersetzt keine professionelle Fahrzeugprüfung vor Ort.*
    `
  };
  
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Return mock or real analysis
  if (process.env.OPENAI_API_KEY) {
    // Real OpenAI implementation would go here
    try {
      // Your actual OpenAI code
      const analysis = mockAnalysis[plan];
      return {
        success: true,
        analysis: analysis,
        plan: plan,
        pdfUrl: plan === 'premium' ? '/temp/sample-analysis.pdf' : null
      };
    } catch (error) {
      console.error('OpenAI error:', error);
      throw error;
    }
  } else {
    // Return mock data for testing
    return {
      success: true,
      analysis: mockAnalysis[plan] || mockAnalysis.basic,
      plan: plan,
      pdfUrl: plan === 'premium' ? '/temp/sample-analysis.pdf' : null
    };
  }
}

module.exports = { analyzeVehicle };