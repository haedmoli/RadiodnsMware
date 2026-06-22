/**
 * Parsea un bearer de RadioDNS (ej. fm:2a3.2016.10540) y devuelve los tópicos
 * STOMP correspondientes para imágenes y texto según la especificación RadioVIS.
 *
 * @param bearer Cadena identificadora del servicio de radio (ej. fm:ecc.pi.freq)
 * @throws Error si el bearer está mal formado
 */
export function parseBearer(bearer: string): { imageTopic: string; textTopic: string } {
  if (!bearer) {
    throw new Error('El bearer no puede estar vacío');
  }

  // Regex para validar formato fm:<ecc>.<pi>.<freq>
  // <ecc>: 3 caracteres hexadecimales
  // <pi>: 4 caracteres hexadecimales
  // <freq>: 5 dígitos decimales
  const regex = /^fm:([0-9a-fA-F]{3})\.([0-9a-fA-F]{4})\.(\d{5})$/;
  const match = bearer.trim().match(regex);

  if (!match) {
    throw new Error(
      `Formato de bearer no soportado o mal formado: "${bearer}". Debe cumplir con el formato "fm:<ecc>.<pi>.<freq>" (ej. fm:2a3.2016.10540)`
    );
  }

  const ecc = match[1].toLowerCase();
  const pi = match[2].toLowerCase();

  return {
    imageTopic: `/topic/${ecc}/${pi}/image`,
    textTopic: `/topic/${ecc}/${pi}/text`,
  };
}
