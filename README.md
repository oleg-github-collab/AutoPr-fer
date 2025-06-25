# 🚗 AutoPrüfer Pro

> KI-gestützte Fahrzeuganalyse für den deutschen Automarkt - Mobile First PWA

![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)

## 🎯 Features

- **📱 Mobile First Design** - Optimiert für Smartphones, funktioniert wie eine native App
- **🤖 GPT-4o Integration** - Modernste KI-Analyse in unter 60 Sekunden
- **📊 Premium Analyse** - Detaillierte Grafiken und Vergleich mit 3 Alternativen
- **💳 Stripe Integration** - Sichere Zahlungsabwicklung
- **🌐 PWA Support** - Offline-fähig mit Service Worker
- **🇩🇪 GDPR Compliant** - Vollständig konform mit deutschen Datenschutzgesetzen

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.0.0
- OpenAI API Key
- Stripe Account
- Domain mit SSL

### Installation

```bash
# Clone repository
git clone https://github.com/autoprufer/autoprufer-pro.git
cd autoprufer-pro

# Install dependencies
npm install

# Setup environment
cp .env.example .env
# Edit .env with your keys

# Start development
npm run dev

# Production
npm start
```

### Environment Variables

```env
# Server
PORT=3000
NODE_ENV=production
BASE_URL=https://autoprufer.de

# APIs
OPENAI_API_KEY=sk-...
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Optional
SENTRY_DSN=https://...
ANALYTICS_ID=G-...
```

## 📁 Project Structure

```
autoprufer-pro/
├── public/              # Static files & PWA assets
│   ├── index.html      # Main app
│   ├── manifest.json   # PWA manifest
│   ├── sw.js          # Service Worker
│   └── css/           # Compiled styles
├── server/             # Backend
│   ├── index.js       # Main server
│   ├── routes/        # API routes
│   ├── services/      # Business logic
│   └── utils/         # Helpers
├── src/               # Source files
│   ├── js/           # Frontend JS
│   └── css/          # Source styles
└── docs/             # Documentation
```

## 🎨 Key Features Explained

### 1. Mobile-First UX

- Native-like navigation with screen transitions
- Touch-optimized controls
- Offline support via Service Worker
- Share API integration
- Camera/gallery integration

### 2. Analysis Flow

```
Upload → Plan Selection → Payment → Analysis → Results
```

- **Basic (4.99€)**: Quick analysis with key risks
- **Premium (16.99€)**: 40+ parameters + competitor comparison

### 3. Premium Competitor Table

Automatically compares with 3 similar vehicles:
- Price comparison
- Fuel consumption
- Insurance costs
- Reliability rating
- Recommendation score

### 4. Interactive Charts

- Monthly cost breakdown (Doughnut)
- Depreciation curve (Line)
- Technical ratings (Progress bars)
- Animated statistics

## 🛠️ API Endpoints

```
POST /api/analyze
  - Multipart: photos[], url, plan
  - Returns: Analysis result

POST /api/create-checkout
  - Body: { plan }
  - Returns: Stripe session

GET /api/health
  - Returns: Server status
```

## 🚢 Deployment

### DigitalOcean (Recommended)

```bash
# 1. Create Droplet (Ubuntu 22.04, Frankfurt)
# 2. SSH into server
ssh root@your-ip

# 3. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
apt install -y nodejs

# 4. Clone and setup
cd /var/www
git clone https://github.com/your-repo.git autoprufer
cd autoprufer
npm install --production

# 5. Setup PM2
npm install -g pm2
pm2 start server/index.js --name autoprufer
pm2 save
pm2 startup

# 6. Setup Nginx (see docs/nginx.conf)
# 7. SSL with Certbot
# 8. Configure domain DNS
```

### Alternative: Docker

```bash
docker build -t autoprufer .
docker run -p 3000:3000 --env-file .env autoprufer
```

## 💰 Business Model

- **Volume**: 100 analyses/day = 500-1700€ daily revenue
- **Costs**: ~6€/month hosting + API costs
- **Profit margin**: ~95%

### Scaling Ideas

1. **B2B API** - For dealerships
2. **Subscription** - Monthly unlimited
3. **White Label** - Custom branding
4. **Additional Services** - Insurance comparison, financing

## 🧪 Testing

```bash
# Run tests
npm test

# Lint code
npm run lint

# Test PWA
npx lighthouse https://localhost:3000
```

## 📊 Analytics & Monitoring

- Google Analytics 4 for user tracking
- Sentry for error monitoring
- Custom events for conversion tracking
- PM2 metrics for server monitoring

## 🔒 Security

- HTTPS only
- Rate limiting on API
- Input validation
- XSS protection
- CORS configured
- Helmet.js for headers

## 🤝 Contributing

1. Fork repository
2. Create feature branch
3. Commit changes
4. Push to branch
5. Open Pull Request

## 📄 License

MIT License - see LICENSE file

## 🆘 Support

- Email: support@autoprufer.de
- Documentation: /docs
- Issues: GitHub Issues

---

Built with ❤️ for the German automotive market