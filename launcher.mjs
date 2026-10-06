import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writeFile, readFile, mkdir, unlink, rename, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomBytes } from 'node:crypto';

const ROOT=dirname(fileURLToPath(import.meta.url));
process.on('unhandledRejection',e=>console.error('[launcher unhandledRejection]',e));
process.on('uncaughtException',e=>console.error('[launcher uncaughtException]',e));
// Token aleatorio por arranque para el puente interno server<->chat (ya no es una clave fija en el código).
const BRIDGE_TOKEN=randomBytes(24).toString('hex');
// En la edición portable el ejecutable puede viajar entre PCs, pero los datos del creador
// deben quedarse en el perfil de Windows de cada persona. Esto evita empaquetar cuentas,
// tokens, cookies o perfiles de navegador dentro del ZIP compartido.
const DEFAULT_DATA_DIR=join(process.env.APPDATA || join(homedir(),'AppData','Roaming'),'GREÑA LIVE PRO');
const DATA_DIR=(process.env.GRENA_APP_MODE==='1')
  ? DEFAULT_DATA_DIR
  : (process.env.GRENA_DATA_DIR || DEFAULT_DATA_DIR);
// El EXE portable antiguo definía GRENA_DATA_DIR apuntando a data\backend. Lo corregimos
// aquí antes de lanzar los servidores para que todos los procesos usen el perfil del usuario.
if(process.env.GRENA_APP_MODE==='1')process.env.GRENA_DATA_DIR=DATA_DIR;
const LOG_DIR=join(DATA_DIR,'logs');
const PID_FILE=join(DATA_DIR,'launcher-pids.json');
await mkdir(LOG_DIR,{recursive:true}).catch(()=>{});

let stopping=false;
let browserProcess=null;
let browserProfile='';
let appWindowReady=false;
const services=new Map();
const restartTimers=new Map();

async function atomicWriteJson(file,data){
  const tmp=`${file}.tmp`;
  await writeFile(tmp,JSON.stringify(data,null,2),'utf8');
  try{await rename(tmp,file)}catch{
    await unlink(file).catch(()=>{});
    await rename(tmp,file);
  }
}
async function persistPids(){
  const pids=[process.pid,...services.values()].map(s=>s.process?.pid ?? s).filter(pid=>Number.isInteger(pid)&&pid>0);
  await atomicWriteJson(PID_FILE,[...new Set(pids)]).catch(()=>{});
}
// FIX4: un PID guardado puede haber sido reutilizado por otro programa. Solo se cierra si el proceso
// sigue siendo un node.exe que ejecuta launcher/server/chat-server desde ESTA carpeta de GREÑA.
async function filterGrenaPids(pids){
  const list=pids.filter(pid=>Number.isInteger(pid)&&pid>0&&pid!==process.pid);
  if(!list.length)return [];
  if(process.platform==='win32'){
    const ps="$root=$env:GRENA_ROOT; foreach($id in ($env:GRENA_PIDS -split ',')){ if($id -notmatch '^[0-9]+$'){continue}; try{ $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$id); if($p -and $p.Name -match '^node(\\.exe)?$' -and $p.CommandLine -and $p.CommandLine.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $p.CommandLine -match '(launcher|chat-server|server)\\.mjs'){ Write-Output $id } }catch{} }";
    const out=await new Promise(resolve=>{
      let buf='';
      const p=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',ps],{windowsHide:true,stdio:['ignore','pipe','ignore'],env:{...process.env,GRENA_ROOT:ROOT,GRENA_PIDS:list.join(',')}});
      p.stdout.on('data',d=>{buf+=d});
      p.on('error',()=>resolve(''));p.on('exit',()=>resolve(buf));
      setTimeout(()=>resolve(buf),6000);
    });
    const ok=new Set(String(out).split(/\s+/).map(Number).filter(Number.isInteger));
    return list.filter(pid=>ok.has(pid));
  }
  const ok=[];
  for(const pid of list){
    const cmd=await new Promise(r=>execFile('ps',['-p',String(pid),'-o','command='],{windowsHide:true},(e,out)=>r(e?'':String(out))));
    if(cmd.includes(ROOT)&&/(launcher|chat-server|server)\.mjs/.test(cmd))ok.push(pid);
  }
  return ok;
}
async function stopPrevious(){
  try{
    const raw=JSON.parse(await readFile(PID_FILE,'utf8'));
    const verified=await filterGrenaPids(Array.isArray(raw)?raw:[]);
    for(const pid of verified){
      if(process.platform==='win32'){
        await new Promise(r=>execFile('taskkill',['/PID',String(pid),'/T','/F'],{windowsHide:true},()=>r()));
      }else{
        try{process.kill(pid,'SIGTERM')}catch{}
      }
    }
  }catch{}
  await unlink(PID_FILE).catch(()=>{});
}
async function freeGrenaPorts(){
  if(process.platform!=='win32')return;
  // Limpia instancias antiguas de GREÑA que no estaban registradas en launcher-pids.json.
  // Solo toca procesos node.exe que estén escuchando en los puertos exclusivos de GREÑA.
  const ps=`$ports=@(8787,8788,8790); $ids=@(); foreach($port in $ports){ try { $ids += (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess) } catch {} }; $ids=$ids|Sort-Object -Unique; foreach($id in $ids){ try { $p=Get-CimInstance Win32_Process -Filter \"ProcessId=$id\"; if($p -and $p.Name -match '^node(\\.exe)?$' -and $p.CommandLine -match '(launcher\\.mjs|chat-server\\.mjs|server\\.mjs)'){ Stop-Process -Id $id -Force -ErrorAction SilentlyContinue } } catch {} }`;
  await new Promise(resolve=>{
    const p=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',ps],{windowsHide:true,stdio:'ignore'});
    p.on('error',()=>resolve());p.on('exit',()=>resolve());
    setTimeout(resolve,3500);
  });
  await new Promise(r=>setTimeout(r,350));
}

