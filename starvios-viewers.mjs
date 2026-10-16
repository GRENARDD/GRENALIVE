// Public live directory used by Starvios itself to render viewer counts.
// A chat popout does NOT expose reliable audience totals.
export const STARVIOS_LIVE_DIRECTORY_URL='https://starvios.com/api/public/live-now';

export function parseStarviosLiveDirectory(raw,channel) {
  if(!raw||!Array.isArray(raw.rows))return {state:'unavailable',count:null};
  const name=String(channel||'').trim().replace(/^@/,'').toLowerCase();
  if(!name)return {state:'unavailable',count:null};
  const stream=raw.rows.find(row=>
    row&&String(row.status||'').toLowerCase()==='live'&&
    String(row.profiles?.username||'').trim().toLowerCase()===name
  );
  if(!stream)return {state:'offline',count:0};
  const value=stream.viewer_count;
  if(typeof value!=='number'&&typeof value!=='string')return {state:'live',count:null};
  if(typeof value==='string'&&!/^\d+$/.test(value))return {state:'live',count:null};
  const n=Number(value);
  if(!Number.isSafeInteger(n)||n<0||n>10000000)return {state:'live',count:null};
  return {state:'live',count:n};
}


/**
 * Respaldo de solo lectura: usa las tablas públicas que Starvios consulta para
 * mostrar un canal en directo. Nunca presupone 0 si el perfil o la cifra no son
 * visibles. No requiere ni almacena credenciales del streamer.
 */
export async function fetchStarviosDbLiveDirectory(channel,{baseUrl,key,request=fetch,timeoutMs=5000}={}){
  const name=String(channel||'').trim().replace(/^@/,'');
  if(!/^[a-zA-Z0-9_.-]{2,40}$/.test(name))throw Error('Canal Starvios no válido');
  if(!baseUrl||!key)throw Error('Consulta pública Starvios no configurada');
  const headers={apikey:key,accept:'application/json'};
  async function readRows(table,params){
    const safeBase=String(baseUrl).endsWith('/')?String(baseUrl).slice(0,-1):String(baseUrl);
    const url=new URL(safeBase+'/'+table);
    for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
    const response=await request(url.href,{headers,signal:AbortSignal.timeout(timeoutMs)});
    if(!response.ok){
      const problem=await response.json().catch(()=>({}));
      const code=String(problem?.code||'').slice(0,30);
      const message=String(problem?.message||'').slice(0,140);
      throw Error('Starvios '+table+' HTTP '+response.status+
        (code?' · '+code:'')+(message?' · '+message:''));
    }
    const rows=await response.json();
    if(!Array.isArray(rows))throw Error('Starvios '+table+' sin registros verificables');
    return rows;
  }
  // Filtramos también localmente, ya que "_" es comodín en ILIKE.
  const profiles=await readRows('profiles',{select:'id,username',username:'ilike.'+name,limit:50});
  const profile=profiles.find(row=>String(row?.username||'').toLowerCase()===name.toLowerCase());
  const id=String(profile?.id||'');
  if(!id||id.length>128)throw Error('Perfil Starvios no disponible por consulta pública');
  let streams=[],previousError=null;
  // Starvios ha utilizado distintos nombres de tabla. Una respuesta vacía de
  // "streams" no confirma que "live_streams" también esté vacía.
  for(const table of ['streams','live_streams']){
    try{
      const matches=await readRows(table,{select:'*',channel_id:'eq.'+id,status:'eq.live',limit:20});
      if(matches.length){streams=matches;break}
    }catch(error){previousError=error}
  }
  // Algunas versiones guardan al autor bajo profile_id/creator_id en vez de
  // channel_id. Consultamos SOLO registros LIVE publicados y verificamos el id.
  if(!streams.length){
    for(const table of ['streams','live_streams']){
      try{
        const candidates=await readRows(table,{select:'*',status:'eq.live',limit:500});
        const matches=candidates.filter(row=>[row?.channel_id,row?.profile_id,row?.creator_id,row?.user_id,row?.streamer_id].some(value=>String(value||'')===id));
        if(matches.length){streams=matches;break}
      }catch(error){previousError=error}
    }
  }
  if(!streams.length)throw previousError||Error('Starvios no publica un LIVE verificable para este canal');
  const rows=streams.filter(row=>[row?.channel_id,row?.profile_id,row?.creator_id,row?.user_id,row?.streamer_id].some(value=>String(value||'')===id));
  const fields=['viewer_count','viewers_count','current_viewers','active_viewers','concurrent_viewers','live_viewers'];
  const mapped=rows.map(row=>{
    const field=fields.find(key=>Object.prototype.hasOwnProperty.call(row,key));
    return {...row,viewer_count:field?row[field]:null,profiles:{username:profile.username}};
  });
  if(mapped.every(row=>row.viewer_count===null)){
    const keys=Object.keys(rows[0]||{}).filter(key=>/view|audien|watch|presen|count/i.test(key)).slice(0,12);
    console.info('[STARVIOS VIEWER FIELDS]',JSON.stringify(keys));
  }
  return {rows:mapped};
}
