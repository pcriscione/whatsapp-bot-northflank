// --- WhatsApp Bot — single-instance & no-QR-after-connected -----------------
// Para contenedores (Northflank): lock exclusivo, init único, reconexión controlada,
// y limpieza de sesión solo cuando hay LOGOUT.
// ----------------------------------------------------------------------------

import fs from "fs";
import path from "path";
import express from "express";
import pkg from "whatsapp-web.js";
import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";
import puppeteer from "puppeteer";
import { fileURLToPath } from "url";

const { Client, LocalAuth } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- logs con PID
const PID = process.pid;
const log = (...args) => console.log(`[pid ${PID}]`, ...args);

// ---- Lock EXCLUSIVO por archivo
const SESSION_DIR = "/wwebjs_auth";
const LOCK_PATH = `${SESSION_DIR}/.session.lock`;
let lockFd = null;

function acquireExclusiveLock() {
  const STALE_MS = 2 * 60 * 1000; // 2 min: lock "viejo" se considera huérfano
  try {
    fs.mkdirSync(SESSION_DIR, { recursive: true });

    // ¿Se pidió forzar reset del lock?
    if (process.env.FORCE_LOCK_RESET === "true") {
      try { fs.unlinkSync(LOCK_PATH); } catch {}
    }

    // Si ya existe lock: si es reciente, salimos. Si está viejo, lo borramos.
    if (fs.existsSync(LOCK_PATH)) {
      try {
        const st = fs.statSync(LOCK_PATH);
        const age = Date.now() - st.mtimeMs;
        if (age > STALE_MS) {
          log(`🧹 Lock viejo (~${Math.round(age / 1000)}s). Eliminando ${LOCK_PATH}`);
          fs.unlinkSync(LOCK_PATH);
        } else {
          log("🔒 Otra instancia ya usa la sesión (lock reciente). Saliendo.");
          process.exit(0);
        }
      } catch (err) {
        log("⚠️ No pude evaluar el lock existente, salgo por seguridad:", err?.message || err);
        process.exit(0);
      }
    }

    // Crear lock atómico
    lockFd = fs.openSync(LOCK_PATH, "wx");
    fs.writeFileSync(LOCK_PATH, String(PID));

    const cleanup = () => {
      try { if (lockFd) fs.closeSync(lockFd); } catch {}
      try { fs.unlinkSync(LOCK_PATH); } catch {}
    };

    process.on("exit", cleanup);
    process.on("SIGINT", () => { cleanup(); process.exit(0); });
    process.on("SIGTERM", () => { cleanup(); process.exit(0); });

    log("🔑 Lock exclusivo adquirido");
  } catch (e) {
    if (e?.code === "EEXIST") {
      log("🔒 Otra instancia ya usa la sesión (lock existe). Saliendo.");
      process.exit(0);
    } else {
      log("⚠️ Error adquiriendo lock:", e?.message || e);
      process.exit(0);
    }
  }
}

acquireExclusiveLock();

// ---- Estado app/bot
const inscripcionesSorteo = new Map();
const __cooldown = new Map();

let lastQRDataURL = null;
let client = null;
let initInFlight = null;
let isReady = false;

// ---- Manejo de errores no atrapados (evita crash y loop de reinicios)
process.on("unhandledRejection", (err) => log("⚠️ unhandledRejection:", err?.stack || err));
process.on("uncaughtException", (err) => log("⚠️ uncaughtException:", err?.stack || err));

// === helpers de ciclo de vida ===
function safeDestroy(c) {
  return c?.destroy?.().catch(() => {});
}

// --- Parche temporal: WhatsApp Web (build 2.3000.x, ~16 sept 2026) renombró la
// propiedad interna "_serialized" a "$1" en WID/MsgKey, lo que rompe sendMessage()/
// reply() en whatsapp-web.js (incluso en la última versión, 1.34.7). Ver:
// https://github.com/wwebjs/whatsapp-web.js/issues/201919
// Reintenta porque el objeto interno puede no estar cargado todavía justo al
// dispararse "authenticated". Sacar este parche cuando la librería lo arregle upstream.
async function applySerializedPatch(c) {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const applied = await c.pupPage.evaluate(() => {
        try {
          const MsgKey = window.require && window.require("WAWebMsgKey");
          if (!MsgKey?.prototype) return false;
          if (!Object.getOwnPropertyDescriptor(MsgKey.prototype, "_serialized")) {
            Object.defineProperty(MsgKey.prototype, "_serialized", {
              get() { return this.$1 ?? this.toString(); },
              configurable: true,
            });
          }
          return true;
        } catch {
          return false;
        }
      });
      if (applied) {
        log("🩹 Parche _serialized aplicado");
        return;
      }
    } catch {
      // pupPage todavía no está listo para evaluate, seguimos reintentando
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  log("⚠️ No se pudo aplicar el parche _serialized tras 30 intentos");
}

