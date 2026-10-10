//! Licencia de compra unica (paso 29, rebanada 2).
//!
//! Clase de residencia: OPERATIVO (cuenta, medico y equipo; nada clinico). El
//! portal entrega una licencia firmada con Ed25519 al activar el equipo y la app
//! la verifica aqui, sin red, con las llaves publicas que trae fijadas. Despues
//! de activar, todo lo que no es IA en la nube funciona sin conexion aunque
//! MiDoc deje de existir: la licencia no caduca; `updates_until` solo dice hasta
//! cuando corresponden versiones nuevas.
//!
//! Formato (igual al del portal, `lib/security/license-token.ts`):
//! `base64url(payload JSON) "." base64url(firma Ed25519 de esos bytes)`.
//!
//! Llaves de confianza: `MIDOC_LICENSE_PUBKEYS` ("kid:base64,kid2:base64") fijada
//! al compilar; en compilaciones de depuracion tambien la del entorno
//! (`src-tauri/.env`), para desarrollo. Sin llaves, nada se activa.

use base64::{
    engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD},
    Engine as _,
};
use dryoc::classic::crypto_sign::crypto_sign_verify_detached;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::sync;

const LICENSE_KEY: &str = "license_token";
const INSTALLATION_KEY: &str = "installation_id";
const TOKEN_VERSION: u32 = 1;

#[derive(Debug, thiserror::Error)]
pub enum LicenseError {
    #[error("{0}")]
    Invalid(String),
    #[error("{0}")]
    Sync(#[from] sync::SyncError),
}

/// Lo que firma el portal. Campos en camelCase, como en el JSON firmado.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub v: u32,
    pub kid: String,
    pub license_id: String,
    pub activation_id: String,
    pub account_id: String,
    pub holder_name: Option<String>,
    pub holder_license_number: Option<String>,
    pub edition: String,
    pub purchased_at: String,
    pub updates_until: String,
    pub max_devices: u32,
    pub installation_id: String,
    pub issued_at: String,
}

#[derive(Debug, Clone)]
pub struct TrustedKey {
    pub kid: String,
    pub public_key: [u8; 32],
}

/// Estado de la licencia en este equipo, para la interfaz.
#[derive(Debug, Serialize, PartialEq)]
pub struct LicenseStatus {
    /// "VALID", "MISSING" o "INVALID".
    pub state: &'static str,
    /// Por que no es valida (INVALID).
    pub reason: Option<String>,
    pub holder_name: Option<String>,
    pub holder_license_number: Option<String>,
    pub edition: Option<String>,
    pub purchased_at: Option<String>,
    pub updates_until: Option<String>,
    /// Hoy todavia corresponden actualizaciones. La app funciona igual si no.
    pub updates_included: bool,
    pub max_devices: Option<u32>,
}

impl LicenseStatus {
    fn without_license(state: &'static str, reason: Option<String>) -> Self {
        Self {
            state,
            reason,
            holder_name: None,
            holder_license_number: None,
            edition: None,
            purchased_at: None,
            updates_until: None,
            updates_included: false,
            max_devices: None,
        }
    }
}

/// "kid:base64,kid2:base64". Las entradas mal formadas se ignoran.
pub fn parse_trusted_keys(spec: &str) -> Vec<TrustedKey> {
    spec.split(',')
        .filter_map(|entry| {
            let (kid, key) = entry.trim().split_once(':')?;
            let bytes = STANDARD.decode(key.trim()).ok()?;
            let public_key: [u8; 32] = bytes.try_into().ok()?;
            let kid = kid.trim();
            (!kid.is_empty()).then(|| TrustedKey {
                kid: kid.to_string(),
                public_key,
            })
        })
        .collect()
}

