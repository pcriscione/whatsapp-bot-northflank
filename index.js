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
  const texto = msg.body.trim().toLowerCase();

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

    default:
      await msg.reply(`👋 ¡Hola! Soy Alma, bot de La Princesa y Ramona. Favor indícame qué quieres hacer:
1️⃣ Ver la carta
2️⃣ Consultar horarios
3️⃣ Hacer una reserva
4️⃣ Ubicación de los restaurantes      
Escribí el número de la opción que quieras.`);
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