async function health(url,timeoutMs=1600){
  const ac=new AbortController();
  const timer=setTimeout(()=>ac.abort(),timeoutMs);
  try{const r=await fetch(url,{cache:'no-store',signal:ac.signal});return r.ok}catch{return false}finally{clearTimeout(timer)}
}
async function logHandle(name){
  const path=join(LOG_DIR,`${name}.log`);
  try{return await open(path,'a')}catch{return null}
}
async function startService(name,file,healthUrl,extraEnv={}){
  if(stopping)return null;
  const oldTimer=restartTimers.get(name);
  if(oldTimer){clearTimeout(oldTimer);restartTimers.delete(name)}

  const fh=await logHandle(name);
  // El servidor principal usa un canal IPC privado con el launcher. Así la ventana
  // puede pedir "Salir de GREÑA" sin exponer ningún puerto de control adicional.
  const stdio=name==='main'
    ? (fh?['ignore',fh.fd,fh.fd,'ipc']:['ignore','ignore','ignore','ipc'])
    : (fh?['ignore',fh.fd,fh.fd]:'ignore');
  let p;
  try{
    p=spawn(process.execPath,[join(ROOT,file)],{
      cwd:ROOT,
      stdio,
      windowsHide:true,
      env:{...process.env,GRENA_BRIDGE_TOKEN:BRIDGE_TOKEN,...extraEnv}
    });
  }catch(e){
    await fh?.appendFile(`[${new Date().toISOString()}] spawn fallo: ${e?.stack||e}\n`).catch(()=>{});
    await fh?.close().catch(()=>{});
    scheduleRestart(name,file,healthUrl,extraEnv,1);
    return null;
  }
  const svc={name,file,healthUrl,process:p,restarts:(services.get(name)?.restarts||0),external:false,fh,extraEnv};
  services.set(name,svc);
  await persistPids();

  if(name==='main'&&typeof p.on==='function'){
    p.on('message',msg=>{
      if(!msg||typeof msg!=='object')return;
      if(msg.type==='grena-app-window-ready')appWindowReady=true;
      if(msg.type==='grena-shutdown-request')shutdownAndExit(String(msg.reason||'solicitud-app')).catch(()=>process.exit(0));
    });
  }

  p.on('error',async e=>{
    await fh?.appendFile(`[${new Date().toISOString()}] error de proceso: ${e?.stack||e}\n`).catch(()=>{});
  });
  p.once('exit',async(code,signal)=>{
    await fh?.appendFile(`[${new Date().toISOString()}] proceso terminado code=${code} signal=${signal||''}\n`).catch(()=>{});
    await fh?.close().catch(()=>{});
    const current=services.get(name);
    if(current?.process!==p||stopping)return;
    const next=(current.restarts||0)+1;
    scheduleRestart(name,file,healthUrl,extraEnv,next);
  });
  return p;
}
function scheduleRestart(name,file,healthUrl,extraEnv,restarts){
  if(stopping)return;
  const delay=Math.min(6000,800*Math.max(1,restarts));
  const timer=setTimeout(async()=>{
    restartTimers.delete(name);
    const existing=services.get(name)||{};
    services.set(name,{...existing,restarts});
    await startService(name,file,healthUrl,extraEnv);
  },delay);
  restartTimers.set(name,timer);
}
async function waitForBoth(tries=100){
  for(let i=0;i<tries;i++){
    const [main,chat]=await Promise.all([
      health('http://127.0.0.1:8787/health'),
      health('http://127.0.0.1:8788/health')
    ]);
    if(main&&chat)return true;
    await new Promise(r=>setTimeout(r,200));
  }
  return false;
}
function openBrowser(url='http://127.0.0.1:8787/'){
  try{
    let p=null,tracked=false;
    if(process.platform==='win32' && process.env.GRENA_APP_MODE==='1'){
      const pfx=process.env['ProgramFiles(x86)']||process.env['PROGRAMFILES(X86)']||process.env.PROGRAMFILES||'';
      const pf=process.env.ProgramFiles||process.env.PROGRAMFILES||'';
      const local=process.env.LOCALAPPDATA||'';
      const candidates=[
        pfx&&join(pfx,'Microsoft','Edge','Application','msedge.exe'),
        pf&&join(pf,'Microsoft','Edge','Application','msedge.exe'),
        local&&join(local,'Microsoft','Edge','Application','msedge.exe')
      ].filter(Boolean);
      const edge=candidates.find(existsSync);
      if(edge){
        // Perfil de Edge exclusivo de GREÑA y por usuario. Usamos una carpeta versionada
        // para no reutilizar perfiles viejos que pudieran traer extensiones o pestañas de instalación.
        const profile=join(DATA_DIR,'browser-profile-v2');
        browserProfile=profile;
        const args=[`--user-data-dir=${profile}`,`--app=${url}`,'--start-maximized','--no-first-run','--disable-background-mode','--disable-extensions'];
        p=spawn(edge,args,{detached:false,stdio:'ignore',windowsHide:true});
        browserProcess=p;tracked=true;
      }
    }
    if(!p){
      if(process.platform==='win32') p=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{detached:true,stdio:'ignore',windowsHide:true});
      else if(process.platform==='darwin') p=spawn('open',[url],{detached:true,stdio:'ignore'});
      else p=spawn('xdg-open',[url],{detached:true,stdio:'ignore'});
    }
    p.on('error',()=>{});
    if(tracked){
      p.once('exit',()=>{
        if(browserProcess===p)browserProcess=null;
        // NO cerramos toda GREÑA por la salida de este PID de Edge. Edge puede transferir
        // la ventana a otro proceso, reciclar el renderer o reiniciarlo tras una actualización.
        // El cierre real de la ventana lo confirma la propia página mediante /api/app/window-closing.
        // Si Edge se cae por completo, el próximo arranque de GREÑA limpia estos servicios viejos.
      });
    }else p.unref();
  }catch{}
}

