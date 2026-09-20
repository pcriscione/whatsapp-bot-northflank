// Fallback para desarrollo/test sin Supabase configurado. Mismo comportamiento que el
// Map en RAM del bot actual: se pierde en cada restart. NO usar en producción real.
export class InMemoryLeadsRepository {
  constructor() {
    this.leads = new Map();
  }

  key(tenantId, telefono) {
    return `${tenantId}:${telefono}`;
  }

  async upsert({ tenantId, telefono, estado, nombre }) {
    const key = this.key(tenantId, telefono);
    const existing = this.leads.get(key) || {};
    this.leads.set(key, { ...existing, tenantId, telefono, estado, nombre: nombre ?? existing.nombre });
  }

  async getPending({ tenantId, telefono }) {
    return this.leads.get(this.key(tenantId, telefono)) || null;
  }
}
