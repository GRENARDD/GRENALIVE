/**
 * Input protection shared by the mobile event service. No OAuth credentials
 * or private network destinations are ever accepted.
 */
export function normalizeTikTokUsername(raw){
  let input=String(raw??'').trim();
  if(/^https:\/\//i.test(input)){
    const url=new URL(input);
    if(!['tiktok.com','www.tiktok.com','m.tiktok.com'].includes(url.hostname.toLowerCase())||
       url.port||url.username||url.password)throw Error('El enlace no pertenece a TikTok.');
    const match=/^\/@([A-Za-z0-9._]{2,30})(?:\/|$)/.exec(url.pathname);
    if(!match)throw Error('Enlace público de TikTok inválido.');
    input=match[1];
  }else input=input.replace(/^@/,'');
  if(!/^[A-Za-z0-9._]{2,30}$/.test(input))throw Error('Introduce un @usuario válido de TikTok.');
  return input;
}
export function safeEventText(value,max=160){
  return String(value??'').replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,max);
}
