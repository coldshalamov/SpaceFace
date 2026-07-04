$ErrorActionPreference = 'SilentlyContinue'
$procs = Get-CimInstance Win32_Process
$cpuById = @{}
foreach ($p in (Get-Process)) { $cpuById[[int]$p.Id] = [math]::Round($p.CPU,1) }
$memById = @{}
foreach ($p in (Get-Process)) { $memById[[int]$p.Id] = [math]::Round($p.WorkingSet64/1MB) }
$rows = foreach ($p in $procs) {
  $name = $p.Name
  if ($name -match 'zcode|codex|blender|firefox|msedge|ipf|waves|conhost|taskhost') {
    $cmd = if ($p.CommandLine) { ($p.CommandLine -replace '\s+',' ') } else { '' }
    if ($cmd.Length -gt 55) { $cmd = $cmd.Substring(0,55) + '...' }
    [PSCustomObject]@{
      PID = [int]$p.ProcessId
      PPID = [int]$p.ParentProcessId
      Name = $name
      CPU = if ($cpuById[[int]$p.ProcessId]) { $cpuById[[int]$p.ProcessId] } else { 0 }
      MB = if ($memById[[int]$p.ProcessId]) { $memById[[int]$p.ProcessId] } else { 0 }
      Cmd = $cmd
    }
  }
}
$rows | Sort-Object CPU -Descending | Format-Table PID,PPID,Name,CPU,MB,Cmd -AutoSize
