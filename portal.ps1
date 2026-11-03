# Run your own society portal on Windows. The same commands as ./portal (for Mac and
# Linux), for Windows without bash. See docs/SELF_HOSTING.md.
#
#   powershell -ExecutionPolicy Bypass -File portal.ps1 install
#
#   install           set up (asks a few questions), then start
#   start | stop      start or stop everything
#   update            back up, then move to the newest version
#   autoupdate on     install new releases each night, and allow "Update now" in
#   autoupdate off    Settings (a check every 5 minutes); off stops both
#   backup            back up the database and uploads now
#   restore <file>    put a backup back, replacing what's there
#   logs [service]    follow the logs (app, web, db, backup, cloudflared, caddy)
#   status            what's running
#   tick              what autoupdate runs every 5 minutes
#
# Settings live in portal.env next to this script, in the same format ./portal writes,
# so a portal set up with either script can be run with the other. Runs on the
# PowerShell that comes with Windows (5.1): no ?? or ternaries in here.
param([string]$Command = "", [string]$Arg = "")
$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$EnvFile = Join-Path $Root "portal.env"
$ComposeFile = Join-Path $Root "deploy/docker-compose.yml"
$Images = "ghcr.io/maahir-ahmed/portal"

function Say([string]$s = "") { Write-Host $s }
function Die([string]$s) { Write-Host "Error: $s" -ForegroundColor Red; exit 1 }
function Ask([string]$q, [string]$def = "") {
  # Unattended (an automatic update): nobody can answer, so stop and say why.
  if ($env:PORTAL_UNATTENDED) { Die "a new setting needs an answer ($q). Run portal.ps1 update yourself." }
  $prompt = $q; if ($def) { $prompt = "$q [$def]" }
  $a = Read-Host $prompt
  if ($a) { return $a.Trim() } else { return $def }
}
function RandomHex([int]$bytes) {
  $b = New-Object byte[] $bytes
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return -join ($b | ForEach-Object { $_.ToString("x2") })
}

function Get-Setting([string]$key) {
  if (-not (Test-Path $EnvFile)) { return "" }
  $line = Get-Content $EnvFile | Where-Object { $_ -like "$key=*" } | Select-Object -Last 1
  if ($line) { return $line.Substring($key.Length + 1) } else { return "" }
}
function Has-Setting([string]$key) {
  return (Test-Path $EnvFile) -and [bool](Get-Content $EnvFile | Where-Object { $_ -like "$key=*" })
}
# Appends KEY=value unless KEY is already there. UTF-8 without a BOM and \n endings:
# Docker Compose would read a BOM as part of the first key.
function Ensure([string]$key, [string]$value) {
  if (-not (Has-Setting $key)) { [IO.File]::AppendAllText($EnvFile, "$key=$value`n") }
}

# Runs a command with its output and errors hidden; returns its exit code. PowerShell
# 5.1 turns a native command's redirected stderr into an error, so it is done here,
# with errors allowed.
function Quiet([scriptblock]$block) {
  $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  try { & $block *> $null } catch { }
  $code = $LASTEXITCODE
  $ErrorActionPreference = $old
  return $code
}

function Compose {
  if (-not (Test-Path $EnvFile)) { Die "no portal.env yet. Run: powershell -ExecutionPolicy Bypass -File portal.ps1 install" }
  $profile = @()
  $method = Get-Setting "METHOD"
  if ($method -eq "cloudflare" -or $method -eq "caddy") { $profile = @("--profile", $method) }
  & docker compose --env-file $EnvFile -p (Get-Setting "STACK") -f $ComposeFile @profile @args
}

