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
