const OpenAI = require('openai');
const fs = require('fs').promises;
const { generatePDF } = require('../utils/pdfGenerator');
const { processImage } = require('../utils/imageProcessor');
const { getPrompt } = require('./prompts');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function analyzeVehicle(vehicleData, plan, imagePath) {
  try {
    // Prepare messages
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

    // Add image if provided
    if (imagePath) {
      const imageBase64 = await processImage(imagePath);
      messages.push({
        role: "user",
        content: [
          {
            type: "text",
            text: "Bitte analysiere auch das beigefügte Fahrzeugbild."
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

module.exports = { analyzeVehicle };