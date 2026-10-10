// Genera un par Ed25519 para firmar licencias (paso 29).
// Uso: npm run license:keygen -- <kid>
// La semilla privada va SOLO al entorno del portal (.env.local o el almacen de
// secretos del despliegue); nunca se commitea. La publica se fija en la app.
import { generateSigningSeed, publicKeyBase64, signingKeyFromSeed } from "../src/lib/security/license-token";

const kid = process.argv[2] ?? `midoc-${new Date().toISOString().slice(0, 10)}`;
const seed = generateSigningSeed();
const publicKey = publicKeyBase64(signingKeyFromSeed(kid, seed));

console.log("# Portal (.env.local o secretos del despliegue):");
console.log(`LICENSE_SIGNING_KID=${kid}`);
console.log(`LICENSE_SIGNING_KEY=${seed}`);
console.log("");
console.log("# App de escritorio (al compilar, o en src-tauri/.env en desarrollo):");
console.log(`MIDOC_LICENSE_PUBKEYS=${kid}:${publicKey}`);
