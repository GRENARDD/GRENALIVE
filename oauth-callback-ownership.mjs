// Los callbacks OAuth que llegan desde Chrome no tienen necesariamente la cookie de la app.
// El state OAuth debe ser impredecible, de un solo uso, con caducidad y vinculado al perfil activo.
// La validación de existencia, uso único y expiración del state la realiza finishOAuth().
export function oauthCallbackBelongsToProfile({platform,state,activeUserId,sessionUserId}){
 if(!state?.userId||state.userId!==activeUserId)return false;
 const externalBrowser=platform==='kick'||(platform==='youtube'&&state.mode==='grena-auth');
 return externalBrowser||sessionUserId===state.userId;
}
