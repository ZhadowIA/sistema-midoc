# Paso 9 — Auto-actualización Tauri y rollback

Objetivo: definir el canal de auto-actualización de la app de escritorio
(Tauri 2.11) y el procedimiento de rollback ante una versión defectuosa, sin
comprometer la residencia local de los datos clínicos.

> Estado: **diseño listo para ejecutar.** Los cambios de código de abajo están
> redactados para aplicarse tal cual, pero requieren una llave de firma real y
> un servidor de releases; por eso no se activan en el repo (una `pubkey`
> inválida rompería `tauri build`, y la llave privada nunca debe commitearse).
> Marcar este documento como implementado al cerrar esos dos pendientes de infra.

## Cómo funciona el canal

- La app usa `tauri-plugin-updater`. Al arrancar (o bajo demanda) consulta un
  endpoint HTTPS que devuelve un manifiesto con la última versión y su firma.
- Si hay versión nueva, descarga el instalador firmado, **verifica la firma con
  la llave pública embebida** y lo aplica. Si la firma no valida, no instala.
- El canal solo mueve el binario de la app. **Nunca toca la base clínica
  cifrada**: los datos siguen en `app_data/midoc.db` en el equipo del médico.

## Cambios de código a aplicar

### 1. `src-tauri/Cargo.toml`

```toml
[dependencies]
tauri-plugin-updater = "2"
```

### 2. `src-tauri/src/lib.rs` (en `run()`, junto a los demás `.plugin(...)`)

```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

### 3. `src-tauri/capabilities/default.json` (agregar permiso)

```json
"permissions": [
  "core:default",
  "opener:default",
  "updater:default"
]
```

### 4. `src-tauri/tauri.conf.json`

Agregar el bloque `plugins.updater` y activar los artefactos de actualización en
`bundle`:

```json
"bundle": {
  "active": true,
  "targets": "all",
  "createUpdaterArtifacts": true,
  "icon": [ "..." ]
},
"plugins": {
  "updater": {
    "endpoints": [
      "https://releases.midoc.example.com/{{target}}/{{arch}}/{{current_version}}"
    ],
    "pubkey": "<LLAVE_PUBLICA_MINISIGN_BASE64>",
    "windows": { "installMode": "passive" }
  }
}
```

- `installMode: "passive"` instala con una UI mínima sin intervención del médico.
- Los placeholders `{{target}}`, `{{arch}}`, `{{current_version}}` los rellena el
  plugin al consultar el endpoint.

## Llaves de firma (minisign)

```bash
# Genera el par. La privada se protege con contraseña.
npx tauri signer generate -w ~/.tauri/midoc-updater.key
```

- La **llave pública** va en `plugins.updater.pubkey` (es pública: seguro
  commitearla).
- La **llave privada** y su contraseña son secretos de release. Nunca se
  commitean. En el build se pasan por entorno:
  - `TAURI_SIGNING_PRIVATE_KEY` (ruta o contenido de la llave privada)
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Guardarlas en el gestor de secretos del pipeline. Si se pierde la privada,
  hay que rotar la pública y re-firmar; los clientes con la pública vieja dejan
  de auto-actualizar hasta reinstalar.

## Manifiesto y endpoint

El endpoint responde, por plataforma, un JSON como:

```json
{
  "version": "0.2.0",
  "notes": "Correcciones de la consulta dental",
  "pub_date": "2026-06-20T12:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "<contenido del .sig generado en el build>",
      "url": "https://releases.midoc.example.com/MiDoc_0.2.0_x64-setup.nsis.zip"
    }
  }
}
```

`tauri build` (con `createUpdaterArtifacts: true` y las variables de firma)
produce el instalador, el `.zip` de actualización y su `.sig`. El contenido del
`.sig` es lo que va en `signature`.

## Flujo de release

1. Subir la versión en `tauri.conf.json` y `Cargo.toml` (semver, siempre hacia
   adelante).
2. `tauri build` con `TAURI_SIGNING_PRIVATE_KEY[_PASSWORD]` en el entorno.
3. Firmar el instalador Windows con el certificado de código
   (`scripts/sign-windows-installer.ps1`, ver `paso-9-piloto-seguro.md`).
4. Publicar instalador + `.zip` + actualizar el manifiesto del endpoint.
5. Validar en una máquina de staging que una instalación previa se
   auto-actualiza y abre su base existente.

## Procedimiento de rollback

El updater de Tauri **no degrada de versión solo** (compara semver y solo avanza).
Ante una versión defectuosa ya publicada:

1. **Detener la propagación de inmediato:** revertir el manifiesto del endpoint a
   la última versión buena (o retirar la entrada defectuosa). Las instalaciones
   que aún no actualizaron dejan de recibir la mala.
2. **Recuperar a los ya afectados — opción preferida (hotfix hacia adelante):**
   publicar una versión **mayor** (ej. `0.2.1`) que revierta el cambio dañino.
   El updater la entrega como "nueva" y los clientes quedan corregidos por el
   mismo canal. Es lo más limpio porque semver nunca retrocede.
3. **Recuperar a los ya afectados — opción manual:** distribuir el **instalador
   firmado de la versión buena anterior** para reinstalar encima. Por eso se
   **archivan los instaladores firmados de cada release** (no solo el último).

### Por qué el rollback es seguro para los datos

- **Respaldo previo garantizado:** la app crea un respaldo cifrado en cada
  desbloqueo (`paso-9-drill-restauracion.md`), así que antes de cualquier
  actualización ya existe un respaldo reciente.
- **Migraciones aditivas (REGLAS §6):** las migraciones del esquema son
  *forward-compatible* — solo agregan tablas/columnas, nunca rompen una base
  existente. `apply_migrations` solo aplica migraciones con `current < target`;
  si una app vieja abre una base que una app nueva migró a un esquema mayor, no
  intenta nada y la base abre igual (SQLite tolera columnas/tablas que el código
  viejo no consulta).
- **Dependencia explícita:** esta seguridad de rollback se sostiene **solo
  mientras las migraciones sigan siendo aditivas.** Una migración destructiva
  (renombrar/eliminar una columna que la versión vieja lee) rompería el rollback
  de datos; cualquier cambio así exige una estrategia de migración versionada y
  una nota en este documento.

## Pendiente de infraestructura para activarlo

1. Generar y resguardar la llave de firma del updater (pública al config,
   privada al gestor de secretos del pipeline).
2. Provisionar el endpoint/servidor de releases que sirve el manifiesto y los
   artefactos firmados.

Con esos dos puntos resueltos, aplicar los cuatro cambios de código de arriba y
correr el flujo de release.
