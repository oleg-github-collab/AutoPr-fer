// server.js - Hauptserver für Autoprüfer
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const cron = require('node-cron');
const OpenAI = require('openai');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const PDFDocument = require('pdfkit');
const sharp = require('sharp');

const app = express();
const PORT = process.env.PORT || 3000;

// OpenAI Setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Middleware
app.use(cors());
app.use(express.static('public'));
app.use('/temp', express.static('temp'));
app.use(express.json({ 
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf-8');
  }
}));

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

// Store for analysis results (in production use Redis)
const analysisResults = new Map();

// ========== PROMPTS ==========
const prompts = {
  basic: `Du bist ein erfahrener KFZ-Gutachter und Gebrauchtwagen-Experte. Analysiere das Fahrzeug und gib eine kurze Einschätzung.

Deine Aufgabe (Basic-Analyse):
1. Bewerte den Preis (fair/zu hoch/günstig)
2. Liste 3-5 wichtige Punkte, auf die beim Kauf geachtet werden sollte
3. Nenne typische Schwachstellen dieses Modells
4. Gib eine kurze Kaufempfehlung

Halte die Antwort kompakt (max. 300 Wörter) und verständlich für Laien.`,

  standard: `Du bist ein erfahrener KFZ-Gutachter und Marktanalyst. Erstelle eine detaillierte Fahrzeuganalyse.

Deine Aufgabe (Standard-Analyse):
1. **Preisbewertung**: Vergleiche mit aktuellen Marktpreisen
2. **Technische Einschätzung**: Typische Probleme, Wartungskosten
3. **Verhandlungstipps**: Konkrete Argumente für Preisverhandlung
4. **Alternative Modelle**: 3-4 vergleichbare Fahrzeuge
5. **Kilometerstand-Bewertung**: Ist der Kilometerstand für das Alter angemessen?
6. **Wiederverkaufswert**: Prognose für die nächsten 3 Jahre

Strukturiere deine Antwort klar mit Überschriften. Nutze konkrete Zahlen wo möglich.`,

  premium: `Du bist ein zertifizierter KFZ-Sachverständiger mit 20 Jahren Erfahrung. Erstelle ein umfassendes Gutachten.

Deine Aufgabe (Premium-Analyse):

## 1. MARKTANALYSE
- Aktueller Marktwert (Min/Durchschnitt/Max)
- Preisentwicklung der letzten 12 Monate
- Regionale Preisunterschiede
- Händler vs. Privatpreise

## 2. TECHNISCHE BEWERTUNG
- Motoranalyse und bekannte Probleme
- Getriebe und Antriebsstrang
- Fahrwerk und Bremsen
- Elektronik und Assistenzsysteme
- Karosserie und Rostanfälligkeit

## 3. UNTERHALTSKOSTEN
- Kraftstoffverbrauch (real vs. Herstellerangabe)
- Versicherungseinstufung
- KFZ-Steuer
- Wartungsintervalle und -kosten
- Typische Reparaturkosten nach Kilometern

## 4. HISTORIE & RÜCKRUFE
- Bekannte Rückrufaktionen
- Modellpflegen und Verbesserungen
- Typische Vorbesitzer-Profile

## 5. KAUFBERATUNG
- Detaillierte Checkliste für Besichtigung
- Kritische Punkte bei Probefahrt
- Verhandlungsstrategie mit konkreten Argumenten
- Empfohlene Werkstätten in der Region

## 6. ALTERNATIVEN
- 5 vergleichbare Modelle mit Vor-/Nachteilen
- Preis-Leistungs-Vergleich

## 7. ZUKUNFTSPROGNOSE
- Wertverlust-Kurve für 5 Jahre
- Technologie-Zukunftsfähigkeit
- Umweltzonen und Fahrverbote

## 8. FAZIT & EMPFEHLUNG
- Klare Kauf-/Nichtkauf-Empfehlung mit Begründung
- Maximaler empfohlener Kaufpreis
- Timing-Empfehlung (jetzt kaufen oder warten)

Wenn ein Bild vorhanden ist, analysiere zusätzlich:
- Zustand der Karosserie
- Reifenprofil und -zustand
- Sichtbare Mängel oder Schäden
- Gepflegtheit des Innenraums

Verwende konkrete Zahlen, Statistiken und Fakten. Sei kritisch aber fair.`
};

