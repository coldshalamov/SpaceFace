$ErrorActionPreference = 'SilentlyContinue'
# Sample instantaneous CPU% twice (1s apart) to find what's ACTIVELY burning CPU now,
# not cumulative lifetime CPU.
$s1 = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
  Where-Object { $_.PercentProcessorTime -gt 0 } |
  Select-Object IDProcess, Name, @{N='Pct';E={[int]$_.PercentProcessorTime}}
Start-Sleep -Seconds 1
$s2 = Get-CimInstance Win32_PerfFormattedData_PerfProc_Process |
  Where-Object { $_.PercentProcessorTime -gt 0 } |
  Select-Object IDProcess, Name, @{N='Pct';E={[int]$_.PercentProcessorTime}}

$map = @{}
foreach ($p in $s2) { $map[[int]$p.IDProcess] = [int]$p.Pct }
$rows = foreach ($p in $s1) {
  $p2 = $map[[int]$p.IDProcess]
  if ($p2) {
    [PSCustomObject]@{ PID = [int]$p.IDProcess; Name = $p.Name; PctNow = $p2 }
  }
}
$rows | Sort-Object PctNow -Descending | Select-Object -First 15 | Format-Table -AutoSize
"---"
"Total instantaneous CPU% across all procs (approx, max ~100 per core):"
($rows | Measure-Object PctNow -Sum).Sum
