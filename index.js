// --- WhatsApp Bot (Northflank-friendly) ---------------------
// - Una sola inicialización (anti reentrada)
// - Reinicio limpio con /restart
// - QR cacheado en memoria (+ opcional a archivo)
// - Puppeteer "ligero" para 512 MB
// ------------------------------------------------------------

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Estado app/bot
const inscripcionesSorteo = new Map();
const __cooldown = new Map();
let lastQRDataURL = null;

let client = null;          // se recrea cuando haga falta
let initInProgress = false; // guardia anti reentrada
let isReady = false;        // para señales de salud

// ---- Fábrica de cliente (crea y conecta listeners una sola vez por instancia)
function buildClient() {
  const c = new Client({
    authStrategy: new LocalAuth({ dataPath: '/wwebjs_auth' }),
    // (opcional) pin temporal de versión si WA Web cambia y rompe wwebjs:
    // webVersion: '2.2412.54',
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/wa-version.json'
    },
    puppeteer: {
      headless: true,
      executablePath: puppeteer.executablePath(), // usa Chromium de puppeteer
      defaultViewport: { width: 800, height: 600, deviceScaleFactor: 1 },
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--no-zygote', '--disable-gpu', '--disable-software-rasterizer',
        '--disable-extensions', '--disable-background-networking',
        '--disable-default-apps', '--no-first-run', '--no-default-browser-check',
        '--mute-audio', '--window-size=800,600',
        '--blink-settings=imagesEnabled=false'
      ]
    }
  });

  // ---- Listeners (UNA VEZ por instancia)
  c.on('qr', async (qr) => {
    console.log('🟩 QR solicitado (cliente pidió autenticación)');
    // QR en terminal (ASCII)
    try { qrcodeTerminal.generate(qr, { small: true }); } catch {}
    // QR a memoria (para /qr)
    try {
      lastQRDataURL = await QRCode.toDataURL(qr);
      console.log('📷 QR generado y cacheado en memoria');
      // opcional: guardar a archivo (no crítico si falla)
      try {
        await QRCode.toFile(path.join(__dirname, 'qr.png'), qr);
        console.log('💾 QR guardado como qr.png (opcional)');
      } catch (err) {
        console.warn('⚠️ No se pudo escribir qr.png:', err?.message || err);
      }
    } catch (err) {
      console.error('❌ Error generando QR:', err);
    }
  });

  c.on('authenticated', async () => {
    const s = await c.getState().catch(() => 'NO_STATE');
    console.log('🔐 authenticated, state =', s);
  });

  c.on('ready', async () => {
    isReady = true;
    const s = await c.getState().catch(() => 'NO_STATE');
    console.log('✅ Bot is ready! state =', s);
  });

  c.on('change_state', (s) => {
    isReady = (s === 'CONNECTED');
    console.log('🔁 change_state:', s);
  });

  c.on('auth_failure', (m) => console.error('❌ auth_failure:', m));

  c.on('disconnected', async (reason) => {
    console.warn('⚠️ disconnected:', reason);
    isReady = false;
    try { await c.destroy(); } catch {}
    client = null;              // FORZAMOS nueva instancia
    // Reintento suave tras 2 s (respeta guardia en ensureInit)
    setTimeout(() => ensureInit().catch(() => {}), 2000);
  });

  // ---- Mensajes (tu lógica)
  c.on('message', async (msg) => {
    if (msg.fromMe) return;
    if (msg.from === 'status@broadcast') return;
    if (msg.from.endsWith('@g.us')) return;

    try {
      const now = Date.now();
      const last = __cooldown.get(msg.from) || 0;
      if (now - last < 1500) return;
      __cooldown.set(msg.from, now);
    } catch {}

    const texto = (msg.body || '').trim().toLowerCase();
    const telefono = (msg.from || '').split('@')[0] || '';
    const usuario = inscripcionesSorteo.get(msg.from);

    if (usuario?.estado === 'esperando_nombre') {
      usuario.nombre = (msg.body || '').trim();
      usuario.estado = 'completado';
      await msg.reply(`✅ ¡Gracias ${usuario.nombre}! Estás participando del sorteo con el número ${usuario.telefono}. ¡Mucha suerte! 🎉`);

      // Envío a Google Sheets (Apps Script)
      try {
        const respuesta = await fetch('https://script.google.com/macros/s/AKfycbxkk6uC3K6mN6dbRWzviSLYViqN8ML3Vq0L_pQ5jm46eSfThviuaiOp7UGcEZx-mBLKPw/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: usuario.nombre, telefono: usuario.telefono })
        });
        console.log('✅ Respuesta de Google Sheets:', await respuesta.text());
      } catch (error) {
        console.error('❌ Error al enviar datos a Google Sheets:', error);
      }

      await msg.reply(`👋 ¿Qué quieres hacer ahora?
1️⃣ Ver la carta  
2️⃣ Consultar horarios  
3️⃣ Hacer una reserva  
4️⃣ Conocer nuestra ubicación`);
      return;
    }

    switch (texto) {
      case '1':
        await msg.reply(`🍽️ Ambas cartas: https://www.laprincesa.cl/carta`);
        break;
      case '2':
        await msg.reply(`⏰ Horarios:
- Lunes a viernes: 08:30 a 23:00
- Sábados: 09:00 a 23:00
- Domingos: 09:00 a 20:00`);
        break;
      case '3':
        await msg.reply(`📅 Para hacer una reserva: https://tinyurl.com/uaxzmbr6`);
        break;
      case '4':
        await msg.reply(`📍 Estamos ubicados en Paseo Colina Sur 14500, local 102 y 106. https://maps.app.goo.gl/rECKibRJ2Sz6RgfZA`);
        break;
      case '86':
        inscripcionesSorteo.set(msg.from, { estado: 'esperando_nombre', telefono });
        await msg.reply(`🎁 ¡Estás participando del sorteo!

Por favor respondé este mensaje con tu nombre completo para finalizar tu inscripción.

✅ Hemos registrado tu número: ${telefono}`);
        break;
      default:
        await msg.reply(`👋 ¡Hola! Soy Alma, bot de La Princesa y Ramona. Favor indícame qué quieres hacer:
1️⃣ Ver la carta  
2️⃣ Consultar horarios  
3️⃣ Hacer una reserva  
4️⃣ Conocer nuestra ubicación`);
    }
  });

  return c;
}

