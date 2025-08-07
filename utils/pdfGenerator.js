import PDFDocument from 'pdfkit';
import fs from 'fs';

export async function generatePremiumPDF({ filePath, plan, vehicle = {}, analysisText = '', forecast = [] }) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      // Метадані PDF
      doc.info.Title = 'Autoprüfer – Vollgutachten';
      doc.info.Author = 'Autoprüfer';

      // Футер на кожній сторінці
      const addFooterForCurrentPage = () => {
        const pageHeight = doc.page.height;
        const margin = doc.page.margins.bottom ?? 50;
        doc.fontSize(9).fillColor('#555');
        doc.text(
          'Autoprüfer – KI-gestützte Gebrauchtwagenanalyse – Dieses PDF ist eine unverbindliche Einschätzung.',
          50,
          pageHeight - margin - 20,
          { width: doc.page.width - 100, align: 'center' }
        );
      };
      doc.on('pageAdded', addFooterForCurrentPage);

      // Заголовок
      doc
        .fontSize(22)
        .fillColor('#000')
        .text('Autoprüfer – Vollgutachten', { align: 'center' })
        .moveDown(0.5);

      // Загальна інформація
      doc
        .fontSize(12)
        .fillColor('#333')
        .text(
          `Plan: ${String(plan || '').toUpperCase()} | erstellt am ${new Date().toLocaleDateString('de-DE')}`,
          { align: 'center' }
        )
        .moveDown(1.2);

      // Розділ: Дані авто
      doc
        .fontSize(14)
        .fillColor('#111')
        .text('Fahrzeugdaten', { underline: true })
        .moveDown(0.5);

      const brand = vehicle.brand ?? '-';
      const model = vehicle.model ?? '-';
      const year = vehicle.year ?? '-';
      const mileage = Number(vehicle.mileage ?? 0);
      const price = Number(vehicle.price ?? 0);
      const city = vehicle.city ?? '-';
      const vin = vehicle.vin;
      const description = vehicle.description;

      const lines = [
        `Marke: ${brand}`,
        `Modell: ${model}`,
        `Baujahr: ${year}`,
        `Kilometerstand: ${mileage.toLocaleString('de-DE')} km`,
        `Preis: ${price.toLocaleString('de-DE')} €`,
        `Standort: ${city}`
      ];
      if (vin) lines.push(`VIN: ${vin}`);
      if (description) lines.push(`Beschreibung: ${description}`);

      doc.fontSize(11).fillColor('#333');
      lines.forEach(l => doc.text('• ' + l));
      doc.moveDown(1);

      // Розділ: Аналіз
      doc.fontSize(14).fillColor('#111').text('Analyse', { underline: true }).moveDown(0.5);
      doc.fontSize(11).fillColor('#000');

      const safeAnalysis = String(analysisText ?? '');
      splitTextIntoBlocks(safeAnalysis, 1000).forEach(block => {
        doc.text(block).moveDown(0.5);
      });

      // Розділ: Прогноз (діаграма)
      doc.addPage();
      doc.fontSize(14).fillColor('#111').text('Wiederverkaufsprognose (Schätzung)', { underline: true }).moveDown(0.5);

      if (Array.isArray(forecast) && forecast.length > 0) {
        drawBarChart(doc, forecast, { x: 50, y: 120, width: 500, height: 300, title: 'Wert (EUR) je Jahr' });
      } else {
        doc.fontSize(11).fillColor('#333').text('Keine Prognosedaten verfügbar.', { align: 'left' });
      }

      // Додати футер для поточної (останньої) сторінки
      addFooterForCurrentPage();

      // Завершити документ
      doc.end();

      stream.on('finish', () => resolve(true));
      stream.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

function splitTextIntoBlocks(text, maxCharsPerBlock = 1200) {
  const blocks = [];
  let start = 0;
  const str = String(text ?? '');
  while (start < str.length) {
    blocks.push(str.slice(start, start + maxCharsPerBlock));
    start += maxCharsPerBlock;
  }
  return blocks;
}

function drawBarChart(doc, data, { x, y, width, height, title }) {
  if (!Array.isArray(data) || data.length === 0) return;

  const padding = 40;
  const chartX = x;
  const chartY = y;
  const chartW = width;
  const chartH = height;

  // Рамка
  doc.rect(chartX, chartY, chartW, chartH).stroke('#999');

  // Заголовок графіка
  if (title) {
    doc.fontSize(12).fillColor('#111').text(title, chartX, chartY - 20);
  }

  // Дані
  const values = data.map(d => Number(d.value ?? 0));
  const maxVal = Math.max(...values, 1);

  const n = data.length;
  const innerW = chartW - padding - 20; // віднімемо відступи для осей
  const gap = 10;
  const barWidth = Math.max(8, Math.floor((innerW - (n - 1) * gap) / n));
  const baseY = chartY + chartH - padding;

  // Осі
  doc.moveTo(chartX + padding, chartY + 10).lineTo(chartX + padding, baseY).stroke('#666');
  doc.moveTo(chartX + padding, baseY).lineTo(chartX + chartW - 10, baseY).stroke('#666');

  // Стовпчики та підписи
  data.forEach((d, i) => {
    const v = Number(d.value ?? 0);
    const barHeight = Math.round((v / maxVal) * (chartH - 2 * padding));
    const barX = chartX + padding + i * (barWidth + gap) + 10;
    const barY = baseY - barHeight;

    // Бар
    doc.rect(barX, barY, barWidth, barHeight).fill('#3b82f6');

    // Підписи
    doc.fillColor('#000').fontSize(9)
      .text(String(d.year ?? ''), barX, baseY + 5, { width: barWidth, align: 'center' })
      .text(v.toLocaleString('de-DE') + ' €', barX, barY - 14, { width: barWidth, align: 'center' });
  });
}