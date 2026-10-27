'use strict';

// Pass the original chat text directly to Fish Audio, without artificial
// excitement, pauses, prosody, speed changes, filters or altered sampling.
// The only choice is the official Fish Audio engine (FREE by default, or PRO).
function normalizeFishNaturalOptions(input){
  const options=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  return {model:options.model==='pro'?'pro':'free'};
}
function prepareFishNaturalRequest(originalText,options){
  const choice=normalizeFishNaturalOptions(options);
  return {text:String(originalText||'').trim(),params:{},model:choice.model};
}
module.exports={normalizeFishNaturalOptions,prepareFishNaturalRequest};
