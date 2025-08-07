// backend/prompts/standard.js

export function standardPrompt({ vehicle = {}, context = {} } = {}) {
    const brand = vehicle.brand ?? '-';
    const model = vehicle.model ?? '-';
    const year = vehicle.year ?? '-';
    const mileage = Number(vehicle.mileage ?? 0).toLocaleString('de-DE');
    const price = Number(vehicle.price ?? 0).toLocaleString('de-DE');
  
    const extra = context && Object.keys(context).length
      ? `\n\n[Zusätzlicher Kontext]\n${JSON.stringify(context, null, 2)}`
      : '';
  
    return [
      'Du bist ein Kfz-Sachverständiger. Erstelle eine ausführlichere Standard-Analyse.',
      'Sprache: Deutsch.',
      '\n[Fahrzeugdaten]',
      `- Marke/Modell: ${brand} ${model}`,
      `- Baujahr: ${year}`,
      `- Kilometerstand: ${mileage} km`,
      `- Preis: ${price} €`,
      extra,
      '\n[Aufgabe]',
      '- Beurteile Zustand, nenne typische Schwachstellen und grobe Wartungskosten.',
      '- Prüfe die Plausibilität des Preises und gib eine Kaufempfehlung (kurz begründet).'
    ].join('\n');
  }
  
  export default standardPrompt;