async function ensureHealthy(name){
  if(stopping)return;
  const svc=services.get(name);
  if(!svc)return;
  const ok=await health(svc.healthUrl,1500);
  if(ok){svc.badHealth=0;svc.okStreak=(svc.okStreak||0)+1;if(svc.okStreak>=3)svc.restarts=0;return} // FIX4: tras un arranque estable, el contador de reinicios vuelve a 0
  svc.okStreak=0;
  svc.badHealth=(svc.badHealth||0)+1;
  if(svc.badHealth<2)return;
  svc.badHealth=0;
  if(svc.process && svc.process.exitCode===null){try{svc.process.kill()}catch{}}
  else if(!restartTimers.has(name)) scheduleRestart(name,svc.file,svc.healthUrl,svc.extraEnv||{},Math.max(1,svc.restarts||1));
}

await stopPrevious();
await freeGrenaPorts();
await persistPids();

// IMPORTANTE: el motor de chat se inicia como servicio independiente. Ya no depende
// de que server.mjs consiga crear un proceso hijo oculto en Windows.
await startService('chat','chat-server.mjs','http://127.0.0.1:8788/health');
await startService('main','server.mjs','http://127.0.0.1:8787/health',{GRENA_CHAT_MANAGED_BY_LAUNCHER:'1'});

