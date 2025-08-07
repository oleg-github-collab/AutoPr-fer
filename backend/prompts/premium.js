// backend/prompts/premium.js

/**
 * Формує системний промпт для плану Premium німецькою.
 * @param {Object} params
 * @param {Object} params.vehicle - дані авто
 * @param {Object} [params.photoAnalysis] - результати аналізу фото (опційно)
 * @param {Object} [params.context] - додатковий контекст/інструкції (опційно)
 * @returns {string}
 */
export function premiumPrompt({ vehicle = {}, photoAnalysis = null, context = {} } = {}) {
    const brand = vehicle.brand ?? '-';
    const model = vehicle.model ?? '-';
    const year = vehicle.year ?? '-';
    const mileage = Number(vehicle.mileage ?? 0).toLocaleString('de-DE');
    const price = Number(vehicle.price ?? 0).toLocaleString('de-DE');
    const city = vehicle.city ?? '-';
    const vin = vehicle.vin ? `\n- VIN: ${vehicle.vin}` : '';
    const description = vehicle.description ? `\n- Beschreibung: ${vehicle.description}` : '';
  
    const photoBlock = photoAnalysis
      ? `\n\n[Fotobewertung]\n${typeof photoAnalysis === 'string' ? photoAnalysis : JSON.stringify(photoAnalysis, null, 2)}`
      : '';
  
    const extra = context && Object.keys(context).length
      ? `\n\n[Zusätzlicher Kontext]\n${JSON.stringify(context, null, 2)}`
      : '';
  
    return [
      'Du bist ein Kfz-Sachverständiger. Erstelle ein gründliches, verständliches und praktisches Premium-Gutachten für einen gebrauchten Wagen.',
      'Sprache: Deutsch. Antworte präzise, mit klaren Handlungsempfehlungen und realistischen Risiken.',
      '\n[Fahrzeugdaten]',
      `- Marke: ${brand}`,
      `- Modell: ${model}`,
      `- Baujahr: ${year}`,
      `- Kilometerstand: ${mileage} km`,
      `- Preis: ${price} €`,
      `- Standort: ${city}${vin}${description}`,
      photoBlock,
      extra,
      '\n[Aufgabe]',
      '- Beurteile den technischen Zustand basierend auf den Angaben (und Fotos, falls vorhanden).',
      '- Liste häufige Modellschwachstellen, bekannte Rückrufe und typische Reparaturkosten-Spannen.',
      '- Prüfe die Plausibilität von Preis und Laufleistung (Marktvergleich, ggf. grobe Preisspanne angeben).',
      '- Gib eine Checkliste für Besichtigung/Probefahrt mit Prioritäten (hoch/mittel/niedrig).',
      '- Schätze künftige Kosten (Wartung/Reparaturen) für 12–24 Monate.',
      '- Fasse in einem Fazit zusammen: Kaufempfehlung (Ja/Nein/Unter Vorbehalt) mit kurzer Begründung.',
      '\n[Format]',
      'Gib die Antwort als klar gegliederte Abschnitte mit Überschriften aus. Vermeide Floskeln, werde konkret.'
    ].join('\n');
  }
  
  export default premiumPrompt;