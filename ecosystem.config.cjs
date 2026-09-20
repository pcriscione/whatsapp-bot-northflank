// Un proceso PM2 por restaurante (mismo código, distinto --tenant).
// "la-princesa" queda comentado a propósito: no correrlo hasta el Paso 7 (corte
// controlado), y solo después de validar todo con el tenant "test".
module.exports = {
  apps: [
    {
      name: "whatsapp-bot-test",
      script: "run.js",
      args: "--tenant=test",
    },
    // {
    //   name: "whatsapp-bot-la-princesa",
    //   script: "run.js",
    //   args: "--tenant=la-princesa",
    // },
  ],
};
