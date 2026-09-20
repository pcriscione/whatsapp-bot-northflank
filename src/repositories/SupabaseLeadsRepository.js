import { createClient } from "@supabase/supabase-js";

const TABLE = "leads_sorteo";

// Requiere la tabla creada por schema.sql. Ver ARCHITECTURE.md sección 4.
export class SupabaseLeadsRepository {
  constructor({ supabaseUrl, supabaseKey }) {
    this.client = createClient(supabaseUrl, supabaseKey);
  }

  async upsert({ tenantId, telefono, estado, nombre }) {
    const { error } = await this.client
      .from(TABLE)
      .upsert(
        {
          tenant_id: tenantId,
          telefono,
          estado,
          nombre: nombre ?? null,
          actualizado_en: new Date().toISOString(),
        },
        { onConflict: "tenant_id,telefono" }
      );

    if (error) throw new Error(`SupabaseLeadsRepository.upsert: ${error.message}`);
  }

  async getPending({ tenantId, telefono }) {
    const { data, error } = await this.client
      .from(TABLE)
      .select("estado, nombre")
      .eq("tenant_id", tenantId)
      .eq("telefono", telefono)
      .maybeSingle();

    if (error) throw new Error(`SupabaseLeadsRepository.getPending: ${error.message}`);
    return data;
  }
}
