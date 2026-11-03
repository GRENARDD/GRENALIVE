/* GREÑA AFTERGLOW 2.1 — Premium sonic identity
   Original procedural signatures. No remote sound library, no samples,
   no downloading and no network dependencies in OBS.
   Soft-limited, mixed and spatialized WebAudio; same play/unlock API. */
(function(global){
  'use strict';
  const EVENTS=['follow','gift','sub','raid','share','likes'];
  const ALIAS={like:'likes',tap:'likes',cheer:'gift',bits:'gift',giftsub:'gift',subrenew:'sub',membergift:'gift',superchat:'gift',donation:'gift',shower:'gift',milestone:'sub',record:'sub'};
  let ctx,master,comp,reverb,delay,delayFeedback,lastLike=0;
  function init(){
    if(!ctx){
      const Audio=global.AudioContext||global.webkitAudioContext;
      if(!Audio)return null;
      ctx=new Audio({latencyHint:'interactive'});
      master=ctx.createGain();master.gain.value=.78;
      comp=ctx.createDynamicsCompressor();comp.threshold.value=-17;comp.knee.value=22;comp.ratio.value=3.2;comp.attack.value=.005;comp.release.value=.22;
      master.connect(comp);comp.connect(ctx.destination);
      // Short, filtered ambient reflections, quiet enough to keep speech intelligible.
      reverb=ctx.createGain();reverb.gain.value=.085;
      delay=ctx.createDelay(1);delay.delayTime.value=.148;
      const dark=ctx.createBiquadFilter();dark.type='lowpass';dark.frequency.value=2600;dark.Q.value=.5;
      delayFeedback=ctx.createGain();delayFeedback.gain.value=.16;
      reverb.connect(delay);delay.connect(dark);dark.connect(master);
      dark.connect(delayFeedback);delayFeedback.connect(delay);
    }
    if(ctx.state==='suspended')ctx.resume().catch(()=>{});
    return ctx;
  }
  function bus(time,volume){
    const g=ctx.createGain();
    const level=Math.max(0,Math.min(100,Number(volume)||0))/100;
    g.gain.setValueAtTime(Math.max(.00001,level*.55),time);
    g.connect(master);g.connect(reverb);
    return g;
  }
  function note(out,start,freq,duration,{gain=.12,end=freq,wave='sine',pan=0,attack=.012,release=.22,detune=0,filter=0}={}){
    const osc=ctx.createOscillator(),amp=ctx.createGain();
    osc.type=wave;osc.detune.value=detune;
    osc.frequency.setValueAtTime(Math.max(32,freq),start);
    if(end!==freq)osc.frequency.exponentialRampToValueAtTime(Math.max(32,end),start+Math.max(.02,duration*.81));
    const stop=start+duration;
    const a=Math.min(attack,duration*.35),r=Math.min(release,duration*.65);
    amp.gain.setValueAtTime(.00001,start);
    amp.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),start+Math.max(.004,a));
    amp.gain.setValueAtTime(Math.max(.0002,gain*.70),Math.max(start+a+.001,stop-r));
    amp.gain.exponentialRampToValueAtTime(.00001,stop);
    let tail=osc;
    if(filter){
      const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.setValueAtTime(filter,start);
      osc.connect(low);tail=low;
    }
    tail.connect(amp);
    if(ctx.createStereoPanner){
      const stereo=ctx.createStereoPanner();stereo.pan.value=pan;amp.connect(stereo);stereo.connect(out);
    }else amp.connect(out);
    osc.start(start);osc.stop(stop+.025);
  }
  function shimmer(out,t,f,d=.45,g=.115,pan=0){
    note(out,t,f,d,{wave:'sine',gain:g,pan,release:d*.8,attack:.006});
    note(out,t,f*2.005,d*.52,{wave:'sine',gain:g*.19,pan:-pan,release:d*.4});
    note(out,t,f*3.01,d*.24,{wave:'triangle',gain:g*.062,pan,attack:.003});
  }
  function puff(out,t,d=.18,g=.035,brightness=1400,pan=0){
    const rate=ctx.sampleRate,len=Math.ceil(rate*d),buffer=ctx.createBuffer(1,len,rate),wave=buffer.getChannelData(0);
    for(let i=0;i<len;i++){
      const fade=Math.pow(1-i/len,1.8);
      wave[i]=(Math.random()*2-1)*fade;
    }
    const src=ctx.createBufferSource(),hi=ctx.createBiquadFilter(),lo=ctx.createBiquadFilter(),en=ctx.createGain();
    src.buffer=buffer;hi.type='highpass';hi.frequency.value=Math.max(80,brightness*.42);
    lo.type='lowpass';lo.frequency.value=Math.min(9000,brightness*3.1);
    en.gain.setValueAtTime(Math.max(.0001,g),t);en.gain.exponentialRampToValueAtTime(.00001,t+d);
    src.connect(hi);hi.connect(lo);lo.connect(en);
    if(ctx.createStereoPanner){let p=ctx.createStereoPanner();p.pan.value=pan;en.connect(p);p.connect(out)}else en.connect(out);
    src.start(t);src.stop(t+d+.02);
  }
  const signatures={
    // FOLLOW — floating glass harmonics and a small rising "welcome" motif.
    follow(b,t){
      shimmer(b,t,587.33,.36,.16,-.36);
      shimmer(b,t+.105,739.99,.44,.15,.3);
      shimmer(b,t+.24,987.77,.72,.19,0);
      note(b,t+.02,293.66,.56,{wave:'sine',gain:.055,release:.43});
    },
    // GIFT — tactile impact, stardust scattering and warm major shimmer.
    gift(b,t){
      note(b,t,138.59,.3,{wave:'sine',gain:.22,end:73.42,attack:.005,release:.2});
      puff(b,t,.16,.082,1700);
      [0,.08,.16,.24,.32].forEach((x,i)=>shimmer(b,t+.12+x,[880,1174.66,1567.98,1760,2093][i],.46,.095,i%2?-.5:.5));
      shimmer(b,t+.54,1318.51,.78,.14,.15);
    },
    // SUB — a confident, elegant cinematic major-7 chord / ascending signet.
    sub(b,t){
      note(b,t,146.83,1.02,{wave:'sine',gain:.10,release:.76});
      [[293.66,0,-.45],[369.99,.12,.3],[440,.26,-.15],[554.37,.42,.4],[739.99,.58,0]].forEach(([f,off,pan])=>shimmer(b,t+off,f,.82,.125,pan));
      puff(b,t+.38,.14,.025,3200);
    },
    // RAID — broad, restrained low impact with a cinematic directional rise.
    raid(b,t){
      note(b,t,164.81,.47,{wave:'sine',gain:.32,end:55,attack:.005,release:.35});
      puff(b,t,.4,.085,430,-.4);
      note(b,t+.11,220,.39,{wave:'triangle',gain:.095,end:330,pan:-.4,release:.27});
      note(b,t+.28,329.63,.5,{wave:'triangle',gain:.10,end:493.88,pan:.38});
      shimmer(b,t+.51,659.25,.64,.14,.1);
      shimmer(b,t+.7,987.77,.68,.11,-.12);
    },
    // SHARE — a clean light sweep that leaves the spoken stream unobstructed.
    share(b,t){
      puff(b,t,.27,.045,4300,-.55);
      note(b,t,523.25,.26,{wave:'sine',gain:.10,end:783.99,pan:-.6,attack:.008});
      note(b,t+.15,659.25,.32,{wave:'sine',gain:.12,end:1046.5,pan:.1});
      shimmer(b,t+.29,1174.66,.49,.14,.53);
    },
    // LIKES — quiet liquid droplets, short enough for frequent interactions.
    likes(b,t){
      shimmer(b,t,783.99,.18,.096,-.4);
      shimmer(b,t+.095,987.77,.2,.091,.34);
      shimmer(b,t+.19,1174.66,.28,.095,0);
    }
  };
  function cue(type,volume=54){
    const v=Math.min(100,Math.max(0,Number(volume)||0));
    if(!v)return false;
    const audio=init();
    if(!audio||audio.state==='suspended')return false;
    // Guard against dense likes spamming the same sound every few milliseconds.
    if(type==='likes'&&audio.currentTime-lastLike<.44)return true;
    if(type==='likes')lastLike=audio.currentTime;
    if(!signatures[type])return false;
    const start=audio.currentTime+.025;
    signatures[type](bus(start,v),start);
    return true;
  }
  function play(type,opts={}){
    if(opts.enabled===false)return false;
    const id=ALIAS[String(type||'').toLowerCase()]||String(type||'').toLowerCase();
    try{return cue(id,opts.volume??54)}catch(e){console.warn('[AFTERGLOW SONIC]',e);return false}
  }
  global.AfterglowAudio={play,unlock:init,events:EVENTS,version:'2.1-sonic'};
})(window);
