const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

async function generatePDF(vehicleData, analysisText) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, left: 50, right: 50, bottom: 50 }
    });
    
    const filename = `analyse-${Date.now()}.pdf`;
    const filepath = path.join('temp', filename);
    const stream = fs.createWriteStream(filepath);
    
    doc.pipe(stream);
    
    // Header
    doc.fontSize(24)
       .fillColor('#1e40af')
       .text('Autoprüfer', { align: 'center' });
    
    doc.fontSize(18)
       .fillColor('#000')
       .text('Fahrzeuganalyse Premium', { align: 'center' });
    
    doc.moveDown();
    
    // Vehicle Info Box
    doc.fontSize(14)
       .fillColor('#1e40af')
       .text('Fahrzeugdaten', { underline: true });
    
    doc.fontSize(11)
       .fillColor('#000')
       .text(`Fahrzeug: ${vehicleData.brand} ${vehicleData.model}`)
       .text(`Baujahr: ${vehicleData.year}`)
       .text(`Kilometerstand: ${vehicleData.mileage} km`)
       .text(`Preis: ${vehicleData.price} €`)
       .text(`Standort: ${vehicleData.city}`);
    
    if (vehicleData.vin) {
      doc.text(`VIN: ${vehicleData.vin}`);
    }
    
    doc.moveDown();
    
    // Analysis
    doc.fontSize(14)
       .fillColor('#1e40af')
       .text('Detaillierte Analyse', { underline: true });
    
    doc.moveDown();
    
    // Split analysis text into sections
    const sections = analysisText.split('##').filter(s => s.trim());
    
    sections.forEach(section => {
      const lines = section.trim().split('\n');
      const title = lines[0];
      const content = lines.slice(1).join('\n');
      
      if (title) {
        doc.fontSize(12)
           .fillColor('#1e40af')
           .text(title.trim(), { underline: true });
        
        doc.fontSize(10)
           .fillColor('#000')
           .text(content.trim(), { align: 'justify' });
        
        doc.moveDown();
      }
    });
    
    // Footer
    doc.fontSize(8)
       .fillColor('#666')
       .text(`Erstellt am: ${new Date().toLocaleDateString('de-DE')}`, 50, 750)
       .text('© 2024 Autoprüfer - KI-gestützte Fahrzeuganalyse', { align: 'center' });
    
    doc.end();
    
    stream.on('finish', () => {
      resolve(filepath);
    });
    
    stream.on('error', reject);
  });
}

module.exports = { generatePDF };