# Incidentes — WhatsApp Bot (La Princesa y Ramona)

## 2026-09-20 — Bot dejó de responder (bug de WhatsApp Web, no de nuestro código)

**Síntoma**: el bot aparecía `online` en PM2 y `CONNECTED` en el heartbeat, recibía
mensajes (el teléfono los mostraba), pero nunca respondía. `pm2 restart` no lo arreglaba.

**Causa raíz**: WhatsApp cambió algo en su frontend web (~16/9/2026) que renombró una
propiedad interna (`_serialized` → `$1`) usada por `whatsapp-web.js` para casi todo:
`sendMessage`, `getChats`, y el propio bootstrapping de `window.Store`. En builds nuevos
de WhatsApp Web, `window.Store`/`WWebJS` nunca terminaba de cargar en la página, por lo
que el evento `message` de la librería **ni siquiera se disparaba** — el bot parecía
conectado pero estaba ciego. Confirmado como bug conocido y activo en toda la comunidad
de `whatsapp-web.js` en ese momento (afectaba incluso la última versión publicada,
1.34.7), sin fix oficial mergeado todavía:
- https://github.com/wwebjs/whatsapp-web.js/issues/201919
- https://github.com/wwebjs/whatsapp-web.js/pull/201901

**Cómo se diagnosticó**:
1. Un parche puntual sobre `WAWebMsgKey.prototype._serialized` (aplicado vía
   `page.evaluate` en el evento `authenticated`) no alcanzó — el problema era más
   profundo que un solo objeto renombrado (`window.Store` completo no cargaba).
2. Se agregó logging de diagnóstico temporal (`safeReply`, log de "mensaje entrante")
   para confirmar si el problema era "no recibe" o "recibe pero no responde" — resultó
   ser lo primero: el evento `message` nunca se disparaba.
3. Se probó la hipótesis de fondo (evitar el build roto en vez de parchearlo) **en una
   sesión completamente aislada** (`branch pintest-webversion`, carpeta separada,
   número de WhatsApp de prueba, nunca el productivo) antes de tocar producción de
   nuevo — clave para no seguir arriesgando el número real mientras se iteraba.

**Fix real**: pinnear WhatsApp Web a un build anterior al bug (`2.3000.1045601094-alpha`,
el último confirmado estable en este bot, cacheado el 20/8/2026), usando
`webVersionCache: { type: "remote", remotePath: "...wa-version.../{version}.html" }`.
El soporte que ya existía en el código (`WWEBJS_WEB_VERSION` + `type: "none"`) estaba
mal implementado — `type: "none"` no pinnea nada, solo desactiva el cache y sigue
trayendo la versión más nueva (rota) igual.

**Lección importante sobre cómo aplicar el pin**: cambiar la versión de WhatsApp Web
sobre una **sesión ya autenticada** con otra versión no funciona de forma confiable —
en este incidente causó primero un logout forzado, y en un segundo intento un cuelgue
indefinido en `state: null` sin QR ni error. Lo que sí funcionó de forma limpia fue
**volver a parear desde cero** (borrar `/wwebjs_auth/session`, reiniciar, escanear QR
nuevo) ya con el pin puesto desde el principio — igual que se había validado en la
sesión de prueba aislada.

**Para el futuro / otros bots de la Software Factory**:
- Si un bot de WhatsApp basado en `whatsapp-web.js` deja de responder sin explicación
  y sin errores nuevos, sospechar primero de un cambio de versión de WhatsApp Web antes
  que de un bug propio — revisar https://github.com/wwebjs/whatsapp-web.js/issues por
  reportes recientes.
- Nunca probar un cambio de `webVersion`/`webVersionCache` directo sobre la sesión
  productiva. Validar primero en una sesión aislada (carpeta separada, número de
  prueba) — así se evitó romper más el número real mientras se iteraba a ciegas.
- Si hay que aplicar un pin de versión a una sesión ya pareada, asumir que probablemente
  haga falta re-parear desde cero (borrar la sesión, QR nuevo) en vez de esperar que
  reconecte sola.

## 2026-09-20 (continuación) — Dos hallazgos más durante la migración a v2

**No correr dos instancias de Puppeteer en el mismo VPS.** Al probar el esqueleto de
v2 (`node run.js --tenant=test`) en paralelo, con producción (v1) corriendo al mismo
tiempo en este VPS chico, producción tuvo `Execution context was destroyed` /
`Attempted to use detached Frame` casi al instante y quedó deslogueada (QR de nuevo).
Conclusión: el servidor no tiene recursos para correr dos Chromium headless a la vez
de forma confiable. **Para futuras pruebas de otro tenant/bot, usar una máquina
separada, o parar producción (`pm2 stop`) mientras dure la prueba.**

**Ignorar mensajes viejos al re-vincular.** Cada vez que el dispositivo se re-vincula
(pasó varias veces este día), WhatsApp sincroniza historial reciente de chats al nuevo
dispositivo, y el evento `message` de `whatsapp-web.js` se dispara también para esos
mensajes viejos — el bot terminó respondiéndole a clientes que habían escrito hace
meses. Fix: descartar cualquier mensaje entrante cuyo `msg.timestamp` tenga más de 5
minutos de antigüedad, antes de procesarlo. Aplicado en `index.js` (production) y
pendiente de portar a v2 cuando se retome esa migración.

**Endpoints sin autenticación corregidos**: `/qr` y `/restart` ahora requieren
`Authorization: Bearer <RESTART_TOKEN>` (variable de entorno, nunca hardcodeada). Sin
la variable configurada, quedan bloqueados por defecto (fail-closed).
