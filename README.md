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

## Alertas
El bot manda una notificación push (app **ntfy**, gratis, suscripta al topic) cuando:
se desconecta, pide QR (máx. 1 cada 30 min), falla la autenticación, o lleva más de 10 min sin conectar.
Avisa también cuando se recupera. El QR nunca se manda por la alerta.

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
