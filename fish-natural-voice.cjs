'use strict';

// Clean spoken chat before sending it to Fish Audio; the displayed chat is unchanged.
function cleanSpokenChatText(value){
 let text=String(value||'');
 const emoji=/\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/u;
 if(typeof Intl.Segmenter==='function'){
  text=Array.from(new Intl.Segmenter('es',{granularity:'grapheme'}).segment(text),p=>emoji.test(p.segment)?' ':p.segment).join('');
 }else{
  text=text.replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\u{1F3FB}-\u{1F3FF}\uFE0F\u200D]/gu,' ').replace(/[0-9#*]\u20E3/gu,' ');
 }
 // No long synthetic laughs. Say just "jaja" once, preserving other words.
 text=text.replace(/(?<![\p{L}\p{N}_@#])(?:(?:j[aá]|h[aá]|je|ji|he|hi|xd)[\s,!?;.:]*){2,}(?![\p{L}\p{N}_])/giu,'jaja');
 return text.replace(/\s+([,.!?;:])/g,'$1').replace(/\s+/g,' ').trim();
}
function normalizeFishNaturalOptions(input){
 const options=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
 return {model:options.model==='pro'?'pro':'free'};
}
function prepareFishNaturalRequest(originalText,options){
 const choice=normalizeFishNaturalOptions(options);
 return {text:cleanSpokenChatText(originalText),params:{},model:choice.model};
}
module.exports={cleanSpokenChatText,normalizeFishNaturalOptions,prepareFishNaturalRequest};
