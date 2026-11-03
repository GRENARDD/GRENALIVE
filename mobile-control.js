/* GREÑA LIVE Mobile · editor real de AFTERGLOW sobre los endpoints existentes.
 * No crea configuraciones paralelas: el mismo backend usado por la PC guarda cada cambio.
 */
(() => {
  'use strict';
  const el = id => document.getElementById(id);
  const keys = ['follow','gift','sub','raid','share','likes'];
  const soundNames = {follow:'Seguidores',gift:'Regalos',sub:'Suscripciones',raid:'Raids',share:'Compartidos',likes:'Tap Tap'};
  let settings = null, dirty = false, saving = false;

  function note(id, message, kind) {
    const target = el(id);
    if (!target) return;
    target.textContent = message;
    target.classList.remove('error','success');
    if (kind) target.classList.add(kind);
  }
  async function api(url, options = {}) {
    const response = await fetch(url, {credentials:'same-origin',cache:'no-store',...options});
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw Error(data.error || 'El servicio GREÑA no respondió.');
    return data;
  }
  function value(id, fallback) {
    const field = el(id);
    return field ? field.value : fallback;
  }
  function checked(id, fallback = true) {
    const field = el(id);
    return field ? field.checked : fallback;
  }
  function setValue(id, v) { if (el(id) && v !== undefined && v !== null) el(id).value = String(v); }
  function setChecked(id, v) { if (el(id)) el(id).checked = !!v; }
  function collect() {
    const current = settings || {};
    const sounds = {...(current.sounds || {})};
    keys.forEach(k => { sounds[k] = checked('mobSound-' + k); });
    return {
      ...current,
      theme:value('mobTheme','minecraft'),
      mascotCharacter:value('mobMascot','zp'),
      intensity:Number(value('mobIntensity','65')),
      volume:Number(value('mobVolume','54')),
      soundEnabled:checked('mobSoundOn'),
      audioRoute:value('mobAudioRoute','both'),
      sounds,
      fontFamily:value('mobFont','Inter'),
      textColor:value('mobTextColor','#ffffff'),
      accentMode:value('mobAccentMode','platform'),
      accent:value('mobAccent','#caff5f')
    };
  }
  function paintPreview() {
    const theme = value('mobTheme','minecraft');
    const names = {
      minecraft:'Minecraft Pixelcraft',domino:'Dominó',ascension:'Ascensión Premium',
      grena_catalog:'Catálogo Premium',grena_fullscreen:'Pantalla completa',
      grena_mascots:'Personajes Pixel',grena_grenito:'GREÑITO',
      celestial:'Celestial',sakura:'Sakura',comic:'Cómic',hologram:'Holográfico',
      inferno:'Inferno',arcade:'Arcade',royal:'Royal',void:'Void'
    };
    const title = el('mobPreviewTitle');
    if (title) title.textContent = names[theme] || 'GREÑA';
    const card = el('mobPreviewCard');
    if (card) {
      const color = value('mobAccent','#caff5f');
      card.style.borderColor = value('mobAccentMode','platform') === 'custom' ? color : '#9d80e9';
    }
    if (el('mobIntensityOut')) el('mobIntensityOut').textContent = value('mobIntensity','65') + '%';
    if (el('mobVolumeOut')) el('mobVolumeOut').textContent = value('mobVolume','54') + '%';
    if (el('mobMascotField')) el('mobMascotField').hidden = theme !== 'grena_mascots';
    if (el('mobAccentField')) el('mobAccentField').hidden = value('mobAccentMode','platform') !== 'custom';
  }
  function fill(current) {
    if (!current || typeof current !== 'object') throw Error('No hay ajustes de alertas disponibles.');
    settings = current;
    setValue('mobTheme',current.theme || 'minecraft');
    setValue('mobMascot',current.mascotCharacter || 'zp');
    setValue('mobIntensity',current.intensity ?? 65);
    setValue('mobVolume',current.volume ?? 54);
    setChecked('mobSoundOn',current.soundEnabled !== false);
    setValue('mobAudioRoute',current.audioRoute || 'both');
    setValue('mobFont',current.fontFamily || 'Inter');
    setValue('mobTextColor',current.textColor || '#ffffff');
    setValue('mobAccentMode',current.accentMode || 'platform');
    setValue('mobAccent',current.accent || '#caff5f');
    keys.forEach(k => setChecked('mobSound-' + k,current.sounds?.[k] !== false));
    dirty = false;
    paintPreview();
  }
  async function load() {
    if (dirty || saving) return;
    note('mobAlertInfo','Leyendo la configuración compartida de GREÑA…');
    try {
      const response = await api('/api/afterglow-settings');
      fill(response.settings);
      note('mobAlertInfo','Configuración cargada. Los cambios solo se aplican al guardar.');
    } catch (e) {
      note('mobAlertInfo','No se pudo cargar: ' + e.message,'error');
    }
  }
  async function save() {
    if (!settings || saving) return note('mobAlertInfo','Primero conecta GREÑA para cargar tus ajustes.','error');
    saving = true;
    const button = el('mobSaveAlert');
    if (button) button.disabled = true;
    note('mobAlertInfo','Guardando en GREÑA…');
    const proposed = collect();
    try {
      const response = await api('/api/afterglow-settings',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(proposed)
      });
      fill(response.settings || proposed);
      note('mobAlertInfo','✓ Guardado en GREÑA. Las escenas conectadas reciben el cambio.','success');
    } catch (e) {
      note('mobAlertInfo','No se guardó: ' + e.message,'error');
    } finally {
      saving = false;
      if (button) button.disabled = false;
    }
  }
  async function testAlert() {
    const button = el('mobTestAlert');
    if (button) button.disabled = true;
    try {
      const platform = value('mobTestPlatform','TikTok');
      const event = value('mobTestEvent','follow');
      const action = {follow:'te siguió',gift:'envió un regalo',sub:'se suscribió',raid:'envió una raid',share:'compartió el LIVE',like:'envió 100 Tap Taps'}[event] || 'te apoyó';
      await api('/api/alert',{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({platform,event,name:'USUARIO_PRUEBA',action,count:5,giftName:'Rosa'})
      });
      note('mobAlertInfo','Prueba enviada al motor. Revisa tu overlay en la transmisión.','success');
    } catch(e) {
      note('mobAlertInfo','No se pudo enviar la prueba: ' + e.message,'error');
    } finally { if (button) button.disabled = false; }
  }
  async function loadAutoConnect() {
    try {
      const data = await api('/api/auto-connect');
      setChecked('mobAutoConnect',data.prefs?.enabled !== false);
      note('mobChannelInfo','Los canales se gestionan con el mismo motor de GREÑA.');
    } catch(e) {
      note('mobChannelInfo','No se pudo consultar la reconexión automática: ' + e.message,'error');
    }
  }
  async function changeAutoConnect() {
    const field = el('mobAutoConnect');
    if (!field) return;
    field.disabled = true;
    const requested = field.checked;
    try {
      await api('/api/auto-connect',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({enabled:requested})
      });
      note('mobChannelInfo',requested?'Reconexión automática activada.':'Reconexión automática desactivada.','success');
    } catch(e) {
      field.checked = !requested;
      note('mobChannelInfo','No se guardó: ' + e.message,'error');
    } finally { field.disabled = false; }
  }

  // Evitar que el teléfono sobrescriba un cambio aún sin guardar al regresar de otra pestaña.
  const inputs = ['mobTheme','mobMascot','mobIntensity','mobVolume','mobSoundOn','mobAudioRoute','mobFont','mobTextColor','mobAccentMode','mobAccent',...keys.map(k => 'mobSound-' + k)];
  inputs.forEach(id => {
    const input = el(id);
    if (!input) return;
    const handler = () => { dirty = true; paintPreview();note('mobAlertInfo','Cambios pendientes. Pulsa «Guardar alertas».'); };
    input.addEventListener('input',handler);
    input.addEventListener('change',handler);
  });
  el('mobSaveAlert')?.addEventListener('click',save);
  el('mobReloadAlert')?.addEventListener('click',() => {
    if (dirty && !confirm('¿Descartar cambios sin guardar y cargar la versión de GREÑA?')) return;
    dirty = false;load();
  });
  el('mobTestAlert')?.addEventListener('click',testAlert);
  el('mobAutoConnect')?.addEventListener('change',changeAutoConnect);
  el('mobRefreshChannels')?.addEventListener('click',() => {
    if (typeof window.grenaMobileRefresh === 'function') window.grenaMobileRefresh();
    loadAutoConnect();
  });
  window.grenaMobileAlertsOpen = () => {if (!settings) load();};
  window.grenaMobileChannelsOpen = loadAutoConnect;
  paintPreview();
})();
