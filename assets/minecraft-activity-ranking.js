/* GREÑA Live · Ranking de personajes Minecraft por actividad real del LIVE.
 * El tiempo es estimado por señales (entrada/chat/regalos): TikTok no publica
 * un cronómetro individual fiable ni eventos de salida para todos los usuarios.
 * Fuente universal, sin dependencias: navegador/Node para pruebas.
 */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.GrenaMinecraftActivity=api;
})(typeof window!=='undefined'?window:null,function(){
  'use strict';
  const MAX_VISIBLE=10, MAX_TRACKED=500, PRESENCE_MS=90000, DISPLAY_MS=20*60000, SESSION_GAP_MS=4*3600000;
  const numeric=(v,limit=100000000)=>Math.max(0,Math.min(limit,Number(v)||0));
  const levels=[0,10,50,150,400,1000,2500,6000];
  const level=x=>{const xp=numeric(x);let n=0;for(let i=1;i<levels.length;i++)if(xp>=levels[i])n=i;return n};
  const norm=v=>String(v||'').trim().replace(/^@/,'').toLowerCase();
  const keyFor=e=>{
    const platform=norm(e.platform||'tiktok');
    const user=norm(e.user||e.username||e.nickname);
    return user?platform+':'+user:'';
  };
  function createTracker(){
    let users=new Map(),seenEvents=new Map(),lastEventAt=0,roomId='';
    function reset(){users.clear();seenEvents.clear();lastEventAt=0;roomId=''}
    function accrue(u,now){
      if(!u)return;
      const stop=Math.min(now,u.lastSeen+PRESENCE_MS);
      if(stop>u.accountedAt){u.timeMs+=stop-u.accountedAt;u.accountedAt=stop}
    }
    function tick(now=Date.now()){
      for(const u of users.values())accrue(u,now);
      for(const [id,at] of seenEvents)if(now-at>360000)seenEvents.delete(id);
    }
    function observe(e,now=Date.now()){
      if(!e||!['chat','gift','join','leave'].includes(e.type))return null;
      if(lastEventAt&&now-lastEventAt>SESSION_GAP_MS)reset();
      const key=keyFor(e);if(!key)return null;
      tick(now);
      const eventId=String(e.eventId||e.messageId||'').trim();
      const uniqueId=eventId?e.type+':'+norm(e.platform)+':'+eventId:'';
      if(uniqueId&&seenEvents.has(uniqueId))return users.get(key)||null;
      if(uniqueId)seenEvents.set(uniqueId,now);
      let u=users.get(key);
      if(!u){u={key,name:String(e.nickname||e.user||e.username).slice(0,40),platform:norm(e.platform||'tiktok'),comments:0,gifts:0,giftValue:0,timeMs:0,xp:0,lastSeen:now,accountedAt:now,lastText:'',lastCommentAt:0};users.set(key,u)}
      if(e.nickname)u.name=String(e.nickname).slice(0,40);
      if(e.type==='leave'){accrue(u,now);u.lastSeen=now-DISPLAY_MS-1;u.accountedAt=now;return u}
      u.lastSeen=now;u.accountedAt=now;lastEventAt=now;
      if(e.type==='chat'){
        const msg=String(e.text||'').trim().slice(0,1000);
        // Keep showing every real message in the chat; prevent copied/spam text from farming XP.
        if(msg&&(u.lastText!==msg.toLowerCase()||now-u.lastCommentAt>=8000)){
          u.comments++;u.xp+=5;u.lastText=msg.toLowerCase();u.lastCommentAt=now;
        }
      }
      if(e.type==='gift'){
        const value=numeric(e.coins??e.totalDiamonds??e.amount,1000000);
        const count=Math.max(1,Math.min(10000,Number(e.count)||1));
        const coins=e.totalValue===true?value:value*count;
        u.gifts+=count;u.giftValue+=coins;
        u.xp+=Math.max(10,Math.min(400,Math.round(10+3*Math.sqrt(coins))));
      }
      if(users.size>MAX_TRACKED){
        // Retain the most active participants even when TikTok emits thousands of joins.
        const oldest=[...users.values()].sort((a,b)=>(a.comments*5+a.timeMs/60000*2)-(b.comments*5+b.timeMs/60000*2)||a.lastSeen-b.lastSeen).slice(0,users.size-MAX_TRACKED);
        for(const r of oldest)users.delete(r.key);
      }
      return u;
    }
    function top(now=Date.now()){
      tick(now);
      return [...users.values()].filter(u=>now-u.lastSeen<=DISPLAY_MS)
        .map(u=>({...u,activeMinutes:u.timeMs/60000,activityScore:u.comments*5+u.timeMs/60000*2,xpTotal:u.xp+Math.floor(u.timeMs/60000)*2,level:level(u.xp+Math.floor(u.timeMs/60000)*2)}))
        .sort((a,b)=>b.activityScore-a.activityScore||b.comments-a.comments||b.timeMs-a.timeMs||b.lastSeen-a.lastSeen)
        .slice(0,MAX_VISIBLE);
    }
    function setRoom(id){
      const next=String(id||'').trim();if(!next)return;
      if(roomId&&roomId!==next)reset();
      roomId=next;
    }
    function exportState(){return {version:1,savedAt:Date.now(),lastEventAt,roomId,users:[...users.values()]}}
    function restore(data,now=Date.now()){
      if(!data||data.version!==1||now-numeric(data.lastEventAt)>SESSION_GAP_MS||!Array.isArray(data.users))return false;
      reset();
      roomId=String(data.roomId||'').slice(0,100);lastEventAt=numeric(data.lastEventAt);
      for(const u of data.users.slice(-MAX_TRACKED)){
        if(typeof u.key!=='string'||!u.key.includes(':'))continue;
        const item={key:u.key.slice(0,140),name:String(u.name||'Usuario').slice(0,40),platform:norm(u.platform),comments:numeric(u.comments),gifts:numeric(u.gifts),giftValue:numeric(u.giftValue),timeMs:numeric(u.timeMs,SESSION_GAP_MS),xp:numeric(u.xp),lastSeen:numeric(u.lastSeen),accountedAt:numeric(u.accountedAt)||numeric(u.lastSeen),lastText:String(u.lastText||'').slice(0,1000),lastCommentAt:numeric(u.lastCommentAt)};
        if(item.lastSeen<=now&&now-item.lastSeen<=DISPLAY_MS)users.set(item.key,item);
      }
      return true;
    }
    return {observe,top,tick,reset,setRoom,exportState,restore,keyFor,level,MAX_VISIBLE};
  }
  return {createTracker,keyFor,level,MAX_VISIBLE};
});
