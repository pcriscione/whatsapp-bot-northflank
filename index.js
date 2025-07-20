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

// Crear cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// Generar QR en consola y guardar imagen
client.on('qr', async qr => {
  qrcodeTerminal.generate(qr, { small: true });
  await QRCode.toFile('./qr.png', qr);
});

// Cuando el bot esté listo
client.on('ready', () => {
  console.log('✅ Bot is ready!');
});

// Respuesta automática
client.on('message', async msg => {
  if (msg.body.toLowerCase() === 'hola') {
    await msg.reply('👋 ¡Hola! Soy el bot del restaurante. ¿Querés ver los horarios, menú o hacer una reserva?');
  }
});

client.initialize();

// Servidor Express para mostrar el estado y el QR
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
