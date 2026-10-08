// GREÑA YouTube Live adapter — YouTube Data API v3.
// Requires GRENA_YOUTUBE_API_KEY server-side; never expose it in browser code.
const API='https://www.googleapis.com/youtube/v3';
export function youtubeVideoId(input){
  const value=String(input||'').trim();
  if(/^[a-zA-Z0-9_-]{11}$/.test(value))return value;
  try {
    const u=new URL(value);
    if(!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(u.hostname.toLowerCase()))return '';
    const id=u.hostname.endsWith('youtu.be')?u.pathname.split('/')[1]:u.searchParams.get('v')||(/\/(?:live|shorts|embed)\/([\w-]{11})/.exec(u.pathname)||[])[1];
    return /^[\w-]{11}$/.test(id||'')?id:'';
  }catch{return ''}
}
export function normalizeYouTubeMessage(item){
  const s=item?.snippet||{},a=item?.authorDetails||{},type=s.type||'';
  const user=a.displayName||'Usuario',userId=a.channelId||'';
  const base={platform:'youtube',id:String(item?.id||''),type,user,username:user,nickname:user,userId,avatar:a.profileImageUrl||'',isModerator:!!a.isChatModerator,isOwner:!!a.isChatOwner,isMember:!!a.isChatSponsor,createdAt:s.publishedAt||'',message:s.displayMessage||''};
  if(type==='textMessageEvent')return {...base,kind:'chat',message:s.textMessageDetails?.messageText||base.message};
  if(type==='superChatEvent'){const d=s.superChatDetails||{};return {...base,kind:'superchat',event:'gift',amount:Number(d.amountMicros||0)/1e6,currency:d.currency||'',displayAmount:d.amountDisplayString||'',tier:d.tier||0,message:d.userComment||base.message}}
  if(type==='superStickerEvent'){const d=s.superStickerDetails||{};return {...base,kind:'supersticker',event:'gift',amount:Number(d.amountMicros||0)/1e6,currency:d.currency||'',displayAmount:d.amountDisplayString||'',stickerId:d.superStickerMetadata?.stickerId||'',giftName:d.superStickerMetadata?.altText||'Super Sticker'}}
  if(type==='newSponsorEvent')return {...base,kind:'membership',event:'sub',membershipLevel:s.newSponsorDetails?.memberLevelName||'',isUpgrade:!!s.newSponsorDetails?.isUpgrade};
  if(type==='memberMilestoneChatEvent')return {...base,kind:'membermilestone',event:'sub',months:s.memberMilestoneChatDetails?.memberMonth||0,message:s.memberMilestoneChatDetails?.userComment||base.message};
  if(type==='membershipGiftingEvent')return {...base,kind:'membershipgift',event:'gift',count:Number(s.membershipGiftingDetails?.giftMembershipsCount||0)};
  if(type==='giftMembershipReceivedEvent')return {...base,kind:'membershipreceived',event:'sub'};
  if(type==='giftEvent')return {...base,kind:'jewelgift',event:'gift',giftName:s.giftDetails?.giftName||'Regalo',giftDetails:s.giftDetails||{}};
  return null;
}
export class YouTubeLiveReader {
  constructor({apiKey=process.env.GRENA_YOUTUBE_API_KEY,onMessage=()=>{},onStatus=()=>{},onViewers=()=>{}}={}){
    this.apiKey=String(apiKey||'').trim();this.onMessage=onMessage;this.onStatus=onStatus;this.onViewers=onViewers;
    this.running=false;this.timer=null;this.nextPageToken='';this.seen=new Set();this.chatId='';this.videoId='';this.backoff=0;this.pollCount=0;
  }
  async request(resource,params){
    const u=new URL(API+'/'+resource);for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));
    u.searchParams.set('key',this.apiKey);
    const ac=new AbortController(),t=setTimeout(()=>ac.abort(),12000);
    try{const r=await fetch(u,{signal:ac.signal});const data=await r.json();if(!r.ok)throw new Error('YouTube API '+r.status+': '+(data?.error?.message||'No disponible'));return data}finally{clearTimeout(t)}
  }
  async start(input){
    await this.stop();
    if(!this.apiKey)throw new Error('Falta GRENA_YOUTUBE_API_KEY en Railway.');
    const id=youtubeVideoId(input);if(!id)throw new Error('Introduce el enlace público de YouTube (Compartir → Copiar enlace), no el enlace de Studio.');
    this.videoId=id;this.running=true;this.nextPageToken='';this.seen.clear();this.backoff=0;
    try {await this.discoverChat();} catch(e){await this.stop();throw e}
    return {videoId:id,chatId:this.chatId,waiting:!this.chatId};
  }
  async discoverChat(){
    if(!this.running)return;
    try{
      const data=await this.request('videos',{part:'liveStreamingDetails,snippet,status',id:this.videoId});
      const v=data.items?.[0];
      if(!v)throw new Error('No se encuentra este vídeo. Comprueba que es público o no listado y que la URL es correcta.');
      const chat=v.liveStreamingDetails?.activeLiveChatId||'';
      if(chat){
        this.chatId=chat;this.nextPageToken='';this.seen.clear();
        this.onStatus({connected:true,videoId:this.videoId,title:v.snippet?.title||''});
        void this.poll();return;
      }
      this.onStatus({connected:false,waiting:true,videoId:this.videoId,error:'Directo guardado. Esperando que YouTube active el chat LIVE; inicia la emisión desde OBS.'});
      this.timer=setTimeout(()=>this.discoverChat().catch(e=>this.onStatus({connected:false,error:String(e.message||e)})),30000);
    }catch(e){this.onStatus({connected:false,error:String(e.message||e)});throw e}
  }
  async poll(){
    if(!this.running)return;
    let interval=5000;
    try{
      const data=await this.request('liveChat/messages',{liveChatId:this.chatId,part:'id,snippet,authorDetails',maxResults:200,pageToken:this.nextPageToken});
      const initial=!this.nextPageToken;
      this.pollCount=(this.pollCount||0)+1;
      if(this.pollCount<=3||this.pollCount%12===0)console.log('[YouTube CHAT POLL]',JSON.stringify({videoId:this.videoId,chatFound:!!this.chatId,items:(data.items||[]).length,initial,hasNextPage:!!data.nextPageToken,poll:this.pollCount}));
      this.nextPageToken=data.nextPageToken||this.nextPageToken;
      for(const item of data.items||[]){
        if(!item.id||this.seen.has(item.id))continue;this.seen.add(item.id);
        // Do not replay historical chat/paid events on the first fetch.
        if(!initial){const mapped=normalizeYouTubeMessage(item);if(mapped)this.onMessage(mapped)}
      }
      if(this.seen.size>1500)this.seen=new Set([...this.seen].slice(-700));
      interval=Math.max(2000,Number(data.pollingIntervalMillis)||5000);
      this.backoff=0;
      this.onStatus({connected:true,videoId:this.videoId});
    }catch(e){
      this.backoff=Math.min(60000,this.backoff?this.backoff*2:5000);interval=this.backoff;
      console.warn('[YouTube CHAT POLL ERROR]',String(e.message||e).slice(0,250));
      this.onStatus({connected:false,error:String(e.message||e),retryMs:interval});
    }
    if(this.running)this.timer=setTimeout(()=>this.poll().catch(()=>{}),interval);
  }
  async refreshViewers(){
    if(!this.running)return;
    try{const d=await this.request('videos',{part:'liveStreamingDetails',id:this.videoId});const n=d.items?.[0]?.liveStreamingDetails?.concurrentViewers;this.onViewers(n===undefined?null:Number(n))}catch{}
  }
  async stop(){
    this.running=false;if(this.timer)clearTimeout(this.timer);this.timer=null;
    this.nextPageToken='';this.seen.clear();this.videoId='';this.chatId='';
  }
}
