# WhatsApp Bot — Alma (La Princesa y Ramona)

Bot de respuestas automáticas sobre `whatsapp-web.js` (WhatsApp Web no oficial vía Puppeteer).
Corre en el VPS de Vultr `64.176.18.3` con PM2 (proceso `whatsapp-bot`, carpeta `/root/botwhatsapp`).

## Correr local
```bash
npm install
node index.js        # escaneá el QR que aparece en la terminal
```
HTTP en el puerto 3000: `/health`, `/state`, `/qr` y `POST /restart` (estos dos con `Authorization: Bearer $RESTART_TOKEN`).

## Variables de entorno
| Variable | Uso |
|---|---|
| `RESTART_TOKEN` | Protege `/qr` y `/restart` (sin ella quedan bloqueados). |
| `ALERT_NTFY_TOPIC` | Topic de ntfy.sh para alertas push al teléfono. Sin ella solo se loguea. |
| `ALERT_NTFY_SERVER` | Opcional, default `https://ntfy.sh`. |
| `WWEBJS_WEB_VERSION` | Opcional, pisa la versión fijada de WhatsApp Web (ver `INCIDENTS.md`). |
| `STAFF_NOTIFY_TOKEN` | Token para leer la cola de avisos de reservas (Reserva Princesa). Sin él, los avisos están apagados. |
| `STAFF_GROUP_NAME` | Nombre exacto del grupo donde publicar los avisos (`Reservas`). Debe ser único. |
| `STAFF_GROUP_ID` | Opcional: ID del grupo (`...@g.us`), lo escribe el bot en el log la primera vez. Evita buscar por nombre. |
| `STAFF_NOTIFY_API` | Opcional: URL del backend de reservas (default: Cloud Run de producción). |

## Avisos de reservas al grupo del equipo
Cada 30 s el bot consulta por HTTPS la cola de avisos de Reserva Princesa y publica en el grupo
`STAFF_GROUP_NAME` cada reserva nueva, modificada o cancelada de La Princesa y Ramona. Apagado si
falta `STAFF_NOTIFY_TOKEN`. El número del bot tiene que estar en el grupo. El bot sigue sin responder
mensajes que lleguen de grupos. Detalle en `Reserva Princesa/DECISIONS.md`, "Fase 26".

## Alertas
El bot manda una notificación push (app **ntfy**, gratis, suscripta al topic) cuando:
se desconecta, pide QR (máx. 1 cada 30 min), falla la autenticación, o lleva más de 10 min sin conectar.
Avisa también cuando se recupera. El QR nunca se manda por la alerta.

## Reinicio diario preventivo
PM2 reinicia el bot todos los días a las 08:00 UTC (05:00 Chile en verano / 04:00 en invierno)
para liberar la memoria que acumula Chromium (VPS de 1 GB). Reutiliza la sesión, no pide QR.
Configurado con `pm2 restart whatsapp-bot --cron-restart="0 8 * * *" && pm2 save`.
Ver: `pm2 describe whatsapp-bot | grep -i cron`.

## Redeploy (VPS)
```bash
ssh root@64.176.18.3
cd /root/botwhatsapp
git pull
pm2 restart whatsapp-bot --update-env
pm2 save
```

## Re-vincular (cuando pide QR)
`pm2 logs whatsapp-bot --lines 0` y escanear desde el teléfono del bot: WhatsApp → Dispositivos vinculados → Vincular un dispositivo.

Historial de problemas y lecciones: `INCIDENTS.md`.
