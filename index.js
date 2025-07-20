import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import QRCode from 'qrcode';
import fs from 'fs';

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => {
  QRCode.toFile('./qr.png', qr, function (err) {
    if (err) throw err;
    console.log('✅ QR guardado como qr.png');
  });
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

import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (_, res) => {
  res.send('🟢 Bot de WhatsApp activo en Northflank');
});

app.listen(port, () => {
  console.log(`🌐 Servidor web escuchando en http://localhost:${port}`);
});

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Endpoint para servir el QR como imagen
app.get('/qr', (req, res) => {
  const qrPath = path.join(__dirname, 'qr.png');
  if (fs.existsSync(qrPath)) {
    res.sendFile(qrPath);
  } else {
    res.send('⚠️ QR aún no generado. Esperá unos segundos...');
  }
});
