/* GREÑA AFTERGLOW · original synthesized cue engine.
   Six distinct sonic signatures; no third-party sound files or external dependencies. */
(function(global){
  'use strict';
  let context=null;
  const soundIds=['follow','gift','sub','raid','share','likes'];
  function getContext(){
    if(!context){const A=global.AudioContext||global.webkitAudioContext;if(!A)return null;context=new A()}
    if(context.state==='suspended')context.resume().catch(()=>{});
    return context;
  }
  function tone(ctx,freq,start,length,vol,shape='sine',endFreq=freq,pan=0){
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    const stereo=ctx.createStereoPanner?ctx.createStereoPanner():null;
    osc.type=shape;osc.frequency.setValueAtTime(Math.max(35,freq),start);
    if(endFreq!==freq)osc.frequency.exponentialRampToValueAtTime(Math.max(35,endFreq),start+Math.max(.015,length*.75));
    gain.gain.setValueAtTime(.0001,start);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,vol),start+.015);
    gain.gain.setTargetAtTime(.0001,start+Math.max(.03,length*.33),Math.max(.025,length*.18));
    if(stereo){stereo.pan.value=pan;osc.connect(gain);gain.connect(stereo);stereo.connect(ctx.destination)}
    else {osc.connect(gain);gain.connect(ctx.destination)}
    osc.start(start);osc.stop(start+length+.12);
  }
  function noise(ctx,start,duration,vol,highpass=200,pan=0){
    const rate=ctx.sampleRate,frames=Math.ceil(rate*Math.min(.7,duration+.05)),buf=ctx.createBuffer(1,frames,rate),data=buf.getChannelData(0);
    for(let i=0;i<frames;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/frames,1.45);
    const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
    src.buffer=buf;f.type='highpass';f.frequency.value=highpass;g.gain.setValueAtTime(Math.max(.0001,vol),start);g.gain.exponentialRampToValueAtTime(.0001,start+duration);
    src.connect(f);f.connect(g);g.connect(ctx.destination);src.start(start);src.stop(start+duration+.025);
  }
  function cue(id,volume=54){
    if(volume<=0)return false;
    const ctx=getContext();if(!ctx||ctx.state==='suspended')return false;
    const t=ctx.currentTime+.012, v=Math.min(.28,Math.max(0,Number(volume)||54)/100*.25);
    const hit=(f,a,l=.28,shape='sine',dest=f,p=0)=>tone(ctx,f,t+a,l,v,shape,dest,p);
    switch(id){
      case 'follow': // soft glass invitation, three rising plucks
        hit(523,0,.22,'sine',650,-.24);hit(659,.11,.25,'sine',840,.1);hit(988,.25,.54,'triangle',1109,.29);
        break;
      case 'gift': // crystalline gift shower with low weight and sparkling high notes
        hit(132,0,.36,'triangle',82);noise(ctx,t,.14,v*.4,650);
        hit(622,.05,.3,'triangle',790,-.4);hit(932,.13,.34,'sine',1150,.38);
        hit(1244,.22,.6,'sine',1480,-.17);hit(1865,.34,.5,'sine',2030,.4);
        break;
      case 'sub': // ceremonial musical signature, upward major arpeggio
        hit(294,0,.55,'triangle',330,-.28);hit(440,.11,.6,'sine',494,.15);
        hit(587,.24,.7,'sine',659,.3);hit(880,.42,.85,'sine',988,-.1);
        break;
      case 'raid': // sub hit / swoop and 3-note tactical arrival
        hit(118,0,.55,'sawtooth',63);noise(ctx,t,.3,v*.67,105);
        hit(220,.19,.32,'triangle',349,-.5);hit(329,.36,.37,'triangle',523,.18);
        hit(523,.49,.66,'sawtooth',622,.45);
        break;
      case 'share': // airy directional signal sweep
        noise(ctx,t,.3,v*.35,1600);hit(570,0,.22,'sine',950,-.6);
        hit(720,.15,.23,'sine',1275,.05);hit(1046,.32,.45,'sine',1320,.56);
        break;
      case 'likes': // happy quick bubble taps
        hit(698,0,.16,'sine',800,-.3);hit(880,.09,.15,'sine',980,.3);
        hit(1046,.21,.35,'sine',1195,0);break;
      default: return false;
    }
    return true;
  }
  const alias={like:'likes',tap:'likes',cheer:'gift',bits:'gift',giftsub:'gift',subrenew:'sub',membergift:'gift',superchat:'gift',donation:'gift',shower:'gift',milestone:'sub',record:'sub'};
  function play(type,opts={}){
    if(opts.enabled===false)return false;
    const id=alias[String(type||'').toLowerCase()]||String(type||'').toLowerCase();
    try{return cue(id,opts.volume??54)}catch(e){console.debug('[AFTERGLOW AUDIO]',e);return false}
  }
  global.AfterglowAudio={play,unlock:getContext,events:soundIds};
})(window);
