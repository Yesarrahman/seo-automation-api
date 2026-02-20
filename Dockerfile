# Use official Node.js 18 slim image
FROM node:18-slim

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

# Copy package files first (for Docker layer caching)
COPY package*.json ./

# Install production dependencies
# PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false ensures Chromium is downloaded
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=false
RUN npm install --production

# Copy application code
COPY index.js ./

# Expose port
EXPOSE 3000

# Start the server
CMD ["node", "index.js"]
