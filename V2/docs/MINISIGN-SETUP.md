# Configuración de minisign para Tauri updater

## Problema

`npx tauri signer generate` requiere entrada **interactiva de terminal** (contraseña + confirmación). No puede automatizarse en CI/CD scripts no interactivos ni en entornos de automación.

## Solución: Ejecutar manualmente + guardar en secretos

### Paso 1: Generar llaves (una sola vez)

En tu terminal local (PowerShell / Git Bash / Terminal):

```bash
cd V2/desktop-app/src-tauri

# Ejecutar el generador interactivo
npx tauri signer generate -w ~/.tauri/midoc-updater.key
```

Cuando pregunte por contraseña, usa: `<contrasena en secretos del pipeline>` (o tu contraseña segura)

Resultado: archivo `~/.tauri/midoc-updater.key` con par completo.

### Paso 2: Extraer llave pública

Abrir `~/.tauri/midoc-updater.key` y copiar la línea que empieza con `RW`:

```
# minim version 4
untrusted comment: ...
RWRrJ9FfCwPz7... <- ESTA LÍNEA (copiar completa)
```

### Paso 3: Configurar tauri.conf.json

Pegar en `V2/desktop-app/src-tauri/tauri.conf.json`:

```json
{
  "plugins": {
    "updater": {
      "pubkey": "RWRrJ9FfCwPz7...",  // <- Pegar aquí
      "endpoints": [
        "https://releases.midoc.example.com/{{target}}/{{arch}}/{{current_version}}"
      ]
    }
  }
}
```

Commit este cambio (la llave pública es seguro commitear).

### Paso 4: Guardar llave privada en secretos del pipeline

En GitHub (Settings → Secrets) o Azure DevOps:

1. Leer contenido completo de `~/.tauri/midoc-updater.key`:
   ```bash
   cat ~/.tauri/midoc-updater.key
   ```

2. Crear secreto `TAURI_SIGNING_PRIVATE_KEY` con **todo el contenido del archivo**

3. Crear secreto `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` con el valor: `<contrasena en secretos del pipeline>`

### Paso 5: En el pipeline CI/CD

```yaml
# GitHub Actions ejemplo
- name: Build with signing
  env:
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
  run: |
    cd V2/desktop-app/src-tauri
    cargo tauri build --release
```

Tauri automáticamente:
- Lee las variables de entorno
- Usa la llave privada para firmar
- Genera artefactos de actualización en `target/release/bundle/`

## Verificación

Después de generar las llaves, verificar que existe:

```powershell
Test-Path "$HOME/.tauri/midoc-updater.key"  # Debe ser True
```

Y contiene:

```bash
head -3 ~/.tauri/midoc-updater.key
# minim version 4
untrusted comment: ...
RW...
```

## Seguridad

| Artefacto | Ubicación | Secreto? | Acción |
|-----------|-----------|----------|--------|
| Archivo completo | `~/.tauri/midoc-updater.key` | ✓ | Guardar en secretos del pipeline, NUNCA commitear |
| Llave pública | `tauri.conf.json` | ✗ | Commitear normalmente |
| Contraseña | `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | ✓ | Guardar en secretos |

## Troubleshooting

**Error: "npx tauri signer generate: command not found"**
- Instalar Node.js y npm
- Desde `V2/desktop-app/src-tauri`, ejecutar `npm install`

**Error: "Permission denied" al acceder a ~/.tauri/**
- Crear directorio: `mkdir -p ~/.tauri`
- Permisos: `chmod 700 ~/.tauri`

**Error: "No such file ~/.tauri/midoc-updater.key" en build**
- El archivo no se generó
- Revisar que `TAURI_SIGNING_PRIVATE_KEY` contiene el archivo completo, no solo la ruta

## Rotación de llaves

Si necesitas cambiar la contraseña o generar un nuevo par:

1. Generar nuevo par: `npx tauri signer generate -w ~/.tauri/midoc-updater-new.key`
2. Extraer nueva llave pública
3. Actualizar `tauri.conf.json`
4. Commit el cambio
5. Actualizar secretos del pipeline
6. Hacer build de nueva versión (clientes antiguos no actualizarán si la firma no valida)

## Próximos pasos

- [ ] Ejecutar `npx tauri signer generate -w ~/.tauri/midoc-updater.key` manualmente
- [ ] Extraer llave pública e insertar en `tauri.conf.json`
- [ ] Guardar llave privada en secretos del pipeline
- [ ] Configurar endpoint de releases (servidor HTTP/HTTPS)
- [ ] Hacer commit de `tauri.conf.json`
- [ ] Test del flujo: compilar + firmar + verificar artefactos

