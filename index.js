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

const inscripcionesSorteo = new Map();
const __cooldown = new Map();
let lastQRDataURL = null;

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '/wwebjs_auth' }),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/wa-version.json'
  },
  puppeteer: {
    headless: true,
    defaultViewport: { width: 800, height: 600, deviceScaleFactor: 1 },
    args: [
      '--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage',
      '--no-zygote','--disable-gpu','--disable-software-rasterizer',
      '--disable-extensions','--disable-background-networking',
      '--disable-default-apps','--no-first-run','--no-default-browser-check',
      '--mute-audio','--window-size=800,600',
      '--blink-settings=imagesEnabled=false'
    ]
  }
});


// ---------- listeners (una sola vez) ----------
client.on('qr', () => console.log('🟩 QR solicitado (cliente pidió autenticación)'));
client.on('authenticated', async () => {
  const s = await client.getState().catch(() => 'NO_STATE');
  console.log('🔐 authenticated, state =', s);
});
client.on('ready', async () => {
  const s = await client.getState().catch(() => 'NO_STATE');
  console.log('✅ Bot is ready! state =', s);
});
client.on('auth_failure', (m) => console.error('❌ auth_failure:', m));
client.on('disconnected', (r) => console.warn('⚠️ disconnected:', r));
client.on('change_state', (s) => console.log('🔁 change_state:', s));

// heartbeat único
setInterval(async () => {
  const s = await client.getState().catch(() => 'NO_STATE');
  console.log('🩺 heartbeat state:', s);
}, 10000);

// QR a memoria + opcional archivo
client.on('qr', async (qr) => {
  qrcodeTerminal.generate(qr, { small: true });
  try {
    lastQRDataURL = await QRCode.toDataURL(qr);
    console.log('📷 QR generado y cacheado en memoria');
    try {
      await QRCode.toFile(path.join(__dirname, 'qr.png'), qr);
      console.log('💾 QR guardado como qr.png (opcional)');
    } catch (err) {
      console.warn('⚠️ No se pudo escribir qr.png (no es crítico):', err?.message || err);
    }
  } catch (err) {
    console.error('❌ Error generando QR:', err);
  }
});

// mensajes
client.on('message', async (msg) => {
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

    try {
      const respuesta = await fetch('https://script.google.com/macros/s/AKfycbxkk6uC3K6mN6dbRWzviSLYViqN8ML3Vq0L_pQ5jm46eSfThviuaiOp7UGcEZx-mBLKPw/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: usuario.nombre, telefono: usuario.telefono }),
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

// init con guardia
let initInProgress = false;
async function ensureInit() {
  if (initInProgress) return;
  initInProgress = true;
  try {
    await client.initialize();
  } catch (e) {
    console.error('❌ Error en initialize():', e);
  } finally {
    initInProgress = false;
  }

  setTimeout(async () => {
    const s = await client.getState().catch(() => 'NO_STATE');
    if (s === 'NO_STATE' || s == null) {
      console.warn('⏱️ Sin estado tras 60s, reinicializando…');
      try { await client.destroy().catch(() => {}); } catch {}
      ensureInit();
    }
  }, 60000);
}
ensureInit();

// --------------------- Servidor Express ---------------------
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_, res) => res.send('🟢 Bot de WhatsApp activo en Northflank'));

app.get('/qr', (_, res) => {
  if (!lastQRDataURL) return res.status(503).send('⚠️ QR aún no generado. Recarga cada 2–3 segundos hasta que aparezca.');
  const img = Buffer.from(lastQRDataURL.split(',')[1], 'base64');
  res.set('Content-Type', 'image/png');
  res.send(img);
});

app.get('/health', (_, res) => res.json({ ok: true, ready: !!lastQRDataURL }));

app.get('/state', async (_, res) => {
  try {
    const state = await client.getState().catch(() => 'NO_STATE');
    res.json({ state });
  } catch (e) {
    res.status(500).json({ state: 'ERROR', error: String(e) });
  }
});

app.post('/restart', async (_, res) => {
  try {
    console.log('♻️ Reiniciando cliente…');
    await client.destroy().catch(() => {});
    await ensureInit();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(port, () => console.log(`🌐 Servidor web escuchando en http://localhost:${port}`));
