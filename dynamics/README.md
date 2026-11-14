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
