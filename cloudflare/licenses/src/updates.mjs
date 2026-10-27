// GREÑA LIVE PRO: owner-controlled release channel.
// Drafting never changes the public feed. Only an explicit owner publish does.
const storeSql = "CREATE TABLE IF NOT EXISTS update_publications (channel TEXT PRIMARY KEY, draft_version TEXT, draft_notes TEXT, published_version TEXT, published_notes TEXT, published_at INTEGER, installer_name TEXT, manifest_yaml TEXT)";
const tagValid = version => /^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(version);
const newer = (a,b) => {const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++){if(x[i]!==y[i])return x[i]>y[i]}return false};
async function current(env){await env.DB.prepare(storeSql).run();return await env.DB.prepare("SELECT * FROM update_publications WHERE channel='stable'").first()}
function published(row){return row?.published_version?{version:row.published_version,notes:row.published_notes||'',publishedAt:row.published_at}:null}
function draft(row){return row?.draft_version?{version:row.draft_version,notes:row.draft_notes||''}:null}
const bad=(message,status=400)=>new Response(JSON.stringify({ok:false,error:message}),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const ok=data=>new Response(JSON.stringify({ok:true,...data}),{headers:{'content-type':'application/json','cache-control':'no-store'}});
async function releaseFiles(version){
 const tag='v'+version;
 const response=await fetch('https://api.github.com/repos/GRENARDD/GRENALIVE/releases/tags/'+tag,{headers:{'accept':'application/vnd.github+json','user-agent':'GRENA-LIVE-Release-Gate'},signal:AbortSignal.timeout(10000)});
 if(!response.ok)return {error:'La versión '+tag+' todavía no está publicada en GitHub Releases.',status:409};
 const release=await response.json();
 if(release.tag_name!==tag||release.draft||release.prerelease)return {error:'Publica primero una versión estable en GitHub Releases.',status:409};
 const info=release.assets?.find(a=>a.name==='latest.yml');
 if(!info||info.size<100||info.size>65536)return {error:'La versión necesita latest.yml generado por electron-builder.',status:409};
 const result=await fetch(info.browser_download_url,{signal:AbortSignal.timeout(10000)});
 if(!result.ok)return {error:'No se pudo verificar latest.yml de GitHub.',status:503};
 const yaml=await result.text();
 const value=/^version:\s*([^\s]+)\s*$/m.exec(yaml)?.[1];
 const names=[...yaml.matchAll(/^\s*- url:\s*([^\r\n]+)\s*$/gm)];
 const name=names.length===1?names[0][1].trim().replace(/^["']|["']$/g,''):'';
 const checksum=/^\s*sha512:\s*[A-Za-z0-9+/=]{70,}\s*$/m.test(yaml);
 if(yaml.length>65536||value!==version||!checksum||!/^[-a-zA-Z0-9_(). +%]+\.exe$/i.test(name))
   return {error:'El manifiesto de actualización es inválido o no coincide con esta versión.',status:409};
 if(!release.assets.some(a=>a.name===name&&a.size>1000000))
   return {error:'El instalador indicado en latest.yml no existe en GitHub Releases.',status:409};
 return {yaml,name};
}
export async function publicUpdates(req,env){
 const url=new URL(req.url),path=url.pathname;
 if(req.method!=='GET')return null;
 if(path==='/api/updates/latest'){
   const row=await current(env);
   return ok({published:!!row?.published_version,release:published(row)});
 }
 if(path==='/api/updates/latest.yml'){
   const row=await current(env);
   if(!row?.manifest_yaml||!row.published_version)return bad('No hay actualizaciones aprobadas.',404);
   const yaml=row.manifest_yaml.replace(/(^\s*- url:\s*)([^\r\n]+)/gm,(_line,prefix,name)=>prefix+'download/'+encodeURIComponent(name.trim().replace(/^["']|["']$/g,'')));
   return new Response(yaml,{headers:{'content-type':'text/yaml; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}});
 }
 if(path.startsWith('/api/updates/download/')){
   const row=await current(env);
   if(!row?.published_version||!row.installer_name)return bad('Actualización no disponible.',404);
   let name;try{name=decodeURIComponent(path.slice('/api/updates/download/'.length))}catch{return bad('Nombre de archivo inválido.')};
   if(name!==row.installer_name&&name!==row.installer_name+'.blockmap')return bad('Archivo no publicado oficialmente.',404);
   return Response.redirect('https://github.com/GRENARDD/GRENALIVE/releases/download/v'+row.published_version+'/'+encodeURIComponent(name),302);
 }
 return null;
}
export async function adminUpdates(req,env,parseBody){
 const path=new URL(req.url).pathname;
 if(path==='/api/license-admin/updates'&&req.method==='GET'){
   const row=await current(env);
   return ok({draft:draft(row),published:published(row)});
 }
 if(req.method!=='POST'||!['/api/license-admin/updates/stage','/api/license-admin/updates/publish'].includes(path))return null;
 const input=await parseBody(req),row=await current(env);
 if(path.endsWith('/stage')){
   const version=String(input.version||'').trim(),notes=String(input.notes||'').trim();
   if(!tagValid(version)||notes.length>1200)return bad('Escribe una versión válida como 5.1.0 y notas de hasta 1200 caracteres.');
   if(row?.published_version&&!newer(version,row.published_version))return bad('La versión nueva debe ser superior a la publicada.',409);
   await env.DB.prepare("INSERT INTO update_publications(channel,draft_version,draft_notes) VALUES('stable',?,?) ON CONFLICT(channel) DO UPDATE SET draft_version=excluded.draft_version,draft_notes=excluded.draft_notes").bind(version,notes).run();
   return ok({draft:{version,notes},published:false,message:'Borrador guardado: los usuarios todavía NO reciben avisos.'});
 }
 const version=row?.draft_version;
 if(!version||!tagValid(version))return bad('Primero guarda una versión como borrador.',409);
 if(row?.published_version&&!newer(version,row.published_version))return bad('La versión no supera a la publicada.',409);
 const files=await releaseFiles(version);
 if(files.error)return bad(files.error,files.status);
 const time=Date.now();
 await env.DB.prepare("UPDATE update_publications SET published_version=draft_version,published_notes=draft_notes,published_at=?,installer_name=?,manifest_yaml=?,draft_version=NULL,draft_notes=NULL WHERE channel='stable' AND draft_version=?")
   .bind(time,files.name,files.yaml,version).run();
 return ok({published:true,release:{version,notes:row.draft_notes||'',publishedAt:time},message:'Actualización publicada oficialmente. Los clientes ya pueden recibir el aviso.'});
}
