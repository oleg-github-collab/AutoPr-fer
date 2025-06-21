#!/bin/bash

mkdir -p autoprufer-pro/public/css
mkdir -p autoprufer-pro/public/js
mkdir -p autoprufer-pro/server/routes
mkdir -p autoprufer-pro/server/services
mkdir -p autoprufer-pro/server/utils

touch autoprufer-pro/public/index.html
touch autoprufer-pro/public/css/app.css
touch autoprufer-pro/public/js/app.js
touch autoprufer-pro/public/manifest.json
touch autoprufer-pro/public/sw.js

touch autoprufer-pro/server/index.js
touch autoprufer-pro/server/routes/analysis.js
touch autoprufer-pro/server/routes/payment.js
touch autoprufer-pro/server/routes/health.js

touch autoprufer-pro/server/services/openai.js
touch autoprufer-pro/server/services/scraper.js
touch autoprufer-pro/server/services/imageProcessor.js

touch autoprufer-pro/server/utils/validator.js
touch autoprufer-pro/server/utils/errorHandler.js

touch autoprufer-pro/.env.example
touch autoprufer-pro/.gitignore
touch autoprufer-pro/package.json
touch autoprufer-pro/README.md

echo "Структуру створено успішно!"
