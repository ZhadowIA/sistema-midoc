//! Cifrado E2E del buzon de documentos (paso 6, Fase B del
//! `13_contrato_sincronizacion.md`).
//!
//! El medico tiene un par de llaves X25519. La llave **secreta** vive solo en
//! esta base cifrada (clase OPERATIVO: material de llave, nunca sale del
//! equipo); la **publica** se publica al portal al vincular el dispositivo.
//!
//! El paciente cifra cada archivo con un *sealed box* de libsodium usando la
//! llave publica del medico: la nube almacena solo ciphertext y jamas puede
//! leerlo (residencia 1). El medico descifra localmente con su par de llaves.
//! `dryoc` es interoperable con el `crypto_box_seal` de libsodium-wrappers que
//! corre en la pagina de carga del paciente.

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use dryoc::dryocbox::{DryocBox, KeyPair};
use dryoc::types::StackByteArray;
use rusqlite::Connection;

use crate::sync::{get_state, set_state, SyncError};

const SECRET_KEY_STATE: &str = "document_secret_key";
const PUBLIC_KEY_STATE: &str = "document_public_key";

#[derive(Debug, thiserror::Error)]
pub enum CryptoError {
    #[error("error de base de datos: {0}")]
    State(#[from] SyncError),
    // InvalidKey/Decrypt los construye el descifrado (rebanada 3, sync Fase B);
    // ya cubiertos por pruebas, aun sin cableado de produccion.
    #[allow(dead_code)]
    #[error("material de llave invalido")]
    InvalidKey,
    #[allow(dead_code)]
    #[error("no se pudo descifrar el documento")]
    Decrypt,
}

#[allow(dead_code)] // usado por unseal_document (rebanada 3) y pruebas.
fn decode_key(value: &str) -> Result<[u8; 32], CryptoError> {
    let bytes = BASE64.decode(value).map_err(|_| CryptoError::InvalidKey)?;
    bytes.try_into().map_err(|_| CryptoError::InvalidKey)
}

#[allow(dead_code)] // usado por unseal_document (rebanada 3) y pruebas.
fn keypair_from(secret_b64: &str, public_b64: &str) -> Result<KeyPair, CryptoError> {
    let secret = decode_key(secret_b64)?;
    let public = decode_key(public_b64)?;
    Ok(KeyPair {
        public_key: StackByteArray::from(public),
        secret_key: StackByteArray::from(secret),
    })
}

/// Garantiza que exista el par de llaves del medico y devuelve la llave
/// publica en base64. Idempotente: si ya existe, no la regenera (regenerarla
/// dejaria ilegibles los documentos cifrados con la anterior).
pub fn ensure_keypair(conn: &Connection) -> Result<String, CryptoError> {
    if let (Some(_secret), Some(public)) = (
        get_state(conn, SECRET_KEY_STATE)?,
        get_state(conn, PUBLIC_KEY_STATE)?,
    ) {
        return Ok(public);
    }

    let keypair = KeyPair::gen();
    let secret_b64 = BASE64.encode(&keypair.secret_key[..]);
    let public_b64 = BASE64.encode(&keypair.public_key[..]);

    set_state(conn, SECRET_KEY_STATE, &secret_b64)?;
    set_state(conn, PUBLIC_KEY_STATE, &public_b64)?;

    Ok(public_b64)
}

/// Llave publica actual del medico (None si aun no se ha generado).
#[allow(dead_code)] // expuesta para la UI/rebanada 3; ya cubierta por pruebas.
pub fn document_public_key(conn: &Connection) -> Result<Option<String>, CryptoError> {
    Ok(get_state(conn, PUBLIC_KEY_STATE)?)
}

/// Descifra un documento del buzon (sealed box base64) con el par de llaves
/// del medico. Usado por la sincronizacion Fase B.
#[allow(dead_code)] // cableado en la rebanada 3 (sync Fase B); ya con pruebas.
pub fn unseal_document(conn: &Connection, sealed_b64: &str) -> Result<Vec<u8>, CryptoError> {
    let secret = get_state(conn, SECRET_KEY_STATE)?.ok_or(CryptoError::InvalidKey)?;
    let public = get_state(conn, PUBLIC_KEY_STATE)?.ok_or(CryptoError::InvalidKey)?;
    let keypair = keypair_from(&secret, &public)?;

    let sealed = BASE64
        .decode(sealed_b64)
        .map_err(|_| CryptoError::Decrypt)?;
    let dryocbox = DryocBox::from_sealed_bytes(&sealed).map_err(|_| CryptoError::Decrypt)?;
    dryocbox
        .unseal_to_vec(&keypair)
        .map_err(|_| CryptoError::Decrypt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-crypto-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        open_encrypted(&path, "clave-de-prueba").unwrap()
    }

    #[test]
    fn keypair_is_stable_across_calls() {
        let conn = test_conn("stable");
        let first = ensure_keypair(&conn).unwrap();
        let second = ensure_keypair(&conn).unwrap();
        assert_eq!(first, second, "no debe regenerarse la llave");
        assert_eq!(decode_key(&first).unwrap().len(), 32);
    }

    #[test]
    fn public_key_absent_until_generated() {
        let conn = test_conn("absent");
        assert!(document_public_key(&conn).unwrap().is_none());
        let public = ensure_keypair(&conn).unwrap();
        assert_eq!(document_public_key(&conn).unwrap(), Some(public));
    }

    #[test]
    fn seals_with_public_and_unseals_with_keypair() {
        // El paciente (web) sella con la publica; el medico descifra aqui.
        let conn = test_conn("roundtrip");
        let public_b64 = ensure_keypair(&conn).unwrap();
        let public = decode_key(&public_b64).unwrap();

        let message = b"resultado de laboratorio: hemoglobina 14.2";
        // Formato raw libsodium (epk||mac||ciphertext), igual que el
        // crypto_box_seal que corre en la pagina de carga del paciente.
        let sealed = DryocBox::seal_to_vecbox(message, &StackByteArray::from(public))
            .unwrap()
            .to_vec();
        let sealed_b64 = BASE64.encode(&sealed);

        let decrypted = unseal_document(&conn, &sealed_b64).unwrap();
        assert_eq!(decrypted, message);
    }

    #[test]
    fn rejects_tampered_ciphertext() {
        let conn = test_conn("tampered");
        let public_b64 = ensure_keypair(&conn).unwrap();
        let public = decode_key(&public_b64).unwrap();
        let mut sealed = DryocBox::seal_to_vecbox(b"dato", &StackByteArray::from(public))
            .unwrap()
            .to_vec();
        let last = sealed.len() - 1;
        sealed[last] ^= 0xff;
        let sealed_b64 = BASE64.encode(&sealed);
        assert!(unseal_document(&conn, &sealed_b64).is_err());
    }
}
