const REQUIRED_TEXTOS = ["saludo", "horarios", "carta", "reservas", "ubicacion", "humano"];

export function validateTenantConfig(config) {
  const errors = [];

  if (!config.tenantId) errors.push("falta tenantId");
  if (!config.sessionDir) errors.push("falta sessionDir");
  if (!config.httpPort) errors.push("falta httpPort");
  if (!config.restartTokenEnvVar) errors.push("falta restartTokenEnvVar");

  for (const key of REQUIRED_TEXTOS) {
    if (!config.textos?.[key]) errors.push(`falta textos.${key}`);
  }

  if (config.sorteo?.enabled && !config.sorteo?.codigo) {
    errors.push("sorteo.enabled=true pero falta sorteo.codigo");
  }

  if (config.allowlistEnvVar !== undefined && typeof config.allowlistEnvVar !== "string") {
    errors.push("allowlistEnvVar debe ser un string (nombre de variable de entorno)");
  }

  if (errors.length > 0) {
    throw new Error(`Config de tenant inválida (${config.tenantId ?? "?"}):\n- ${errors.join("\n- ")}`);
  }
}
