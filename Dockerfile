# Imagen estable con Debian bullseye
FROM node:20-bullseye
ARG BUILD_REV=5

# ---- Dependencias del sistema para Chromium (Puppeteer) ----
RUN apt-get update && apt-get install -y \
  ca-certificates fonts-liberation \
  libasound2 libatk1.0-0 libatk-bridge2.0-0 \
  libc6 libcairo2 libcups2 libdbus-1-3 libdrm2 \
  libexpat1 libgbm1 libglib2.0-0 libgtk-3-0 \
  libnspr4 libnss3 libpango-1.0-0 libx11-6 libx11-xcb1 \
  libxcomposite1 libxdamage1 libxext6 libxfixes3 libxkbcommon0 \
  libxrandr2 xdg-utils wget gnupg && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos manifest y usamos EXACTAMENTE el lockfile
COPY package*.json ./
RUN npm install --omit=dev

# Copiamos el resto del proyecto
COPY . .

# Arranque único (evita dobles starts)
CMD ["node","index.js"]
