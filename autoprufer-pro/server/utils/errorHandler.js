// utils/errorHandler.js - Error Handling Utilities

class ErrorHandler {
    constructor() {
        this.isDevelopment = process.env.NODE_ENV === 'development';
    }
    
    // Custom error classes
    static ValidationError = class extends Error {
        constructor(message, field = null) {
            super(message);
            this.name = 'ValidationError';
            this.statusCode = 400;
            this.field = field;
        }
    };
    
    static AuthenticationError = class extends Error {
        constructor(message = 'Authentifizierung fehlgeschlagen') {
            super(message);
            this.name = 'AuthenticationError';
            this.statusCode = 401;
        }
    };
    
    static AuthorizationError = class extends Error {
        constructor(message = 'Nicht autorisiert') {
            super(message);
            this.name = 'AuthorizationError';
            this.statusCode = 403;
        }
    };
    
    static NotFoundError = class extends Error {
        constructor(resource = 'Ressource') {
            super(`${resource} nicht gefunden`);
            this.name = 'NotFoundError';
            this.statusCode = 404;
        }
    };
    
    static ConflictError = class extends Error {
        constructor(message = 'Konflikt bei der Verarbeitung') {
            super(message);
            this.name = 'ConflictError';
            this.statusCode = 409;
        }
    };
    
    static RateLimitError = class extends Error {
        constructor(message = 'Zu viele Anfragen') {
            super(message);
            this.name = 'RateLimitError';
            this.statusCode = 429;
        }
    };
    
    static ExternalServiceError = class extends Error {
        constructor(service, originalError = null) {
            super(`Fehler beim Zugriff auf ${service}`);
            this.name = 'ExternalServiceError';
            this.statusCode = 502;
            this.service = service;
            this.originalError = originalError;
        }
    };
    
    // Format error for API response
    formatError(error) {
        const formatted = {
            error: true,
            message: this.getUserFriendlyMessage(error),
            statusCode: error.statusCode || 500,
            timestamp: new Date().toISOString()
        };
        
        // Add error code for client handling
        if (error.name) {
            formatted.code = this.getErrorCode(error.name);
        }
        
        // Add field for validation errors
        if (error.field) {
            formatted.field = error.field;
        }
        
        // Add debug info in development
        if (this.isDevelopment) {
            formatted.debug = {
                name: error.name,
                stack: error.stack,
                originalError: error.originalError
            };
        }
        
        return formatted;
    }
    
    // Get user-friendly error message
    getUserFriendlyMessage(error) {
        // Custom error messages
        const messageMap = {
            'ValidationError': error.message || 'Ungültige Eingabe',
            'AuthenticationError': 'Bitte melden Sie sich an',
            'AuthorizationError': 'Sie haben keine Berechtigung für diese Aktion',
            'NotFoundError': error.message || 'Die angeforderte Ressource wurde nicht gefunden',
            'ConflictError': error.message || 'Es ist ein Konflikt aufgetreten',
            'RateLimitError': 'Sie haben zu viele Anfragen gesendet. Bitte versuchen Sie es später erneut',
            'ExternalServiceError': `Der Service ist momentan nicht verfügbar. Bitte versuchen Sie es später erneut`,
            'PaymentError': 'Die Zahlung konnte nicht verarbeitet werden',
            'AnalysisError': 'Die Analyse konnte nicht durchgeführt werden',
            'NetworkError': 'Netzwerkfehler. Bitte überprüfen Sie Ihre Internetverbindung'
        };
        
        // Check for specific error types
        if (error.name && messageMap[error.name]) {
            return messageMap[error.name];
        }
        
        // Check for specific error messages
        if (error.message) {
            // Stripe errors
            if (error.message.includes('Stripe')) {
                return 'Fehler bei der Zahlungsverarbeitung';
            }
            
            // OpenAI errors
            if (error.message.includes('OpenAI') || error.message.includes('GPT')) {
                return 'KI-Analyse temporär nicht verfügbar';
            }
            
            // File errors
            if (error.message.includes('File') || error.message.includes('Upload')) {
                return 'Fehler beim Datei-Upload';
            }
        }
        
        // Generic message for production
        if (!this.isDevelopment) {
            return 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es später erneut';
        }
        
        // Return original message in development
        return error.message || 'Unbekannter Fehler';
    }
    
    // Get error code for client
    getErrorCode(errorName) {
        const codeMap = {
            'ValidationError': 'VALIDATION_ERROR',
            'AuthenticationError': 'AUTH_ERROR',
            'AuthorizationError': 'FORBIDDEN',
            'NotFoundError': 'NOT_FOUND',
            'ConflictError': 'CONFLICT',
            'RateLimitError': 'RATE_LIMIT',
            'ExternalServiceError': 'SERVICE_ERROR',
            'PaymentError': 'PAYMENT_ERROR',
            'AnalysisError': 'ANALYSIS_ERROR'
        };
        
        return codeMap[errorName] || 'UNKNOWN_ERROR';
    }
    
    // Log error with context
    logError(error, context = {}) {
        const errorInfo = {
            timestamp: new Date().toISOString(),
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                statusCode: error.statusCode
            },
            context: context
        };
        
        // Log to console in development
        if (this.isDevelopment) {
            console.error('Error:', errorInfo);
        }
        
        // In production, you would send to logging service
        // e.g., Sentry, LogRocket, etc.
        if (process.env.SENTRY_DSN) {
            // Sentry.captureException(error, { extra: context });
        }
        
        return errorInfo;
    }
    
    // Handle async route errors
    asyncHandler(fn) {
        return (request, reply) => {
            Promise.resolve(fn(request, reply)).catch(error => {
                this.handleError(error, reply);
            });
        };
    }
    
    // Central error handling
    handleError(error, reply) {
        // Log the error
        this.logError(error);
        
        // Format and send response
        const formatted = this.formatError(error);
        
        reply
            .code(formatted.statusCode)
            .type('application/json')
            .send(formatted);
    }
    
    // Validate required environment variables
    validateEnvironment() {
        const required = [
            'NODE_ENV',
            'PORT',
            'OPENAI_API_KEY',
            'STRIPE_SECRET_KEY',
            'BASE_URL'
        ];
        
        const missing = required.filter(key => !process.env[key]);
        
        if (missing.length > 0) {
            throw new Error(
                `Missing required environment variables: ${missing.join(', ')}\n` +
                `Please check your .env file`
            );
        }
    }
    
    // Create error from Stripe error
    fromStripeError(stripeError) {
        const error = new Error(stripeError.message);
        error.name = 'PaymentError';
        error.statusCode = this.getStripeStatusCode(stripeError.type);
        error.originalError = stripeError;
        return error;
    }
    
    // Get status code from Stripe error type
    getStripeStatusCode(type) {
        const statusMap = {
            'card_error': 400,
            'invalid_request_error': 400,
            'authentication_error': 401,
            'rate_limit_error': 429,
            'validation_error': 400,
            'api_error': 500
        };
        
        return statusMap[type] || 500;
    }
    
    // Create error from OpenAI error
    fromOpenAIError(openaiError) {
        const error = new Error('KI-Analyse fehlgeschlagen');
        error.name = 'AnalysisError';
        error.statusCode = 500;
        error.originalError = openaiError;
        
        // Check for rate limit
        if (openaiError.status === 429) {
            error.message = 'KI-Service überlastet. Bitte versuchen Sie es in wenigen Minuten erneut';
            error.statusCode = 503;
        }
        
        return error;
    }
}

// Export singleton instance
module.exports = new ErrorHandler();