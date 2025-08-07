import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import { uploadsStore, resultsStore } from '../utils/store.js';
import { buildVisionContent } from '../utils/visionProcessor.js';
import { generatePremiumPDF } from '../utils/pdfGenerator.js';
import basicPrompt from './prompts/basic.js';
import standardPrompt from './prompts/standard.js';
import premiumPrompt from './prompts/premium.js';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const TMP_REPORTS_DIR = path.join('/tmp', 'autopruefer_reports');
fs.mkdirSync(TMP_REPORTS_DIR, { recursive: true });

export async function analyzeFromSession(session) {
  const sessionId = session.id;
  const meta = session.metadata || {};
  const plan = meta.plan || 'basic';

  const vehicle = {
    brand: meta.brand || '',
    model: meta.model || '',
    year: Number(meta.year || 0),
    mileage: Number(meta.mileage || 0),
    price: Number(meta.price || 0),
    city: meta.city || '',
    vin: meta.vin || '',
    description: meta.description || ''
  };

  const uploadId = meta.uploadId || '';
  let imageUrl = null;
  if (uploadId) {
    // Die Bild-URL ist öffentlich unter /uploads/:id
    // Die vollständige Domain ist in PUBLIC_BASE_URL enthalten und wurde bereits auf dem Client verwendet
    imageUrl = `${process.env.PUBLIC_BASE_URL}/uploads/${uploadId}`;
  }

  const systemPrompt = plan === 'premium' ? premiumPrompt : plan === 'standard' ? standardPrompt : basicPrompt;

  const userText = `Fahrzeugdaten:\n- Marke: ${vehicle.brand}\n- Modell: ${vehicle.model}\n- Baujahr: ${vehicle.year}\n- Kilometerstand: ${vehicle.mileage} km\n- Preis: ${vehicle.price} €\n- Standort: ${vehicle.city}\n- VIN: ${vehicle.vin || 'nicht angegeben'}\n- Zusatzinfos: ${vehicle.description || '—'}\n\nBitte antworte ausschließlich auf Deutsch.`;

  const messages = [
    { role: 'system', content: systemPrompt },
    buildVisionContent(userText, imageUrl)
  ].filter(Boolean);

  // OpenAI-Aufruf
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.2,
    messages
  });

  const text = completion.choices?.[0]?.message?.content?.trim() || 'Keine Antwort erhalten.';

  let pdfPath = null;
  if (plan === 'premium') {
    // Einfache Abschätzung für Charts/Tabellen
    const now = new Date().getFullYear();
    const age = Math.max(0, now - (vehicle.year || now));
    const basePrice = vehicle.price || 0;
    const forecast = Array.from({ length: 6 }, (_, i) => ({
      year: now + i,
      value: Math.round(basePrice * Math.pow(0.88, i + age)) // 12% p.a. Wertverlust als grobes Modell
    }));

    const reportFile = path.join(TMP_REPORTS_DIR, `${sessionId}.pdf`);
    await generatePremiumPDF({
      filePath: reportFile,
      plan,
      vehicle,
      analysisText: text,
      forecast
    });
    pdfPath = reportFile;
  }

  // Ergebnis im Speicher ablegen mit TTL
  resultsStore.set(sessionId, { plan, text, pdfPath }, Number(process.env.TTL_MS || 3600000));

  return { plan, text, pdfPath };
}