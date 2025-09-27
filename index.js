import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
//import mysql from 'mysql2/promise';
//pcriscione

import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const inscripcionesSorteo = new Map(); // userId → { estado, teléfono }
// Anti-duplicados por contacto (cooldown corto)
const __cooldown = new Map(); // chatId -> timestamp ms

// Cache en memoria del último QR (Data URL)
let lastQRDataURL = null;

import puppeteer from 'puppeteer'; // <= agrega este import arriba

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: '/wwebjs_auth' }),
  webVersionCache: {
    type: 'remote',
    remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/wa-version.json'
  },
  puppeteer: {
    headless: true,
    executablePath: puppeteer.executablePath(), // <= fuerza la ruta correcta de Chromium
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--no-zygote',
      '--window-size=1920,1080',
    ]
  }
});

// logs/diagnóstico
client.on('qr', () => console.log('🟩 QR solicitado (cliente pidió autenticación)'));
client.on('authenticated', async () => {
  const s = await client.getState().catch(()=> 'NO_STATE');
  console.log('🔐 authenticated, state =', s);
});
client.on('ready', async () => {
  const s = await client.getState().catch(()=> 'NO_STATE');
  console.log('✅ Bot is ready! state =', s);
});
client.on('auth_failure', (m) => console.error('❌ auth_failure:', m));
client.on('disconnected', (r) => console.warn('⚠️ disconnected:', r));
client.on('change_state', (s) => console.log('🔁 change_state:', s));

// pulso y auto-reinit si no levanta
setInterval(async () => {
  const s = await client.getState().catch(()=> 'NO_STATE');
  console.log('🩺 heartbeat state:', s);
}, 10000);

async function ensureInit() {
  try {
    await client.initialize();
  } catch (e) {
    console.error('❌ Error en initialize():', e);
  }
  // si a los 60s no hay estado, reintenta
  setTimeout(async () => {
    const s = await client.getState().catch(()=> 'NO_STATE');
    if (s === 'NO_STATE' || s == null) {
      console.warn('⏱️ Sin estado tras 60s, reinicializando…');
      try { await client.destroy().catch(()=>{}); } catch {}
      await ensureInit();
    }
  }, 60000);
}

ensureInit();



// ---- Logs de estado útiles para depurar ----
client.on('loading_screen', (percent, message) => {
  console.log(`⏳ loading_screen ${percent}% - ${message}`);
});
client.on('authenticated', () => {
  console.log('🔐 authenticated');
});
client.on('auth_failure', (m) => {
  console.error('❌ auth_failure:', m);
});
client.on('disconnected', (r) => {
  console.warn('⚠️ disconnected:', r);
});
client.on('change_state', (s) => {
  console.log('🔁 change_state:', s);
});

client.on('authenticated', async () => {
  const s = await client.getState().catch(()=> 'NO_STATE');
  console.log('🔐 authenticated, state =', s);
});

client.on('ready', async () => {
  const s = await client.getState().catch(()=> 'NO_STATE');
  console.log('✅ Bot is ready! state =', s);
});

client.on('change_state', (s) => console.log('🔁 change_state:', s));

// pulso de vida cada 10s
setInterval(async () => {
  const s = await client.getState().catch(()=> 'NO_STATE');
  console.log('🩺 heartbeat state:', s);
}, 10000);

// Evento: se genera el QR
client.on('qr', async qr => {
  console.log('🟩 Evento QR recibido (listo para escanear)');
  // QR ASCII en consola (por si necesitas)
  qrcodeTerminal.generate(qr, { small: true });

  try {
    // Guardamos el QR en memoria (evita depender del filesystem)
    lastQRDataURL = await QRCode.toDataURL(qr);
    console.log('📷 QR generado y cacheado en memoria');

    // Si quieres seguir guardando a archivo, lo dejamos como best-effort:
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

// Evento: bot listo
client.on('ready', () => {
  console.log('✅ Bot is ready!');
});

// Evento: mensaje entrante
client.on('message', async msg => {
  // --- Filtros anti-bucle / anti-duplicados base ---
  if (msg.fromMe) return;                      // evita responder a tus propios mensajes
  if (msg.from === 'status@broadcast') return; // ignora Status
  if (msg.from.endsWith('@g.us')) return;      // ignora grupos (si tu bot es 1:1)

  // --- Ventana de cooldown por contacto (mitiga duplicados por reconexiones) ---
  try {
    const now = Date.now();
    const last = __cooldown.get(msg.from) || 0;
    if (now - last < 1500) return; // 1.5s
    __cooldown.set(msg.from, now);
  } catch (e) {
    // no-op
  }

  const texto = (msg.body || '').trim().toLowerCase();
  const telefono = (msg.from || '').split('@')[0] || '';
  const usuario = inscripcionesSorteo.get(msg.from);

  // Paso 1: Si el usuario está en proceso de sorteo, guardar el nombre
  if (usuario?.estado === 'esperando_nombre') {
    usuario.nombre = (msg.body || '').trim();
    usuario.estado = 'completado';
    await msg.reply(`✅ ¡Gracias ${usuario.nombre}! Estás participando del sorteo con el número ${usuario.telefono}. ¡Mucha suerte! 🎉`);

    try {
      const respuesta = await fetch('https://script.google.com/macros/s/AKfycbxkk6uC3K6mN6dbRWzviSLYViqN8ML3Vq0L_pQ5jm46eSfThviuaiOp7UGcEZx-mBLKPw/exec', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: usuario.nombre,
          telefono: usuario.telefono
        })
      });
      const resultado = await respuesta.text();
      console.log('✅ Respuesta de Google Sheets:', resultado);
    } catch (error) {
      console.error('❌ Error al enviar datos a Google Sheets:', error);
    }

    // Mostramos nuevamente el menú
    await msg.reply(`👋 ¿Qué quieres hacer ahora?
1️⃣ Ver la carta  
2️⃣ Consultar horarios  
3️⃣ Hacer una reserva  
4️⃣ Conocer nuestra ubicación`);
    return;
  }

  // Paso 2: Responder opciones del menú
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

client.initialize();

// --------------------- Servidor Express ---------------------
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_, res) => {
  res.send('🟢 Bot de WhatsApp activo en Northflank');
});

// Sirve el QR directamente desde memoria (sin depender de qr.png)
app.get('/qr', (_, res) => {
  if (!lastQRDataURL) {
    return res
      .status(503)
      .send('⚠️ QR aún no generado. Recarga cada 2–3 segundos hasta que aparezca.');
  }
  const img = Buffer.from(lastQRDataURL.split(',')[1], 'base64');
  res.set('Content-Type', 'image/png');
  res.send(img);
});

// (Opcional) endpoint simple de salud
app.get('/health', (_, res) => {
  res.json({ ok: true, ready: !!lastQRDataURL });
});

// Estado en vivo del cliente de WhatsApp
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
    await client.destroy().catch(()=>{});
    await client.initialize();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/restart', async (_, res) => {
  try {
    console.log('♻️ Reiniciando cliente…');
    await client.destroy().catch(()=>{});
    await ensureInit();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.listen(port, () => {
  console.log(`🌐 Servidor web escuchando en http://localhost:${port}`);
});

