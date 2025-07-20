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
  authStrategy: new LocalAuth(),
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
 switch (texto) {
  case '1':
    await msg.reply(`🍽️ Nuestro menú incluye:
- Ceviche clásico
- Lomo saltado
- Ají de gallina
- Suspiro limeño
¿Querés ver más detalles?`);
    break;

  case '2':
    await msg.reply(`⏰ Horarios:
- Lunes a viernes: 12:00 a 22:00
- Sábados y domingos: 13:00 a 23:00`);
    break;

  case '3':
    await msg.reply(`📅 Para hacer una reserva, por favor escribinos:
- Nombre
- Día y hora
- Número de personas

¡Te confirmaremos enseguida!`);
    break;

  default:
    await msg.reply(`❓ No entiendo tu mensaje. Por favor escribí:
1️⃣ para ver el menú  
2️⃣ para consultar los horarios  
3️⃣ para hacer una reserva`);
}


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
