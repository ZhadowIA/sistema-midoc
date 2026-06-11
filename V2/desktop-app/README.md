# MiDoc — App del medico (escritorio)

Aplicacion instalable local-first de MiDoc V2: todo el dato clinico vive en una base SQLite **cifrada con SQLCipher** en el equipo del medico. Ver `../01_contexto_v2.md` (decision de arquitectura) y `../REGLAS_DESARROLLO.md` (reglas obligatorias).

## Stack

- Tauri 2 (shell nativo, Rust)
- React 18 + TypeScript estricto + Vite
- rusqlite con `bundled-sqlcipher-vendored-openssl` (SQLCipher compilado, sin dependencias del sistema)

## Comandos

```bash
npm install          # primera vez
npm run tauri dev    # app en modo desarrollo
npm run build        # typecheck + build del frontend
npm run tauri build  # instalador de produccion

cd src-tauri
cargo test           # pruebas de la capa Rust (incluye cifrado y migraciones)
cargo clippy         # lint de Rust
```

Requisitos de build en Windows: Rust (rustup, toolchain MSVC), VS Build Tools 2022 con C++, Strawberry Perl y NASM (estos dos solo para compilar OpenSSL/SQLCipher la primera vez).

## Base de datos cifrada

- Archivo: `%APPDATA%/com.midoc.app/midoc.db` (app data dir de Tauri).
- La frase de seguridad del medico se pasa a `PRAGMA key`; SQLCipher deriva la llave con PBKDF2-HMAC-SHA512 y salt por base. La frase nunca se persiste.
- Migraciones versionadas con `PRAGMA user_version` en `src-tauri/src/db.rs`, siempre dentro de transaccion (regla 6).
- Toda tabla nueva declara su clase de residencia (CLINICO / CONTACTO / OPERATIVO) en un comentario junto a la migracion (regla 4).

## Respaldo y restauracion (paso 9)

- Cada desbloqueo crea un respaldo cifrado automatico en `%APPDATA%/com.midoc.app/backups/midoc-<timestamp>.db`.
- El respaldo se genera con `VACUUM INTO` desde la conexion SQLCipher abierta, por lo que conserva el mismo cifrado de la base principal.
- Restauracion manual controlada: cerrar MiDoc, copiar el respaldo elegido como `midoc.db`, abrir la app con la misma frase de seguridad y verificar que la base desbloquee.
- Prueba automatizada de restauracion: `cd src-tauri && cargo test db::tests::backup -- --nocapture`. Cubre apertura con llave correcta, rechazo con llave incorrecta y que el archivo no sea SQLite en claro.

## Sincronizacion (paso 3, fase A)

La app descarga citas y preconsultas del portal a la base cifrada (contrato en `../13_contrato_sincronizacion.md`). Modulo `src-tauri/src/sync.rs`; comandos Tauri `link_account`, `sync_now`, `list_appointments`.

### Verificacion end-to-end

**Capa 2 — test automatizado contra portal vivo** (`sync.rs`, `#[ignore]`):

```bash
# 1. Portal arriba (en V2/consultorio-app): npm run dev  (necesita Postgres)
# 2. Desde V2/desktop-app/src-tauri:
cargo test sync::tests::e2e -- --ignored --nocapture
```

Reserva una cita en el portal por HTTP, la baja a una base cifrada temporal, y verifica que (a) la cita queda local y (b) el contenido clinico de la preconsulta se purga de la nube tras el ACK. Por depender de un portal vivo no corre en la suite normal (`cargo test` la omite).

**Capa 3 — smoke manual de GUI** (la ventana nativa de Tauri no es automatizable):

1. `npm run dev` en `V2/consultorio-app`.
2. `npm run tauri dev` en `V2/desktop-app`; desbloquear con una frase.
3. Vincular: URL `http://localhost:3000`, correo y contrasena del medico.
4. Reservar una cita en el portal (`/perfil/<slug>/agenda`).
5. En la app, "Sincronizar ahora": la cita aparece en la agenda.

## Atencion clinica (paso 4)

`src-tauri/src/clinical.rs`: la cita abre el encuentro (uno por cita), con expediente del paciente (antecedentes, alergias, historial de encuentros previos), nota SOAP **versionada** (cada guardado crea una version), receta e indicaciones. **Firmar y cerrar** congela el encuentro y guarda un hash SHA-256 del contenido final como evidencia de integridad (`verify_signature` lo recalcula y detecta alteraciones). Todos los cambios criticos quedan en `clinical_audit`. Nada de este modulo toca la red.

**Plantilla de especialidad:** la nota lleva un payload JSON de especialidad (`note_versions.specialty_payload`) que Rust trata como blob opaco — la estructura vive en el frontend. Se versiona y firma junto con la nota: alterarlo rompe la firma.

- **Paso 5 — medicina general/familiar:** factores de riesgo, revision por sistemas, exploracion, laboratorios, tamizajes, plan preventivo y seguimiento.
- **Paso 8 — odontologia:** el escritorio toma la especialidad del medico desde el portal al vincularse (`/api/admin/profile`) y activa el modulo dental local: odontograma por pieza/superficie, periodontograma por seis sitios, condiciones bucales, plan dental, higiene y proxima revision. Todo sigue viviendo y firmandose solo en la base cifrada local.

## Estado (paso 0)

Compuerta del paso 0: la app crea y abre su base cifrada, rechaza llaves incorrectas y el archivo en disco no es SQLite en claro (verificado por pruebas en `db.rs`).
