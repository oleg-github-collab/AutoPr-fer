// services/scraper.js - Web Scraping Service

const axios = require('axios');
const cheerio = require('cheerio');

class ScraperService {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        this.timeout = 10000; // 10 seconds
    }
    
    async scrapeListing(url) {
        try {
            // Determine the platform
            const platform = this.detectPlatform(url);
            
            if (!platform) {
                throw new Error('Nicht unterstützte Plattform');
            }
            
            // Fetch the page
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml',
                    'Accept-Language': 'de-DE,de;q=0.9',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Cache-Control': 'no-cache'
                },
                timeout: this.timeout,
                maxRedirects: 5
            });
            
            const $ = cheerio.load(response.data);
            
            // Extract data based on platform
            let listingData;
            switch (platform) {
                case 'mobile':
                    listingData = this.scrapeMobileDe($);
                    break;
                case 'autoscout':
                    listingData = this.scrapeAutoScout24($);
                    break;
                case 'kleinanzeigen':
                    listingData = this.scrapeKleinanzeigen($);
                    break;
                default:
                    listingData = this.scrapeGeneric($);
            }
            
            // Clean and format the data
            return this.formatListingData(listingData);
            
        } catch (error) {
            console.error('Scraping error:', error.message);
            
            // Return empty data on error
            return this.getEmptyListingData();
        }
    }
    
    detectPlatform(url) {
        if (url.includes('mobile.de')) return 'mobile';
        if (url.includes('autoscout24')) return 'autoscout';
        if (url.includes('kleinanzeigen.de')) return 'kleinanzeigen';
        return null;
    }
    
    scrapeMobileDe($) {
        const data = {
            title: '',
            price: '',
            description: '',
            details: {},
            features: []
        };
        
        // Title
        data.title = $('h1[data-testid="ad-title"]').text().trim() || 
                     $('h1.h2').text().trim() ||
                     $('.g-col-12 h1').text().trim();
        
        // Price
        data.price = $('.price-block .h3').text().trim() ||
                    $('[data-testid="prime-price"]').text().trim() ||
                    $('.price').first().text().trim();
        
        // Description
        data.description = $('.description-text').text().trim() ||
                          $('[data-testid="description"]').text().trim() ||
                          $('.g-col-12 .u-margin-bottom-12').text().trim();
        
        // Key details
        $('.key-features__item, [data-testid="key-feature"]').each((i, el) => {
            const text = $(el).text().trim();
            if (text.includes('km')) {
                data.details.mileage = text;
            } else if (text.match(/\d{2}\/\d{4}/)) {
                data.details.firstRegistration = text;
            } else if (text.includes('kW') || text.includes('PS')) {
                data.details.power = text;
            } else if (text.includes('Benzin') || text.includes('Diesel') || text.includes('Elektro')) {
                data.details.fuelType = text;
            }
        });
        
        // Additional features
        $('.features-list li, .equipment-list__item').each((i, el) => {
            const feature = $(el).text().trim();
            if (feature) {
                data.features.push(feature);
            }
        });
        
        // Technical data
        $('.technical-data dd, [data-testid="technical-data-value"]').each((i, el) => {
            const label = $(el).prev('dt').text().trim();
            const value = $(el).text().trim();
            
            if (label && value) {
                data.details[this.normalizeKey(label)] = value;
            }
        });
        
        return data;
    }
    
    scrapeAutoScout24($) {
        const data = {
            title: '',
            price: '',
            description: '',
            details: {},
            features: []
        };
        
        // Title
        data.title = $('h1').first().text().trim() ||
                    $('.cldt-detail-title').text().trim();
        
        // Price
        data.price = $('.cldt-stage-price').text().trim() ||
                    $('.cldt-price').text().trim();
        
        // Description
        data.description = $('.cldt-stage-description').text().trim() ||
                          $('.description').text().trim();
        
        // Key facts
        $('.cldt-stage-primary-keyfact').each((i, el) => {
            const text = $(el).text().trim();
            const label = $(el).find('.keyfact-label').text().trim();
            const value = $(el).find('.keyfact-value').text().trim();
            
            if (label && value) {
                data.details[this.normalizeKey(label)] = value;
            }
        });
        
        // Data table
        $('.cldt-data-section dt').each((i, el) => {
            const label = $(el).text().trim();
            const value = $(el).next('dd').text().trim();
            
            if (label && value) {
                data.details[this.normalizeKey(label)] = value;
            }
        });
        
        // Equipment
        $('.cldt-equipment-block li').each((i, el) => {
            const feature = $(el).text().trim();
            if (feature) {
                data.features.push(feature);
            }
        });
        
        return data;
    }
    
    scrapeKleinanzeigen($) {
        const data = {
            title: '',
            price: '',
            description: '',
            details: {},
            features: []
        };
        
        // Title
        data.title = $('#viewad-title').text().trim() ||
                    $('h1[data-testid="ad-detail-header"]').text().trim();
        
        // Price
        data.price = $('#viewad-price').text().trim() ||
                    $('[data-testid="ad-price"]').text().trim();
        
        // Description
        data.description = $('#viewad-description-text').text().trim() ||
                          $('[data-testid="ad-description"]').text().trim();
        
        // Details list
        $('.addetailslist--detail').each((i, el) => {
            const label = $(el).find('.addetailslist--detail--label').text().trim();
            const value = $(el).find('.addetailslist--detail--value').text().trim();
            
            if (label && value) {
                data.details[this.normalizeKey(label)] = value;
            }
        });
        
        // Attributes
        $('[data-testid="attribute"]').each((i, el) => {
            const text = $(el).text().trim();
            if (text) {
                const parts = text.split(':');
                if (parts.length === 2) {
                    data.details[this.normalizeKey(parts[0])] = parts[1].trim();
                }
            }
        });
        
        // Tags/Features
        $('.tag-list__item').each((i, el) => {
            const feature = $(el).text().trim();
            if (feature) {
                data.features.push(feature);
            }
        });
        
        return data;
    }
    
    scrapeGeneric($) {
        // Fallback generic scraping
        const data = {
            title: $('h1').first().text().trim(),
            price: '',
            description: '',
            details: {},
            features: []
        };
        
        // Try to find price
        const pricePatterns = [
            /(\d{1,3}[.,]?\d{3})\s*€/,
            /€\s*(\d{1,3}[.,]?\d{3})/,
            /EUR\s*(\d{1,3}[.,]?\d{3})/
        ];
        
        const bodyText = $('body').text();
        for (const pattern of pricePatterns) {
            const match = bodyText.match(pattern);
            if (match) {
                data.price = match[0];
                break;
            }
        }
        
        // Try to find description
        const descSelectors = [
            '.description',
            '[class*="description"]',
            '[id*="description"]',
            'article',
            '.content'
        ];
        
        for (const selector of descSelectors) {
            const desc = $(selector).first().text().trim();
            if (desc && desc.length > 50) {
                data.description = desc.substring(0, 1000);
                break;
            }
        }
        
        return data;
    }
    
    formatListingData(data) {
        // Combine all information into a formatted text
        let formatted = '';
        
        if (data.title) {
            formatted += `Titel: ${data.title}\n`;
        }
        
        if (data.price) {
            formatted += `Preis: ${data.price}\n`;
        }
        
        // Add details
        if (Object.keys(data.details).length > 0) {
            formatted += '\nDetails:\n';
            for (const [key, value] of Object.entries(data.details)) {
                formatted += `- ${this.humanizeKey(key)}: ${value}\n`;
            }
        }
        
        // Add description
        if (data.description) {
            formatted += `\nBeschreibung:\n${data.description}\n`;
        }
        
        // Add features
        if (data.features.length > 0) {
            formatted += '\nAusstattung:\n';
            data.features.slice(0, 20).forEach(feature => {
                formatted += `- ${feature}\n`;
            });
        }
        
        // Limit total length
        return formatted.substring(0, 3000);
    }
    
    normalizeKey(key) {
        return key
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');
    }
    
    humanizeKey(key) {
        return key
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }
    
    getEmptyListingData() {
        return 'Keine Daten vom Inserat verfügbar. Bitte laden Sie Fotos hoch für die Analyse.';
    }
}

module.exports = new ScraperService();