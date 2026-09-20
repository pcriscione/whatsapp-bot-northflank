-- Correr a mano en el SQL Editor de Supabase (no hay MCP de Supabase conectado en este
-- proyecto). Reemplaza el Map en RAM de inscripciones al sorteo. Ver ARCHITECTURE.md.

create table if not exists leads_sorteo (
  id bigint generated always as identity primary key,
  tenant_id text not null,
  telefono text not null,
  nombre text,
  estado text not null default 'esperando_nombre',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint leads_sorteo_tenant_telefono_unique unique (tenant_id, telefono)
);
