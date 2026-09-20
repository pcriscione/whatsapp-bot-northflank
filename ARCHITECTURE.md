# Arquitectura objetivo — WhatsApp Bot v2 (multi-restaurante)

Este documento es el contrato de diseño para la migración del bot actual (monolito de un
archivo, un solo restaurante) a una base reutilizable para varios restaurantes dentro de la
Software Factory. Reemplaza y detalla la sección 8 del informe de diagnóstico inicial, ya
incorporando lo que confirmamos en producción (Vultr, `64.176.18.3`, proceso PM2
`whatsapp-bot`).

## 1. Restricciones reales confirmadas (no teóricas)

- `whatsapp-web.js` + `LocalAuth` exige un **proceso persistente** con Chromium corriendo
  indefinidamente — no es apto para autoscaling ni scale-to-zero (descarta Cloud Run para esta
  pieza). Se queda en una VPS tipo Vultr.
- **Una sesión de WhatsApp = un número = una instancia de `Client`.** No se puede compartir una
  sesión entre dos procesos corriendo al mismo tiempo (confirmado: el bug de `export_contactos.js`
  corriendo una segunda `LocalAuth` sobre el mismo `dataPath` es justamente este riesgo).
- El firewall (`ufw`) en el VPS de producción solo permite el puerto 22 — el puerto HTTP del bot
  (3000) **no está expuesto a internet**. Esto es una buena práctica ya vigente; la v2 debe
  mantenerla, no debe asumir que el HTTP server es accesible públicamente.
- PM2 ya es el gestor de procesos en producción, funciona bien (lock exclusivo + reconexión
  artesanal han mantenido el bot estable). La v2 sigue usando PM2, no hace falta Docker/K8s para
  esto todavía.
- Hoy no hay base de datos real en uso: los datos de sorteo viven en un `Map` en RAM (se pierden
  en cada restart) y se replican a un Google Apps Script (Sheets).

## 2. Modelo de despliegue: motor compartido + un proceso por restaurante

Dado que la sesión de WhatsApp es 1:1 con el número, el patrón correcto para "multi-restaurante"
**no** es un solo servidor que atienda muchos tenants por request (como un SaaS HTTP típico),
sino:

> **Un mismo código (motor/engine) + una config por restaurante + un proceso PM2 independiente
> por número de WhatsApp.**

Cada restaurante nuevo = un archivo de config + una entrada nueva en `ecosystem.config.js` + su
propio directorio de sesión. El código de negocio (flujos de conversación, servicios,
repositorios) se comparte al 100%.

## 3. Estructura de carpetas propuesta

```
whatsapp-bot/
├── src/
│   ├── adapters/
│   │   └── whatsapp/
│   │       ├── WhatsAppAdapter.js   # Client + LocalAuth + lock exclusivo + reconexión
│   │       │                        #   (misma lógica ya probada en prod, extraída a clase)
│   │       └── qr.js                # generación/cacheo de QR
│   ├── domain/
│   │   └── conversation/
│   │       ├── ConversationEngine.js # recibe un "mensaje entrante" agnóstico de canal
│   │       ├── menuFlow.js           # opciones 1-5
│   │       └── sorteoFlow.js         # flujo del código "86"
│   ├── services/
│   │   ├── leadsService.js           # guarda inscripciones (usa el repo)
│   │   └── sheetsExportService.js    # opcional, por tenant (ver sección 4)
│   ├── repositories/
│   │   └── SupabaseLeadsRepository.js
│   ├── config/
│   │   ├── tenantSchema.js           # valida shape de un config de restaurante
│   │   └── loadTenantConfig.js
│   ├── api/
│   │   └── httpServer.js             # /health, /qr, /restart, /export-contacts (con token)
│   └── logging/
│       └── logger.js                 # pino, structured logs, incluye tenant en cada línea
├── tenants/
│   └── la-princesa.config.json
├── run.js                            # node run.js --tenant=la-princesa
└── ecosystem.config.js               # un app de PM2 por tenant
```

Ejemplo de `tenants/la-princesa.config.json`:

