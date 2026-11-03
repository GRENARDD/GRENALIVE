# GREÑA Live Mobile 0.5 BETA — solo TikTok

## Qué hace el APK

La aplicación Android instalada (no `mobile.html`) ahora ofrece **solo TikTok LIVE**:
- Iniciar sesión con la cuenta GREÑA ID existente.
- Vincular un TikTok público mediante `@usuario` o `https://www.tiktok.com/@usuario/live`.
- Guardar ajustes de alertas y canales localmente. Cuando exista el endpoint Cloudflare `/api/license/mobile-settings`, se sincronizarán con GREÑA ID. No borrar ajustes de otras redes que sigan en el almacenamiento de la cuenta.
- Usar chat flotante con botón circular movible para ocultarlo/mostrarlo, sin cubrir la interfaz de la propia app.
- Animaciones originales GREÑA AFTERGLOW (Minecraft, mascota, catálogo, pantalla completa), más respaldo Domino desde la rama original `feature/domino-alerts` porque el archivo histórico `grena-theme-packs.js` no está en el repositorio principal.
- Estado del LIVE: **sin servidor**, **esperando directo**, **LIVE confirmado**, **desconectado**. La app nunca trata guardar el enlace como estar conectado.
- Al activar la vigilancia, el servicio Node TikTok comprueba el LIVE. Si está apagado, sigue intentando a intervalos de 30 a 120 segundos mientras el móvil consulta el receptor.
- Eventos disponibles según el conector TikTok: chat, seguidores, regalos, compartidos, likes y espectadores aproximados.

## Estado que NO debe confundirse

**El motor del servidor móvil NO se ha desplegado.** El Android usa `GET /api/license/mobile-relay` autenticado para descubrir un receptor HTTPS verificado. El endpoint todavía no está publicado en GREÑA ID producción. Por tanto, instalar el APK ahora no detecta ni reproduce eventos reales de TikTok.

La ruta de alojamiento preparada es **Cloudflare Containers**, no Railway. Containers requiere disponibilidad y facturación compatible de Cloudflare. No se han activado planes de pago, migrado D1 ni publicado cambios en el Worker original.

TikTok-live-connector es una API no oficial: su conectividad y firma pueden variar. Una compilación verde no demuestra éxito en un LIVE auténtico. La prueba integral requerirá una transmisión pública realmente activa, eventos observados desde Android y verificación de fondo/opacidad/audio en teléfono real.

## Uso de la beta

1. Instala el APK Android (depuración) en tu teléfono/emulador.
2. Entra con GREÑA ID.
3. Abre **Vincular o cambiar TikTok** e introduce el enlace completo o `@usuario`; marca **Activar vigilancia** y guarda.
4. En **Alertas**, selecciona tu plantilla y guárdala.
5. En **Flotante**, concede `Mostrar sobre otras apps` y activa el overlay. El botón circular puede moverse con el dedo y tocarse para mostrar/ocultar el chat; las alertas funcionan independientemente.
6. Pulsa **Activar vigilancia TikTok LIVE**. Hasta que el servidor esté disponible aparecerá **motor pendiente/no disponible**. Cuando esté habilitado, el estado correcto será primero **vigilando** y después **EN DIRECTO** solo si TikTok confirma el LIVE.

## Protección PC

Las versiones y servidores GREÑA Live de Windows no se han modificado. Cambios aislados en `feature/android-tiktok-only-v0-5-20261103`. Este proyecto se deriva de la rama Android, no del instalador principal. No instalar como versión estable ni publicar automáticamente.

Las otras plataformas (Twitch, Kick, YouTube, Starvios) siguen existiendo en el código de PC, pero no se activan ni muestran en Android 0.5.
