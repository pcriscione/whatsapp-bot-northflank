import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Inicializar cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: '/wwebjs_auth'
  }),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// Evento: se genera el QR
client.on('qr', async qr => {
  qrcodeTerminal.generate(qr, { small: true });
  try {
    await QRCode.toFile(path.join(__dirname, 'qr.png'), qr);
    console.log('📷 QR guardado como qr.png');
  } catch (err) {
    console.error('❌ Error guardando el QR:', err);
  }
});

// Evento: bot listo
client.on('ready', () => {
  console.log('✅ Bot is ready!');
});

// Evento: mensaje entrante
client.on('message', async msg => {
  if (msg.body.toLowerCase() === 'hola') {
    await msg.reply('👋 ¡Hola! Soy el bot del restaurante. ¿Quieres ver los horarios, menú o hacer una reserva?');
  }
});

client.initialize();

// Servidor Express para el QR y status
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_, res) => {
  res.send('🟢 Bot de WhatsApp activo en Northflank');
});

app.get('/qr', (req, res) => {
  const qrPath = path.join(__dirname, 'qr.png');
  if (fs.existsSync(qrPath)) {
    res.sendFile(qrPath);
  } else {
    res.send('⚠️ QR aún no generado. Esperá unos segundos...');
  }
});

app.listen(port, () => {
  console.log(`🌐 Servidor web escuchando en http://localhost:${port}`);
});
