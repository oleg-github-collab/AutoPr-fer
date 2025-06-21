// services/openai.js - OpenAI Service

const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

class OpenAIService {
    constructor() {
        this.model = 'gpt-4o';
    }
    
    async analyzeVehicle(data) {
        const { photos, listingText, url, plan } = data;
        
        // Build system prompt based on plan
        const systemPrompt = this.buildSystemPrompt(plan);
        
        // Build user prompt
        const userPrompt = this.buildUserPrompt(listingText, photos.length, url);
        
        try {
            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ];
            
            // Add images if available
            if (photos.length > 0) {
                messages[1].content = [
                    { type: "text", text: userPrompt },
                    ...photos.map(photo => ({
                        type: "image_url",
                        image_url: { url: photo }
                    }))
                ];
            }
            
            const completion = await openai.chat.completions.create({
                model: this.model,
                messages: messages,
                max_tokens: plan === 'premium' ? 3000 : 1000,
                temperature: 0.7,
            });
            
            const response = completion.choices[0].message.content;
            return this.parseResponse(response, plan);
            
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error('Analyse fehlgeschlagen');
        }
    }
    
    async extractVehicleInfo(data) {
        const prompt = `
        Extrahiere folgende Fahrzeuginformationen aus den Daten:
        - Marke (make)
        - Modell (model)
        - Baujahr (year)
        - Preis (price)
        - Kilometerstand (mileage)
        - Segment (compact, suv, etc.)
        
        Antwort als JSON.
        
        Daten: ${data.listingText}
        `;
        
        try {
            const completion = await openai.chat.completions.create({
                model: this.model,
                messages: [{ role: "user", content: prompt }],
                max_tokens: 500,
                temperature: 0.3,
            });
            
            const response = completion.choices[0].message.content;
            return JSON.parse(response);
        } catch (error) {
            // Fallback to basic extraction
            return this.basicVehicleExtraction(data.listingText);
        }
    }
    
    buildSystemPrompt(plan) {
        const basePrompt = `Du bist ein erfahrener Kfz-Gutachter mit über 20 Jahren Erfahrung im deutschen Automarkt. 
Du analysierst Fahrzeuge für potenzielle Käufer und gibst ehrliche, konstruktive Bewertungen.

WICHTIG: Strukturiere deine Antwort EXAKT wie folgt:

1. GESAMTBEWERTUNG: [Empfehlenswert/Mit Vorsicht zu genießen/Nicht empfehlenswert]
[Kurze Begründung in 1-2 Sätzen]

2. HAUPTRISIKEN:
- [Risiko 1]
- [Risiko 2]
- [Risiko 3]

3. VERDÄCHTIGE PUNKTE:
- [Punkt 1]
- [Punkt 2]

4. VERHANDLUNGSTIPPS:
- [Tipp 1 mit geschätzten Kosten]
- [Tipp 2 mit geschätzten Kosten]
- [Tipp 3 mit Verhandlungsspielraum]

5. WEITERE EMPFEHLUNGEN:
- [Empfehlung 1]
- [Empfehlung 2]
- [Empfehlung 3]`;

        if (plan === 'premium') {
            return basePrompt + `

PREMIUM-ANALYSE zusätzlich:

6. TECHNISCHE DETAILS:
- Motor: [Bewertung und bekannte Probleme]
- Getriebe: [Typ und Zuverlässigkeit]
- Fahrwerk: [Zustand und typische Schwachstellen]
- Elektronik: [Komplexität und Fehleranfälligkeit]

7. UNTERHALTSKOSTEN (monatlich):
- Kraftstoff: [€]
- Versicherung: [€]
- Wartung: [€]
- Steuer: [€]
- Wertverlust: [€]
- GESAMT: [€/Monat]

8. MARKTANALYSE:
- Aktueller Marktwert: [€]
- Preis-Leistung: [Bewertung]
- Wiederverkaufswert in 3 Jahren: [€ und %]

9. KONKURRENZMODELLE:
Erstelle eine Vergleichstabelle mit 3 direkten Konkurrenten.

Gib eine SEHR detaillierte Analyse mit mindestens 40 Prüfpunkten.`;
        }
        
        return basePrompt;
    }
    
    buildUserPrompt(listingText, photoCount, url) {
        let prompt = 'Analysiere dieses Fahrzeug:\n\n';
        
        if (listingText) {
            prompt += `Inseratstext:\n${listingText}\n\n`;
        }
        
        if (photoCount > 0) {
            prompt += `Es wurden ${photoCount} Fotos zur Analyse bereitgestellt.\n`;
        }
        
        if (url) {
            prompt += `Inserat-URL: ${url}\n`;
        }
        
        if (!listingText && photoCount === 0) {
            prompt += 'Keine spezifischen Daten verfügbar. Gib allgemeine Hinweise zur Fahrzeugprüfung.';
        }
        
        return prompt;
    }
    
    parseResponse(response, plan) {
        const sections = this.extractSections(response);
        
        // Determine verdict
        let verdict = 'caution';
        const bewertung = sections['GESAMTBEWERTUNG'] || '';
        if (bewertung.includes('Empfehlenswert') && !bewertung.includes('Nicht empfehlenswert')) {
            verdict = 'recommended';
        } else if (bewertung.includes('Nicht empfehlenswert')) {
            verdict = 'not_recommended';
        }
        
        const result = {
            verdict,
            summary: this.cleanText(bewertung),
            risks: this.extractListItems(sections['HAUPTRISIKEN']),
            suspiciousPoints: this.extractListItems(sections['VERDÄCHTIGE PUNKTE']),
            negotiation: this.extractListItems(sections['VERHANDLUNGSTIPPS']),
            recommendations: this.extractListItems(sections['WEITERE EMPFEHLUNGEN']),
            plan
        };
        
        if (plan === 'premium') {
            result.technicalDetails = this.extractListItems(sections['TECHNISCHE DETAILS']);
            result.monthlyCosting = this.extractCosts(sections['UNTERHALTSKOSTEN']);
            result.marketAnalysis = this.extractListItems(sections['MARKTANALYSE']);
            result.stats = this.extractStats(response);
        }
        
        return result;
    }
    
    extractSections(text) {
        const sections = {};
        const sectionRegex = /(\d+\.\s*[A-ZÄÖÜ\s]+):([\s\S]*?)(?=\d+\.\s*[A-ZÄÖÜ\s]+:|$)/g;
        
        let match;
        while ((match = sectionRegex.exec(text)) !== null) {
            const sectionName = match[1].replace(/\d+\.\s*/, '').trim();
            sections[sectionName] = match[2].trim();
        }
        
        return sections;
    }
    
    extractListItems(text) {
        if (!text) return [];
        
        const items = text.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => line.replace(/^[-•*]\s*/, ''))
            .filter(line => line.length > 10);
        
        return items;
    }
    
    extractCosts(text) {
        if (!text) return null;
        
        const costs = {
            fuel: 0,
            insurance: 0,
            maintenance: 0,
            tax: 0,
            depreciation: 0,
            total: 0
        };
        
        const patterns = {
            fuel: /Kraftstoff:\s*(\d+)/,
            insurance: /Versicherung:\s*(\d+)/,
            maintenance: /Wartung:\s*(\d+)/,
            tax: /Steuer:\s*(\d+)/,
            depreciation: /Wertverlust:\s*(\d+)/,
            total: /GESAMT:\s*(\d+)/
        };
        
        for (const [key, pattern] of Object.entries(patterns)) {
            const match = text.match(pattern);
            if (match) {
                costs[key] = parseInt(match[1]);
            }
        }
        
        return costs;
    }
    
    extractStats(text) {
        return {
            fuelConsumption: this.extractNumber(text, /(\d+[.,]\d+)\s*L\/100km/) || 5.5,
            annualInsurance: this.extractNumber(text, /Versicherung:?\s*(\d+)\s*€\/Jahr/) || 1200,
            annualMaintenance: this.extractNumber(text, /Wartung:?\s*(\d+)\s*€\/Jahr/) || 1500,
            resalePercentage: this.extractNumber(text, /(\d+)\s*%\s*(?:Restwert|nach 3 Jahren)/) || 64
        };
    }
    
    extractNumber(text, pattern) {
        const match = text.match(pattern);
        if (match) {
            return parseFloat(match[1].replace(',', '.'));
        }
        return null;
    }
    
    cleanText(text) {
        return text
            .replace(/\[.*?\]/g, '')
            .replace(/\d+\.\s*/g, '')
            .trim();
    }
    
    basicVehicleExtraction(text) {
        // Fallback extraction using simple patterns
        const patterns = {
            make: /(BMW|Mercedes|Audi|VW|Volkswagen|Ford|Opel|Toyota|Mazda)/i,
            model: /\b(3er|5er|A4|A6|C-Klasse|E-Klasse|Golf|Passat|Focus|Astra)\b/i,
            year: /\b(20\d{2}|19\d{2})\b/,
            price: /(\d{1,3}[.,]?\d{3})\s*€/,
            mileage: /(\d{1,3}[.,]?\d{3})\s*km/i
        };
        
        const extracted = {};
        
        for (const [key, pattern] of Object.entries(patterns)) {
            const match = text.match(pattern);
            if (match) {
                extracted[key] = match[1];
            }
        }
        
        // Clean up price and mileage
        if (extracted.price) {
            extracted.price = parseInt(extracted.price.replace(/[.,]/g, ''));
        }
        if (extracted.mileage) {
            extracted.mileage = parseInt(extracted.mileage.replace(/[.,]/g, ''));
        }
        
        return extracted;
    }
}

module.exports = new OpenAIService();