import _sodium from "libsodium-wrappers";

/**
 * Sella un sobre `[metaLen BE u32][metaJSON][body]` con un sealed box (X25519)
 * usando la llave publica del dispositivo del medico. El meta (nombre de
 * archivo, tipo, etc.) viaja cifrado dentro; la nube nunca lo ve. El mismo
 * formato lo descifra la app del medico (Rust) al sincronizar.
 *
 * Cliente: corre en el navegador del paciente con libsodium-wrappers.
 */
export async function sealEnvelope(
  publicKeyBase64: string,
  meta: Record<string, unknown>,
  body: Uint8Array
): Promise<string> {
  const metaBytes = new TextEncoder().encode(JSON.stringify(meta));
  const envelope = new Uint8Array(4 + metaBytes.length + body.length);
  new DataView(envelope.buffer).setUint32(0, metaBytes.length, false);
  envelope.set(metaBytes, 4);
  envelope.set(body, 4 + metaBytes.length);

  await _sodium.ready;
  const sodium = _sodium;
  const publicKey = sodium.from_base64(publicKeyBase64, sodium.base64_variants.ORIGINAL);
  // Sealed box: cifrado anonimo con la llave publica del medico. Solo el medico,
  // con su llave secreta local, puede abrirlo.
  const sealed = sodium.crypto_box_seal(envelope, publicKey);
  return sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);
}
