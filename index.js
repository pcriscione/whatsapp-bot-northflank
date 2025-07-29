import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
//import mysql from 'mysql2/promise';

import qrcodeTerminal from 'qrcode-terminal';
import QRCode from 'qrcode';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const inscripcionesSorteo = new Map(); // userId → { estado, teléfono }


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
  const telefono = msg.from.split('@')[0];
  const usuario = inscripcionesSorteo.get(msg.from);

  // Paso 1: Si el usuario está en proceso de sorteo, guardar el nombre
  if (usuario?.estado === 'esperando_nombre') {
    usuario.nombre = msg.body.trim();
    usuario.estado = 'completado';
    await msg.reply(`✅ ¡Gracias ${usuario.nombre}! Estás participando del sorteo con el número ${usuario.telefono}. ¡Mucha suerte! 🎉`);

try {
  const respuesta = await fetch('https://script.google.com/macros/s/AKfycbzO9HDR1zCSBdfBWomBF-LmUBm8amtRp6C1AmfTp5o4Q-40L-uXAaYwRnx0M46yW4F9dg/exec', {
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
