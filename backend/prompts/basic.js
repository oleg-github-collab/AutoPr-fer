// backend/prompts/basic.js

export function basicPrompt({ vehicle = {}, context = {} } = {}) {
    const brand = vehicle.brand ?? '-';
    const model = vehicle.model ?? '-';
    const year = vehicle.year ?? '-';
    const mileage = Number(vehicle.mileage ?? 0).toLocaleString('de-DE');
    const price = Number(vehicle.price ?? 0).toLocaleString('de-DE');
  
    const extra = context && Object.keys(context).length
      ? `\n\n[Zusätzlicher Kontext]\n${JSON.stringify(context, null, 2)}`
      : '';
  
    return [
      'Du bist ein Kfz-Experte. Erstelle eine kurze, prägnante Ersteinschätzung (Basic) zu diesem Gebrauchtwagen.',
      'Sprache: Deutsch.',
      '\n[Fahrzeugdaten]',
      `- Marke/Modell: ${brand} ${model}`,
      `- Baujahr: ${year}`,
      `- Kilometerstand: ${mileage} km`,
      `- Preis: ${price} €`,
      extra,
      '\n[Aufgabe]',
      '- Nenne 3–5 Hauptpunkte: grober Zustand, Plausibilität von Preis/Laufleistung, schnelle Empfehlung.',
      '- Halte dich kurz.'
    ].join('\n');
  }
  
  export default basicPrompt;