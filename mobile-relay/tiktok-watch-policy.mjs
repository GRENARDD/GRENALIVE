/**
 * Only TikTok LIVE is active in GREÑA Android 0.5.
 * A watcher may be active while the creator is offline. Do not mark LIVE
 * without a successful platform handshake.
 */
export const WATCH_RETRY_MS=30_000;
export function retryDelay(failures){
  const count=Math.max(1,Math.min(10,Math.floor(Number(failures)||1)));
  return Math.min(120_000,WATCH_RETRY_MS*count);
}
export function canRetry(session,now=Date.now()){
  return Boolean(session?.watching&&!session?.connected&&!session?.connecting&&
    now >= Number(session.retryAt||0));
}
export function confirmedLive(session){
  return session?.connected===true&&session?.watching===true&&
    typeof session.roomId==='string'&&session.roomId.length>0;
}
