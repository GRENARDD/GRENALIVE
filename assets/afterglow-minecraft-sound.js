/* GREÑA PIXELCRAFT — original 8-bit voxel foley.
   The melodies, "eat", item pickup and block-placement cues are synthesized,
   not borrowed from Minecraft's copyrighted sound assets. API: play(event,{volume}). */
(function(global){
'use strict';
let ac,output,limiter,lastLike=-1,lastCue={};
const aliases={like:'likes',tap:'likes',cheer:'gift',bits:'gift',giftsub:'gift',subrenew:'sub',membergift:'gift',shower:'gift',milestone:'sub',superchat:'gift'};
function init(){
 if(!ac){
   const AC=global.AudioContext||global.webkitAudioContext;if(!AC)return null;
   ac=new AC({latencyHint:'interactive'});
   output=ac.createGain();output.gain.value=.7;
   limiter=ac.createDynamicsCompressor();limiter.threshold.value=-20;limiter.knee.value=14;limiter.ratio.value=5;limiter.attack.value=.002;limiter.release.value=.18;
   output.connect(limiter);limiter.connect(ac.destination);
 }
 if(ac.state==='suspended')ac.resume().catch(()=>{});
 return ac;
}
function bus(level){
 const g=ac.createGain();g.gain.value=Math.min(1,Math.max(0,level))/100*.6;
 g.connect(output);return g;
}
function tone(b,t,f,d,v=.1,opt={}){
 const o=ac.createOscillator(),amp=ac.createGain();o.type=opt.shape||'square';
 o.frequency.setValueAtTime(f,t);
 if(opt.end)o.frequency.exponentialRampToValueAtTime(Math.max(40,opt.end),t+d*.72);
 const end=t+d,attack=Math.min(.007,d*.2);
 amp.gain.setValueAtTime(.00001,t);amp.gain.exponentialRampToValueAtTime(v,t+Math.max(.002,attack));
 amp.gain.setValueAtTime(v*.85,Math.max(t+.008,end-Math.min(.07,d*.4)));
 amp.gain.exponentialRampToValueAtTime(.00001,end);
 o.connect(amp);amp.connect(b);o.start(t);o.stop(end+.01)
}
function noise(b,t,d,v=.085,low=1700,high=120){
 const frames=Math.ceil(ac.sampleRate*d),bf=ac.createBuffer(1,frames,ac.sampleRate),p=bf.getChannelData(0);
 let c=0;for(let i=0;i<frames;i++){if(i%6===0)c=Math.random()*2-1;p[i]=c*Math.pow(1-i/frames,1.4)}
 const src=ac.createBufferSource(),lp=ac.createBiquadFilter(),hp=ac.createBiquadFilter(),g=ac.createGain();
 src.buffer=bf;lp.type='lowpass';lp.frequency.value=low;hp.type='highpass';hp.frequency.value=high;
 g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.00001,t+d);
 src.connect(hp);hp.connect(lp);lp.connect(g);g.connect(b);
 src.start(t);src.stop(t+d+.005)
}
function plop(b,t,f=470){
 tone(b,t,f,.13,.19,{shape:'triangle',end:f*.55});
 tone(b,t+.026,f*1.35,.11,.065,{shape:'square',end:f*.8});
}
function block(b,t){
 noise(b,t,.115,.17,780,85);
 tone(b,t,156,.13,.09,{shape:'triangle',end:91});
 tone(b,t+.038,112,.07,.04,{shape:'square',end:72})
}
function crunch(b,t){
 noise(b,t,.12,.16,3500,320);
 noise(b,t+.045,.1,.12,2150,420);
 tone(b,t,235,.075,.022,{shape:'square',end:170})
}
function xp(b,t){
 [659,880,1046].forEach((f,i)=>{
  tone(b,t+i*.092,f,.18,.098,{shape:'sine',end:f*1.05});
  tone(b,t+i*.092,f*2,.085,.025,{shape:'square',end:f*2.1});
 })
}
const signatures={
 follow(b,t){plop(b,t,450);xp(b,t+.13);},
 gift(b,t){block(b,t);plop(b,t+.15,520);tone(b,t+.31,784,.17,.09,{shape:'triangle'});},
 sub(b,t){xp(b,t);[523,659,784,1046].forEach((f,i)=>tone(b,t+.28+i*.125,f,.2,.095,{shape:'square'}));noise(b,t+.61,.25,.05,2400,900);},
 raid(b,t){block(b,t);tone(b,t+.07,155,.48,.23,{shape:'sawtooth',end:127});tone(b,t+.21,233,.39,.12,{shape:'square',end:184});block(b,t+.5);},
 share(b,t){block(b,t);plop(b,t+.18,390);tone(b,t+.32,587,.22,.045,{shape:'triangle'});},
 likes(b,t){ // original crunchy "eating" motif: quick pixel bites, no actual game samples
   crunch(b,t);crunch(b,t+.155);crunch(b,t+.315);plop(b,t+.46,620);
 }
};
function play(type,options={}){
 const kind=aliases[String(type||'').toLowerCase()]||String(type||'').toLowerCase();
 if(options.enabled===false||!signatures[kind])return false;
 const volume=Number(options.volume??54);
 if(!Number.isFinite(volume)||volume<=0)return false;
 try{
  const ctx=init();if(!ctx||ctx.state==='suspended')return false;
  const now=ctx.currentTime;
  if(kind==='likes'&&now-lastLike<1)return true;
  if(lastCue[kind]!=null&&now-lastCue[kind]<.12)return true;
  if(kind==='likes')lastLike=now;
  lastCue[kind]=now;
  signatures[kind](bus(volume),now+.018);
  return true;
 }catch(e){console.warn('[PIXELCRAFT AUDIO]',e);return false}
}
global.AfterglowMinecraftSound={play,unlock:init,events:Object.keys(signatures),version:'pixel-2'};
})(window);
