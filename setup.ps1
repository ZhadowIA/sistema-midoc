param(
  [switch]$SkipInstall,
  [switch]$SkipDb,
  [switch]$Run
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$appDir = Join-Path $root "consultorio-app"
$botDir = Join-Path $root "whatsapp-bot"

function Ensure-EnvFile {
  param(
    [string]$ServiceName,
    [string]$ServiceDir
  )

  $envExample = Join-Path $ServiceDir ".env.example"
  $envFile = Join-Path $ServiceDir ".env"

  if (-not (Test-Path -LiteralPath $envExample)) {
    throw "No se encontro $envExample"
  }

  if (-not (Test-Path -LiteralPath $envFile)) {
    Copy-Item -LiteralPath $envExample -Destination $envFile
    Write-Host "[OK] ${ServiceName}: creado .env desde .env.example"
  } else {
    Write-Host "[OK] ${ServiceName}: .env ya existe (sin cambios)"
  }
}

Write-Host "== MiDoc setup iniciado =="

Ensure-EnvFile -ServiceName "consultorio-app" -ServiceDir $appDir
Ensure-EnvFile -ServiceName "whatsapp-bot" -ServiceDir $botDir

if (-not $SkipInstall) {
  Write-Host "Instalando dependencias..."
  Push-Location $appDir
  npm install
  Pop-Location

  Push-Location $botDir
  npm install
  Pop-Location
} else {
  Write-Host "Saltando instalacion de dependencias por bandera -SkipInstall"
}

if (-not $SkipDb) {
  Write-Host "Configurando Prisma en consultorio-app..."
  Push-Location $appDir
  npx prisma generate
  npx prisma db push
  Pop-Location
} else {
  Write-Host "Saltando Prisma por bandera -SkipDb"
}

Write-Host ""
Write-Host "Setup completado."
Write-Host "Revisa y completa secretos reales en:"
Write-Host " - $appDir\\.env"
Write-Host " - $botDir\\.env"
Write-Host ""

if ($Run) {
  Write-Host "Abriendo dos terminales para ejecutar ambos servicios..."
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$appDir'; npm run dev"
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$botDir'; npm run dev"
} else {
  Write-Host "Para ejecutar manualmente:"
  Write-Host " 1) cd '$appDir'; npm run dev"
  Write-Host " 2) cd '$botDir'; npm run dev"
  Write-Host ""
  Write-Host "Tip: usa .\\setup.ps1 -Run para abrir ambos servicios automaticamente."
}
