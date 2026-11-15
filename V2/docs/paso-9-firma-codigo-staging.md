# Paso 9 — Firma de código y distribución del instalador

Objetivo: permitir que los instaladores de la app de escritorio se firmen con un certificado válido, lo que evita advertencias de Windows "publisher unknown" y es requisito para distribución externa.

## Estado actual (staging)

> **2026-09-03 (paquete B de la remediación):** el PFX que vivía en `V2/certs/` se
> retiró del repositorio y su contraseña se borró de la documentación. Ambos se
> consideran **comprometidos** (estuvieron en el historial de git): no se reutilizan.
> El material de firma se genera localmente, vive fuera del repo y llega al pipeline
> solo como secreto (`*.pfx`, `*.p12`, `*.key` y `*.pem` están en `.gitignore`).

Para staging se usa un **certificado auto-firmado** generado por quien opera el
pipeline. Generación en PowerShell (la contraseña se elige en el momento y no se
escribe en ningún archivo del repo):

```powershell
$cert = New-SelfSignedCertificate -Type CodeSigningCert -Subject "CN=MiDoc Staging" `
  -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(5)
$pass = Read-Host -AsSecureString "Contraseña del PFX"
Export-PfxCertificate -Cert $cert -FilePath "$env:USERPROFILE\.midoc\staging-code-signing.pfx" -Password $pass
```

- **Ruta**: local, fuera del repo (por ejemplo `~/.midoc/staging-code-signing.pfx`)
- **Contraseña**: solo en el secreto `CODE_SIGNING_PASSWORD` del pipeline
- **Tipo**: Code Signing (DigitalSignature)

### Para producción

Se requiere un certificado de una **Autoridad Certificadora (CA) confiable**:

- Opciones: DigiCert, Sectigo, GlobalSign, Let's Encrypt (via partners), etc.
- Costo: $200-500 USD/año
- Proceso: compra + validación de identidad → descarga PFX
- Ventaja: navegadores y Windows reconocen el certificado sin warnings

## Flujo de firma de instaladores

### 1. Generar instalador (Tauri)

```bash
cd V2/desktop-app/src-tauri
cargo tauri build --release
# Genera: target/release/bundle/msi/Midoc_X.Y.Z_x64.msi
```

### 2. Firmar con signtool

Usar el script `V2/desktop-app/scripts/sign-windows-installer.ps1`:

```powershell
$certPath = "$env:USERPROFILE\.midoc\staging-code-signing.pfx"   # fuera del repo
$certPass = $env:CODE_SIGNING_PASSWORD                              # nunca en claro
$installerPath = "V2/desktop-app/src-tauri/target/release/bundle/msi/Midoc_X.Y.Z_x64.msi"

& "V2/desktop-app/scripts/sign-windows-installer.ps1" `
  -InstallerPath $installerPath `
  -PfxPath $certPath `
  -PfxPassword $certPass
```

**Requisito**: signtool.exe disponible (Windows SDK 10/11)

Si no está instalado:
1. Descargar Windows SDK 11: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
2. En el instalador, marcar "Signing Tools for Windows"
3. O agregar al PATH: `C:\Program Files (x86)\Windows Kits\11\bin\x64`

### 3. Verificar firma

```powershell
signtool verify /pa $installerPath
```

Salida esperada: `SignTool Error: (-1) No signature found.` → OK (el error es que no hay timestamp todavía)

### 4. Distribuir

Una vez firmado, el instalador:
- **No tendrá warning** "Unknown Publisher" en Windows
- Podrá descargarse vía HTTP/HTTPS sin marca roja
- Windows Defender lo reconocerá como validado (con cert real de CA)

## Integración en CI/CD

En GitHub Actions / Azure Pipelines:

```yaml
# 1. Descargar certificado de secretos
$certBytes = [Convert]::FromBase64String($env:CODE_SIGNING_CERT)
Set-Content -Path cert.pfx -Value $certBytes -AsByteStream

# 2. Compilar
cargo tauri build --release

# 3. Firmar
scripts/sign-windows-installer.ps1 `
  -InstallerPath "target/release/bundle/msi/Midoc_*.msi" `
  -PfxPath cert.pfx `
  -PfxPassword $env:CODE_SIGNING_PASSWORD
```

**Secretos a configurar**:
- `CODE_SIGNING_CERT`: certificado PFX codificado en Base64
- `CODE_SIGNING_PASSWORD`: contraseña del PFX

## Roadmap

1. ✅ Certificado auto-firmado para staging (hecho)
2. ⏳ Obtener certificado de CA para producción
3. ⏳ Wiring en CI/CD pipeline
4. ⏳ Validar firma en distribución (test con Microsoft Defender)
