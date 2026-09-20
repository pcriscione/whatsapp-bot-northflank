import express from "express";
import { requireToken } from "./auth.js";

export function buildHttpServer({ adapter, tenantConfig, logger }) {
  const app = express();
  const auth = requireToken(tenantConfig.restartTokenEnvVar);

  app.get("/", (_req, res) => res.send(`🟢 Bot de WhatsApp activo (${tenantConfig.tenantId})`));

  app.get("/health", (_req, res) =>
    res.json({ ok: true, ready: adapter.isReady, qr: !!adapter.getLastQrDataUrl() })
  );

  app.get("/state", async (_req, res) => {
    try {
      res.json({ state: await adapter.getState() });
    } catch (e) {
      res.status(500).json({ state: "ERROR", error: String(e) });
    }
  });

  // Igual que en producción: solo publica el QR mientras no hay sesión activa.
  app.get("/qr", auth, (_req, res) => {
    const dataUrl = adapter.getLastQrDataUrl();
    if (adapter.isReady) return res.status(204).send();
    if (!dataUrl) return res.status(503).send("QR aún no generado. Recarga cada 2-3s.");
    const img = Buffer.from(dataUrl.split(",")[1], "base64");
    res.set("Content-Type", "image/png");
    res.send(img);
  });

  app.post("/restart", auth, async (_req, res) => {
    try {
      logger.info("Reiniciando cliente (vía API)...");
      await adapter.restart();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  // Reemplaza a export_contactos.js: no abre una segunda sesión de Puppeteer.
  app.post("/export-contacts", auth, async (_req, res) => {
    try {
      const rows = await adapter.exportContacts();
      res.json({ ok: true, count: rows.length, rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e) });
    }
  });

  return app;
}
