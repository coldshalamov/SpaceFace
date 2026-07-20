# Finish place_station_fab + place_station_research only
$ErrorActionPreference = 'Stop'
$ROOT = 'C:\Users\93rob\Documents\GitHub\SpaceFace'
$runner = Join-Path $ROOT 'tools\art\blender\run_full_finish_bar.ps1'
$genTex = Join-Path $ROOT 'tools\art\blender\gen_revamp_textures.py'
$phases = @('iter0','det','materials','bake_hull','bake_mech','bake_accent','render','export')

foreach ($part in @('place_station_fab','place_station_research')) {
    Write-Host "START $part"
    $texDir = Join-Path $ROOT "assets\ships\parts\textures\$part"
    $trim = Join-Path $texDir "${part}_trim_sheet_1k.jpg"
    $wear = Join-Path $texDir "${part}_wear_mask_1k.jpg"
    if (-not (Test-Path $trim) -or -not (Test-Path $wear)) {
        python $genTex $part
        Push-Location $ROOT
        git add -N "assets/ships/parts/textures/$part/"
        Pop-Location
    }
    & $runner -PartId $part -Phases $phases
    Push-Location $ROOT
    $relTmp = "assets/ships/parts/blender/${part}_export_tmp.glb"
    $fin = node tools/art/finalize_part.mjs $relTmp $part --method=blender_mcp 2>&1 | Out-String
    Write-Host $fin
    $evidence = Join-Path $ROOT "assets\ships\parts\revamp-evidence\$part"
    New-Item -ItemType Directory -Force -Path $evidence | Out-Null
    $fin | Set-Content (Join-Path $evidence 'finalize.log') -Encoding utf8
    python (Join-Path $ROOT 'tools\art\blender\write_place_evidence.py') $part
    Pop-Location
    Write-Host "FINISHED $part"
}
Write-Host 'REMAINING BATCH COMPLETE'