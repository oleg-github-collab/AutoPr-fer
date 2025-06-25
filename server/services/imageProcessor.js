// services/imageProcessor.js - Image Processing Service

const sharp = require('sharp');
const crypto = require('crypto');

class ImageProcessor {
    constructor() {
        this.maxWidth = 1200;
        this.maxHeight = 1200;
        this.quality = 85;
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
    }
    
    async processImage(filePart) {
        try {
            // Get buffer from file part
            const buffer = await filePart.toBuffer();
            
            // Validate file
            this.validateImage(buffer, filePart.filename);
            
            // Get image metadata
            const metadata = await sharp(buffer).metadata();
            
            // Process image
            const processed = await this.optimizeImage(buffer, metadata);
            
            // Convert to base64 for API
            const base64 = processed.toString('base64');
            const dataUri = `data:image/jpeg;base64,${base64}`;
            
            return dataUri;
            
        } catch (error) {
            console.error('Image processing error:', error);
            throw new Error(`Bildverarbeitung fehlgeschlagen: ${error.message}`);
        }
    }
    
    validateImage(buffer, filename) {
        // Check file size
        if (buffer.length > this.maxFileSize) {
            throw new Error('Datei ist zu groß (max. 10MB)');
        }
        
        // Check file extension
        const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
        const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
        
        if (!ext || !validExtensions.includes(ext)) {
            throw new Error('Ungültiges Dateiformat. Erlaubt: JPG, PNG, WebP, HEIC');
        }
    }
    
    async optimizeImage(buffer, metadata) {
        let pipeline = sharp(buffer);
        
        // Auto-orient based on EXIF data
        pipeline = pipeline.rotate();
        
        // Resize if needed
        if (metadata.width > this.maxWidth || metadata.height > this.maxHeight) {
            pipeline = pipeline.resize(this.maxWidth, this.maxHeight, {
                fit: 'inside',
                withoutEnlargement: true
            });
        }
        
        // Convert to JPEG for consistency
        pipeline = pipeline.jpeg({
            quality: this.quality,
            progressive: true,
            mozjpeg: true // Better compression
        });
        
        // Apply auto-enhancements for better analysis
        pipeline = pipeline
            .normalize() // Enhance contrast
            .sharpen({ sigma: 0.5 }); // Slight sharpening
        
        return await pipeline.toBuffer();
    }
    
    async extractImageFeatures(buffer) {
        // Extract useful features for analysis
        const image = sharp(buffer);
        const metadata = await image.metadata();
        const stats = await image.stats();
        
        return {
            dimensions: {
                width: metadata.width,
                height: metadata.height
            },
            format: metadata.format,
            hasAlpha: metadata.hasAlpha,
            colorStats: {
                dominant: stats.dominant,
                entropy: stats.entropy,
                brightness: this.calculateBrightness(stats)
            },
            quality: this.assessImageQuality(metadata, stats)
        };
    }
    
    calculateBrightness(stats) {
        // Calculate average brightness across channels
        const channels = stats.channels;
        const brightness = channels.reduce((sum, channel) => sum + channel.mean, 0) / channels.length;
        return Math.round(brightness);
    }
    
    assessImageQuality(metadata, stats) {
        let quality = 100;
        
        // Penalize low resolution
        if (metadata.width < 800 || metadata.height < 600) {
            quality -= 20;
        }
        
        // Penalize very dark or very bright images
        const avgBrightness = this.calculateBrightness(stats);
        if (avgBrightness < 50 || avgBrightness > 200) {
            quality -= 15;
        }
        
        // Penalize low entropy (blurry/uniform images)
        const avgEntropy = stats.entropy;
        if (avgEntropy < 3) {
            quality -= 15;
        }
        
        return Math.max(0, quality);
    }
    
    async createThumbnail(buffer, size = 200) {
        return await sharp(buffer)
            .resize(size, size, {
                fit: 'cover',
                position: 'center'
            })
            .jpeg({ quality: 80 })
            .toBuffer();
    }
    
    async batchProcess(fileParts) {
        const processed = [];
        const errors = [];
        
        for (const [index, part] of fileParts.entries()) {
            try {
                const result = await this.processImage(part);
                processed.push({
                    index,
                    data: result,
                    filename: part.filename
                });
            } catch (error) {
                errors.push({
                    index,
                    filename: part.filename,
                    error: error.message
                });
            }
        }
        
        if (processed.length === 0 && errors.length > 0) {
            throw new Error('Keine Bilder konnten verarbeitet werden');
        }
        
        return {
            processed,
            errors,
            totalProcessed: processed.length,
            totalErrors: errors.length
        };
    }
    
    generateImageHash(buffer) {
        // Generate hash for duplicate detection
        return crypto
            .createHash('md5')
            .update(buffer)
            .digest('hex');
    }
    
    async detectCarInImage(buffer) {
        // Placeholder for future ML integration
        // Could integrate with TensorFlow.js or cloud vision APIs
        
        // For now, return basic heuristics
        const metadata = await sharp(buffer).metadata();
        const stats = await sharp(buffer).stats();
        
        // Simple heuristic: landscape images with good quality
        const isLandscape = metadata.width > metadata.height;
        const hasGoodQuality = this.assessImageQuality(metadata, stats) > 70;
        
        return {
            likelyContainsCar: isLandscape && hasGoodQuality,
            confidence: hasGoodQuality ? 0.7 : 0.3
        };
    }
}

module.exports = new ImageProcessor();