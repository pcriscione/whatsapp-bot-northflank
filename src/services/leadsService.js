export class LeadsService {
  constructor({ repository }) {
    this.repository = repository;
  }

  async registerInscripcion({ tenantId, telefono }) {
    await this.repository.upsert({ tenantId, telefono, estado: "esperando_nombre" });
  }

  async completeInscripcion({ tenantId, telefono, nombre }) {
    await this.repository.upsert({ tenantId, telefono, estado: "completado", nombre });
  }

  async getPending({ tenantId, telefono }) {
    return this.repository.getPending({ tenantId, telefono });
  }
}
