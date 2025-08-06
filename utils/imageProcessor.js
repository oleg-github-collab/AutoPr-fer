const sharp = require('sharp');
const fs = require('fs').promises;

async function processImage(imagePath) {
  try {
    // Resize and optimize image for API
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

module.exports = { processImage };