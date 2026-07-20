# Batch Full Finish Bar for remaining place assets (Blender singleton — one asset at a time)
$ErrorActionPreference = 'Stop'
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

foreach ($part in $jobs.Keys) {
    Log "START $part"
    $texDir = Join-Path $ROOT "assets\ships\parts\textures\$part"
    $trim = Join-Path $texDir "${part}_trim_sheet_1k.jpg"
    $wear = Join-Path $texDir "${part}_wear_mask_1k.jpg"
    if (-not (Test-Path $trim) -or -not (Test-Path $wear)) {
        Log "gen textures $part"
        python $genTex $part
        Push-Location $ROOT
        git add -N "assets/ships/parts/textures/$part/"
        Pop-Location
    }
    $phases = @($jobs[$part])
    $exportOnly = ($phases.Count -eq 1 -and $phases[0] -eq 'export')
    if ($exportOnly) {
        & $runner -PartId $part -Phases @('export')
    } else {
        & $runner -PartId $part -Phases @($phases)
    }
    if ($phases -contains 'export') {
        Push-Location $ROOT
        $relTmp = "assets/ships/parts/blender/${part}_export_tmp.glb"
        $fin = & 'C:\Program Files\nodejs\node.exe' 'tools/art/finalize_part.mjs' $relTmp $part '--method=blender_mcp' 2>&1 | Out-String
        Write-Host $fin
        $evidence = Join-Path $ROOT "assets\ships\parts\revamp-evidence\$part"
        New-Item -ItemType Directory -Force -Path $evidence | Out-Null
        $fin | Set-Content (Join-Path $evidence 'finalize.log') -Encoding utf8
        python (Join-Path $ROOT 'tools\art\blender\write_place_evidence.py') $part
        Pop-Location
    }
    Log "FINISHED $part"
}
Log 'BATCH COMPLETE'