```json
{
  "tenantId": "la-princesa",
  "botName": "Alma",
  "sessionDir": "/wwebjs_auth/la-princesa",
  "httpPort": 3001,
  "restartTokenEnvVar": "LA_PRINCESA_RESTART_TOKEN",
  "textos": {
    "saludo": "👋 ¡Hola! Soy Alma, bot de La Princesa y Ramona...",
    "horarios": "⏰ Horarios:\n- Lunes a sábados: 12:00 a 23:00\n- Domingos: 12:00 a 20:00",
    "carta": "🍽️ Ambas cartas: https://www.laprincesa.cl/carta",
    "reservas": "📅 Para hacer una reserva: https://tinyurl.com/uaxzmbr6",
    "ubicacion": "📍 Paseo Colina Sur 14500, local 102 y 106. https://maps.app.goo.gl/rECKibRJ2Sz6RgfZA",
    "humano": "☎️ Favor llámanos a este mismo número por teléfono (no por whatsapp) en horario de atención."
  },
  "sorteo": {
    "enabled": true,
    "codigo": "86",
    "sheetsWebhookUrl": null
  }
}
```

`ecosystem.config.js` (extracto):

```js
module.exports = {
  apps: [
    { name: "whatsapp-bot-la-princesa", script: "run.js", args: "--tenant=la-princesa" },
    // { name: "whatsapp-bot-otro-restaurante", script: "run.js", args: "--tenant=otro" },
  ],
};
```

## 4. Persistencia — reemplazo del `Map` en RAM

Tabla en Supabase (Postgres) en vez de memoria volátil:

```sql
create table if not exists leads_sorteo (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  telefono text not null,
  nombre text,
  estado text not null default 'esperando_nombre',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_leads_sorteo_tenant_telefono
  on leads_sorteo (tenant_id, telefono);
```

El envío a Google Apps Script se mantiene **opcional por tenant** (para no romper el hábito
actual de "La Princesa" de mirar una planilla), pero pasa a ser un paso secundario *después* de
guardar en Supabase — si Sheets falla, el dato no se pierde (hoy si Sheets falla, no pasa nada
grave porque igual no había persistencia real, pero con Supabase como fuente de verdad dejamos
de depender de que ese webhook funcione).

## 5. API HTTP y seguridad

- Mismos endpoints (`/health`, `/qr`, `/state`, `/restart`), pero:
  - `/restart` y `/qr` requieren un header `Authorization: Bearer <token>` (token por tenant, en
    variable de entorno, nunca hardcodeado).
  - Se mantiene el firewall actual (`ufw`, solo puerto 22 expuesto). El acceso a estos endpoints
    sigue siendo vía túnel SSH (`ssh -L 3001:localhost:3001 root@vps`) salvo que en el futuro se
    decida exponer un dashboard con su propio proxy/TLS — no es necesario para esta migración.
- Nuevo endpoint `POST /export-contacts` (con el mismo token) que reemplaza a
  `export_contactos.js`: usa el **mismo `Client` ya conectado** del proceso principal
  (`client.getChats()`), sin levantar una segunda sesión de Puppeteer. Elimina el riesgo de
  colisión de sesión que tiene hoy el script suelto.

## 6. Logging

`pino` (o similar) en vez de `console.log`. Cada línea incluye `tenantId`, nivel (`info`,
`warn`, `error`) y timestamp ISO. Sigue yendo a stdout/stderr — PM2 lo captura igual que hoy, sin
necesidad de un colector externo por ahora (se puede sumar después si la Software Factory crece
a más restaurantes y hace falta observabilidad centralizada).

## 7. Qué se mantiene igual a propósito (para bajar riesgo de la migración)

- `whatsapp-web.js` 1.34.x + `LocalAuth` como estrategia de auth.
- Los flags de Puppeteer ya probados en producción (`--no-sandbox`, `--disable-dev-shm-usage`,
  etc.) — no tocarlos salvo que rompan algo.
- El patrón de lock exclusivo por archivo + reconexión con backoff de 10s ante `disconnected` —
  se traslada tal cual a `WhatsAppAdapter.js`, solo se refactoriza la ubicación, no el
  comportamiento.
- PM2 como gestor de procesos.
- Las respuestas de negocio (textos, links, flujo del sorteo) — se mueven a config pero el
  contenido es el mismo.

## 8. Compatibilidad de sesión al migrar

Al pasar de `index.js` (sesión en `/wwebjs_auth`, sin tenant) a v2 (`/wwebjs_auth/la-princesa`),
la sesión actual **se puede copiar tal cual** a la nueva ruta — es solo un cambio de carpeta, la
misma versión de `whatsapp-web.js`/Chromium, mismo Node 20. No debería pedir QR nuevo si se copia
completa (incluyendo `.session.lock`, que se regenera solo).

## 9. Siguiente paso (Paso 6 del plan)

Construir este esqueleto en un branch/carpeta nueva, probarlo end-to-end con un **número de
WhatsApp de test** (no el productivo, por la restricción de sesión única de la sección 1), y
solo después planear el corte a producción (Paso 7).
