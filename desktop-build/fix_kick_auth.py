#!/usr/bin/env python3
"""Hardening for GREÑA Kick OAuth Desktop without exposing creator credentials.

Used only after fix_oauth.py has normalized local callback to 127.0.0.1.
The shared GREÑA Auth broker remains default unless this Windows installation
already has its own Kick Developer App Client ID and Client Secret.
"""
from pathlib import Path
import sys
root=Path(sys.argv[1]).resolve()
file=root/'server.mjs'
source=file.read_text(encoding='utf-8')

def once(before,after):
    global source
    count=source.count(before)
    if count!=1:
        raise RuntimeError('Kick OAuth: estructura incompatible ('+str(count)+' coincidencias), no se ha aplicado esta correccion.')
    source=source.replace(before,after,1)

once(
  "if(d.providers?.kick?.clientId)oauthConfig.kick={...(oauthConfig.kick||{}),clientId:d.providers.kick.clientId};",
  "if(d.providers?.kick?.clientId&&!oauthConfig.kick?.clientSecret)oauthConfig.kick={...(oauthConfig.kick||{}),clientId:d.providers.kick.clientId};"
)
once(
  "if(['tiktok','kick'].includes(platform)&&AUTH_SERVICE_URL)return beginBrokerOAuth(platform,req,res,currentOwner.id);",
  """// Si el dueño ya configuro SU Kick Developer App en este equipo,
 // el intercambio OAuth usa su propio Client ID/Secret y evita que un
 // broker externo rechace el code. No distribuir esas credenciales.
 const localKickReady=platform==='kick'&&!!oauthConfig.kick?.clientId&&!!oauthConfig.kick?.clientSecret;
 if(['tiktok','kick'].includes(platform)&&AUTH_SERVICE_URL&&!localKickReady)return beginBrokerOAuth(platform,req,res,currentOwner.id);"""
)
once(
  """ const d=await authServiceFetch(`/v1/exchange/${platform}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,redirect_uri:s.redirect||oauthRedirectFor(platform),...(s.verifier?{code_verifier:s.verifier}:{})})});
 const tok=d.tokens||d;""",
  """ if(platform==='kick'&&(!code||typeof code!=='string'))throw Error('Kick no entrego un codigo de autorizacion. Cierra esta ventana y vuelve a conectar Kick.');
 let d;
 try{
  d=await authServiceFetch(`/v1/exchange/${platform}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,redirect_uri:s.redirect||oauthRedirectFor(platform),...(s.verifier?{code_verifier:s.verifier}:{})})});
 }catch(e){
  // GREÑA Auth devuelve este mismo texto tanto por un invalid_grant como
  // por fallo de proveedor: no debemos asegurar que Kick esta caido.
  if(platform==='kick'&&/No se pudo contactar con el proveedor OAuth/i.test(String(e?.message||''))){
   throw Error('GREÑA Auth no pudo completar el intercambio de Kick. El proveedor puede haber rechazado el codigo o el callback; no significa que Kick este caido. Cierra esta ventana y pulsa Conectar Kick otra vez. Si se repite, el administrador debe revisar los registros del servicio GREÑA Auth y su Redirect URI.');
  }
  throw e;
 }
 const tok=d.tokens||d;"""
)
file.write_text(source,encoding='utf-8')
print('GREÑA Kick OAuth: opcion directa para credenciales locales, sin cambiar cuentas existentes.')
