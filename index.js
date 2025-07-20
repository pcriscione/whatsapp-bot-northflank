import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;

import QRCode from 'qrcode';
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Inicializar cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', async qr => {
  qrcode.generate(qr, { small: true }); // Muestra en consola
  await QRCode.toFile('./qr.png', qr);  // Guarda como imagen
});

client.on('ready', () => {
  console.log('✅ Bot is ready!');
});

client.on('message', async msg => {
  if (msg.body.toLowerCase() === 'hola') {
    await msg.reply('👋 ¡Hola! Soy el bot del restaurante. ¿Querés ver los horarios, menú o hacer una reserva?');
  }
});

client.initialize();

// Inicializar servidor Express
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_, res) => {
  res.send('🟢 Bot de WhatsApp activo en Northflank');
});

// Ruta para ver el QR
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
