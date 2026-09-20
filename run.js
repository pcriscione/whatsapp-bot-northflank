import { loadTenantConfig } from "./src/config/loadTenantConfig.js";
import { createLogger } from "./src/logging/logger.js";
import { WhatsAppAdapter } from "./src/adapters/whatsapp/WhatsAppAdapter.js";
import { ConversationEngine } from "./src/domain/conversation/ConversationEngine.js";
import { LeadsService } from "./src/services/leadsService.js";
import { InMemoryLeadsRepository } from "./src/repositories/InMemoryLeadsRepository.js";
import { SupabaseLeadsRepository } from "./src/repositories/SupabaseLeadsRepository.js";
import { exportToSheets } from "./src/services/sheetsExportService.js";
import { buildHttpServer } from "./src/api/httpServer.js";

function parseTenantArg() {
  const arg = process.argv.find((a) => a.startsWith("--tenant="));
  return arg?.split("=")[1];
}

function buildRepository(logger) {
  const { SUPABASE_URL, SUPABASE_KEY } = process.env;
  if (SUPABASE_URL && SUPABASE_KEY) {
    logger.info("Usando SupabaseLeadsRepository");
    return new SupabaseLeadsRepository({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY });
  }
  logger.warn("SUPABASE_URL/SUPABASE_KEY no configurados — usando InMemoryLeadsRepository (NO usar en producción real)");
  return new InMemoryLeadsRepository();
}

async function main() {
  const tenantId = parseTenantArg();
  const tenantConfig = loadTenantConfig(tenantId);
  const logger = createLogger(tenantConfig.tenantId);

  // La URL del webhook nunca vive en el JSON versionado: se resuelve desde el
  // entorno usando el nombre de variable indicado en la config del tenant.
  if (tenantConfig.sorteo?.sheetsWebhookUrlEnvVar) {
    tenantConfig.sorteo.sheetsWebhookUrl = process.env[tenantConfig.sorteo.sheetsWebhookUrlEnvVar] || null;
  }

  const repository = buildRepository(logger);
  const leadsService = new LeadsService({ repository });
  const conversationEngine = new ConversationEngine({ tenantConfig, leadsService });

  const adapter = new WhatsAppAdapter({
    tenantId: tenantConfig.tenantId,
    sessionDir: tenantConfig.sessionDir,
    logger,
    webVersion: process.env.WWEBJS_WEB_VERSION,
    onIncomingMessage: async (msg) => {
      const actions = await conversationEngine.handleIncomingMessage({ from: msg.from, body: msg.body });

      for (const action of actions) {
        if (action.type === "reply") {
          await msg.reply(action.text);
        } else if (action.type === "sheetsExport") {
          await exportToSheets({ url: action.url, nombre: action.nombre, telefono: action.telefono, logger });
        }
      }
    },
  });

  const app = buildHttpServer({ adapter, tenantConfig, logger });
  const server = app.listen(tenantConfig.httpPort, () =>
    logger.info(`Servidor HTTP escuchando en http://localhost:${tenantConfig.httpPort}`)
  );

  process.on("SIGTERM", () => {
    try { server.close(() => logger.info("HTTP server cerrado")); } catch {}
  });

  logger.info("Bot iniciando...");
  await adapter.initialize();
}

main().catch((err) => {
  console.error("Fallo fatal al iniciar:", err);
  process.exit(1);
});