// Limpia la sesión SIN borrar el lock (para evitar que otro pod "entre")
async function wipeSessionKeepLock() {
  const fsp = await import("fs/promises");

  await fsp.mkdir(SESSION_DIR, { recursive: true }).catch(() => {});

  // Borra todo dentro de SESSION_DIR excepto .session.lock
  let entries = [];
  try {
    entries = await fsp.readdir(SESSION_DIR, { withFileTypes: true });
  } catch {
    return;
  }

  const deletions = entries
    .filter((e) => e.name !== path.basename(LOCK_PATH))
    .map(async (e) => {
      const full = path.join(SESSION_DIR, e.name);
      await fsp.rm(full, { recursive: true, force: true }).catch(() => {});
    });

  await Promise.allSettled(deletions);
  log("🧽 Sesión limpiada (manteniendo lock)");
}

// ---- Fábrica del cliente (sin reconexión aquí; solo listeners normales)
function buildClient() {
  const pinnedWebVersion = process.env.WWEBJS_WEB_VERSION; // ej: "2.x.x"

  const c = new Client({
    authStrategy: new LocalAuth({ dataPath: SESSION_DIR }),

    ...(pinnedWebVersion
      ? {
          webVersion: pinnedWebVersion,
          webVersionCache: { type: "none" },
        }
      : {}),

    puppeteer: {
      headless: "new",
      executablePath: puppeteer.executablePath(),
      protocolTimeout: 300_000,
      timeout: 300_000,
      defaultViewport: { width: 800, height: 600, deviceScaleFactor: 1 },
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--no-zygote",
        "--disable-gpu",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--no-first-run",
        "--no-default-browser-check",
        "--mute-audio",
        "--window-size=800,600",
        "--blink-settings=imagesEnabled=false",
      ],
    },
  });

  // --- Listeners (sin reinicios acá)
  c.once("authenticated", async () => {
    const s = await c.getState().catch(() => "NO_STATE");
    log("🔐 authenticated, state =", s);
    applySerializedPatch(c).catch((e) => log("⚠️ Error aplicando parche _serialized:", e));
  });

  c.once("ready", async () => {
    isReady = true;
    lastQRDataURL = null; // no más QR tras conectar
    const s = await c.getState().catch(() => "NO_STATE");
    log("✅ BOT IS READY | state =", s);
  });

  c.on("change_state", (s) => {
    isReady = s === "CONNECTED";
    log("🔁 change_state:", s);
  });

  c.on("auth_failure", (m) => log("❌ auth_failure:", m));

  // QR: NO publicar si ya está conectado
  c.on("qr", async (qr) => {
    if (isReady) {
      log("🔇 QR ignorado (ya conectado)");
      return;
    }
    log("🟩 QR solicitado (cliente pidió autenticación)");
    try { qrcodeTerminal.generate(qr, { small: true }); } catch {}
    try {
      lastQRDataURL = await QRCode.toDataURL(qr);
      log("📷 QR generado y cacheado en memoria");
      try {
        await QRCode.toFile(path.join(__dirname, "qr.png"), qr);
        log("💾 QR guardado como qr.png (opcional)");
      } catch (err) {
        log("⚠️ No se pudo escribir qr.png:", err?.message || err);
      }
    } catch (err) {
      log("❌ Error generando QR:", err);
    }
  });

  // Mensajes (tus respuestas)
  c.on("message", async (msg) => {
    if (msg.fromMe) return;
    if (msg.from === "status@broadcast") return;
    if (msg.from.endsWith("@g.us")) return;

    // cooldown anti-spam
    try {
      const now = Date.now();
      const last = __cooldown.get(msg.from) || 0;
      if (now - last < 1500) return;
      __cooldown.set(msg.from, now);
    } catch {}

    const texto = (msg.body || "").trim().toLowerCase();
    const telefono = (msg.from || "").split("@")[0] || "";
    const usuario = inscripcionesSorteo.get(msg.from);

    if (usuario?.estado === "esperando_nombre") {
      usuario.nombre = (msg.body || "").trim();
      usuario.estado = "completado";

      await msg.reply(
        `✅ ¡Gracias ${usuario.nombre}! Estás participando del sorteo con el número ${usuario.telefono}. ¡Mucha suerte! 🎉`
      );

      try {
        const resp = await fetch(
          "https://script.google.com/macros/s/AKfycbxkk6uC3K6mN6dbRWzviSLYViqN8ML3Vq0L_pQ5jm46eSfThviuaiOp7UGcEZx-mBLKPw/exec",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ nombre: usuario.nombre, telefono: usuario.telefono }),
          }
        );
        log("✅ Respuesta de Google Sheets:", await resp.text());
      } catch (error) {
        log("❌ Error al enviar datos a Google Sheets:", error);
      }

      await msg.reply(`👋 ¿Qué quieres hacer ahora?
1️⃣ Ver la carta  
2️⃣ Consultar horarios  
3️⃣ Hacer una reserva  
4️⃣ Conocer ubicación
5️⃣ Hablar con humano`);      
      return;
    }

    switch (texto) {
      case "1":
        await msg.reply("🍽️ Ambas cartas: https://www.laprincesa.cl/carta");
        break;
      case "2":
        await msg.reply(`⏰ Horarios:
- Lunes a sábados: 12:00 a 23:00
- Domingos: 12:00 a 20:00`);
        break;
      case "3":
        await msg.reply("📅 Para hacer una reserva: https://tinyurl.com/uaxzmbr6");
        break;
      case "4":
        await msg.reply(
          "📍 Paseo Colina Sur 14500, local 102 y 106. https://maps.app.goo.gl/rECKibRJ2Sz6RgfZA"
        );
        break;
      case "5":
        await msg.reply(
          "☎️ Favor llámanos a este mismo número por teléfono (no por whatsapp) en horario de atención."
        );
      break;  
      case "86":
        inscripcionesSorteo.set(msg.from, { estado: "esperando_nombre", telefono });
        await msg.reply(`🎁 ¡Estás participando del sorteo!!!

Por favor respondé este mensaje con tu nombre completo para finalizar tu inscripción.

✅ Hemos registrado tu número: ${telefono}`);
        break;
      default:
        await msg.reply(`👋 ¡Hola! Soy Alma, bot de La Princesa y Ramona. ¿Qué quieres hacer?
1️⃣ Ver la carta  
2️⃣ Consultar horarios  
3️⃣ Hacer una reserva  
4️⃣ Conocer ubicación
5️⃣ Hablar con humano`);  
    }
  });

  return c;
}

