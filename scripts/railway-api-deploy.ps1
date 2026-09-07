param(
  [Parameter(Mandatory = $true)]
  [string]$ProjectId,

  [Parameter(Mandatory = $true)]
  [string]$EnvironmentId,

  [Parameter(Mandatory = $true)]
  [string]$ServiceId,

  [Parameter(Mandatory = $true)]
  [string]$SourcePath,

  [Parameter(Mandatory = $true)]
  [string]$Message,

  [ValidateRange(60, 1800)]
  [int]$TimeoutSeconds = 900
)

$ErrorActionPreference = 'Stop'
$configPath = 'C:\Users\Rapto\.railway\config.json'
$oauthClientId = 'rlwy_oaci_onEklvmksh1hRUiCo7E2zX12'
$backboard = 'https://backboard.railway.app'
$sessionId = if ($env:RAILWAY_AGENT_SESSION) { $env:RAILWAY_AGENT_SESSION } else { "fyxbot-deploy-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())" }
$caller = if ($env:RAILWAY_CALLER) { $env:RAILWAY_CALLER } else { 'skill:use-railway@1.3.7' }
$archivePath = Join-Path ([System.IO.Path]::GetTempPath()) "fyxbot-$ServiceId-$([Guid]::NewGuid().ToString('N')).tar.gz"

function Get-RailwayAccessToken {
  if (-not (Test-Path -LiteralPath $configPath)) {
    throw 'Session Railway locale introuvable.'
  }

  $config = Get-Content -Raw -LiteralPath $configPath | ConvertFrom-Json
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $expiresAt = [long]($config.user.tokenExpiresAt ?? 0)
  if ($config.user.accessToken -and $expiresAt -gt ($now + 60)) {
    return [string]$config.user.accessToken
  }

  if (-not $config.user.refreshToken) {
    throw 'La session Railway a expiré et aucun jeton de renouvellement est disponible.'
  }

  $tokenRequest = @{
    Uri = "$backboard/oauth/token"
    Method = 'Post'
    ContentType = 'application/x-www-form-urlencoded'
    Body = @{
      grant_type = 'refresh_token'
      refresh_token = [string]$config.user.refreshToken
      client_id = $oauthClientId
    }
  }
  $tokenResponse = Invoke-RestMethod @tokenRequest

  if (-not $tokenResponse.access_token -or [long]$tokenResponse.expires_in -le 0) {
    throw 'Railway a renvoyé une réponse de renouvellement invalide.'
  }

  $backupPath = "$configPath.backup-$([DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss'))"
  Copy-Item -LiteralPath $configPath -Destination $backupPath
  $config.user.accessToken = [string]$tokenResponse.access_token
  if ($tokenResponse.refresh_token) {
    $config.user.refreshToken = [string]$tokenResponse.refresh_token
  }
  $config.user.tokenExpiresAt = $now + [long]$tokenResponse.expires_in
  $config.user.token = $null
  $temporaryConfig = "$configPath.tmp"
  $json = $config | ConvertTo-Json -Depth 100
  [System.IO.File]::WriteAllText($temporaryConfig, $json, [System.Text.UTF8Encoding]::new($false))
  Move-Item -LiteralPath $temporaryConfig -Destination $configPath -Force
  return [string]$config.user.accessToken
}

function New-DeployArchive {
  param([string]$Root)

  $resolvedRoot = (Resolve-Path -LiteralPath $Root).Path
  $exclusions = @(
    '--exclude=.env',
    '--exclude=.env.*',
    '--exclude=node_modules',
    '--exclude=dashboard/node_modules',
    '--exclude=dashboard/dist',
    '--exclude=dashboard/.next',
    '--exclude=dashboard/.vinext',
    '--exclude=dist',
    '--exclude=.next',
    '--exclude=.vinext',
    '--exclude=out',
    '--exclude=data',
    '--exclude=.git',
    '--exclude=.tools',
    '--exclude=coverage',
    '--exclude=*.log'
  )
  Push-Location $resolvedRoot
  try {
    & tar.exe -czf $archivePath @exclusions .
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $archivePath)) {
      throw 'La création de archive de déploiement a échoué.'
    }
  } finally {
    Pop-Location
  }
}

function Get-DeploymentStatus {
  param(
    [string]$AccessToken,
    [string]$DeploymentId
  )

  $query = @'
query Deployments($input: DeploymentListInput!, $first: Int) {
  deployments(input: $input, first: $first) {
    edges { node { id createdAt status meta } }
  }
}
'@
  $payload = @{
    query = $query
    variables = @{
      input = @{
        projectId = $ProjectId
        environmentId = $EnvironmentId
        serviceId = $ServiceId
      }
      first = 20
    }
  } | ConvertTo-Json -Depth 12 -Compress
  $statusRequest = @{
    Uri = "$backboard/graphql/v2"
    Method = 'Post'
    ContentType = 'application/json'
    Headers = @{ Authorization = "Bearer $AccessToken"; 'x-source' = 'railway-cli/5.43.1' }
    Body = $payload
  }
  $response = Invoke-RestMethod @statusRequest
  if ($response.errors) {
    throw "Lecture de état Railway refusée : $($response.errors.message -join '; ')"
  }
  return $response.data.deployments.edges.node | Where-Object { $_.id -eq $DeploymentId } | Select-Object -First 1
}

try {
  $accessToken = Get-RailwayAccessToken
  New-DeployArchive -Root $SourcePath
  $encodedMessage = [Uri]::EscapeDataString($Message)
  $uploadUri = "$backboard/project/$ProjectId/environment/$EnvironmentId/up?serviceId=$ServiceId&message=$encodedMessage"
  $uploadRequest = @{
    Uri = $uploadUri
    Method = 'Post'
    ContentType = 'application/gzip'
    Headers = @{
      Authorization = "Bearer $accessToken"
      'x-source' = 'railway-cli/5.43.1'
      'x-railway-caller' = $caller
      'x-railway-agent-session' = $sessionId
    }
    InFile = $archivePath
  }
  $uploadResponse = Invoke-RestMethod @uploadRequest

  if (-not $uploadResponse.deploymentId) {
    throw 'Railway ne fournit pas identifiant de déploiement.'
  }

  $terminal = @('SUCCESS', 'FAILED', 'CRASHED', 'NEEDS_APPROVAL', 'SLEEPING', 'SKIPPED', 'REMOVED', 'REMOVING')
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  $deployment = $null
  do {
    Start-Sleep -Seconds 10
    $deployment = Get-DeploymentStatus -AccessToken $accessToken -DeploymentId $uploadResponse.deploymentId
    if ($deployment -and $terminal -contains [string]$deployment.status) { break }
  } while ([DateTime]::UtcNow -lt $deadline)

  if (-not $deployment) {
    throw "Le déploiement $($uploadResponse.deploymentId) ne figure pas dans historique Railway."
  }
  if ($terminal -notcontains [string]$deployment.status) {
    throw "Le déploiement $($deployment.id) reste sans état final avant le délai imparti (état : $($deployment.status))."
  }

  [pscustomobject]@{
    deploymentId = $deployment.id
    status = [string]$deployment.status
    createdAt = $deployment.createdAt
    logsUrl = $uploadResponse.logsUrl
  } | ConvertTo-Json

  if ([string]$deployment.status -ne 'SUCCESS') {
    exit 2
  }
} finally {
  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }
}
