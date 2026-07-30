# HISTORICAL / LEGACY REPLAY ONLY.
# Current graphics work follows docs/visual-assets/README.md and the material-truth skill.
# run_full_finish_bar.ps1 — retired CLI fallback for revamp_full_finish.py
[CmdletBinding()]
param(
    [string]$PartId,
    [string[]]$Phases = @('iter0','det','materials','bake_hull','bake_mech','bake_accent','render','export'),
    [string]$Date = '2026-07-06',
    [switch]$LegacyReplay,
    [switch]$Help
)
$ErrorActionPreference = 'Stop'
if (-not $LegacyReplay) {
    throw 'LEGACY FULL FINISH REPLAY BLOCKED: pass -LegacyReplay explicitly; new work follows docs/visual-assets/README.md'
}
if ($Help) {
    Write-Host 'usage: run_full_finish_bar.ps1 -LegacyReplay -PartId <id> [-Phases <phase[]>]'
    Write-Host 'historical replay only; not a current graphics production route'
    return
}
if ([string]::IsNullOrWhiteSpace($PartId)) {
    throw 'Legacy replay requires -PartId <id>.'
}
$previousReplay = $env:SF_LEGACY_REPLAY
$env:SF_LEGACY_REPLAY = '--legacy-replay'

try {
$BLENDER = 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe'
$SCRIPT = Join-Path $PSScriptRoot 'revamp_full_finish.py'
$ROOT = Resolve-Path (Join-Path $PSScriptRoot '..\..\..')
if (-not (Test-Path $BLENDER)) { throw "Blender not found: $BLENDER" }
$authoringPath = Join-Path $ROOT 'assets\ships\parts\blender\authoring.json'
$authoring = Get-Content -LiteralPath $authoringPath -Raw | ConvertFrom-Json
$entry = $authoring.entries.PSObject.Properties[$PartId].Value
if (
    $Phases -contains 'export' -and
    $null -ne $entry -and
    -not [string]::IsNullOrWhiteSpace($entry.texture_finalizer_path) -and
    $entry.texture_finalizer_status -ne 'blender-export-ready'
) {
    throw "Registered texture finalizer for $PartId is canonical-GLB repair-only; Blender export promotion is blocked until exact material and asset-metadata parity is proven."
}
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

    # The authoring registry is executable routing, not descriptive metadata. Assets that
    # declare a texture finalizer must pass the exact Blender export through it before the
    # canonical source and manifest are promoted transactionally.
    if ($null -ne $entry -and -not [string]::IsNullOrWhiteSpace($entry.texture_finalizer_path)) {
        $finalizer = Join-Path $ROOT $entry.texture_finalizer_path
        if (-not (Test-Path -LiteralPath $finalizer)) {
            throw "Missing registered texture finalizer: $finalizer"
        }
        $node = (Get-Command node -ErrorAction Stop).Source
        $finalizerReport = & $node $finalizer '--apply' "--id=$PartId" "--input=$tmp" 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "Texture finalizer failed part=$PartId exit=$LASTEXITCODE`n$($finalizerReport -join [Environment]::NewLine)"
        }
        $evidenceDir = Join-Path $ROOT "assets\ships\parts\revamp-evidence\$PartId"
        New-Item -ItemType Directory -Force -Path $evidenceDir | Out-Null
        $finalizerReport | Set-Content -LiteralPath (Join-Path $evidenceDir 'texture-finalizer-report.json') -Encoding utf8
        Write-Host "[$PartId] texture-finalized and promoted from exact export: $tmp"
    }
}
Write-Host "[$PartId] DONE"
} finally {
    if ($null -eq $previousReplay) {
        Remove-Item Env:SF_LEGACY_REPLAY -ErrorAction SilentlyContinue
    } else {
        $env:SF_LEGACY_REPLAY = $previousReplay
    }
}
