# run_full_finish_bar.ps1 — CLI fallback for revamp_full_finish.py (Blender singleton per asset)
param(
    [Parameter(Mandatory)][string]$PartId,
    [string[]]$Phases = @('iter0','det','materials','bake_hull','bake_mech','bake_accent','render','export'),
    [string]$Date = '2026-07-06'
)
$ErrorActionPreference = 'Stop'
$BLENDER = 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe'
$SCRIPT = Join-Path $PSScriptRoot 'revamp_full_finish.py'
$ROOT = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
if (-not (Test-Path $BLENDER)) { throw "Blender not found: $BLENDER" }
foreach ($phase in $Phases) {
    Write-Host "[$PartId] phase=$phase"
    $env:SF_PART_ID = $PartId
    $env:SF_PHASE = $phase
    $env:SF_REVAMP_DATE = $Date
    & $BLENDER --background --python-expr "import runpy; runpy.run_path(r'$SCRIPT')"
    if ($LASTEXITCODE -ne 0) { throw "Blender failed phase=$phase part=$PartId exit=$LASTEXITCODE" }
}
if ($Phases -contains 'export') {
    $tmp = Join-Path $ROOT 'assets\ships\parts\blender' "${PartId}_export_tmp.glb"
    if (-not (Test-Path $tmp)) { throw "Missing export tmp: $tmp" }
    Write-Host "[$PartId] export tmp ready: $tmp"
}
Write-Host "[$PartId] DONE"