# GREÑA Live — Jugar con amigos (trabajo en progreso)

Esta rama agrega el motor de salas compartidas de dinámicas. **No está integrado todavía al ejecutable ni al mundo local de Minecraft.**

## Comportamiento
- Un streamer con GREÑA ID crea una sala e invita a otro GREÑA ID.
- Solo el destinatario puede aceptar; invitaciones vencen a los cinco minutos.
- Cada streamer puede activar/desactivar su participación sin cerrar la sala.
- Al llegar un follow, se asocia la pregunta al GREÑA ID del streamer seguido.
- Solo los mensajes provenientes de los chats de **ese streamer** cuentan en su votación. Los votos de otros streamers de la sala se ignoran.
- Un usuario puede actualizar A/B; se registra su último voto por plataforma+identificador.
- Una sola pregunta activa por sala; las demás esperan en una cola hasta 20.
- Al terminar el conteo, el resultado incluye los gamertags de los jugadores participantes para que otro módulo lo entregue a Minecraft.

## Integración pendiente con el código principal
- Usar la identidad autenticada de GREÑA ID en cada solicitud; no confiar en un streamerId enviado por un navegador.
- Persistir salas/invitaciones de manera transaccional, con una única autoridad entre PCs distintas, por ejemplo en servicio de GREÑA ID.
- Enlazar alertas reales de follow (sin disparar por alertas de prueba) con `follow(...)`.
- Enlazar cada chat conectado con `vote(...)`; la cuenta de origen debe provenir del conector, no de texto proporcionado por el espectador.
- Programar `tick()` con reloj del servidor, sin que el navegador controle el resultado.
- Crear la pantalla Dinámicas / Jugar con amigos, notificaciones y confirmación de invitaciones.
- Entregar el resultado al addon a través de un puente seguro y compatible con el hosting de Bedrock.
- Evitar pérdida/duplicación de eventos y proteger inventarios y construcciones del mundo eterno antes de jugar en producción.

## Prueba
```sh
node --test dynamics/shared-rooms.test.mjs
```

### Restricciones conocidas
El repositorio visible declara versión 5.1.19; la versión de escritorio mencionada por el usuario es posterior. No fusionar esta rama ni etiquetarla estable hasta integrarla con el código más reciente y realizar pruebas end-to-end con dos cuentas auténticas.

## Estado de integración actualizado
- Interfaz `/dynamics.html` enlazada en menú principal.
- Ruta de control `/api/dynamics/minecraft` exige sesión GREÑA ID y pasa por los guardias de host/origen de GREÑA Live.
- Alerta de follow real alimenta la cola local. El chat real pasa por `/api/internal/loyalty`; cada instancia atribuye los votos al perfil activo.
- La sala y las invitaciones **solo viven en memoria en la instancia local**. Aún no sincronizan distintas computadoras. El botón de invitación local no puede entregarse a la PC del destinatario.
- Actualmente se selecciona un ID de pregunta y se muestran etiquetas A/B genéricas. Hay un paquete de 200 preguntas separado, pero todavía no está instalado dentro de esta rama.
- El resultado se emite a clientes WebSocket de GREÑA Live, pero **no está conectado a Minecraft Bedrock**. El addon de BDS no funciona como puente remoto en cualquier servidor Aternos o mundo local.
- La protección de inventarios/construcciones requiere verificar y probar las reglas del addon antes de ejecutar retos en un mundo real.
- Los ajustes están en RAM: tras reiniciar hay que reactivar. Esto es intencional para evitar activar eventos sin usuario.
- La v5.1.25 es la última base confirmada; esta rama no debe etiquetarse ni publicarse como v5.1.26 estable.

### Para interconectar dos computadoras
Se requiere un servicio central autenticado por GREÑA ID con almacenamiento transaccional de `rooms`, `room_members`, `invites`, `events` y `votes`, y canales de notificación asociados a cada identidad. Antes de implementarlo en producción hay que revisar el Worker central de Cloudflare y sus rutas reales de identidad para evitar suplantación de cuentas. No enviar contraseñas ni tokens de conectores al otro streamer.

### Backend central agregado (sin desplegar)
- `cloudflare-d1-migration.sql`: nuevas tablas para salas, miembros, invitaciones, eventos y votos.
- `cloudflare-rooms.js`: rutas de crear sala, invitar, bandeja de invitaciones, aceptar/rechazar y consultar miembros.
- Debe llamarse desde el Worker de autenticación **solo después** de validar el Bearer de GREÑA ID y entregar su ID autenticado.
- El Worker debe conectar `env.DB` y proporcionar el callback fiable `verifyRecipient(userId)` desde su propia consulta de identidad; nunca confiar en IDs enviados desde la ventana web.
- Todavía falta desplegar Worker, enlazar las PC y transmitir alertas/votos hacia este backend. Por eso no se ofrece como multistreamer operativo ni v5.1.26 estable.
