# GREÑA ID — Integración del Worker real de licencias (14 nov 2026)

Se recibió el código fuente **bundled** de `grena-live-licenses` (incluye `src/updates.mjs` y `src/worker.mjs`). Se confirmó que ya existen:
- `sessionUser(env, req)`: verifica Bearer contra `user_sessions` en D1 y estado `disabled=0`
- `users(id, username, ...)` para convertir GREÑA ID visible en ID canónico
- `env.DB` como D1; `body(req)` para peticiones JSON
- puertas de identidad, licencias, administrador, Fish Audio y actualizaciones que **no deben modificarse**

Se produjo un Worker de preparación offline (`GRENA_Licencias_Con_Dinamicas_5.1.26_PREPARACION.mjs`) fusionando el código aportado y un módulo de Dinámicas. Este archivo se entregó en la conversación como ZIP, **no está desplegado ni publicado en GitHub Releases**. El fichero original aportado era Markdown escapado, por lo que hay que comparar con una exportación fuente real antes de desplegar.

## Nuevas rutas previstas
- `GET/POST /api/dynamics/rooms`
- `GET /api/dynamics/rooms/inbox`
- `POST /api/dynamics/rooms/invite`
- `POST /api/dynamics/rooms/respond`
- `POST /api/dynamics/rooms/follow`
- `POST /api/dynamics/rooms/vote`
- `GET /api/dynamics/rooms/:id`

El backend autentica el GREÑA ID central usando la **función real** `sessionUser(env,req)`; solo el anfitrión envía invitaciones, se consulta `users.username`, un destinatario solo acepta sus propias invitaciones, y la votación busca explícitamente `owner_id = sessionUser.id` para que los votos se contabilicen únicamente en el directo del streamer seguido.

## Validaciones locales sobre el Worker fusionado
- `node --check` correcto
- `GET /health` responde HTTP 200 como antes
- `GET /api/dynamics/rooms` sin sesión y `GET /api/dynamics/rooms/inbox` sin sesión responden 401
- No se ha realizado prueba contra D1 real ni despliegue a Cloudflare

## Bloqueos antes de declarar v5.1.26 estable
1. Comparar la copia con Worker real de producción y respaldar D1.
2. Probar migración aditiva y rutas autenticadas de salas con dos usuarios reales en entorno de prueba.
3. Integrar eventos remotos reales entre ambos clientes GREÑA Live; actualmente no se ha demostrado flujo end-to-end.
4. Probar el puente y el addon Bedrock con el servidor del usuario. Aternos podría no permitir el puente BDS.
5. Ejecutar CI final y tests de actualización desde 5.1.25, publicar instalador y aprobar actualización. No se ha efectuado ninguna de esas publicaciones.
