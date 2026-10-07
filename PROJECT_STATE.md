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
- Auto-recuperación cuando Chromium muere (`NO_STATE` 3 min => re-init), deployada 27/9.
- Reinicio diario preventivo por PM2 a las 08:00 UTC (27/9).
- 28/9: sin pin de WA Web + whatsapp-web.js desde GitHub commit 58ddf15 (fix `$1`), probado en producción (el usuario no tenía número de prueba). Re-vinculado y respondiendo. Rollback: `WWEBJS_WEB_VERSION=2.3000.1045601094-alpha` + re-vincular.

## Decisiones
- No migrar a WhatsApp Cloud API oficial: el usuario no quiere pagar (25/9/2026).
- Alertas por ntfy.sh: gratis, sin cuenta ni credenciales. El QR nunca viaja por la alerta.

## Pendientes
- 7/10: opción 3 (reservas) ahora responde `https://reservas.laprincesa.cl/wa` (302 a `/r/la-princesa?source=whatsapp`, regla en `_redirects` de Reserva Princesa, ya en producción). En `main`, falta `git pull` + `pm2 restart` en el VPS.
- Avisos de reservas al grupo "Reservas": ACTIVOS desde el 29/9 01:11 UTC (primer aviso real en
  17 s). Env PM2: `STAFF_NOTIFY_TOKEN`, `STAFF_GROUP_NAME` (además de `RESTART_TOKEN`,
  `TEST_RESTART_TOKEN`, `ALERT_NTFY_TOPIC`, que se conservaron al usar `--update-env`). Pendiente:
  fijar `STAFF_GROUP_ID` con el ID que el bot escribe en el log ("👥 Grupo de avisos encontrado").
0. Monitorear si el bot se mantiene vinculado sin pin (deploy 28/9 13:07 UTC). Si vuelve a LOGOUT, la hipótesis del pin no era la causa. Cuando whatsapp-web.js publique >1.34.7 en npm, volver a versión de npm.
1. Verificar que `RESTART_TOKEN` siga en el env de PM2 tras el restart con `--update-env`.
2. Averiguar por qué se desvinculó el 25/9 (grep de `disconnected|auth_failure|logout` en `pm2 logs`).
3. Revisar si el pin de versión de agosto está causando los logouts; evaluar actualizar whatsapp-web.js cuando haya fix upstream.
4. Portar filtro de mensajes viejos a v2 (si se retoma la migración).

5. Mejorar el bot (textos, imágenes, entender texto libre, pausa con humano). El usuario trae referencias visuales; restricción: gratis, sin API oficial (sin botones/listas interactivas).

## Problemas conocidos
- `whatsapp-web.js` no es oficial: WhatsApp puede desvincular la sesión en cualquier momento.
- El caso "CONNECTED pero ciego" (incidente 20/9) no lo detecta la alerta.
- Causa de la muerte de Chromium del 27/9 sin confirmar (sospecha: memoria del VPS).
- No se puede SSH sin la contraseña de root (no hay clave en la PC del usuario).

## Archivos relevantes
- `index.js`, `INCIDENTS.md`, `README.md`

## Próximo paso
Confirmar `pm2 env 0` (RESTART_TOKEN y ALERT_NTFY_TOPIC) y revisar logs de la desvinculación del 25/9.
