# Gate de publicación: instalar v5.1.7, actualizar EN EL MISMO DIRECTORIO
# con el instalador compilado v5.1.8 y comprobar la persistencia de APPDATA.
# Se ejecuta exclusivamente en un Windows runner efímero de GitHub Actions.
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$oldVersion='5.1.7'
$newVersion='5.1.8'
$work=Join-Path $env:RUNNER_TEMP 'grena-upgrade-517-to-518'
$install=Join-Path $work 'Installed'
$oldSetup=Join-Path $work 'GRENA.LIVE.Setup.5.1.7.exe'
$userdata=Join-Path $env:APPDATA 'GREÑA LIVE PRO'
$checkpoint=Join-Path $userdata 'profiles\ci-upgrade-preservation'
$files=@{
 'chat-settings.json'='{"theme":"minecraft","test":"PRESERVE_CHAT_518"}'
 'chat-connections.json'='{"tiktokUrl":"https://www.tiktok.com/@ci-preserve/live","test":"PRESERVE_CONNECTIONS_518"}'
 'test-account.json'='{"user":"ci-upgrade-preservation","test":"PRESERVE_ACCOUNT_518"}'
 'test-voice.json'='{"voice":"fish-ci","test":"PRESERVE_VOICE_518"}'
}
New-Item -ItemType Directory -Path $work,$checkpoint -Force | Out-Null
$expected=@{}
foreach($entry in $files.GetEnumerator()){
 $dest=Join-Path $checkpoint $entry.Key
 [System.IO.File]::WriteAllText($dest,$entry.Value,[System.Text.UTF8Encoding]::new($false))
 $expected[$entry.Key]=(Get-FileHash -Algorithm SHA256 -Path $dest).Hash
}
function Assert-ProfilePreserved([string]$stage){
 foreach($entry in $expected.GetEnumerator()){
  $file=Join-Path $checkpoint $entry.Key
  if(!(Test-Path -LiteralPath $file)){throw "El instalador $stage borró $file"}
  if((Get-FileHash -Algorithm SHA256 -Path $file).Hash -ne $entry.Value){
   throw "El instalador $stage modificó la cuenta o configuración: $file"
  }
 }
 Write-Host "OK ${stage}: perfil, chat, conexiones y voz conservados (SHA256)."
}
function Install-Silent([string]$setup,[string]$label){
 if(!(Test-Path -LiteralPath $setup)){throw "No existe el instalador $label ($setup)"}
 # NSIS /S = instalación silenciosa y /D = carpeta final. /D siempre va al final.
 Write-Host "Instalando $label en $install..."
 $p=Start-Process -FilePath $setup -ArgumentList @('/S',('/D='+ $install)) -PassThru
 try{
  if(!$p.WaitForExit(180000)){Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue;throw "$label excedió 180 segundos"}
  if($p.ExitCode -ne 0){throw "$label terminó con código $($p.ExitCode)"}
 } finally { $p.Dispose() }
}
$uri="https://github.com/GRENARDD/GRENALIVE/releases/download/v$oldVersion/GRENA.LIVE.Setup.$oldVersion.exe"
Write-Host "Descargando instalador oficial anterior $oldVersion para prueba de actualización..."
Invoke-WebRequest -Uri $uri -OutFile $oldSetup -MaximumRedirection 10 -TimeoutSec 180
if((Get-Item $oldSetup).Length -lt 60000000){throw 'El instalador anterior está incompleto.'}
Install-Silent $oldSetup $oldVersion
$installedExe=Join-Path $install 'GREÑA LIVE.exe'
$appPackage=Join-Path $install 'resources\app\package.json'
if(!(Test-Path -LiteralPath $installedExe)){throw 'El instalador 5.1.7 no dejó GREÑA LIVE.exe en el directorio seleccionado.'}
if(!(Test-Path -LiteralPath $appPackage)){throw 'El instalador 5.1.7 no dejó package.json en resources/app.'}
if((Get-Content $appPackage -Raw -Encoding UTF8|ConvertFrom-Json).version -ne $oldVersion){
 throw 'El instalador 5.1.7 no contiene la versión 5.1.7.'
}
Assert-ProfilePreserved '5.1.7'
$latest=Get-ChildItem -Path (Join-Path (Get-Location) 'dist') -File -Filter "*5.1.8.exe"
if(@($latest).Count -ne 1){throw "Esperaba un solo instalador v5.1.8, encontrados: $(@($latest).Count)"}
Install-Silent (@($latest)[0].FullName) $newVersion
if(!(Test-Path -LiteralPath $installedExe)){throw 'El ejecutable desapareció al actualizar a 5.1.8.'}
if(!(Test-Path -LiteralPath $appPackage)){throw 'No quedó el paquete actualizado instalado.'}
$actual=(Get-Content $appPackage -Raw -Encoding UTF8|ConvertFrom-Json).version
if($actual -ne $newVersion){throw "La actualización no sustituyó la versión antigua: $actual"}
foreach($mod in @('universalify','fs-extra','electron-updater')){
 $modulePath=Join-Path $install "resources\app\node_modules\$mod"
 if(!(Test-Path -LiteralPath $modulePath)){throw "Dependencia ausente tras actualizar: $mod"}
}
Assert-ProfilePreserved '5.1.8'
Write-Host 'OK: instalación real 5.1.7 -> 5.1.8; código y dependencias nuevos; datos persistentes intactos.'
