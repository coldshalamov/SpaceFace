# HISTORICAL / LEGACY REPLAY ONLY.
# Replays the retired place_station_fab + place_station_research batch.
[CmdletBinding()]
param(
    [switch]$LegacyReplay,
    [switch]$Help
)
$ErrorActionPreference = 'Stop'
if (-not $LegacyReplay) {
    throw 'LEGACY FULL FINISH REPLAY BLOCKED: pass -LegacyReplay explicitly; new work follows docs/visual-assets/README.md'
}
if ($Help) {
    Write-Host 'usage: run_remaining_places.ps1 -LegacyReplay [-Help]'
    Write-Host 'historical replay only; not a current graphics production route'
    return
}
$ROOT = 'C:\Users\93rob\Documents\GitHub\SpaceFace'
$runner = Join-Path $ROOT 'tools\art\blender\run_full_finish_bar.ps1'
$genTex = Join-Path $ROOT 'tools\art\blender\gen_revamp_textures.py'
$phases = @('iter0','det','materials','bake_hull','bake_mech','bake_accent','render','export')
$previousReplay = $env:SF_LEGACY_REPLAY
$env:SF_LEGACY_REPLAY = '--legacy-replay'

try {
foreach ($part in @('place_station_fab','place_station_research')) {
    Write-Host "START $part"
    $texDir = Join-Path $ROOT "assets\ships\parts\textures\$part"
    $trim = Join-Path $texDir "${part}_trim_sheet_1k.jpg"
    $wear = Join-Path $texDir "${part}_wear_mask_1k.jpg"
    if (-not (Test-Path $trim) -or -not (Test-Path $wear)) {
        python $genTex '--legacy-replay' $part
        Push-Location $ROOT
        git add -N "assets/ships/parts/textures/$part/"
        Pop-Location
    }
    & $runner -PartId $part -Phases $phases -LegacyReplay
    Push-Location $ROOT
    $relTmp = "assets/ships/parts/blender/${part}_export_tmp.glb"
    $fin = node tools/art/finalize_part.mjs $relTmp $part --method=blender_mcp 2>&1 | Out-String
    Write-Host $fin
    $evidence = Join-Path $ROOT "assets\ships\parts\revamp-evidence\$part"
    New-Item -ItemType Directory -Force -Path $evidence | Out-Null
    $fin | Set-Content (Join-Path $evidence 'finalize.log') -Encoding utf8
    python (Join-Path $ROOT 'tools\art\blender\write_place_evidence.py') '--legacy-replay' $part
    Pop-Location
    Write-Host "FINISHED $part"
}
Write-Host 'REMAINING BATCH COMPLETE'
} finally {
    if ($null -eq $previousReplay) {
        Remove-Item Env:SF_LEGACY_REPLAY -ErrorAction SilentlyContinue
    } else {
        $env:SF_LEGACY_REPLAY = $previousReplay
    }
}
