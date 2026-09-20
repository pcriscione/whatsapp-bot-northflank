import path from "path";
import pkg from "whatsapp-web.js";
import qrcodeTerminal from "qrcode-terminal";
import QRCode from "qrcode";
import puppeteer from "puppeteer";

import { acquireExclusiveLock } from "./lock.js";

const { Client, LocalAuth } = pkg;

const RECONNECT_DELAY_MS = 10_000;

// Misma estrategia de conexión/reconexión que el index.js productivo (probada en Vultr),
// solo extraída a una clase reutilizable por tenant.
export class WhatsAppAdapter {
  constructor({ tenantId, sessionDir, logger, onIncomingMessage, webVersion }) {
    this.tenantId = tenantId;
    this.sessionDir = sessionDir;
    this.logger = logger;
    this.onIncomingMessage = onIncomingMessage;
    this.webVersion = webVersion;

    this.client = null;
    this.initInFlight = null;
    this.isReady = false;
    this.lastQrDataUrl = null;
  }

  async initialize() {
    acquireExclusiveLock({
      sessionDir: this.sessionDir,
      logger: this.logger,
      forceReset: process.env.FORCE_LOCK_RESET === "true",
    });

    process.on("unhandledRejection", (err) => this.logger.error("unhandledRejection:", err?.stack || err));
    process.on("uncaughtException", (err) => this.logger.error("uncaughtException:", err?.stack || err));

    return this.ensureInit();
  }

  buildClient() {
    const c = new Client({
      authStrategy: new LocalAuth({ dataPath: this.sessionDir }),
      ...(this.webVersion
        ? { webVersion: this.webVersion, webVersionCache: { type: "none" } }
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

    c.once("authenticated", async () => {
      const s = await c.getState().catch(() => "NO_STATE");
      this.logger.info("authenticated, state =", s);
    });

    c.once("ready", async () => {
      this.isReady = true;
      this.lastQrDataUrl = null;
      const s = await c.getState().catch(() => "NO_STATE");
      this.logger.info("BOT IS READY | state =", s);
    });

    c.on("change_state", (s) => {
      this.isReady = s === "CONNECTED";
      this.logger.info("change_state:", s);
    });

    c.on("auth_failure", (m) => this.logger.error("auth_failure:", m));

    c.on("qr", async (qr) => {
      if (this.isReady) {
        this.logger.info("QR ignorado (ya conectado)");
        return;
      }
      this.logger.info("QR solicitado (cliente pidió autenticación)");
      try { qrcodeTerminal.generate(qr, { small: true }); } catch {}
      try {
        this.lastQrDataUrl = await QRCode.toDataURL(qr);
      } catch (err) {
        this.logger.error("Error generando QR:", err);
      }
    });

    c.on("message", async (msg) => {
      if (msg.fromMe) return;
      if (msg.from === "status@broadcast") return;
      if (msg.from.endsWith("@g.us")) return;

      await this.onIncomingMessage(msg).catch((err) =>
        this.logger.error("Error procesando mensaje:", err?.stack || err)
      );
    });

    return c;
  }

  async ensureInit() {
    if (this.initInFlight) return this.initInFlight;

    this.initInFlight = (async () => {
      this.logger.info("Inicializando cliente WhatsApp");

      if (this.client) {
        await this.safeDestroy(this.client);
        this.client = null;
        this.isReady = false;
      }

      this.client = this.buildClient();

      this.client.once("disconnected", async (reason) => {
        this.logger.warn(`disconnected, motivo: ${reason}`);

        await this.safeDestroy(this.client);
        this.client = null;
        this.isReady = false;

        if (String(reason).toUpperCase().includes("LOGOUT")) {
          this.logger.warn("LOGOUT => limpiando sesión para QR limpio");
          await this.wipeSessionKeepLock();
        }

        setTimeout(() => {
          this.logger.info("re-inicializando cliente...");
          this.ensureInit().catch((e) => this.logger.error("ensureInit falló", e));
        }, RECONNECT_DELAY_MS);
      });

      await this.client.initialize();
      this.logger.info("Cliente inicializado");
    })();

    return this.initInFlight.finally(() => {
      this.initInFlight = null;
    });
  }

  async wipeSessionKeepLock() {
    const fsp = await import("fs/promises");
    const lockName = ".session.lock";

    await fsp.mkdir(this.sessionDir, { recursive: true }).catch(() => {});

    let entries = [];
    try {
      entries = await fsp.readdir(this.sessionDir, { withFileTypes: true });
    } catch {
      return;
    }

    const deletions = entries
      .filter((e) => e.name !== lockName)
      .map((e) => fsp.rm(path.join(this.sessionDir, e.name), { recursive: true, force: true }).catch(() => {}));

    await Promise.allSettled(deletions);
    this.logger.info("Sesión limpiada (manteniendo lock)");
  }

  safeDestroy(c) {
    return c?.destroy?.().catch(() => {});
  }

  async restart() {
    this.isReady = false;
    this.lastQrDataUrl = null;
    await this.safeDestroy(this.client);
    this.client = null;
    await this.ensureInit();
  }

  async getState() {
    return this.client?.getState?.().catch(() => "NO_STATE") ?? "NO_STATE";
  }

  getLastQrDataUrl() {
    return this.isReady ? null : this.lastQrDataUrl;
  }

  // Reemplaza a export_contactos.js: reusa el Client YA conectado en vez de abrir
  // una segunda sesión de Puppeteer sobre el mismo dataPath (eso era lo que podía
  // hacer caer la sesión productiva).
  async exportContacts() {
    if (!this.client || !this.isReady) {
      throw new Error("Cliente no conectado, no se puede exportar contactos ahora");
    }

    const chats = await this.client.getChats();
    const rows = [];

    for (const chat of chats) {
      const serialized = chat.id?._serialized || "";
      if (!serialized) continue;

      let phone = "";
      if (serialized.endsWith("@c.us")) phone = serialized.replace("@c.us", "");
      else if (chat.id?.user) phone = String(chat.id.user);
      else continue;

      const contact = await this.client.getContactById(serialized).catch(() => null);
      const name = (contact?.name || contact?.pushname || chat?.name || "").trim();

      rows.push({
        phone,
        name,
        isMyContact: contact?.isMyContact === true,
        isGroup: chat.isGroup === true,
      });
    }

    return rows;
  }
}
