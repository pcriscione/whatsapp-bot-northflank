// Flujo del sorteo (código "86"). Devuelve una lista de acciones {type: "reply", text}
// para que el caller (adapter) las ejecute contra el canal real (WhatsApp, etc).
export async function handleSorteoStart({ telefono, leadsService, tenantId, sorteoConfig }) {
  await leadsService.registerInscripcion({ tenantId, telefono });

  return [
    {
      type: "reply",
      text: `🎁 ¡Estás participando del sorteo!!!\n\nPor favor respondé este mensaje con tu nombre completo para finalizar tu inscripción.\n\n✅ Hemos registrado tu número: ${telefono}`,
    },
  ];
}

export async function handleSorteoNombre({ telefono, nombre, leadsService, tenantId, sorteoConfig, textos }) {
  await leadsService.completeInscripcion({ tenantId, telefono, nombre });

  const actions = [
    {
      type: "reply",
      text: `✅ ¡Gracias ${nombre}! Estás participando del sorteo con el número ${telefono}. ¡Mucha suerte! 🎉`,
    },
  ];

  if (sorteoConfig?.sheetsWebhookUrl) {
    actions.push({ type: "sheetsExport", nombre, telefono, url: sorteoConfig.sheetsWebhookUrl });
  }

  actions.push({ type: "reply", text: textos.saludo });

  return actions;
}