// ========== HELPER FUNCTIONS ==========
async function processImage(imagePath) {
  try {
    const processedImage = await sharp(imagePath)
      .resize(1024, 1024, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .jpeg({ quality: 85 })
      .toBuffer();
    
    return processedImage.toString('base64');
  } catch (error) {
    console.error('Image processing error:', error);
    throw error;
  }
}

async function generatePDF(vehicleData, analysisText) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, left: 50, right: 50, bottom: 50 },
      info: {
        Title: 'Autoprüfer Fahrzeuganalyse',
        Author: 'Autoprüfer',
        Subject: `Analyse ${vehicleData.brand} ${vehicleData.model}`
      }
    });
    
    const filename = `analyse-${Date.now()}.pdf`;
    const filepath = path.join('temp', filename);
    const stream = fs.createWriteStream(filepath);
    
    doc.pipe(stream);
    
    // Header with logo placeholder
    doc.rect(50, 50, 100, 30)
       .fillAndStroke('#1e40af', '#1e40af');
    
    doc.fontSize(20)
       .fillColor('#ffffff')
       .text('Autoprüfer', 55, 58, { width: 90, align: 'center' });
    
    doc.fontSize(24)
       .fillColor('#1e40af')
       .text('Fahrzeuganalyse Premium', 170, 55);
    
    // Date
    doc.fontSize(10)
       .fillColor('#666666')
       .text(`Erstellt am: ${new Date().toLocaleDateString('de-DE')}`, 400, 60);
    
    doc.moveDown(3);
    
    // Vehicle Info Box
    doc.rect(50, 120, 495, 100)
       .stroke('#e5e7eb');
    
    doc.fontSize(14)
       .fillColor('#1e40af')
       .text('FAHRZEUGDATEN', 60, 130);
    
    doc.fontSize(11)
       .fillColor('#000000')
       .text(`Fahrzeug: ${vehicleData.brand} ${vehicleData.model}`, 60, 155)
       .text(`Baujahr: ${vehicleData.year}`, 60, 175)
       .text(`Kilometerstand: ${new Intl.NumberFormat('de-DE').format(vehicleData.mileage)} km`, 60, 195);
    
    doc.text(`Preis: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(vehicleData.price)}`, 300, 155)
       .text(`Standort: ${vehicleData.city}`, 300, 175);
    
    if (vehicleData.vin) {
      doc.text(`VIN: ${vehicleData.vin}`, 300, 195);
    }
    
    // Main Analysis
    doc.fontSize(14)
       .fillColor('#1e40af')
       .text('DETAILLIERTE ANALYSE', 50, 250);
    
    doc.moveDown();
    
    // Parse and format analysis text
    const sections = analysisText.split('##').filter(s => s.trim());
    let currentY = doc.y;
    
    sections.forEach((section, index) => {
      // Check if we need a new page
      if (currentY > 650) {
        doc.addPage();
        currentY = 50;
      }
      
      const lines = section.trim().split('\n');
      const title = lines[0];
      const content = lines.slice(1).join('\n');
      
      if (title) {
        doc.fontSize(12)
           .fillColor('#1e40af')
           .text(title.trim(), 50, currentY);
        
        currentY += 20;
        
        doc.fontSize(10)
           .fillColor('#000000')
           .text(content.trim(), 50, currentY, {
             width: 495,
             align: 'justify',
             lineGap: 2
           });
        
        currentY = doc.y + 15;
      }
    });
    
    // Footer on last page
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      
      // Page number
      doc.fontSize(8)
         .fillColor('#666666')
         .text(`Seite ${i + 1} von ${pages.count}`, 50, 770, { align: 'center', width: 495 });
      
      // Footer text
      doc.fontSize(8)
         .text('© 2024 Autoprüfer - KI-gestützte Fahrzeuganalyse | Powered by OpenAI GPT-4', 50, 785, { 
           align: 'center', 
           width: 495 
         });
    }
    
    doc.end();
    
    stream.on('finish', () => {
      resolve(filepath);
    });
    
    stream.on('error', reject);
  });
}

