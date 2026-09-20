import fs from "fs";
import path from "path";

const STALE_MS = 2 * 60 * 1000; // 2 min: lock "viejo" se considera huérfano

// Extraído tal cual del index.js productivo (mismo comportamiento, solo reubicado).
export function acquireExclusiveLock({ sessionDir, logger, forceReset }) {
  const lockPath = path.join(sessionDir, ".session.lock");
  let lockFd = null;

  try {
    fs.mkdirSync(sessionDir, { recursive: true });

    if (forceReset) {
      try { fs.unlinkSync(lockPath); } catch {}
    }

    if (fs.existsSync(lockPath)) {
      try {
        const st = fs.statSync(lockPath);
        const age = Date.now() - st.mtimeMs;
        if (age > STALE_MS) {
          logger.warn(`Lock viejo (~${Math.round(age / 1000)}s). Eliminando ${lockPath}`);
          fs.unlinkSync(lockPath);
        } else {
          logger.warn("Otra instancia ya usa la sesión (lock reciente). Saliendo.");
          process.exit(0);
        }
      } catch (err) {
        logger.error("No pude evaluar el lock existente, salgo por seguridad:", err?.message || err);
        process.exit(0);
      }
    }

    lockFd = fs.openSync(lockPath, "wx");
    fs.writeFileSync(lockPath, String(process.pid));

    const cleanup = () => {
      try { if (lockFd) fs.closeSync(lockFd); } catch {}
      try { fs.unlinkSync(lockPath); } catch {}
    };

    process.on("exit", cleanup);
    process.on("SIGINT", () => { cleanup(); process.exit(0); });
    process.on("SIGTERM", () => { cleanup(); process.exit(0); });

    logger.info("Lock exclusivo adquirido:", lockPath);
  } catch (e) {
    if (e?.code === "EEXIST") {
      logger.warn("Otra instancia ya usa la sesión (lock existe). Saliendo.");
      process.exit(0);
    } else {
      logger.error("Error adquiriendo lock:", e?.message || e);
      process.exit(0);
    }
  }
}
