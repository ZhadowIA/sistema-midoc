param(
  [Parameter(Mandatory = $false)]
  [string]$Password = "midoc-staging-2026",

  [Parameter(Mandatory = $false)]
  [string]$OutputDir = "$env:USERPROFILE\.tauri"
)

$ErrorActionPreference = "Stop"

Write-Host "🔑 Generador de llaves minisign para Tauri updater"
Write-Host ""

# Validar npx
$npx = Get-Command npx -ErrorAction SilentlyContinue
if (-not $npx) {
  throw "npx no encontrado. Asegurate de tener Node.js instalado."
}

# Crear directorio
if (-not (Test-Path $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
  Write-Host "✓ Directorio creado: $OutputDir"
}

$keyPath = "$OutputDir\midoc-updater.key"

# Limpiar llave anterior si existe
if (Test-Path $keyPath) {
  Write-Host "⚠️  Llave anterior encontrada. Eliminando..."
  Remove-Item $keyPath -Force
}

Write-Host "Generando par de llaves minisign..."
Write-Host "  Archivo: $keyPath"
Write-Host "  Contraseña: (será enviada automáticamente)"
Write-Host ""

# Crear script temporal Node.js que haga el input automático
$tempScript = [System.IO.Path]::GetTempFileName()
$nodeScript = @"
const { spawn } = require('child_process');
const fs = require('fs');

const password = '$Password';
const keyPath = '$keyPath'.replace(/\\/g, '\\\\');

console.log('Ejecutando: npx tauri signer generate...');

const proc = spawn('npx', ['tauri', 'signer', 'generate', '-w', keyPath], {
  stdio: ['pipe', 'inherit', 'inherit'],
  shell: true,
  cwd: process.cwd()
});

let waitingForPassword = true;

// Enviar contraseña después de un pequeño delay
setTimeout(() => {
  proc.stdin.write(password + '\n');
  proc.stdin.write(password + '\n');
  proc.stdin.end();
}, 500);

proc.on('close', (code) => {
  if (code === 0 && fs.existsSync(keyPath)) {
    console.log('\n✓ Llaves generadas exitosamente');
    console.log('📁 Archivo: ' + keyPath);

    const content = fs.readFileSync(keyPath, 'utf8');
    const lines = content.split('\\n');
    const pubkeyLine = lines.find(l => /^[A-Za-z0-9+/]/.test(l));

    if (pubkeyLine) {
      console.log('🔐 Llave pública (minisign):');
      console.log(pubkeyLine);
    }
  } else {
    console.error('\n❌ Error: no se generaron las llaves');
    process.exit(1);
  }
});
"@

try {
  # Ejecutar con Node.js
  $output = & node -e $nodeScript
  Write-Host $output

  # Verificar resultado
  if (Test-Path $keyPath) {
    Write-Host ""
    Write-Host "✓ Llaves generadas correctamente en: $keyPath"
    Write-Host ""
    Write-Host "📋 Próximos pasos:"
    Write-Host "  1. Extraer llave pública del archivo $keyPath"
    Write-Host "  2. Configurar en tauri.conf.json → plugins.updater.pubkey"
    Write-Host "  3. Guardar llave privada y contraseña en secretos del pipeline"
    Write-Host ""
    Write-Host "⚠️  IMPORTANTE:"
    Write-Host "  - Llave privada: NUNCA commitear"
    Write-Host "  - Usar variable de entorno: TAURI_SIGNING_PRIVATE_KEY_PASSWORD=$Password"
    Write-Host "  - En build: TAURI_SIGNING_PRIVATE_KEY=~/.tauri/midoc-updater.key"
  }
} catch {
  Write-Host "❌ Error: $_"
  exit 1
} finally {
  # Limpiar archivo temporal si existe
  if (Test-Path $tempScript) {
    Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
  }
}
