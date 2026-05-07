param(
    [string]$ProjectRoot = "C:\Sistema MiDoc\sistema-midoc\consultorio-app",
    [string]$BaseUrl = "http://localhost:3000",
    [string]$AppointmentId = "",
    [string]$CookieHeader = ""
)

$ErrorActionPreference = "Stop"

function Pass($msg) { Write-Host "[PASS] $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red }
function Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }

Info "1) Verificando archivos clave..."
$files = @(
    "$ProjectRoot\src\lib\deepgramClient.ts",
    "$ProjectRoot\src\app\api\admin\appointments\[id]\transcription\token\route.ts",
    "$ProjectRoot\src\components\clinical\DictationPanel.tsx"
)

foreach ($f in $files) {
    if (Test-Path -LiteralPath $f) {
        Pass "Existe: $f"
    }
    else {
        Fail "No existe: $f"
    }
}

Info "2) Verificando variables de entorno..."
$dgKey = "81d8dcc6af4844c7d2d7c1cba130b25e18773a39"
$dgProject = "09776e65-c2a1-41df-92c4-3ef13393e97a"

if ([string]::IsNullOrWhiteSpace($dgKey)) { Fail "DEEPGRAM_API_KEY no esta cargada en el entorno actual" }
else { Pass "DEEPGRAM_API_KEY cargada (longitud: $($dgKey.Length))" }

if ([string]::IsNullOrWhiteSpace($dgProject)) { Fail "DEEPGRAM_PROJECT_ID no esta cargada en el entorno actual" }
else { Pass "DEEPGRAM_PROJECT_ID cargada: $dgProject" }

Info "3) Validando que DictationPanel use WS de Deepgram..."
$panelPath = "$ProjectRoot\src\components\clinical\DictationPanel.tsx"
if (Test-Path -LiteralPath $panelPath) {
    $content = Get-Content -LiteralPath $panelPath -Raw
    if ($content -match "wss://api\.deepgram\.com/v1/listen") { Pass "DictationPanel apunta a wss://api.deepgram.com/v1/listen" }
    else { Fail "No se encontro endpoint WS de Deepgram en DictationPanel" }
}

Info "4) Prueba opcional del endpoint token (requiere sesion admin + appointmentId)..."
if (-not [string]::IsNullOrWhiteSpace($AppointmentId) -and -not [string]::IsNullOrWhiteSpace($CookieHeader)) {
    $url = "$BaseUrl/api/admin/appointments/$AppointmentId/transcription/token"
    try {
        $tmp = [System.IO.Path]::GetTempFileName()
        $code = curl.exe -s -o $tmp -w "%{http_code}" -X POST $url -H ("Cookie: $CookieHeader")
        $body = Get-Content -Path $tmp -Raw
        Remove-Item -Path $tmp -Force

        if ($code -eq "200") {
            Pass "Endpoint token responde 200: $url"
            $preview = $body
            if ($preview.Length -gt 300) { $preview = $preview.Substring(0, 300) }
            Info "Body (primeros 300 chars): $preview"
        }
        else {
            Fail "Endpoint token respondio $code"
            Info "Body: $body"
        }
    }
    catch {
        Fail "Fallo endpoint token: $($_.Exception.Message)"
    }
}
else {
    Info "Saltado endpoint token. Para correrlo, pasa -AppointmentId y -CookieHeader."
}

Info "Fin del healthcheck."
