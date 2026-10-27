'use strict';

// Fish Audio S2.1 natural delivery: only operates on the TTS copy of a comment.
// Never rewrite the original chat message or infer the user's language.
const STYLES = new Set(['off','studio','natural','expressive','calm']);
const clamp = (value,min,max,fallback) => {
  const n=Number(value);
  return Number.isFinite(n) ? Math.min(max,Math.max(min,n)) : fallback;
};

function normalizeFishNaturalOptions(input){
  const value=input && typeof input==='object'&&!Array.isArray(input)?input:{};
  const style=STYLES.has(value.style)?value.style:'off'; // old clients retain their original TTS
  return {
    style,
    // The paid S2.1-Pro option is explicit to avoid charging users unexpectedly.
    model:value.model==='pro'?'pro':'free',
    expressiveness:clamp(value.expressiveness,0,100,75),
    speed:clamp(value.speed,0.5,2,1),
    naturalPauses:value.naturalPauses===true,
    automaticEmotion:value.automaticEmotion===true
  };
}

function prepareFishNaturalRequest(originalText,options){
  const opts=normalizeFishNaturalOptions(options);
  const original=String(originalText||'').trim();
  if(opts.style==='off'){
    return {text:original,params:{},enabled:false,model:opts.model};
  }
  if(opts.style==='studio'){
    // Match Fish Audio's published inference defaults. Do not inject emotion tags,
    // force custom sampling, disable text normalization, or retime the waveform.
    // Only neutralize viewer-supplied [instruction] tags; normal chat is unchanged.
    const safeText=original.replace(/\[([^\]\r\n]{1,80})\]/g,'($1)');
    return {
      text:safeText,
      model:opts.model,
      enabled:true,
      params:{
        temperature:0.7,
        top_p:0.7,
        normalize:true,
        latency:'normal',
        prosody:{speed:1},
        sample_rate:44100,
        mp3_bitrate:192,
        condition_on_previous_chunks:true
      }
    };
  }
  // Treat chat text as plain speech, not executable inline Fish control tags.
  // We add ONLY our own curated tags; the viewer cannot set a speaking instruction.
  let content=original
    .replace(/\[([^\]\r\n]{1,80})\]/g,'($1)')
    .replace(/\s+([,.!?;:])/g,'$1')
    .replace(/([!?])\1{2,}/g,'$1')
    .replace(/\s+/g,' ')
    .trim();
  if(opts.naturalPauses && content && !/[.!?…:;]$/.test(content)){
    content+='.';
  }
  // Short chat messages are deliberately kept neutral. Aggressive emoting every
  // second is unnatural in a live stream and increases synthetic-speech latency.
  const excited=/(!{1,}|\b(?:wow|increíble|increible|brutal|ganamos|let's go|lets go|felicidades|awesome|amazing)\b)/iu.test(content);
  const sad=/\b(?:triste|lo siento|perdón|perdon|sad|sorry|rip)\b/iu.test(content);
  let tag='';
  if(opts.style==='calm'){
    tag='[calm] ';
  }else if(opts.automaticEmotion && content.length>=16 && opts.expressiveness>=40){
    if(excited && opts.style==='expressive')tag='[excited] ';
    else if(sad && opts.expressiveness>=65)tag='[sad] ';
    else if(excited && opts.expressiveness>=75 && /!/.test(content))tag='[excited] ';
  }
  // Sampling: deliberately narrow and bounded, to avoid unstable voices.
  const temp=Math.round((0.58+opts.expressiveness*0.0026)*100)/100;
  const topP=opts.style==='expressive'?0.8:0.7;
  return {
    text:(tag+content).slice(0,650),
    enabled:true,
    model:opts.model,
    params:{
      temperature:temp,
      top_p:topP,
      prosody:{speed:opts.speed},
      normalize:true
    }
  };
}

module.exports={normalizeFishNaturalOptions,prepareFishNaturalRequest};
