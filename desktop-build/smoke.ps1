$ErrorActionPreference='Stop'
$exe=Join-Path (Get-Location) 'dist\win-unpacked\GREÑA LIVE.exe'
$backend=Join-Path (Get-Location) 'dist\win-unpacked\resources\app\server.mjs'
$modules=Join-Path (Get-Location) 'dist\win-unpacked\resources\app\node_modules'
if (!(Test-Path $exe)) { throw "No existe el ejecutable $exe" }
if (!(Test-Path $backend)) { throw "El motor Node no se empaquetó como archivo real: $backend" }
if (!(Test-Path $modules)) { throw "Faltan las dependencias node_modules" }
$env:ELECTRON_RUN_AS_NODE='1'
$env:GRENA_CLOUD='0'
$env:HOST='127.0.0.1'
$env:PORT='8787'
$env:GRENA_DATA_DIR=Join-Path $env:RUNNER_TEMP 'GRENA_LIVE_TEST_PROFILE'
$stdout=Join-Path $env:RUNNER_TEMP 'grena.stdout.txt'
$stderr=Join-Path $env:RUNNER_TEMP 'grena.stderr.txt'
$p=$null
try {
 Write-Host 'Prueba real: ejecutar server.mjs con GREÑA LIVE.exe empaquetado'
 $p=Start-Process -FilePath $exe -ArgumentList @($backend) -PassThru -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr
 $healthy=$false
 for ($i=0;$i -lt 110;$i++) {
   Start-Sleep -Milliseconds 500
   if ($p.HasExited) { break }
   try {
     $r=Invoke-WebRequest -Uri 'http://127.0.0.1:8787/health' -UseBasicParsing -TimeoutSec 2
     if ($r.StatusCode -eq 200) { $healthy=$true; break }
   } catch {}
 }
 if (!$healthy) {
   Write-Host '--- STDERR ---'
   if (Test-Path $stderr) { Get-Content $stderr -Tail 100 | Write-Host }
   Write-Host '--- STDOUT ---'
   if (Test-Path $stdout) { Get-Content $stdout -Tail 100 | Write-Host }
   throw 'FALLO: el motor empaquetado no levantó el servicio /health.'
 }
 Write-Host 'OK: GREÑA LIVE Desktop empaquetado responde /health 200.'
} finally {
 if ($p -and !$p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
 Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}
