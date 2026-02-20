# Node 20 required by cheerio@1.x and puppeteer@24.x
FROM node:20-slim

# Install Chromium dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libxss1 \
    libxtst6 \
    libgbm1 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first (Docker layer caching)
COPY package*.json ./

# Install production dependencies
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
RUN npm install --production

# Copy application code
COPY index.js ./

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "index.js"]
