# GREÑA Live 5.1.26 — Dinámicas Minecraft entre streamers

## Integración preparada
- Menú principal: **Dinámicas / ¿Qué prefieres en Minecraft?**
- Cada GREÑA ID autenticado puede activar sus retos, crear automáticamente su sala y enviar una invitación a otro GREÑA ID.
- Solo el destinatario de la invitación puede aceptarla. Las invitaciones caducan a los cinco minutos.
- Los followers reales de TikTok, Twitch, Kick y YouTube encolan preguntas del catálogo original de 200.
- El chat A/B del streamer dueño del reto es el único que cuenta para esa pregunta. Un espectador puede corregir su voto; solo cuenta una vez por plataforma y cuenta.
- Cloudflare D1 es la autoridad central: una pregunta activa por sala, hasta veinte pendientes, 20 segundos de votación, votos separados por streamer e historial de resultados.
- Cada streamer puede registrar su gamertag de Minecraft en la sala y ver los resultados compartidos.
- El Worker real de GREÑA ID maneja la autenticación con Bearer y las rutas `/api/dynamics/rooms/*`. Nunca se transmite el token de otra cuenta.

## Minecraft Bedrock en Aternos: dos vías
**Vía recomendada para Minecraft Bedrock en Windows y servidor Aternos:**
1. Inicia GREÑA Live en Windows, entra con GREÑA ID y activa Dinámicas.
2. Entra al mundo de Aternos con una cuenta de Minecraft que tenga permisos de operador y que permita trucos.
3. En el chat del juego ejecuta `/connect ws://127.0.0.1:19135`.
4. La pantalla Dinámicas debe indicar «Minecraft conectado». Mantén el cliente de Bedrock y GREÑA Live abiertos en ese PC.
5. Vincula los gamertags de los jugadores en la sala. El resultado aplica mensajes y efectos de 6 segundos a los jugadores registrados.

**Límites reales:** el protocolo WebSocket del cliente Bedrock depende de su versión y permisos; no puede garantizarse su compatibilidad sin una sesión real. En esta entrega solo hay efectos seguros y temporales (A = velocidad; B = salto). Los 200 retos tienen preguntas completas, pero no implementan automáticamente 200 efectos distintos. No se envían comandos que cambien bloques, inventarios o posiciones. Si el servidor no permite trucos o la versión del juego rechaza /connect, esta vía no funciona.

**Vía alternativa en servidor BDS administrado:** `/mc/poll` está disponible con un token fuerte `GRENA_MINECRAFT_BRIDGE_TOKEN` para un addon BDS que tenga permiso de HTTP. No asumir que Aternos permite configurar `@minecraft/server-net`.

## Pruebas de lanzamiento
- `node --test dynamics/*.test.mjs` cubre catálogo, salas, D1 simulado con dos identidades, cola, autorización de gamertags y protocolo WebSocket (cliente simulado).
- GitHub Actions compila el instalador, valida voz, OBS, chat, licencias, y comprueba que incluya los módulos.
- El flujo de publicación oficial `grena-release-v5126.yml` exige commit probado de `main`, instalador válido y Worker de producción con ruta de salas protegida.
- La comprobación automatizada **no equivale** a un ensayo de Minecraft real en Aternos. El usuario necesita ejecutar una vez el comando /connect y confirmar el estado de conexión.
- La actualización automática de usuarios continúa bajo control del propietario del canal GREÑA, no por crear el release.

No fusionar un commit con pruebas fallidas. No cambiar credenciales, claves Fish Audio, licencias ni datos de cuentas.
