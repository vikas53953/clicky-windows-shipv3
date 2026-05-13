param(
  [switch]$Install,
  [switch]$InstallOnly,
  [switch]$CheckOnly,
  [string]$HostName = "127.0.0.1",
  [int]$Port = 8000,
  [string]$Model = "openbmb/VoxCPM2"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$venvPath = Join-Path $repoRoot ".venv-voxcpm"
$pythonExe = Join-Path $venvPath "Scripts\python.exe"
$serverPath = Join-Path $repoRoot "tools\voxcpm_openai_server.py"

function Find-Python311 {
  $candidate = & py -3.11 -c "import sys; print(sys.executable)" 2>$null
  if ($LASTEXITCODE -eq 0 -and $candidate) {
    return $candidate.Trim()
  }

  $candidate = & python -c "import sys; print(sys.executable if sys.version_info[:2] == (3, 11) else '')" 2>$null
  if ($LASTEXITCODE -eq 0 -and $candidate) {
    return $candidate.Trim()
  }

  throw "Python 3.11 is required for the local VoxCPM sidecar."
}

if (!(Test-Path $serverPath)) {
  throw "Missing VoxCPM server wrapper: $serverPath"
}

if ($CheckOnly) {
  $basePython = Find-Python311
  $pythonVersion = & $basePython -c "import sys; print('.'.join(map(str, sys.version_info[:3])))"
  $cudaProbe = Get-Command nvidia-smi -ErrorAction SilentlyContinue
  $videoControllers = @(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue | ForEach-Object {
    [pscustomobject]@{
      name = $_.Name
      adapterRAM = $_.AdapterRAM
      driverVersion = $_.DriverVersion
    }
  })
  [pscustomobject]@{
    python311 = $basePython
    pythonVersion = $pythonVersion
    venvExists = Test-Path $pythonExe
    nvidiaSmi = if ($cudaProbe) { $cudaProbe.Source } else { $null }
    videoControllers = $videoControllers
    serverWrapper = $serverPath
    endpoint = "http://${HostName}:$Port/v1/audio/speech"
    model = $Model
  } | ConvertTo-Json -Depth 3
  exit 0
}

if (!(Test-Path $pythonExe)) {
  $basePython = Find-Python311
  Write-Host "Creating VoxCPM venv at $venvPath ..."
  & $basePython -m venv $venvPath
}

if ($Install -or $InstallOnly) {
  Write-Host "Installing VoxCPM runtime into $venvPath ..."
  & $pythonExe -m pip install --upgrade pip
  & $pythonExe -m pip install numpy voxcpm
}

if (!(Test-Path $pythonExe)) {
  throw "VoxCPM venv was not created correctly: $pythonExe"
}

if ($InstallOnly) {
  Write-Host "VoxCPM install step finished. Start the sidecar with npm run voxcpm:serve."
  exit 0
}

$env:CLICKY_VOXCPM_MODEL = $Model
$env:CLICKY_VOXCPM_HOST = $HostName
$env:CLICKY_VOXCPM_PORT = "$Port"

Write-Host "Starting Clicky VoxCPM sidecar on http://${HostName}:$Port/v1/audio/speech ..."
& $pythonExe "$serverPath" --host $HostName --port $Port --model $Model