/// Llaves en las que confia esta compilacion.
pub fn trusted_keys() -> Vec<TrustedKey> {
    let mut keys = option_env!("MIDOC_LICENSE_PUBKEYS")
        .map(parse_trusted_keys)
        .unwrap_or_default();
    if cfg!(debug_assertions) {
        if let Ok(spec) = std::env::var("MIDOC_LICENSE_PUBKEYS") {
            keys.extend(parse_trusted_keys(&spec));
        }
    }
    keys
}

/// Verifica firma y forma. No revisa a que equipo pertenece.
pub fn verify_token(token: &str, keys: &[TrustedKey]) -> Result<LicensePayload, LicenseError> {
    let invalid = |message: &str| LicenseError::Invalid(message.to_string());
    let (body_part, signature_part) = token
        .trim()
        .split_once('.')
        .ok_or_else(|| invalid("Licencia con formato inválido."))?;
    let body = URL_SAFE_NO_PAD
        .decode(body_part)
        .map_err(|_| invalid("Licencia con formato inválido."))?;
    let signature: [u8; 64] = URL_SAFE_NO_PAD
        .decode(signature_part)
        .ok()
        .and_then(|bytes| bytes.try_into().ok())
        .ok_or_else(|| invalid("Licencia con formato inválido."))?;

    // Antes de verificar solo se lee el kid, para elegir la llave.
    let unverified: serde_json::Value =
        serde_json::from_slice(&body).map_err(|_| invalid("Licencia con formato inválido."))?;
    let kid = unverified["kid"].as_str().unwrap_or_default();
    let key = keys
        .iter()
        .find(|key| key.kid == kid)
        .ok_or_else(|| invalid("Licencia firmada con una llave desconocida."))?;
    crypto_sign_verify_detached(&signature, &body, &key.public_key)
        .map_err(|_| invalid("La firma de la licencia no es válida."))?;

    let payload: LicensePayload = serde_json::from_value(unverified)
        .map_err(|_| invalid("Licencia con formato inválido."))?;
    if payload.v != TOKEN_VERSION {
        return Err(invalid(
            "Versión de licencia no soportada; actualiza MiDoc.",
        ));
    }
    Ok(payload)
}

/// Id aleatorio de esta instalacion (uno por perfil). La licencia se liga a el.
pub fn installation_id(conn: &Connection) -> Result<String, LicenseError> {
    if let Some(id) = sync::get_state(conn, INSTALLATION_KEY)? {
        return Ok(id);
    }
    let id = uuid::Uuid::new_v4().to_string();
    sync::set_state(conn, INSTALLATION_KEY, &id)?;
    Ok(id)
}

/// Verifica la licencia que llega del portal y la guarda. Una licencia invalida
/// o de otro equipo no sustituye a la que ya hubiera.
pub fn store(
    conn: &Connection,
    token: &str,
    keys: &[TrustedKey],
) -> Result<LicensePayload, LicenseError> {
    let payload = verify_token(token, keys)?;
    if payload.installation_id != installation_id(conn)? {
        return Err(LicenseError::Invalid(
            "La licencia recibida es de otro equipo.".into(),
        ));
    }
    sync::set_state(conn, LICENSE_KEY, token.trim())?;
    Ok(payload)
}

