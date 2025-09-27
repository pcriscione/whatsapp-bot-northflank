# Imagen estable con Debian bullseye
FROM node:20-bullseye
ARG BUILD_REV=6

ENV NODE_ENV=production \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

# ---- Dependencias del sistema para Chromium (Puppeteer) ----
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates fonts-liberation libfontconfig1 \
  libasound2 libatk1.0-0 libatk-bridge2.0-0 \
  libc6 libcairo2 libcups2 libdbus-1-3 libdrm2 \
  libexpat1 libgbm1 libglib2.0-0 libgtk-3-0 \
  libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 \
  libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 \
  libxdamage1 libxext6 libxfixes3 libxkbcommon0 libxrandr2 \
  libxrender1 libxss1 libxtst6 libxi6 libxshmfence1 \
  libstdc++6 libgcc-s1 xdg-utils wget gnupg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiamos manifests primero para aprovechar la cache de capas
COPY package*.json ./

# Usamos npm install (no CI) para permitir ^ (auto-fixes) y evitar errores de lock desincronizado
RUN npm install --omit=dev --no-audit --no-fund

# Copiamos el resto del proyecto
COPY . .

# (Opcional) expone el puerto para inspección local
EXPOSE 3000

# (Opcional) healthcheck simple del servicio HTTP
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# Arranque
CMD ["node","index.js"]
