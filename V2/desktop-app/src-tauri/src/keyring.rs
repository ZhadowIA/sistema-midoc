//! Envoltura de llave por persona (paso 27, rebanada 2).
//!
//! Hasta ahora la passphrase del medico **era** la llave de SQLCipher: existia
//! una llave que abria todo o no abria nada, y no habia forma de dar acceso a
//! recepcion sin entregarle el expediente.
//!
//! Ahora la base se cifra con una **DEK** aleatoria, y cada persona guarda esa
//! DEK envuelta con una llave derivada de su propia credencial (Argon2id). El
//! archivo de envolturas vive **fuera** de la base por necesidad: no se puede
//! leer la envoltura desde el archivo que la envoltura abre.
//!
//! Riesgo que el diseño cuida: si el `rekey` ocurriera antes de que las
//! envolturas esten en disco, la base quedaria inabrible para siempre. Por eso
//! el orden es escribir primero (de forma atomica) y recifrar despues; si algo
//! falla en medio, la base sigue abriendose con la passphrase y el proceso se
//! reintenta solo en el siguiente arranque.

use std::fs;
use std::path::{Path, PathBuf};

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use dryoc::dryocsecretbox::{DryocSecretBox, Key, Nonce};
use dryoc::pwhash::{Config, PwHash, Salt};
use dryoc::types::{Bytes, NewByteArray};

pub const KEYS_FILE: &str = "keys.json";

/// Parametros de Argon2id, equivalentes a los `interactive` de libsodium. Se
/// fijan aqui y se guardan en cada envoltura: si algun dia se suben, las
/// envolturas viejas siguen abriendo con los suyos.
const ARGON_OPSLIMIT: u64 = 2;
const ARGON_MEMLIMIT: usize = 67_108_864; // 64 MiB
const SALT_LEN: usize = 16;

/// Rol de quien abre la base. Determina que puede hacer, no que puede leer:
/// la separacion fisica de lo clinico llega en la rebanada 3.
pub const ROLE_DOCTOR: &str = "DOCTOR";
pub const ROLE_RECEPCION: &str = "RECEPCION";

