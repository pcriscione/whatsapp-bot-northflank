client.on('message', async msg => {
  const texto = msg.body.trim().toLowerCase();

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
}); // ← esta era la llave que faltaba
