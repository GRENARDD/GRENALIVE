# Activar YouTube en GREÑA Auth (Cloudflare Workers)

Este módulo **no sustituye** al Worker actual. Incorpora cuatro rutas de YouTube sin interferir con TikTok, Twitch ni Kick.

## Integración al Worker existente

1. Copiar `cloudflare/grena-auth-youtube.mjs` junto al archivo principal del Worker.
2. Importar:
   ```js
   import {handleYouTubeAuth, youtubeProviderConfig} from './grena-auth-youtube.mjs';
   ```
3. Al inicio del handler `fetch(request, env)`, antes de las rutas existentes:
   ```js
   const youtubeResponse = await handleYouTubeAuth(request, env);
   if (youtubeResponse) return youtubeResponse;
   ```
4. En el **handler existente** de `GET /v1/config`, mantener el objeto de proveedores ya existente y añadir:
   ```js
   providers.youtube = youtubeProviderConfig(env);
   ```
   **No crear otra ruta /v1/config** ni reemplazar los proveedores existentes.

## Configuración Cloudflare

Crear un OAuth Client **Web application** en Google Cloud Console, habilitar **YouTube Data API v3** y registrar la URL de redirección autorizada exactamente:
`https://grena-auth.omelicolon18.workers.dev/v1/callback/youtube`

En Cloudflare Worker, añadir estos secrets:
- `GOOGLE_YOUTUBE_CLIENT_ID`
- `GOOGLE_YOUTUBE_CLIENT_SECRET`

Y estas variables:
- `YOUTUBE_OAUTH_CALLBACK_URL=https://grena-auth.omelicolon18.workers.dev/v1/callback/youtube`
- `YOUTUBE_ALLOWED_REDIRECTS=http://127.0.0.1:8787/oauth/youtube/callback,http://localhost:8787/oauth/youtube/callback` (ajustar a las URL reales del escritorio; agregar URL HTTPS pública solo si se utiliza)
- Binding KV `YOUTUBE_OAUTH_KV`: namespace dedicado para estados y tickets de corta duración.

Si Google OAuth está en modo Testing, añadir las cuentas autorizadas como usuarios de prueba. Para usuarios generales hace falta completar los requisitos de publicación y verificación de Google aplicables al scope de YouTube.

## Pruebas de aceptación

1. `GET /v1/config` muestra `providers.youtube.enabled=true` **solo después** de configurar todos los valores.
2. Desde GREÑA ID, «Vincular YouTube» abre Google, selecciona la cuenta y vuelve a `/oauth/youtube/callback` del escritorio.
3. La app consulta `channels?part=snippet&mine=true` y guarda el canal en el perfil GREÑA activo.
4. Tras expirar el access token, `/v1/refresh/youtube` renueva sin solicitar otra autorización.
5. Con LIVE activo, la detección y el chat reflejan el canal vinculado.
6. Repetir la conexión con dos perfiles GREÑA para confirmar aislamiento de cuentas; comprobar que TikTok y Kick siguen funcionando.

## Seguridad / restricciones

- Nunca copiar el Client Secret a `grena-public-config.json`, ni al instalador, ni al repositorio.
- No publicar el PR de escritorio hasta integrar y probar el Worker.
- Los tickets se guardan en KV y se borran al canjearlos. KV no garantiza consumo atómico entre regiones; para un despliegue con exigencia estricta de un solo uso, sustituirlo por Durable Objects.
- Revisar las rutas y reglas de redirección reales en el Worker existente antes de desplegar. Este módulo no ha sido probado con una autorización real de Google ni desplegado en Cloudflare.