// ---- Inicialización con guardia (nunca en paralelo)
async function ensureInit() {
  if (initInProgress) {
    console.log('⏳ init en curso, omito reintento');
    return;
  }
  initInProgress = true;
  try {
    if (!client) client = buildClient();
    await client.initialize();              // <- jamás en paralelo
  } catch (e) {
    console.error('❌ Error en initialize():', e);
    try { await client?.destroy(); } catch {}
    client = null;                          // forzar instancia nueva en próximo intento
  } finally {
    initInProgress = false;
  }
}

// ---- Heartbeat (solo informa; no re-inicializa agresivo)
setInterval(async () => {
  const s = await client?.getState?.().catch(() => 'NO_STATE');
  console.log('🩺 heartbeat state:', s ?? 'null');
}, 10000);

// ---- Arranque
ensureInit().catch(() => {});

// --------------------- Servidor Express ---------------------
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_req, res) => {
  res.send('🟢 Bot de WhatsApp activo en Northflank');
});

app.get('/qr', (_req, res) => {
  if (!lastQRDataURL) return res.status(503).send('⚠️ QR aún no generado. Recarga cada 2–3 segundos hasta que aparezca.');
  const img = Buffer.from(lastQRDataURL.split(',')[1], 'base64');
  res.set('Content-Type', 'image/png');
  res.send(img);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, ready: !!lastQRDataURL });
});

app.get('/state', async (_req, res) => {
  try {
    const state = await client?.getState?.().catch(() => 'NO_STATE');
    res.json({ state: state ?? null });
  } catch (e) {
    res.status(500).json({ state: 'ERROR', error: String(e) });
  }
});

app.post('/restart', async (_req, res) => {
  try {
    console.log('♻️ Reiniciando cliente…');
    isReady = false;
    initInProgress = false;
    lastQRDataURL = null;
    try { await client?.destroy(); } catch {}
    client = null;                 // nueva instancia en ensureInit()
    await ensureInit();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(port, () => {
  console.log(`🌐 Servidor web escuchando en http://localhost:${port}`);
});