function Check-Docker {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Say "Docker Desktop isn't installed. It runs the portal and its database."
    if ((Get-Command winget -ErrorAction SilentlyContinue) -and ((Ask "Install it now with winget? (y/n)" "y") -eq "y")) {
      winget install -e --id Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
      Say "Docker Desktop is installed. Restart Windows if it asks, open Docker Desktop once, then run install again."
      exit 0
    }
    Die "install Docker Desktop from https://www.docker.com/products/docker-desktop/, open it once, then run install again"
  }
  if ((Quiet { docker info }) -ne 0) { Die "Docker is installed but not running. Open Docker Desktop, wait until it says it's running, and try again" }
  if ((Quiet { docker compose version }) -ne 0) { Die "Docker Compose v2 is missing. Update Docker Desktop" }
}

function Port-Free([int]$port) {
  $c = New-Object System.Net.Sockets.TcpClient
  try { $c.Connect("127.0.0.1", $port); return $false } catch { return $true } finally { $c.Close() }
}

function Host-Timezone {
  $id = [System.TimeZoneInfo]::Local.Id
  $iana = $null
  # .NET 6 and later (PowerShell 7) can translate Windows zone names; 5.1 can't.
  if ([System.TimeZoneInfo].GetMethod("TryConvertWindowsIdToIanaId", [type[]]@([string], [string].MakeByRefType()))) {
    if ([System.TimeZoneInfo]::TryConvertWindowsIdToIanaId($id, [ref]$iana)) { return $iana }
  }
  return (Ask "Your timezone, for the time of the daily backup (e.g. Australia/Sydney)" "UTC")
}

function Write-Settings {
  if (Test-Path $EnvFile) { Say "Found portal.env: keeping the settings already in it." }

  $name = Get-Setting "APP_NAME"
  while (-not $name) { $name = Ask "Your society's name (e.g. Chess Society)" }
  Ensure "APP_NAME" $name
  $slug = ($name.ToLower() -replace "[^a-z0-9]+", "-").Trim("-")
  if (-not $slug) { $slug = "society" }
  Ensure "SOCIETY_SLUG" $slug
  Ensure "STACK" "portal"
  if (-not (Has-Setting "ADMIN_EMAIL")) { Ensure "ADMIN_EMAIL" (Ask "Your email, for the first account (optional)") }

  $method = Get-Setting "METHOD"
  if (-not $method) {
    Say ""
    Say "How will people reach the portal?"
    Say "  1) Through a Cloudflare Tunnel (recommended: works anywhere, no ports to open)"
    Say "  2) My server has a public IP address, and I'll point the domain at it (Caddy)"
    Say "  3) Just on this computer for now, to try it out"
    switch (Ask "Choose 1, 2 or 3" "1") {
      "1" { $method = "cloudflare" } "2" { $method = "caddy" } "3" { $method = "local" }
      default { Die "choose 1, 2 or 3" }
    }
    Ensure "METHOD" $method
  }

  $port = Get-Setting "APP_PORT"
  if (-not $port) {
    $port = 8080
    while (-not (Port-Free $port)) { $port++ }
    Ensure "APP_PORT" "$port"
  }
  Ensure "APP_BIND" "127.0.0.1"

  if ($method -eq "local") {
    Ensure "NEXTAUTH_URL" "http://localhost:$port"
  } else {
    $domain = Get-Setting "DOMAIN"
    while (-not $domain) { $domain = Ask "The web address it will live at, without https:// (e.g. portal.chesssoc.org)" }
    $domain = ($domain -replace "^https?://", "") -replace "/.*$", ""
    Ensure "DOMAIN" $domain
    Ensure "NEXTAUTH_URL" "https://$domain"
  }
  if ($method -eq "cloudflare" -and -not (Has-Setting "TUNNEL_TOKEN")) {
    Say ""
    Say "Paste your Cloudflare Tunnel token (docs/SELF_HOSTING.md, `"Cloudflare Tunnel`", shows where to get it)."
    $token = ""
    while (-not $token) { $token = Ask "Tunnel token" }
    # The dashboard offers a whole command; keep just the token from it.
    Ensure "TUNNEL_TOKEN" ($token -split "\s+")[-1]
  }

  Ensure "AUTH_SECRET" (RandomHex 32)
  Ensure "DB_PASSWORD" (RandomHex 24)
  $key = New-Object byte[] 32
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($key)
  Ensure "RUBRIC_SECRET_KEY" ([Convert]::ToBase64String($key)) # base64, as src/lib/secrets.ts reads it
  Ensure "SETUP_TOKEN" (RandomHex 24)
  Ensure "ENABLE_DEBUG_TOOLS" "false"
  Ensure "DISCORD_REMINDERS" "on"
  if (-not (Has-Setting "TZ")) { Ensure "TZ" (Host-Timezone) }
  # Forward slashes: Docker Desktop takes them, and nothing has to be escaped.
  Ensure "BACKUP_DIR" ((Join-Path $Root "backups") -replace "\\", "/")
  # The `1` channel: every 1.x release, never a 2.0 that might need you (images.yml).
  Ensure "APP_IMAGE" "$Images-app:1"
  Ensure "WEB_IMAGE" "$Images-web:1"
  Ensure "BACKUP_IMAGE" "$Images-backup:1"
  # Empty: a schema change that would delete data stops the app instead (compose file).
  Ensure "DB_PUSH_FLAGS" ""
  Ensure "UPDATE_TOKEN" (RandomHex 24)
  Ensure "UPDATE_HOUR" "4"
  Ensure "BUILD_FROM_SOURCE" "false"
  New-Item -ItemType Directory -Force -Path (Get-Setting "BACKUP_DIR") | Out-Null
}

function Get-Images {
  if ((Get-Setting "BUILD_FROM_SOURCE") -ne "true") {
    Say "Downloading the portal (a few hundred MB the first time)..."
    Compose pull
    if ($LASTEXITCODE -eq 0) { return }
    # Overnight, a registry hiccup shouldn't turn into a half-hour build, kept for good.
    if ($env:PORTAL_UNATTENDED) { Die "couldn't download the new version; trying again tomorrow" }
    Say ""
    Say "Couldn't download the images. Building them on this computer instead: this takes"
    Say "10 to 30 minutes and needs about 3 GB of memory free for Docker."
    [IO.File]::AppendAllText($EnvFile, "BUILD_FROM_SOURCE=true`n")
  }
  Compose pull --ignore-buildable
  Compose build
  if ($LASTEXITCODE -ne 0) { Die "the build failed; see the messages above" }
}

