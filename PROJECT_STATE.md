# Project State

## Objetivo actual
Mantener el bot estable y enterarse rápido cuando se cae (alertas push gratuitas).

## Estado
En producción en el VPS 64.176.18.3 (PM2, proceso `whatsapp-bot`, carpeta `/root/botwhatsapp`).
El 25/9/2026 apareció desvinculado; se re-vinculó ese día y quedaron deployadas las alertas vía ntfy.sh.

## Completado
- Pin de WhatsApp Web a `2.3000.1045601094-alpha` (incidente 20/9, ver INCIDENTS.md).
- Ignorar mensajes viejos al re-vincular; auth en `/qr` y `/restart`.
- Alertas push (desconexión, QR, auth_failure, colgado >10 min, recuperación).

## Decisiones
- No migrar a WhatsApp Cloud API oficial: el usuario no quiere pagar (25/9/2026).
- Alertas por ntfy.sh: gratis, sin cuenta ni credenciales. El QR nunca viaja por la alerta.

## Pendientes
1. Verificar que `RESTART_TOKEN` siga en el env de PM2 tras el restart con `--update-env`.
2. Averiguar por qué se desvinculó el 25/9 (grep de `disconnected|auth_failure|logout` en `pm2 logs`).
3. Revisar si el pin de versión de agosto está causando los logouts; evaluar actualizar whatsapp-web.js cuando haya fix upstream.
4. Portar filtro de mensajes viejos a v2 (si se retoma la migración).

## Problemas conocidos
- `whatsapp-web.js` no es oficial: WhatsApp puede desvincular la sesión en cualquier momento.
- El caso "CONNECTED pero ciego" (incidente 20/9) no lo detecta la alerta.
- No se puede SSH sin la contraseña de root (no hay clave en la PC del usuario).

## Archivos relevantes
- `index.js`, `INCIDENTS.md`, `README.md`

## Próximo paso
Confirmar `pm2 env 0` (RESTART_TOKEN y ALERT_NTFY_TOPIC) y revisar logs de la desvinculación del 25/9.