async function analyzeVehicle(vehicleData, plan, imagePath) {
  try {
    // Prepare messages
    const messages = [
      {
        role: "system",
        content: prompts[plan]
      },
      {
        role: "user",
        content: `Analysiere folgendes Fahrzeug:
        Marke/Modell: ${vehicleData.brand} ${vehicleData.model}
        Baujahr: ${vehicleData.year}
        Kilometerstand: ${vehicleData.mileage} km
        Preis: ${vehicleData.price} €
        Standort: ${vehicleData.city}
        ${vehicleData.vin ? `VIN: ${vehicleData.vin}` : ''}
        ${vehicleData.description ? `Zusätzliche Informationen: ${vehicleData.description}` : ''}`
      }
    ];

    // Add image if provided
    if (imagePath) {
      const imageBase64 = await processImage(imagePath);
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: "Bitte analysiere auch das beigefügte Fahrzeugbild und beziehe deine Beobachtungen in die Analyse ein."
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
              detail: "high"
            }
          }
        ]
      });
    }

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: imagePath ? "gpt-4o" : "gpt-4-turbo-preview",
      messages: messages,
      temperature: 0.7,
      max_tokens: plan === 'premium' ? 4000 : plan === 'standard' ? 2000 : 1000
    });

    const analysisText = completion.choices[0].message.content;

    // Generate PDF for Premium plan
    if (plan === 'premium') {
      const pdfPath = await generatePDF(vehicleData, analysisText);
      return {
        success: true,
        analysis: analysisText,
        pdfUrl: `/temp/${path.basename(pdfPath)}`,
        plan: plan
      };
    }

    return {
      success: true,
      analysis: analysisText,
      plan: plan
    };

  } catch (error) {
    console.error('Analysis error:', error);
    throw error;
  }
}

// ========== ROUTES ==========
app.post('/api/create-checkout', async (req, res) => {
  try {
    const { plan, vehicleData } = req.body;
    
    const prices = {
      basic: process.env.STRIPE_PRICE_BASIC,
      standard: process.env.STRIPE_PRICE_STANDARD,
      premium: process.env.STRIPE_PRICE_PREMIUM
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'giropay', 'sofort'],
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

    res.json({ sessionId: session.id });
  } catch (error) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Fehler beim Erstellen der Checkout-Session' });
  }
});

app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
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
      
      // Store result
      analysisResults.set(session.id, result);
      
      // Auto-delete after 1 hour
      setTimeout(() => {
        analysisResults.delete(session.id);
      }, 3600000);
      
    } catch (error) {
      console.error('Error processing successful payment:', error);
    }
  }

  res.json({ received: true });
});

app.post('/api/analyze-direct', upload.single('image'), async (req, res) => {
  try {
    const vehicleData = JSON.parse(req.body.vehicleData || '{}');
    const plan = req.body.plan;
    const imagePath = req.file ? req.file.path : null;
    
    const result = await analyzeVehicle(vehicleData, plan, imagePath);
    
    // Cleanup uploaded image after processing
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
    console.error('Analysis error:', error);
    res.status(500).json({ error: 'Fehler bei der Analyse' });
  }
});

app.get('/api/results/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const result = analysisResults.get(sessionId);
  
  if (result) {
    res.json(result);
  } else {
    res.status(404).json({ error: 'Ergebnisse noch nicht verfügbar' });
  }
});

app.get('/success.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'success.html'));
});

// Cleanup temp files every hour
cron.schedule('0 * * * *', async () => {
  console.log('Cleaning up temp files...');
  try {
    await fs.mkdir('temp', { recursive: true });
    const files = await fs.readdir('temp');
    const now = Date.now();
    
    for (const file of files) {
      const filePath = path.join('temp', file);
      const stats = await fs.stat(filePath);
      if (now - stats.mtime.getTime() > 3600000) { // 1 hour
        await fs.unlink(filePath);
        console.log(`Deleted old file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Cleanup error:', error);
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Ein Fehler ist aufgetreten',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║     Autoprüfer Server gestartet      ║
  ║                                       ║
  ║     Port: ${PORT}                     ║
  ║     Umgebung: ${process.env.NODE_ENV || 'development'}         ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
  `);
});