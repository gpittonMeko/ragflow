# Deploy SGAI su EC2: Lambda wake (se spenta) -> git push (locale) -> git pull + npm run build (sul server).
# Richiede: stessa repo su EC2 in ~/workspace/ragflow, remote configurato per pull non interattivo.
#
#   powershell -ExecutionPolicy Bypass -File scripts/deploy-git-pull-build-ec2.ps1
#
# Variabili: vedi deploy-sgai-remote-only-ec2.ps1 + opzionali:
#   SGAI_GIT_REMOTE   (default origin)
#   SGAI_GIT_BRANCH   (default: branch corrente del repo locale)
#   SGAI_SKIP_PUSH=1  solo pull+build remoto (es. push gia fatto)
#   SGAI_SKIP_WAKE=1  EC2 gia accesa

$ErrorActionPreference = "Stop"
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {}

$repoRoot = Split-Path -Parent $PSScriptRoot
$key = if ($env:SGAI_SSH_KEY) { $env:SGAI_SSH_KEY } else { Join-Path $env:USERPROFILE "Documents\LLM_14.pem" }
$hostIp = if ($env:SGAI_EC2_HOST) { $env:SGAI_EC2_HOST } else { "13.49.16.179" }
$sshTarget = "ubuntu@${hostIp}"
$remoteRoot = "/home/ubuntu/workspace/ragflow"
$remoteWeb = "$remoteRoot/web"
$wakeUrl = if ($env:SGAI_WAKE_URL) { $env:SGAI_WAKE_URL } else { "https://91k2hfw1n3.execute-api.eu-north-1.amazonaws.com/wake-up" }
$wakeTarget = if ($env:SGAI_WAKE_TARGET) { $env:SGAI_WAKE_TARGET } else { "SGAI-Production" }
$gitRemote = if ($env:SGAI_GIT_REMOTE) { $env:SGAI_GIT_REMOTE } else { "origin" }

if (-not (Test-Path $key)) { throw "Chiave SSH mancante: $key (imposta SGAI_SSH_KEY)" }

function Invoke-SgaiEc2Wake {
  param([string]$WakeUrl, [string]$Target)
  Write-Host "=== Lambda wake EC2 (force_start) ===" -ForegroundColor Cyan
  $payload = @{ force_start = $true; target_instance = $Target } | ConvertTo-Json -Compress
  try {
    $resp = Invoke-RestMethod -Uri $WakeUrl -Method Post -ContentType "application/json; charset=utf-8" -Body $payload -TimeoutSec 90
    Write-Host ($resp | ConvertTo-Json -Compress -Depth 6)
  } catch {
    Write-Warning "Wake API errore (provo comunque SSH): $_"
  }
}

function Wait-SshReady {
  param([string]$SshTarget, [string]$KeyPath, [int]$MaxAttempts = 100, [int]$SleepSec = 5)
  $maxSec = $MaxAttempts * $SleepSec
  Write-Host "=== Attendo SSH su $SshTarget (fino a ~${maxSec}s) ===" -ForegroundColor Yellow
  for ($i = 1; $i -le $MaxAttempts; $i++) {
    $null = & ssh -o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=accept-new -i $KeyPath $SshTarget "echo SSH_OK" 2>&1
    if ($LASTEXITCODE -eq 0) {
      Write-Host "SSH OK (tentativo $i)" -ForegroundColor Green
      return
    }
    Write-Host "  tentativo $i / $MaxAttempts - attendo ${SleepSec}s..."
    Start-Sleep -Seconds $SleepSec
  }
  throw "SSH non raggiungibile. Accendi EC2 (Lambda wake) o verifica rete/firewall."
}

if (-not $env:SGAI_SKIP_WAKE) {
  Invoke-SgaiEc2Wake -WakeUrl $wakeUrl -Target $wakeTarget
  Wait-SshReady -SshTarget $sshTarget -KeyPath $key
} else {
  Write-Host "SGAI_SKIP_WAKE: salto wake Lambda" -ForegroundColor Yellow
}

if (-not $env:SGAI_SKIP_PUSH) {
  Write-Host "=== git push ($gitRemote) ===" -ForegroundColor Cyan
  Push-Location $repoRoot
  try {
    $branch = if ($env:SGAI_GIT_BRANCH) { $env:SGAI_GIT_BRANCH } else {
      $b = (& git rev-parse --abbrev-ref HEAD 2>$null).Trim()
      if (-not $b -or $b -eq "HEAD") { throw "Branch non determinato; imposta SGAI_GIT_BRANCH" }
      $b
    }
    & git push $gitRemote $branch
    if ($LASTEXITCODE -ne 0) { throw "git push fallito (exit $LASTEXITCODE)" }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "SGAI_SKIP_PUSH: salto git push" -ForegroundColor Yellow
}

$remoteBash = @"
set -e
cd '$remoteRoot'
echo '=== git stash (se working tree sporco, evita fallimento pull) ==='
git stash push -u -m 'auto-stash-before-deploy' || true
echo '=== git pull ==='
git pull --ff-only
cd '$remoteWeb'
echo '=== npm run build (remoto) ==='
npm run build
test -f dist/index.html
echo '=== nginx reload (se container raggiungibile) ==='
docker exec ragflow-server nginx -s reload 2>/dev/null || true
echo DEPLOY_OK
"@
# Here-string su Windows = CRLF: bash su Linux si rompe (cd '.../ragflow\r')
$remoteBash = $remoteBash -replace "`r`n", "`n" -replace "`r", "`n"

Write-Host "=== SSH: git pull + npm run build ===" -ForegroundColor Cyan
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($remoteBash))
ssh -o StrictHostKeyChecking=accept-new -o ConnectTimeout=60 -i $key $sshTarget "echo $b64 | base64 -d | bash"
if ($LASTEXITCODE -ne 0) { throw "SSH remoto fallito con exit $LASTEXITCODE" }

Write-Host "OK: deploy git-pull + build remoto completato." -ForegroundColor Green
