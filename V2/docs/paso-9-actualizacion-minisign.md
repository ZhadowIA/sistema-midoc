# Paso 9 — Llaves minisign para auto-actualización Tauri

Objetivo: generar y configurar un par de llaves minisign para firmar los instaladores de actualización automática de la app de escritorio.

## Estado: Script de generación listo

El script `V2/desktop-app/scripts/generate-signing-keys.ps1` está listo para generar el par de llaves.

### Generar llaves (una sola vez)

```powershell
# Con contraseña por defecto (staging)
$scriptPath = "V2/desktop-app/scripts/generate-signing-keys.ps1"
& $scriptPath

# O con contraseña personalizada
& $scriptPath -Password "tu-contraseña-segura"
```

El script:
1. Crea el directorio `~/.tauri` si no existe
2. Ejecuta `npx tauri signer generate` con entrada automática
3. Extrae la llave pública (base64) del archivo generado
4. Muestra instrucciones para configurar el pipeline

**Resultado**: archivo `~/.tauri/midoc-updater.key` con el par completo (privada + pública)

## Configuración de tauri.conf.json

Una vez generadas las llaves, extraer la llave **pública** e insertarla en:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "RWRrJ...",  // <-- Llave pública base64 aquí
      "endpoints": [
        "https://releases.midoc.example.com/{{target}}/{{arch}}/{{current_version}}"
      ],
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

⚠️ **La llave pública es segura commitear**. La privada NO.

## Variables de entorno para CI/CD

En el pipeline de builds, exportar:

```bash
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<contrasena en secretos del pipeline>"
export TAURI_SIGNING_PRIVATE_KEY="~/.tauri/midoc-updater.key"

# Luego:
cargo tauri build --release
```

Esto firma automáticamente los artefactos de actualización generados por Tauri.

## Seguridad

| Artefacto | Dónde | Secreto? | Qué hacer |
|-----------|-------|----------|-----------|
| Llave privada | `~/.tauri/midoc-updater.key` | ✓ SÍ | Guardar en secretos del pipeline, NUNCA commitear |
| Contraseña | Variable `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | ✓ SÍ | Guardar en secretos del pipeline |
| Llave pública | `tauri.conf.json` | ✗ NO | Seguro commitear, es pública |
| Instalador firmado | Servidor de releases | ✗ NO | Público, acceso HTTP/HTTPS |

## Servidor de releases

El endpoint de actualización debe responder con un manifiesto JSON:

```json
{
  "version": "0.2.0",
  "notes": "Correcciones de seguridad",
  "pub_date": "2026-06-11T18:00:00Z",
  "platforms": {
    "win64": {
      "signature": "base64-de-firma-minisign",
      "url": "https://releases.midoc.example.com/Midoc_0.2.0_x64.msi"
    }
  }
}
```

La firma es generada por Tauri automáticamente durante `cargo tauri build --release`.

## Rotación de llaves

Si la llave privada se compromete:

1. Generar un nuevo par con `generate-signing-keys.ps1`
2. Actualizar la llave pública en `tauri.conf.json`
3. Hacer commit del cambio
4. Compilar la próxima versión con las nuevas llaves
5. Clientes con versión vieja no actualizarán (la firma no validará)
6. Opción: hacer un hotfix que actualice solo la llave pública en `tauri.conf.json`

## Cobertura de tests

- ✓ El drill de restauración (`restore_drill.rs`) no toca las llaves, pero sí valida que backups cifrados se restauran (independiente del updater)
- ⏳ Test E2E de actualización: requiere servidor de releases configurado

## Checklist de implementación

- [x] Script de generación de llaves (PowerShell automático)
- [x] Documentación de configuración en tauri.conf.json
- [x] Variables de entorno para CI/CD
- [ ] Llave privada generada y guardada en secretos del pipeline
- [ ] Llave pública insertada en tauri.conf.json
- [ ] Servidor de releases con endpoint de manifiesto
- [ ] Validación de firma en cliente (automático con tauri-plugin-updater)
- [ ] Test E2E del flujo de actualización
