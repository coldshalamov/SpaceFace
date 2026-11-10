# Batch Full Finish Bar for remaining place assets (Blender singleton — one asset at a time)
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
    Write-Host 'usage: run_batch_places.ps1 -LegacyReplay [-Help]'
    Write-Host 'historical replay only; not a current graphics production route'
    return
}
$ROOT = 'C:\Users\93rob\Documents\GitHub\SpaceFace'
$LOG = Join-Path $ROOT 'tools\art\blender\batch_full_finish.log'
function Log($msg) { $line = "$(Get-Date -Format o) $msg"; Add-Content $LOG $line; Write-Host $line }

# partId => phases to run (skip completed prefixes)
$jobs = [ordered]@{
    'place_station_blackmarket'   = @('iter0','det','materials','bake_hull','bake_mech','bake_accent','render','export')
    'place_gate_jump_ring'        = @('iter0','det','materials','bake_hull','bake_mech','bake_accent','render','export')
    'place_station_mining'        = @('iter0','det','materials','bake_hull','bake_mech','bake_accent','render','export')
    'place_station_fab'           = @('iter0','det','materials','bake_hull','bake_mech','bake_accent','render','export')
    'place_station_research'      = @('iter0','det','materials','bake_hull','bake_mech','bake_accent','render','export')
}

$runner = Join-Path $ROOT 'tools\art\blender\run_full_finish_bar.ps1'
$genTex = Join-Path $ROOT 'tools\art\blender\gen_revamp_textures.py'
$previousReplay = $env:SF_LEGACY_REPLAY
$env:SF_LEGACY_REPLAY = '--legacy-replay'

try {
foreach ($part in $jobs.Keys) {
    Log "START $part"
    $texDir = Join-Path $ROOT "assets\ships\parts\textures\$part"
    $trim = Join-Path $texDir "${part}_trim_sheet_1k.jpg"
    $wear = Join-Path $texDir "${part}_wear_mask_1k.jpg"
    if (-not (Test-Path $trim) -or -not (Test-Path $wear)) {
        Log "gen textures $part"
        python $genTex '--legacy-replay' $part
        Push-Location $ROOT
        git add -N "assets/ships/parts/textures/$part/"
        Pop-Location
    }
    $phases = @($jobs[$part])
    $exportOnly = ($phases.Count -eq 1 -and $phases[0] -eq 'export')
    if ($exportOnly) {
        & $runner -PartId $part -Phases @('export') -LegacyReplay
    } else {
        & $runner -PartId $part -Phases @($phases) -LegacyReplay
    }
    if ($phases -contains 'export') {
        Push-Location $ROOT
        $relTmp = "assets/ships/parts/blender/${part}_export_tmp.glb"
        $fin = & 'C:\Program Files\nodejs\node.exe' 'tools/art/finalize_part.mjs' $relTmp $part '--method=blender_mcp' 2>&1 | Out-String
        Write-Host $fin
        $evidence = Join-Path $ROOT "assets\ships\parts\revamp-evidence\$part"
        New-Item -ItemType Directory -Force -Path $evidence | Out-Null
        $fin | Set-Content (Join-Path $evidence 'finalize.log') -Encoding utf8
        python (Join-Path $ROOT 'tools\art\blender\write_place_evidence.py') '--legacy-replay' $part
        Pop-Location
    }
    Log "FINISHED $part"
}
Log 'BATCH COMPLETE'
} finally {
    if ($null -eq $previousReplay) {
        Remove-Item Env:SF_LEGACY_REPLAY -ErrorAction SilentlyContinue
    } else {
        $env:SF_LEGACY_REPLAY = $previousReplay
    }
}
