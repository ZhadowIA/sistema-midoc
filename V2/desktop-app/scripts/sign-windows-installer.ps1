param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,

  [Parameter(Mandatory = $true)]
  [string]$PfxPath,

  [Parameter(Mandatory = $true)]
  [string]$PfxPassword
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $InstallerPath)) {
  throw "No existe el instalador: $InstallerPath"
}

if (-not (Test-Path -LiteralPath $PfxPath)) {
  throw "No existe el certificado PFX: $PfxPath"
}

$signtool = Get-Command signtool.exe -ErrorAction SilentlyContinue
if (-not $signtool) {
  throw "No se encontro signtool.exe. Instala Windows SDK 10/11 o agrega signtool al PATH antes de firmar."
}

$timestampUrl = "http://timestamp.digicert.com"

& $signtool.Source sign `
  /fd SHA256 `
  /f $PfxPath `
  /p $PfxPassword `
  /tr $timestampUrl `
  /td SHA256 `
  $InstallerPath

if ($LASTEXITCODE -ne 0) {
  throw "signtool.exe fallo con codigo $LASTEXITCODE"
}

Write-Host "Instalador firmado: $InstallerPath"
