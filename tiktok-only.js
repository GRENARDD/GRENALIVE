(()=>{
  document.documentElement.classList.add('tiktok-only');
  const hide=e=>{if(e)e.style.setProperty('display','none','important')};
  const by=id=>document.getElementById(id);
  const hideClosest=(id,sel)=>{const e=by(id);if(e)hide(e.closest(sel)||e)};
  // Chat + voz: conservar nodos para compatibilidad, pero mostrar únicamente TikTok.
  ['connectTwitch','connectKick'].forEach(id=>hideClosest(id,'.connection-box'));
  ['twitchVoiceEnabled','kickVoiceEnabled'].forEach(id=>hideClosest(id,'.voice-box'));
  ['twitchStatus','kickStatus','autoTwitch','autoKick'].forEach(id=>hide(by(id)));
  const dis=by('disconnect'); if(dis) dis.textContent='DESCONECTAR TIKTOK';
  // Widgets: contador y redes exclusivamente TikTok.
  ['twLink','kiLink'].forEach(id=>hideClosest(id,'.row'));
  ['sgTwitch','sgKick'].forEach(id=>hideClosest(id,'.setting'));
  // Radar: solo selector TikTok.
  ['pTwitch','pKick'].forEach(id=>hideClosest(id,'.pcheck'));
  document.querySelectorAll('.pulse-card').forEach(card=>{const t=(card.textContent||'').toLowerCase();if(t.includes('twitch')||t.includes('kick'))hide(card)});
  // Alertas: ocultar tarjetas explícitamente de otras plataformas y sus filas de estado.
  document.querySelectorAll('[data-platform="Twitch"],[data-platform="Kick"],[data-onboard="twitch"],[data-onboard="kick"],[data-alert-event="sub"],[data-alert-event="cheer"],[data-alert-event="raid"]').forEach(hide);
  document.querySelectorAll('.platform-row').forEach(row=>{const t=(row.textContent||'').toLowerCase();if(t.includes('twitch')||t.includes('kick'))hide(row)});
  // Catálogo: solo controles/estadísticas de TikTok.
  document.querySelectorAll('[data-platform="Twitch"],[data-platform="Kick"]').forEach(hide);
  ['statTwitch','statKick'].forEach(id=>hideClosest(id,'article'));
  // Preview / contador: ocultar tarjetas no TikTok si alguna quedó en el DOM.
  document.querySelectorAll('.viewer-card.tw,.viewer-card.ki,.card.tw,.card.ki').forEach(hide);
  // Limpia textos visibles heredados sin cambiar IDs internos.
  document.querySelectorAll('small,p,.sub,footer span').forEach(el=>{
    const txt=(el.textContent||'').trim();
    if(!txt)return;
    if(/TikTok\s*\+\s*Twitch\s*\+\s*Kick/i.test(txt)) el.textContent=txt.replace(/TikTok\s*\+\s*Twitch\s*\+\s*Kick/gi,'TikTok');
    if(/TikTok,\s*Twitch\s*y\s*Kick/i.test(txt)) el.textContent=txt.replace(/TikTok,\s*Twitch\s*y\s*Kick/gi,'TikTok');
  });
})();
