// Devuelve texto a responder para las opciones fijas del menú, o null si el texto
// recibido no matchea ninguna opción (para que el caller decida el fallback/saludo).
export function handleMenuOption(texto, textos) {
  switch (texto) {
    case "1":
      return textos.carta;
    case "2":
      return textos.horarios;
    case "3":
      return textos.reservas;
    case "4":
      return textos.ubicacion;
    case "5":
      return textos.humano;
    default:
      return null;
  }
}
