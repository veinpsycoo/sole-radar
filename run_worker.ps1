$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$pythonPath = (Get-Command python.exe -ErrorAction Stop).Source
$workerJob = Start-Process -FilePath $pythonPath -ArgumentList @('-u', 'worker.py', '--once', '--publish') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'data/scheduled-refresh.log') -RedirectStandardError (Join-Path $PSScriptRoot 'data/scheduled-refresh-error.log') -PassThru -Wait
exit $workerJob.ExitCode
