import { handleMenuOption } from "./menuFlow.js";
import { handleSorteoStart, handleSorteoNombre } from "./sorteoFlow.js";

const COOLDOWN_MS = 1500;

// Recibe un mensaje entrante ya normalizado (no un objeto de whatsapp-web.js) y devuelve
// una lista de "acciones" ({type: "reply", text} | {type: "sheetsExport", ...}) para que
// el adapter del canal las ejecute. No sabe nada de WhatsApp/Puppeteer.
export class ConversationEngine {
  constructor({ tenantConfig, leadsService }) {
    this.tenantConfig = tenantConfig;
    this.leadsService = leadsService;
    this.cooldowns = new Map();
  }

  isInCooldown(from) {
    const now = Date.now();
    const last = this.cooldowns.get(from) || 0;
    if (now - last < COOLDOWN_MS) return true;
    this.cooldowns.set(from, now);
    return false;
  }

  async handleIncomingMessage({ from, body }) {
    const texto = (body || "").trim().toLowerCase();
    const telefono = (from || "").split("@")[0] || "";
    const tenantId = this.tenantConfig.tenantId;
    const { textos, sorteo, allowlist } = this.tenantConfig;

    // Solo para tenants de test: si hay allowlist configurada, ignora a cualquiera
    // que no esté en la lista (para no responderle a contactos reales de un número
    // personal usado temporalmente como sesión de prueba).
    if (Array.isArray(allowlist) && allowlist.length > 0 && !allowlist.includes(telefono)) {
      return [];
    }

    if (this.isInCooldown(from)) return [];

    const pendiente = await this.leadsService.getPending({ tenantId, telefono });

    if (pendiente?.estado === "esperando_nombre") {
      return handleSorteoNombre({
        telefono,
        nombre: (body || "").trim(),
        leadsService: this.leadsService,
        tenantId,
        sorteoConfig: sorteo,
        textos,
      });
    }

    if (sorteo?.enabled && texto === sorteo.codigo) {
      return handleSorteoStart({ telefono, leadsService: this.leadsService, tenantId, sorteoConfig: sorteo });
    }

    const menuReply = handleMenuOption(texto, textos);
    if (menuReply) return [{ type: "reply", text: menuReply }];

    return [{ type: "reply", text: textos.saludo }];
  }
}
