// utils/validator.js - Input Validation Utilities

class Validator {
    constructor() {
        this.urlPatterns = {
            mobile: /^https?:\/\/(www\.)?(suchen\.)?mobile\.de\/.+/i,
            autoscout: /^https?:\/\/(www\.)?autoscout24\.(de|at|ch)\/.+/i,
            kleinanzeigen: /^https?:\/\/(www\.)?kleinanzeigen\.de\/.+/i,
            general: /^https?:\/\/.+/i
        };
        
        this.maxFiles = 10;
        this.maxFileSize = 10 * 1024 * 1024; // 10MB
        this.allowedMimeTypes = [
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/webp',
            'image/heic',
            'image/heif'
        ];
    }
    
    async validateAnalysisRequest(request) {
        const errors = [];
        
        try {
            // Check if multipart
            if (!request.isMultipart()) {
                errors.push('Request muss multipart/form-data sein');
            }
            
            // Parse parts to validate
            const parts = request.parts();
            let hasPhotos = false;
            let hasUrl = false;
            let fileCount = 0;
            
            for await (const part of parts) {
                if (part.type === 'file' && part.fieldname === 'photos') {
                    hasPhotos = true;
                    fileCount++;
                    
                    // Validate file
                    const fileValidation = this.validateFile(part);
                    if (!fileValidation.valid) {
                        errors.push(...fileValidation.errors);
                    }
                } else if (part.fieldname === 'url' && part.value) {
                    hasUrl = true;
                    
                    // Validate URL
                    const urlValidation = this.validateUrl(part.value);
                    if (!urlValidation.valid) {
                        errors.push(...urlValidation.errors);
                    }
                } else if (part.fieldname === 'plan') {
                    // Validate plan
                    if (!['basic', 'premium'].includes(part.value)) {
                        errors.push('Ungültiger Tarif');
                    }
                }
            }
            
            // Check if at least one input provided
            if (!hasPhotos && !hasUrl) {
                errors.push('Bitte laden Sie Fotos hoch oder geben Sie eine URL ein');
            }
            
            // Check file count
            if (fileCount > this.maxFiles) {
                errors.push(`Maximal ${this.maxFiles} Dateien erlaubt`);
            }
            
            return {
                valid: errors.length === 0,
                errors: errors,
                message: errors.join(', ')
            };
            
        } catch (error) {
            return {
                valid: false,
                errors: ['Validierungsfehler: ' + error.message],
                message: 'Validierungsfehler: ' + error.message
            };
        }
    }
    
    validateFile(filePart) {
        const errors = [];
        
        // Check file size
        if (filePart.file && filePart.file._readableState) {
            const size = filePart.file._readableState.length || 0;
            if (size > this.maxFileSize) {
                errors.push(`Datei ${filePart.filename} ist zu groß (max. 10MB)`);
            }
        }
        
        // Check mime type
        if (filePart.mimetype && !this.allowedMimeTypes.includes(filePart.mimetype)) {
            errors.push(`Dateityp ${filePart.mimetype} nicht erlaubt`);
        }
        
        // Check filename
        if (!filePart.filename || filePart.filename.length === 0) {
            errors.push('Dateiname fehlt');
        } else {
            const validFilename = this.validateFilename(filePart.filename);
            if (!validFilename.valid) {
                errors.push(...validFilename.errors);
            }
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
    
    validateFilename(filename) {
        const errors = [];
        
        // Check for malicious patterns
        const dangerousPatterns = [
            /\.\./,  // Directory traversal
            /[<>:"|?*]/,  // Invalid characters
            /^\./, // Hidden files
            /\0/ // Null bytes
        ];
        
        for (const pattern of dangerousPatterns) {
            if (pattern.test(filename)) {
                errors.push('Ungültiger Dateiname');
                break;
            }
        }
        
        // Check extension
        const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0];
        const validExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'];
        
        if (!ext || !validExtensions.includes(ext)) {
            errors.push('Ungültige Dateierweiterung');
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
    
    validateUrl(url) {
        const errors = [];
        
        // Basic URL validation
        if (!url || typeof url !== 'string') {
            errors.push('URL fehlt');
            return { valid: false, errors };
        }
        
        // Trim and check length
        url = url.trim();
        if (url.length === 0) {
            errors.push('URL ist leer');
            return { valid: false, errors };
        }
        
        if (url.length > 2000) {
            errors.push('URL ist zu lang');
            return { valid: false, errors };
        }
        
        // Check if valid URL format
        try {
            const urlObj = new URL(url);
            
            // Check protocol
            if (!['http:', 'https:'].includes(urlObj.protocol)) {
                errors.push('Nur HTTP(S) URLs erlaubt');
            }
            
            // Check if supported platform
            const isSupported = Object.values(this.urlPatterns).some(pattern => pattern.test(url));
            if (!isSupported) {
                errors.push('Diese Webseite wird nicht unterstützt. Unterstützt: Mobile.de, AutoScout24, Kleinanzeigen');
            }
            
        } catch (error) {
            errors.push('Ungültige URL');
        }
        
        return {
            valid: errors.length === 0,
            errors: errors
        };
    }
    
    sanitizeInput(input) {
        if (typeof input !== 'string') return input;
        
        // Remove control characters
        let sanitized = input.replace(/[\x00-\x1F\x7F]/g, '');
        
        // Trim whitespace
        sanitized = sanitized.trim();
        
        // Limit length
        if (sanitized.length > 5000) {
            sanitized = sanitized.substring(0, 5000);
        }
        
        return sanitized;
    }
    
    validatePlan(plan) {
        const validPlans = ['basic', 'premium'];
        return {
            valid: validPlans.includes(plan),
            sanitized: validPlans.includes(plan) ? plan : 'basic'
        };
    }
    
    validateSessionId(sessionId) {
        // Stripe session IDs format
        const pattern = /^cs_[a-zA-Z0-9]{24,}$/;
        return pattern.test(sessionId);
    }
    
    validateEmail(email) {
        const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return pattern.test(email);
    }
    
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#x27;',
            '/': '&#x2F;'
        };
        
        return text.replace(/[&<>"'/]/g, char => map[char]);
    }
}

module.exports = new Validator();