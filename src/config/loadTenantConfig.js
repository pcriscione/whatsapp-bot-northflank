import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { validateTenantConfig } from "./tenantSchema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TENANTS_DIR = path.resolve(__dirname, "../../tenants");

export function loadTenantConfig(tenantId) {
  if (!tenantId) {
    throw new Error("Falta indicar --tenant=<id> (ver carpeta tenants/)");
  }

  const configPath = path.join(TENANTS_DIR, `${tenantId}.config.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(`No existe config para el tenant "${tenantId}" en ${configPath}`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  validateTenantConfig(config);
  return config;
}