#[derive(Debug, thiserror::Error)]
pub enum KeyringError {
    #[error("no se pudo leer el archivo de llaves: {0}")]
    Io(#[from] std::io::Error),
    #[error("el archivo de llaves esta corrupto: {0}")]
    Corrupt(String),
    #[error("credencial incorrecta")]
    BadCredential,
    #[error("error de cifrado")]
    Crypto,
}

/// Una persona con acceso, y la DEK envuelta con su credencial.
#[derive(Clone, serde::Deserialize, serde::Serialize)]
pub struct UserWrap {
    pub id: String,
    pub name: String,
    pub role: String,
    /// Argon2id: sal y parametros con los que se derivo la llave envolvente.
    salt: String,
    opslimit: u64,
    memlimit: usize,
    /// nonce(24) || mac(16) || DEK cifrada
    wrapped_dek: String,
    pub created_at: String,
}

#[derive(Clone, serde::Deserialize, serde::Serialize)]
pub struct KeyFile {
    pub version: u32,
    pub users: Vec<UserWrap>,
}

/// Quien abrio la base. Lo que la sesion necesita saber del actor.
#[derive(Clone, Debug, serde::Serialize)]
pub struct Actor {
    pub id: String,
    pub name: String,
    pub role: String,
}

pub fn keys_path(db_path: &Path) -> PathBuf {
    db_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(KEYS_FILE)
}

pub fn read_key_file(db_path: &Path) -> Result<Option<KeyFile>, KeyringError> {
    let path = keys_path(db_path);
    if !path.exists() {
        return Ok(None);
    }
    let raw = fs::read_to_string(&path)?;
    let parsed: KeyFile =
        serde_json::from_str(&raw).map_err(|e| KeyringError::Corrupt(e.to_string()))?;
    Ok(Some(parsed))
}

/// Escritura atomica: se guarda en un temporal y se renombra. Un corte de luz
/// a media escritura deja el archivo anterior intacto en vez de uno truncado,
/// que dejaria la base inabrible.
fn write_key_file(db_path: &Path, file: &KeyFile) -> Result<(), KeyringError> {
    let path = keys_path(db_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let tmp = path.with_extension("json.tmp");
    let raw = serde_json::to_string_pretty(file).map_err(|e| KeyringError::Corrupt(e.to_string()))?;
    fs::write(&tmp, raw)?;
    fs::rename(&tmp, &path)?;
    Ok(())
}

/// Deriva la llave envolvente de una credencial. Argon2id con parametros
/// `interactive`: el desbloqueo ocurre a mano y con el paciente enfrente, asi
/// que no puede tardar segundos.
fn derive_kek(
    passphrase: &str,
    salt: &Salt,
    opslimit: u64,
    memlimit: usize,
) -> Result<Key, KeyringError> {
    let config = Config::default()
        .with_opslimit(opslimit)
        .with_memlimit(memlimit)
        .with_hash_length(32)
        .with_salt_length(salt.len());

    let hash: PwHash<Vec<u8>, Salt> =
        PwHash::hash_with_salt(&passphrase.as_bytes().to_vec(), salt.clone(), config)
            .map_err(|_| KeyringError::Crypto)?;
    let (bytes, _, _) = hash.into_parts();
    let array: [u8; 32] = bytes.as_slice().try_into().map_err(|_| KeyringError::Crypto)?;
    Ok(Key::from(array))
}

fn random_bytes(len: usize) -> Vec<u8> {
    let mut bytes = vec![0u8; len];
    dryoc::rng::copy_randombytes(&mut bytes);
    bytes
}

fn wrap_dek(dek: &[u8; 32], passphrase: &str) -> Result<(String, String, u64, usize), KeyringError> {
    let salt: Salt = random_bytes(SALT_LEN);
    let (opslimit, memlimit) = (ARGON_OPSLIMIT, ARGON_MEMLIMIT);
    let kek = derive_kek(passphrase, &salt, opslimit, memlimit)?;

    let nonce = Nonce::gen();
    let sealed = DryocSecretBox::encrypt_to_vecbox(dek.as_slice(), &nonce, &kek);
    let mut payload = Vec::with_capacity(nonce.len() + 48);
    payload.extend_from_slice(nonce.as_slice());
    payload.extend_from_slice(&sealed.to_vec());

    Ok((
        BASE64.encode(salt.as_slice()),
        BASE64.encode(&payload),
        opslimit,
        memlimit,
    ))
}

fn unwrap_dek(user: &UserWrap, passphrase: &str) -> Result<[u8; 32], KeyringError> {
    let salt: Salt = BASE64
        .decode(&user.salt)
        .map_err(|_| KeyringError::Corrupt("sal invalida".into()))?;

    let payload = BASE64
        .decode(&user.wrapped_dek)
        .map_err(|_| KeyringError::Corrupt("envoltura invalida".into()))?;
    if payload.len() < 24 + 16 {
        return Err(KeyringError::Corrupt("envoltura truncada".into()));
    }
    let nonce_array: [u8; 24] = payload[..24]
        .try_into()
        .map_err(|_| KeyringError::Corrupt("nonce invalido".into()))?;
    let nonce = Nonce::from(nonce_array);

    let kek = derive_kek(passphrase, &salt, user.opslimit, user.memlimit)?;
    let sealed = DryocSecretBox::from_bytes(&payload[24..]).map_err(|_| KeyringError::Crypto)?;
    let dek = sealed
        .decrypt_to_vec(&nonce, &kek)
        // Una credencial equivocada falla aqui: el MAC no cuadra.
        .map_err(|_| KeyringError::BadCredential)?;

    dek.as_slice()
        .try_into()
        .map_err(|_| KeyringError::Corrupt("DEK de tamano invalido".into()))
}

/// La DEK en el formato que SQLCipher espera para `PRAGMA key`: hexadecimal
/// crudo entre `x'...'`, para que no la trate como passphrase a derivar.
pub fn dek_to_pragma(dek: &[u8; 32]) -> String {
    let hex: String = dek.iter().map(|b| format!("{b:02x}")).collect();
    format!("x'{hex}'")
}

pub fn generate_dek() -> [u8; 32] {
    let key = Key::gen();
    let mut dek = [0u8; 32];
    dek.copy_from_slice(key.as_slice());
    dek
}

/// Prueba la credencial contra cada envoltura y devuelve la DEK y quien abrio.
/// No se pide identificarse antes: la credencial misma dice quien es.
pub fn unlock(file: &KeyFile, passphrase: &str) -> Result<([u8; 32], Actor), KeyringError> {
    for user in &file.users {
        if let Ok(dek) = unwrap_dek(user, passphrase) {
            return Ok((
                dek,
                Actor {
                    id: user.id.clone(),
                    name: user.name.clone(),
                    role: user.role.clone(),
                },
            ));
        }
    }
    Err(KeyringError::BadCredential)
}

/// Crea el archivo de envolturas con su primer usuario (el medico).
pub fn provision(
    db_path: &Path,
    dek: &[u8; 32],
    passphrase: &str,
    name: &str,
) -> Result<Actor, KeyringError> {
    let (salt, wrapped_dek, opslimit, memlimit) = wrap_dek(dek, passphrase)?;
    let user = UserWrap {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        role: ROLE_DOCTOR.into(),
        salt,
        opslimit,
        memlimit,
        wrapped_dek,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let actor = Actor {
        id: user.id.clone(),
        name: user.name.clone(),
        role: user.role.clone(),
    };
    write_key_file(db_path, &KeyFile { version: 1, users: vec![user] })?;
    Ok(actor)
}

/// Agrega una persona con su propia credencial sobre la MISMA base. Es lo que
/// permite darle acceso a recepcion sin compartir la passphrase del medico.
pub fn add_user(
    db_path: &Path,
    dek: &[u8; 32],
    passphrase: &str,
    name: &str,
    role: &str,
) -> Result<Actor, KeyringError> {
    let mut file = read_key_file(db_path)?
        .ok_or_else(|| KeyringError::Corrupt("no hay archivo de llaves".into()))?;

    // Una credencial que ya abre no puede reusarse: dos personas con la misma
    // clave harian imposible saber quien hizo que en la bitacora.
    if unlock(&file, passphrase).is_ok() {
        return Err(KeyringError::Corrupt(
            "esa credencial ya esta en uso por otra persona".into(),
        ));
    }

    let (salt, wrapped_dek, opslimit, memlimit) = wrap_dek(dek, passphrase)?;
    let user = UserWrap {
        id: uuid::Uuid::new_v4().to_string(),
        name: name.to_string(),
        role: role.to_string(),
        salt,
        opslimit,
        memlimit,
        wrapped_dek,
        created_at: chrono::Utc::now().to_rfc3339(),
    };
    let actor = Actor {
        id: user.id.clone(),
        name: user.name.clone(),
        role: user.role.clone(),
    };
    file.users.push(user);
    write_key_file(db_path, &file)?;
    Ok(actor)
}

/// Retira el acceso de una persona. Nunca se retira al ultimo medico: dejaria
/// la base sin dueño y, si era la unica envoltura, inabrible para siempre.
pub fn remove_user(db_path: &Path, user_id: &str) -> Result<(), KeyringError> {
    let mut file = read_key_file(db_path)?
        .ok_or_else(|| KeyringError::Corrupt("no hay archivo de llaves".into()))?;

    let doctors_left = file
        .users
        .iter()
        .filter(|u| u.role == ROLE_DOCTOR && u.id != user_id)
        .count();
    if doctors_left == 0 {
        return Err(KeyringError::Corrupt(
            "no puedes quitar al ultimo medico con acceso".into(),
        ));
    }

    file.users.retain(|u| u.id != user_id);
    write_key_file(db_path, &file)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir()
            .join("midoc-keyring-tests")
            .join(format!("{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn db_in(dir: &Path) -> PathBuf {
        dir.join("midoc.db")
    }

    #[test]
    fn each_person_opens_the_same_base_with_their_own_credential() {
        let dir = temp_dir("dos-personas");
        let db = db_in(&dir);
        let dek = generate_dek();

        provision(&db, &dek, "clave-del-medico", "Dra. Ruiz").unwrap();
        add_user(&db, &dek, "pin-de-recepcion", "Marta", ROLE_RECEPCION).unwrap();

        let file = read_key_file(&db).unwrap().unwrap();

        // La credencial dice quien es: no hay que elegir usuario antes.
        let (dek_medico, medico) = unlock(&file, "clave-del-medico").unwrap();
        assert_eq!(medico.role, ROLE_DOCTOR);
        assert_eq!(medico.name, "Dra. Ruiz");

        let (dek_recepcion, recepcion) = unlock(&file, "pin-de-recepcion").unwrap();
        assert_eq!(recepcion.role, ROLE_RECEPCION);

        // Ambas envolturas guardan la MISMA llave: es una sola base.
        assert_eq!(dek_medico, dek);
        assert_eq!(dek_recepcion, dek);
        assert_ne!(medico.id, recepcion.id);
    }

    #[test]
    fn a_wrong_credential_opens_nothing() {
        let dir = temp_dir("credencial-mala");
        let db = db_in(&dir);
        let dek = generate_dek();
        provision(&db, &dek, "clave-correcta", "Dra. Ruiz").unwrap();

        let file = read_key_file(&db).unwrap().unwrap();
        assert!(matches!(
            unlock(&file, "clave-incorrecta"),
            Err(KeyringError::BadCredential)
        ));
    }

    #[test]
    fn the_key_file_never_holds_the_key_in_the_clear() {
        let dir = temp_dir("sin-llave-en-claro");
        let db = db_in(&dir);
        let dek = generate_dek();
        provision(&db, &dek, "clave-del-medico", "Dra. Ruiz").unwrap();

        let raw = fs::read_to_string(keys_path(&db)).unwrap();
        assert!(!raw.contains(&BASE64.encode(dek)), "la DEK quedo legible");
        assert!(!raw.contains("clave-del-medico"), "la credencial quedo legible");
    }

    #[test]
    fn two_people_cannot_share_one_credential() {
        // Si dos personas abren con la misma clave, la bitacora no puede decir
        // quien hizo que, y toda la separacion de roles se vuelve decorativa.
        let dir = temp_dir("credencial-repetida");
        let db = db_in(&dir);
        let dek = generate_dek();
        provision(&db, &dek, "la-misma-clave", "Dra. Ruiz").unwrap();

        assert!(add_user(&db, &dek, "la-misma-clave", "Marta", ROLE_RECEPCION).is_err());
    }

    #[test]
    fn the_last_doctor_cannot_be_locked_out_of_their_own_record() {
        let dir = temp_dir("ultimo-medico");
        let db = db_in(&dir);
        let dek = generate_dek();
        let medico = provision(&db, &dek, "clave-del-medico", "Dra. Ruiz").unwrap();
        let recepcion = add_user(&db, &dek, "pin-recepcion", "Marta", ROLE_RECEPCION).unwrap();

        // Quitar a recepcion es normal.
        remove_user(&db, &recepcion.id).unwrap();
        // Quitar al unico medico dejaria la base sin dueño.
        assert!(remove_user(&db, &medico.id).is_err());

        let file = read_key_file(&db).unwrap().unwrap();
        assert_eq!(file.users.len(), 1);
        assert!(unlock(&file, "clave-del-medico").is_ok());
        assert!(unlock(&file, "pin-recepcion").is_err());
    }

    #[test]
    fn the_pragma_key_is_raw_hex_not_a_passphrase() {
        // Si la DEK se pasara como texto, SQLCipher la derivaria otra vez y la
        // llave real no seria la que guardamos.
        let dek = [0xabu8; 32];
        let pragma = dek_to_pragma(&dek);
        assert!(pragma.starts_with("x'") && pragma.ends_with('\''));
        assert_eq!(pragma.len(), 2 + 64 + 1);
        assert!(pragma.contains("abab"));
    }
}
