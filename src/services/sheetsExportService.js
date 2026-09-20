// Envío opcional a Google Apps Script (paso secundario: si falla, no se pierde el dato
// porque ya quedó guardado en el repositorio de leads antes de llegar acá).
export async function exportToSheets({ url, nombre, telefono, logger }) {
  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, telefono }),
    });
    logger.info("Respuesta de Google Sheets:", await resp.text());
  } catch (error) {
    logger.error("Error al enviar datos a Google Sheets:", error);
  }
}