function Wait-Ready {
  Say "Waiting for the portal to start (it brings the database up to date first)..."
  for ($i = 0; $i -lt 90; $i++) {
    if ((Quiet { Compose exec -T web wget -q -O /dev/null http://app:3000/login }) -eq 0) { return $true }
    Start-Sleep -Seconds 2
  }
  Say "It hasn't answered after 3 minutes. See what it's doing with: portal.ps1 logs app"
  return $false
}

function Install {
  Check-Docker
  Write-Settings
  Get-Images
  Compose up -d --no-build --remove-orphans
  if ($LASTEXITCODE -ne 0) { Die "couldn't start it; see the messages above" }
  if (-not (Wait-Ready)) { exit 1 }
  $url = Get-Setting "NEXTAUTH_URL"
  Say ""
  Say "The portal is running."
  switch (Get-Setting "METHOD") {
    "cloudflare" { Say "In Cloudflare, the tunnel's public hostname $(Get-Setting 'DOMAIN') must point to the service http://web:80." }
    "caddy" { Say "Point $(Get-Setting 'DOMAIN')'s DNS (an A record) at this server and open ports 80 and 443. The certificate arrives on its own." }
    "local" { Say "It's only reachable from this computer." }
  }
  Say ""
  $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  # Through stdin: PowerShell 5.1 mangles double quotes inside native command arguments.
  $users = ('select count(*) from "User";' | Compose exec -T db psql -U society_user -d society_platform -tA 2> $null) -join ""
  $ErrorActionPreference = $old
  if ($users.Trim() -eq "0") {
    Say "Finish setting up here (this link only works until the first account exists):"
    Say "  $url/setup?token=$(Get-Setting 'SETUP_TOKEN')"
  } else {
    Say "Open it at $url"
  }
  Say ""
  Autoupdate "on"
  Say ""
  Say "portal.env holds your passwords: keep it safe, and back it up somewhere else too."
}

function Backup {
  $out = Compose run --rm -T backup archive | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0 -or -not ("$out" -like "/backups/*")) { Die "the backup failed: $out" }
  Say "Backed up to $(Get-Setting 'BACKUP_DIR')/$("$out".Substring(9))"
}

function Restore([string]$file) {
  if (-not $file) { Die "say which backup: portal.ps1 restore <file.tar.gz>" }
  if (-not (Test-Path $file)) { Die "no such file: $file" }
  $dir = Get-Setting "BACKUP_DIR"
  $name = Split-Path $file -Leaf
  $full = (Resolve-Path $file).Path -replace "\\", "/"
  if ($full -ne "$dir/$name") { Copy-Item $file (Join-Path $dir $name) -Force }

  Say "Checking the backup..."
  Compose run --rm -T backup validate "/backups/$name"
  if ($LASTEXITCODE -ne 0) { Die "that file isn't a backup this portal can restore" }
  Say ""
  Say "This replaces everything in the portal (every account, request and upload) with the backup."
  if ((Ask "Type restore to go ahead") -ne "restore") { Die "stopped, nothing changed" }

  Say "Backing up what's there now first, in case you want it back..."
  Backup
  Compose stop app
  Compose run --rm -T backup restore "/backups/$name"
  if ($LASTEXITCODE -eq 0) { Say "Restored." } else { Say "The restore failed and the database was left as it was." }
  Compose up -d --no-build app
  Wait-Ready | Out-Null
}

# The image IDs the three portal images point at now, "none" for one not here.
function Image-Ids {
  $ids = foreach ($v in "APP_IMAGE", "WEB_IMAGE", "BACKUP_IMAGE") {
    $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $id = docker image inspect -f "{{.Id}}" (Get-Setting $v) 2> $null
    $ErrorActionPreference = $old
    if ($LASTEXITCODE -eq 0 -and $id) { "$id".Trim() } else { "none" }
  }
  return ($ids -join " ")
}

# Points the three image names back at the IDs Image-Ids gave.
function Retag([string]$ids) {
  $names = "APP_IMAGE", "WEB_IMAGE", "BACKUP_IMAGE"
  $list = $ids -split " "
  for ($i = 0; $i -lt 3; $i++) {
    if ($list[$i] -ne "none") { docker tag $list[$i] (Get-Setting $names[$i]) }
  }
}

function Update {
  Check-Docker
  $before = Image-Ids
  $head = ""
  if ((Test-Path (Join-Path $Root ".git")) -and (Get-Command git -ErrorAction SilentlyContinue)) {
    $head = (git -C $Root rev-parse HEAD)
    git -C $Root pull --ff-only
    if ($LASTEXITCODE -ne 0) { Die "couldn't update the scripts with git pull. Undo local changes to this folder and try again" }
  }
  Write-Settings # adds any setting a newer version needs
  Get-Images
  $after = Image-Ids
  # The version just downloaded, for the portal to say which one did or didn't install.
  $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  $envLines = docker image inspect -f "{{range .Config.Env}}{{println .}}{{end}}" (Get-Setting "APP_IMAGE") 2> $null
  $ErrorActionPreference = $old
  $version = ($envLines | Where-Object { $_ -like "APP_VERSION=*" } | Select-Object -First 1)
  if ($version) { $version = $version.Substring(12) }
  Say "Version: $version"

  if ($before -eq $after) {
    Compose up -d --no-build --remove-orphans # picks up a changed compose file, if any
    Say "Already up to date."
    return
  }
  # A version that failed to start before isn't retried every night; a newer one is,
  # and so is this one when you run update yourself or press "Update now" (PORTAL_RETRY).
  $skipFile = Join-Path $Root ".update-skip"
  if ($env:PORTAL_UNATTENDED -and -not $env:PORTAL_RETRY -and (Test-Path $skipFile) -and ((Get-Content $skipFile -Raw).Trim() -eq $after)) {
    Retag $before
    Say "Skipped: this version didn't start last time. Run portal.ps1 update to try it again."
    return
  }

  Say "Backing up before the update..."
  $out = Compose run --rm -T backup archive | Select-Object -Last 1
  if ($LASTEXITCODE -ne 0 -or -not ("$out" -like "/backups/*")) {
    Retag $before
    Die "the backup failed, so nothing was updated"
  }
  Say "Backed up to $(Get-Setting 'BACKUP_DIR')/$("$out".Substring(9))"
  Compose up -d --no-build --remove-orphans
  if (Wait-Ready) {
    Remove-Item $skipFile -ErrorAction SilentlyContinue
    Quiet { docker image prune -f } | Out-Null
    Say "Up to date."
    return
  }

  Say "The new version didn't start. Going back to the one before..."
  [IO.File]::WriteAllText($skipFile, $after)
  Retag $before
  if ($head) { Quiet { git -C $Root reset -q --keep $head } | Out-Null }
  Compose up -d --no-build --remove-orphans
  Wait-Ready | Out-Null
  Die "rolled back: the new version didn't start, and the portal is on the one before. The backup from just before is in $(Get-Setting 'BACKUP_DIR'). See why with: portal.ps1 logs app"
}

# Talks to the portal's update endpoint from inside the web container, so it works
# however the port is published. Returns the reply, or "" if the portal didn't answer.
function Clean-Json([string]$s) {
  $c = ($s -replace '["\\]', "" -replace "\s+", " ")
  if ($c.Length -gt 400) { $c = $c.Substring(0, 400) }
  return $c
}

function Check-In([string]$result = "", [string]$detail = "", [string]$version = "") {
  $body = "{}"
  if ($result) {
    $body = "{`"result`":`"$result`",`"detail`":`"$(Clean-Json $detail)`",`"version`":`"$(Clean-Json $version)`"}"
  }
  $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
  # PowerShell 5.1 mangles double quotes in native arguments, so escape them for it.
  $reply = Compose exec -T web wget -q -O - -T 20 --header "Authorization: Bearer $(Get-Setting 'UPDATE_TOKEN')" `
    --header "Content-Type: application/json" --post-data ($body -replace '"', '\"') http://app:3000/api/system/update 2> $null
  $code = $LASTEXITCODE
  $ErrorActionPreference = $old
  if ($code -eq 0) { return "$reply" } else { return "" }
}

# Every 5 minutes (autoupdate): update if someone pressed "Update now", or once a night
# after UPDATE_HOUR, then tell the portal how it went.
function Tick {
  $lock = Join-Path $Root ".update.lock"
  $resultFile = Join-Path $Root ".update-result"
  # One at a time: an update can take longer than 5 minutes. A lock older than two hours
  # is from a run that died.
  if (Test-Path $lock) {
    if ((Get-Item $lock).LastWriteTime -gt (Get-Date).AddHours(-2)) { return }
    Remove-Item $lock -Recurse -Force
  }
  New-Item -ItemType Directory -Path $lock | Out-Null
  try {
    # A result the portal hasn't heard yet (it was restarting) goes with this check-in.
    if (Test-Path $resultFile) {
      $lines = @(Get-Content $resultFile) + @("", "", "")
      $reply = Check-In $lines[0] $lines[1] $lines[2]
      if ($reply) { Remove-Item $resultFile }
    } else {
      $reply = Check-In
    }

    $today = (Get-Date).ToString("yyyy-MM-dd")
    $lastFile = Join-Path $Root ".last-update"
    $requested = $reply -like '*"requested":true*'
    if (-not $requested) {
      $hour = 0; [int]::TryParse((Get-Setting "UPDATE_HOUR"), [ref]$hour) | Out-Null
      if ((Get-Date).Hour -lt $hour) { return }
      if ((Test-Path $lastFile) -and ((Get-Content $lastFile -Raw).Trim() -eq $today)) { return }
    }
    [IO.File]::WriteAllText($lastFile, $today)

    Say "--- $(Get-Date) update"
    # Its own process, so a question it can't ask (PORTAL_UNATTENDED) ends only that.
    $env:PORTAL_UNATTENDED = "1"
    if ($requested) { $env:PORTAL_RETRY = "1" }
    $old = $ErrorActionPreference; $ErrorActionPreference = "Continue"
    $out = (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath update 2>&1 | Out-String)
    $code = $LASTEXITCODE
    $ErrorActionPreference = $old
    Remove-Item Env:PORTAL_UNATTENDED
    Remove-Item Env:PORTAL_RETRY -ErrorAction SilentlyContinue
    Say $out
    # Nothing new, or only the version that failed before: a nightly run that did nothing
    # has nothing to report, and mustn't paper over how the last real update went.
    if (-not $requested -and $code -eq 0 -and ($out -like "*Already up to date.*" -or $out -like "*Skipped:*")) { return }
    $status = "failed"
    if ($code -eq 0) { $status = "ok" }
    if ($out -like "*rolled back:*") { $status = "rolled_back" }
    $lines = $out -split "`r?`n"
    $last = ($lines | Where-Object { $_.Trim() } | Select-Object -Last 1) -replace "^Error: ", ""
    $version = ($lines | Where-Object { $_ -like "Version: *" } | Select-Object -Last 1)
    if ($version) { $version = $version.Substring(9) }
    [IO.File]::WriteAllText($resultFile, "$status`n$last`n$version`n")
    if (Check-In $status $last $version) { Remove-Item $resultFile }
  } finally {
    Remove-Item $lock -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Autoupdate([string]$state) {
  $name = "Society portal updates ($(Get-Setting 'STACK'), $(Split-Path $Root -Leaf))"
  if ($state -eq "on") {
    # conhost --headless: without it, a console window flashes up every 5 minutes.
    $log = Join-Path $Root "update.log"
    $action = New-ScheduledTaskAction -Execute "conhost.exe" -WorkingDirectory $Root `
      -Argument "--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -Command `"& '$PSCommandPath' tick *>> '$log'`""
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5)
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
    Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
    Say "Automatic updates are on: new releases install each night after $(Get-Setting 'UPDATE_HOUR'):00,"
    Say "after a backup, and `"Update now`" in Settings works within 5 minutes, while you're"
    Say "signed in to Windows (Docker Desktop only runs then). Log: update.log"
  } elseif ($state -eq "off") {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false -ErrorAction SilentlyContinue
    Say "Automatic updates are off. Update with: portal.ps1 update"
  } else {
    Die "say on or off: portal.ps1 autoupdate on"
  }
}

switch ($Command) {
  "install" { Install }
  "start" { Compose up -d --no-build; Wait-Ready | Out-Null }
  "stop" { Compose stop }
  "update" { Update }
  "tick" { Tick }
  "autoupdate" { Autoupdate $Arg }
  "backup" { Backup }
  "restore" { Restore $Arg }
  "logs" { if ($Arg) { Compose logs -f --tail 200 $Arg } else { Compose logs -f --tail 200 } }
  "status" { Compose ps }
  default {
    Get-Content $PSCommandPath | Select-Object -Skip 3 -First 12 | ForEach-Object { $_ -replace "^# ?", "" }
    exit 1
  }
}
