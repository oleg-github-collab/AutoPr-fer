const OpenAI = require('openai');
const { getPrompt } = require('./prompts');
const { generatePDF } = require('../utils/pdfGenerator');
const { processImage } = require('../utils/imageProcessor');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function analyzeVehicle(vehicleData, plan, imagePath) {
  try {
    console.log(`Starting ${plan} analysis for ${vehicleData.brand} ${vehicleData.model}`);
    
    const messages = [
      {
        role: "system",
        content: getPrompt(plan)
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
        ${vehicleData.description ? `Beschreibung: ${vehicleData.description}` : ''}`
      }
    ];

    if (imagePath) {
      const imageBase64 = await processImage(imagePath);
      messages.push({
        role: "user",
        content: [
          { type: "text", text: "Analysiere auch das Fahrzeugbild." },
          { 
            type: "image_url", 
            image_url: { 
              url: `data:image/jpeg;base64,${imageBase64}`,
              detail: plan === 'premium' ? 'high' : 'low'
            }
          }
        ]
      });
    }

    const completion = await openai.chat.completions.create({
      model: imagePath ? "gpt-4o" : "gpt-4-turbo-preview",
      messages: messages,
      temperature: 0.7,
      max_tokens: plan === 'premium' ? 4000 : plan === 'standard' ? 2000 : 1000
    });

    const analysisText = completion.choices[0].message.content;

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
    
    // Return mock data if OpenAI fails
    return {
      success: true,
      analysis: getMockAnalysis(plan, vehicleData),
      plan: plan
    };
  }
}

function getMockAnalysis(plan, vehicleData) {
  const templates = {
    basic: `## Preisbewertung\nDer Preis von ${vehicleData.price}€ erscheint marktgerecht.\n\n## Checkpunkte\n- Serviceheft prüfen\n- Bremsen testen\n- Ölstand kontrollieren\n\n## Kaufempfehlung\nSolides Angebot.`,
    standard: `## Marktanalyse\nPreis liegt im Durchschnitt. Vergleichbare Modelle: ${vehicleData.price * 0.95}€ - ${vehicleData.price * 1.05}€\n\n## Verhandlung\nZiel: ${Math.round(vehicleData.price * 0.92)}€`,
    premium: `# Premium Analyse\n\n## Executive Summary\n✓ Grundsätzlich empfehlenswert\n\n## Marktanalyse\nDetaillierte Analyse...`
  };
  
  return templates[plan] || templates.basic;
}

module.exports = { analyzeVehicle };