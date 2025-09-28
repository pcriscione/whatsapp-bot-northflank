// --- WhatsApp Bot (Northflank-friendly) ----------------------------------
// • Instancia única por lockfile (evita dos pods usando la misma sesión)
// • Una sola inicialización (anti reentrada)
// • No publica/renueva QR cuando ya está CONNECTED
// • Reinicio limpio con /restart
// • Puppeteer "ligero" para 512 MB
// -------------------------------------------------------------------------

import fs from 'fs';
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

// ---- util de logs con PID (para detectar procesos concurrentes)
const PID = process.pid;
const log = (...args) => console.log(`[pid ${PID}]`, ...args);

// ---- Lock de sesión para instancia única (mismo volumen /wwebjs_auth)
const SESSION_DIR = '/wwebjs_auth';
const LOCK_PATH = `${SESSION_DIR}/.session.lock`;
function acquireLock() {
  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
    if (fs.existsSync(LOCK_PATH)) {
      // Si el lock es "reciente", asumimos que hay otra instancia viva
      const { mtimeMs } = fs.statSync(LOCK_PATH);
      if (Date.now() - mtimeMs < 120000) {
        log('🔒 Otra instancia ya usa la sesión. Saliendo.');
        process.exit(0);
      }
    }
    fs.writeFileSync(LOCK_PATH, String(PID));
    const cleanup = () => { try { fs.unlinkSync(LOCK_PATH); } catch {} };
    process.on('exit', cleanup);
    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });
    log('🔑 Lock de sesión adquirido.');
  } catch (e) {
    log('⚠️ No se pudo manejar el lock:', e?.message || e);
  }
}
acquireLock();

// ---- Estado app/bot
const inscripcionesSorteo = new Map();
const __cooldown = new Map();
let lastQRDataURL = null;           // QR mostrado por /qr
let client = null;                   // se recrea cuando haga falta
let initInProgress = false;          // guardia anti reentrada
let isReady = false;                 // para señales de salud

// ---- Fábrica de cliente (crea y conecta listeners una sola vez por instancia)
function buildClient() {
  const c = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),
    // (opcional) pin temporal si WA Web cambia y rompe wwebjs
    // webVersion: '2.2412.54',
    webVersionCache: {
      type: 'remote',
      remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/wa-version.json'
    },
    puppeteer: {
      headless: true,
      executablePath: puppeteer.executablePath(), // Chromium de puppeteer
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

  // ---- Listeners (UNA VEZ por instancia)
  c.on('qr', async (qr) => {
    if (isReady) { // evita publicar QR después de conectar
      log('🔇 QR ignorado (ya conectado)');
      return;
    }
    log('🟩 QR solicitado (cliente pidió autenticación)');
    try { qrcodeTerminal.generate(qr, { small: true }); } catch {}
    try {
      lastQRDataURL = await QRCode.toDataURL(qr);
      log('📷 QR generado y cacheado en memoria');
      try {
        await QRCode.toFile(path.join(__dirname, 'qr.png'), qr);
        log('💾 QR guardado como qr.png (opcional)');
      } catch (err) {
        log('⚠️ No se pudo escribir qr.png:', err?.message || err);
      }
    } catch (err) {
      log('❌ Error generando QR:', err);
    }
  });

  c.on('authenticated', async () => {
    const s = await c.getState().catch(() => 'NO_STATE');
    log('🔐 authenticated, state =', s);
  });

  c.on('ready', async () => {
    isReady = true;
    lastQRDataURL = null; // oculta el QR en /qr tras conectar
    const s = await c.getState().catch(() => 'NO_STATE');
    log('✅ Bot is ready! state =', s);
  });

  c.on('change_state', (s) => {
    isReady = (s === 'CONNECTED');
    log('🔁 change_state:', s);
  });

  c.on('auth_failure', (m) => log('❌ auth_failure:', m));

  c.on('disconnected', async (reason) => {
    log('⚠️ disconnected:', reason);
    isReady = false;
    try { await c.destroy(); } catch {}
    client = null; // forzamos nueva instancia
    // reintento suave tras 2 s (respeta guardia)
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

      try {
        const respuesta = await fetch('https://script.google.com/macros/s/AKfycbxkk6uC3K6mN6dbRWzviSLYViqN8ML3Vq0L_pQ5jm46eSfThviuaiOp7UGcEZx-mBLKPw/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nombre: usuario.nombre, telefono: usuario.telefono })
        });
        log('✅ Respuesta de Google Sheets:', await respuesta.text());
      } catch (error) {
        log('❌ Error al enviar datos a Google Sheets:', error);
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
  if (initInProgress) { log('⏳ init en curso, omito reintento'); return; }
  initInProgress = true;
  try {
    if (!client) client = buildClient();
    await client.initialize(); // jamás en paralelo
  } catch (e) {
    log('❌ Error en initialize():', e);
    try { await client?.destroy(); } catch {}
    client = null; // forzar nueva instancia en próximo intento
  } finally {
    initInProgress = false;
  }
}

// ---- Heartbeat (solo informa; no re-inicializa agresivo)
setInterval(async () => {
  const s = await client?.getState?.().catch(() => 'NO_STATE');
  log('🩺 heartbeat state:', s ?? 'null');
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
  if (isReady) return res.status(204).send(); // no mostrar QR si ya está conectado
  if (!lastQRDataURL) return res.status(503).send('⚠️ QR aún no generado. Recarga cada 2–3 segundos hasta que aparezca.');
  const img = Buffer.from(lastQRDataURL.split(',')[1], 'base64');
  res.set('Content-Type', 'image/png');
  res.send(img);
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, ready: isReady, qr: !!lastQRDataURL });
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
    log('♻️ Reiniciando cliente…');
    isReady = false;
    initInProgress = false;
    lastQRDataURL = null;
    try { await client?.destroy(); } catch {}
    client = null; // nueva instancia en ensureInit()
    await ensureInit();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(port, () => {
  log(`🌐 Servidor web escuchando en http://localhost:${port}`);
});
