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

## Estado (paso 0)

Compuerta del paso 0: la app crea y abre su base cifrada, rechaza llaves incorrectas y el archivo en disco no es SQLite en claro (verificado por pruebas en `db.rs`). El modelo clinico completo llega en el paso 4.