// ---- Inicialización (nunca en paralelo) + reconexión controlada
async function ensureInit() {
  if (initInFlight) return initInFlight;

  initInFlight = (async () => {
    log("🚀 Inicializando cliente WhatsApp");

    // Si existía algo, destruye antes
    if (client) {
      await safeDestroy(client);
      client = null;
      isReady = false;
    }

    client = buildClient();

    // ÚNICO manejo de desconexión aquí
    client.once("disconnected", async (reason) => {
      log(`⚠️ disconnected, motivo: ${reason}`);

      // evita promesas usando frames muertos
      await safeDestroy(client);
      client = null;
      isReady = false;

      if (String(reason).toUpperCase().includes("LOGOUT")) {
        log("🔄 LOGOUT => limpiando sesión para QR limpio");
        await wipeSessionKeepLock();
      }

      setTimeout(() => {
        log("♻️ re-inicializando cliente...");
        ensureInit().catch((e) => log("❌ ensureInit falló", e));
      }, 10_000);
    });

    await client.initialize();
    log("✅ Cliente inicializado");
  })();

  return initInFlight.finally(() => {
    initInFlight = null;
  });
}

// Heartbeat (solo informa)
setInterval(async () => {
  const s = await client?.getState?.().catch(() => "NO_STATE");
  log("🩺 heartbeat state:", s ?? "null");
}, 10_000);

// Arranque
log("🚀 Bot iniciando en Northflank…");
ensureInit().catch(() => {});

// --------------------- Servidor HTTP ---------------------
const app = express();
const port = process.env.PORT || 3000;

app.get("/", (_req, res) => res.send("🟢 Bot de WhatsApp activo en Northflank"));

app.get("/qr", (_req, res) => {
  if (isReady) return res.status(204).send(); // no mostrar QR si ya está conectado
  if (!lastQRDataURL) return res.status(503).send("⚠️ QR aún no generado. Recarga cada 2–3 s.");
  const img = Buffer.from(lastQRDataURL.split(",")[1], "base64");
  res.set("Content-Type", "image/png");
  res.send(img);
});

app.get("/state", async (_req, res) => {
  try {
    const state = await client?.getState?.().catch(() => "NO_STATE");
    res.json({ state: state ?? null });
  } catch (e) {
    res.status(500).json({ state: "ERROR", error: String(e) });
  }
});

app.get("/health", (_req, res) =>
  res.json({ ok: true, ready: isReady, qr: !!lastQRDataURL })
);

app.post("/restart", async (_req, res) => {
  try {
    log("♻️ Reiniciando cliente…");
    isReady = false;
    lastQRDataURL = null;

    await safeDestroy(client);
    client = null;

    await ensureInit();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const server = app.listen(port, () =>
  log(`🌐 Servidor web escuchando en http://localhost:${port}`)
);

// Apagado limpio del HTTP server
process.on("SIGTERM", () => {
  try {
    server.close(() => log("🛑 HTTP server cerrado"));
  } catch {}
});
