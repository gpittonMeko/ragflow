# Chiude processi Node usati da build frontend.
# Uso: .\scripts\stop-local-node-builds.ps1
#      .\scripts\stop-local-node-builds.ps1 -ForceAll   # termina TUTTI i node.exe (anche Cursor/estensioni)

param([switch]$ForceAll)

$ErrorActionPreference = 'Continue'

if ($ForceAll) {
    Write-Host "Terminazione di tutti i processi node.exe..."
    taskkill /F /IM node.exe 2>$null
    exit $LASTEXITCODE
}

$killed = 0
# Query unica WMI (evita loop lenti per-PID)
Get-WmiObject Win32_Process -Filter "name='node.exe'" | ForEach-Object {
    $cl = $_.CommandLine
    if ([string]::IsNullOrEmpty($cl)) { return }
    if ($cl -match 'umi|@umijs|webpack|vite\.|esbuild') {
        Write-Host "Stop PID $($_.ProcessId)"
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
        $killed++
    }
}
Write-Host "Terminati processi build: $killed"
