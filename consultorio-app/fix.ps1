Get-ChildItem -Path "src\components" -Filter *.tsx -Recurse | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    if (-not $content.StartsWith("`"use client`";")) {
        $newContent = "`"use client`";`n" + $content
        Set-Content -Path $_.FullName -Value $newContent -NoNewline
    }
}