const ok=await waitForBoth();
openBrowser();
if(!ok){
  const diag=join(DATA_DIR,'ARRANQUE_ERROR.txt');
  await writeFile(diag,
`GRENA no consiguió tener activos ambos motores.\n\n`+
`Principal: http://127.0.0.1:8787/health\nChat:      http://127.0.0.1:8788/health\n\n`+
`Revisa los registros en:\n${LOG_DIR}\n`, 'utf8').catch(()=>{});
}

setInterval(()=>{ensureHealthy('chat');ensureHealthy('main')},3000);

async function killOwnedTree(p){
  if(!p?.pid)return;
  if(process.platform==='win32'){
    await new Promise(resolve=>execFile('taskkill',['/PID',String(p.pid),'/T','/F'],{windowsHide:true},()=>resolve()));
    return;
  }
  try{if(p.exitCode===null)p.kill('SIGTERM')}catch{}
}
async function killOwnedBrowserProfile(){
  if(process.platform!=='win32'||!browserProfile)return;
  // Edge puede transferir la ventana a otro proceso. Cerramos solo procesos msedge.exe
  // cuyo command line use el perfil privado de GREÑA; no toca el Edge/Chrome normal.
  const ps="$profile=$env:GRENA_BROWSER_PROFILE; Get-CimInstance Win32_Process -Filter \"Name='msedge.exe'\" | Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($profile,[StringComparison]::OrdinalIgnoreCase) -ge 0 } | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }";
  await new Promise(resolve=>{
    const q=spawn('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-Command',ps],{windowsHide:true,stdio:'ignore',env:{...process.env,GRENA_BROWSER_PROFILE:browserProfile}});
    q.on('error',()=>resolve());q.on('exit',()=>resolve());setTimeout(resolve,3500);
  });
}
async function stop({closeBrowser=true}={}){
  if(stopping)return;
  stopping=true;
  for(const t of restartTimers.values())clearTimeout(t);
  restartTimers.clear();

  // Mata únicamente los árboles de procesos cuyo PID fue creado por este launcher.
  // /T incluye cloudflared y navegadores internos lanzados por los motores de GREÑA.
  for(const {process:p} of services.values())await killOwnedTree(p).catch(()=>{});
  for(const {fh} of services.values())try{await fh?.close()}catch{}
  services.clear();

  if(closeBrowser&&browserProcess){
    const bp=browserProcess;browserProcess=null;
    await killOwnedTree(bp).catch(()=>{});
  }
  if(closeBrowser)await killOwnedBrowserProfile().catch(()=>{});
  await unlink(PID_FILE).catch(()=>{});
}
async function shutdownAndExit(reason='salida'){
  if(stopping)return;
  console.log(`[GREÑA] Cierre completo: ${reason}`);
  await stop({closeBrowser:true});
  process.exit(0);
}
process.on('SIGINT',()=>shutdownAndExit('SIGINT').catch(()=>process.exit(0)));
process.on('SIGTERM',()=>shutdownAndExit('SIGTERM').catch(()=>process.exit(0)));
process.on('exit',()=>{});
setInterval(()=>{},1<<30);