/// Estado de la licencia guardada, verificada sin red.
pub fn status(
    conn: &Connection,
    keys: &[TrustedKey],
    today: chrono::NaiveDate,
) -> Result<LicenseStatus, LicenseError> {
    let Some(token) = sync::get_state(conn, LICENSE_KEY)? else {
        return Ok(LicenseStatus::without_license("MISSING", None));
    };
    let payload = match verify_token(&token, keys) {
        Ok(payload) => payload,
        Err(error) => {
            return Ok(LicenseStatus::without_license(
                "INVALID",
                Some(error.to_string()),
            ))
        }
    };
    if payload.installation_id != installation_id(conn)? {
        return Ok(LicenseStatus::without_license(
            "INVALID",
            Some(
                "La licencia guardada es de otro equipo. Activa este equipo con tu cuenta.".into(),
            ),
        ));
    }
    let updates_included = chrono::NaiveDate::parse_from_str(&payload.updates_until, "%Y-%m-%d")
        .map(|until| today <= until)
        .unwrap_or(false);
    Ok(LicenseStatus {
        state: "VALID",
        reason: None,
        holder_name: payload.holder_name,
        holder_license_number: payload.holder_license_number,
        edition: Some(payload.edition),
        purchased_at: Some(payload.purchased_at),
        updates_until: Some(payload.updates_until),
        updates_included,
        max_devices: Some(payload.max_devices),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_encrypted;
    use dryoc::classic::crypto_sign::{crypto_sign_detached, crypto_sign_seed_keypair};

    fn test_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join("midoc-license-tests");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(format!("{name}-{}.db", uuid::Uuid::new_v4()));
        open_encrypted(&path, "frase-de-prueba-123").unwrap()
    }

    /// Licencia firmada por el portal (Node) con una semilla solo de pruebas.
    fn fixture() -> serde_json::Value {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("test_data/license/portal-signed.json");
        serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
    }

    fn fixture_keys() -> Vec<TrustedKey> {
        let f = fixture();
        parse_trusted_keys(&format!(
            "{}:{}",
            f["kid"].as_str().unwrap(),
            f["publicKey"].as_str().unwrap()
        ))
    }

    /// Firma bytes como lo haria el portal, con la semilla de la fixture.
    fn sign_bytes(body: &[u8]) -> String {
        let seed: [u8; 32] = STANDARD
            .decode(fixture()["seedBase64"].as_str().unwrap())
            .unwrap()
            .try_into()
            .unwrap();
        let (_, secret) = crypto_sign_seed_keypair(&seed);
        let mut signature = [0u8; 64];
        crypto_sign_detached(&mut signature, body, &secret).unwrap();
        format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(body),
            URL_SAFE_NO_PAD.encode(signature)
        )
    }

    fn sign(payload: &serde_json::Value) -> String {
        sign_bytes(&serde_json::to_vec(payload).unwrap())
    }

    fn payload_for(installation: &str) -> serde_json::Value {
        let mut payload = fixture()["payload"].clone();
        payload["installationId"] = serde_json::json!(installation);
        payload
    }

    fn today() -> chrono::NaiveDate {
        chrono::NaiveDate::from_ymd_opt(2026, 10, 6).unwrap()
    }

    #[test]
    fn verifies_a_license_signed_by_the_portal() {
        let f = fixture();
        let payload = verify_token(f["token"].as_str().unwrap(), &fixture_keys()).unwrap();
        assert_eq!(payload.holder_license_number.as_deref(), Some("1234567"));
        assert_eq!(payload.updates_until, "2027-10-06");
        assert_eq!(payload.max_devices, 2);
        // Ed25519 es determinista: firmar en Rust los mismos bytes que firmo el
        // portal da exactamente la misma licencia.
        let token = f["token"].as_str().unwrap();
        let body = URL_SAFE_NO_PAD
            .decode(token.split_once('.').unwrap().0)
            .unwrap();
        assert_eq!(sign_bytes(&body), token);
    }

    #[test]
    fn rejects_tampered_unknown_and_malformed_licenses() {
        let token = fixture()["token"].as_str().unwrap().to_string();
        let (_, signature) = token.split_once('.').unwrap();
        let mut forged = fixture()["payload"].clone();
        forged["maxDevices"] = serde_json::json!(50);
        let forged = format!(
            "{}.{signature}",
            URL_SAFE_NO_PAD.encode(serde_json::to_vec(&forged).unwrap())
        );
        assert!(verify_token(&forged, &fixture_keys())
            .unwrap_err()
            .to_string()
            .contains("firma"));

        assert!(verify_token(&token, &[])
            .unwrap_err()
            .to_string()
            .contains("desconocida"));
        let other = parse_trusted_keys(&format!("test-fixture:{}", STANDARD.encode([9u8; 32])));
        assert!(verify_token(&token, &other).is_err());
        assert!(verify_token("sin-punto", &fixture_keys()).is_err());
        assert!(verify_token("a.b", &fixture_keys()).is_err());

        let mut future = fixture()["payload"].clone();
        future["v"] = serde_json::json!(2);
        assert!(verify_token(&sign(&future), &fixture_keys())
            .unwrap_err()
            .to_string()
            .contains("Versión"));
    }

    #[test]
    fn stores_only_valid_licenses_for_this_installation() {
        let conn = test_conn("store");
        let keys = fixture_keys();
        assert_eq!(status(&conn, &keys, today()).unwrap().state, "MISSING");

        let installation = installation_id(&conn).unwrap();
        assert_eq!(
            installation_id(&conn).unwrap(),
            installation,
            "el id de instalacion es estable"
        );

        let other = sign(&payload_for(&uuid::Uuid::new_v4().to_string()));
        assert!(store(&conn, &other, &keys)
            .unwrap_err()
            .to_string()
            .contains("otro equipo"));
        assert_eq!(status(&conn, &keys, today()).unwrap().state, "MISSING");

        let mine = sign(&payload_for(&installation));
        store(&conn, &mine, &keys).unwrap();
        let valid = status(&conn, &keys, today()).unwrap();
        assert_eq!(valid.state, "VALID");
        assert_eq!(valid.holder_name.as_deref(), Some("Dra. Eva Soto"));
        assert!(valid.updates_included);

        // Una invalida no sustituye a la buena.
        assert!(store(&conn, "basura.basura", &keys).is_err());
        assert_eq!(status(&conn, &keys, today()).unwrap().state, "VALID");
    }

    #[test]
    fn keeps_working_after_updates_end_and_without_link() {
        let conn = test_conn("expired");
        let keys = fixture_keys();
        let token = sign(&payload_for(&installation_id(&conn).unwrap()));
        store(&conn, &token, &keys).unwrap();

        let years_later = chrono::NaiveDate::from_ymd_opt(2031, 1, 1).unwrap();
        let later = status(&conn, &keys, years_later).unwrap();
        assert_eq!(later.state, "VALID", "la licencia no caduca");
        assert!(
            !later.updates_included,
            "solo dejan de corresponder actualizaciones"
        );

        // Desvincular borra el token de sincronizacion, no la licencia.
        sync::set_state(&conn, "device_token", "token").unwrap();
        sync::delete_state(&conn, "device_token").unwrap();
        assert_eq!(status(&conn, &keys, today()).unwrap().state, "VALID");
    }

    #[test]
    fn a_copied_license_from_another_installation_is_invalid() {
        let conn = test_conn("copied");
        let keys = fixture_keys();
        installation_id(&conn).unwrap();
        // Alguien pega en la base una licencia de otra instalacion.
        sync::set_state(
            &conn,
            LICENSE_KEY,
            &sign(&payload_for(&uuid::Uuid::new_v4().to_string())),
        )
        .unwrap();
        let copied = status(&conn, &keys, today()).unwrap();
        assert_eq!(copied.state, "INVALID");
        assert!(copied.reason.unwrap().contains("otro equipo"));

        sync::set_state(&conn, LICENSE_KEY, "alterada.firma").unwrap();
        assert_eq!(status(&conn, &keys, today()).unwrap().state, "INVALID");
    }

    #[test]
    fn parses_trusted_keys_and_ignores_garbage() {
        let good = STANDARD.encode([1u8; 32]);
        let keys = parse_trusted_keys(&format!(
            " prod-2026:{good} , roto , corto:{} ,:{good}",
            STANDARD.encode([1u8; 8])
        ));
        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0].kid, "prod-2026");
        assert!(parse_trusted_keys("").is_empty());
    }
}
