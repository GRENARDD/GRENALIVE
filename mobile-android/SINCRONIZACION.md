# Plan de sincronización GREÑA Live PC + GREÑA Live Mobile

## Contrato funcional

1. **Identidad central GREÑA ID:** inicio de sesión por dispositivo, mismo usuario, licencia y permisos. Una sesión móvil no invalidará una sesión de PC; no hacer depender autenticación de la IP o una sola máquina.
2. **Comunidad central:** los dos clientes leen el mismo `/api/license/community`. Una persona con dos dispositivos conectados aparece **una sola vez** en la lista pública. Siempre respetar «Aparecer en la lista».
3. **Presencia de LIVE por dispositivo:** un dispositivo no puede marcar fuera de línea toda la cuenta cuando existe otra transmisión activa. No confundir app abierta con transmisión confirmada.
4. **Chat y alertas:** eventos por `streamId`/`eventId` con orden, deduplicación y permisos por propietario; reenviar por WebSocket autenticado o SSE desde servicio central, sin necesidad de PC en línea.
5. **Configuraciones:** guardar en Cloudflare por `userId`, con versión/revisión por sección (voces, chat, alertas, cuentas vinculadas) y notificar cambios; la posición del overlay y su opacidad son preferencias locales del dispositivo.
6. **Protección de credenciales:** nunca distribuir secretos de redes, Fish Audio o tokens administrativos en el APK. APIs de terceros y tokens se resguardan en backend; el móvil recibe solo datos autorizados.

## Hallazgo en el código actual de Cloudflare

`cloudflare/licenses/src/worker.mjs` usa `community_presence` con `user_id TEXT PRIMARY KEY`. La llamada `POST /api/license/presence` con `share:false` ejecuta `DELETE FROM community_presence WHERE user_id=?`. Si un mismo usuario abre GREÑA en Android y PC, ese DELETE puede borrar el estado del PC. No modificar esta ruta a ciegas ni desplegar sobre producción sin migración y pruebas.

## Cambio de backend propuesto (pendiente, NO implementado)

Crear una nueva tabla para **presencias por fuente autenticada**, por ejemplo:

```sql
CREATE TABLE IF NOT EXISTS community_presence_sources (
  user_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  platform_json TEXT NOT NULL DEFAULT '[]',
  viewers_json TEXT NOT NULL DEFAULT '{}',
  live INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, source_id)
);
CREATE INDEX IF NOT EXISTS idx_presence_sources_updated
  ON community_presence_sources(updated_at);
```

Además, guardar **la preferencia global de aparecer** en una tabla separada de presencia. El API posterior recibirá heartbeat autenticado con `sourceId` aleatorio e identificador de canal, límite de fuentes por usuario, tiempo de expiración (por ejemplo 90 s) y número de espectadores por plataforma.

Agregación por GREÑA ID:

- Mostrar **un solo streamer** por usuario, con `live = OR` de todas las fuentes recientes.
- `platforms` es la unión de plataformas realmente activas.
- Si PC y Android reportan el **mismo canal/plataforma**, no sumar dos veces sus espectadores (usar una fuente preferida o máximo verificable por canal). Entre canales distintos, sumar si corresponde.
- Cuando un dispositivo se desconecta, borrar **solo su fuente**; el resto sigue activo hasta que caduque su heartbeat o reporte offline.
- Al cerrar la app, no hacer un `share:false` global por accidente. Si el usuario apaga la visibilidad, cambiar explícitamente la preferencia global.
- Mantener temporalmente lectura compatible de la tabla anterior mientras se migra, y verificar que los datos históricos no se pierdan.

### Ejemplo de resultado compartido para ambos clientes

```json
{
  "ok": true,
  "liveCount": 1,
  "totalViewers": 820,
  "users": [
    {"name":"Streamer", "viewers":820, "platforms":["tiktok","twitch"]}
  ]
}
```

## Secuencia acordada

1. Desarrollar y probar **APK Android independiente**.
2. Implementar cambios compatibles en Cloudflare (aislados y probados) para presencia multi-dispositivo, preferencias y eventos; migrar con pruebas.
3. Activar integración de chat/alertas reales en el APK, validar Android y la sincronización simultánea PC+Android.
4. Recién entonces incorporar descarga/actualizaciones del APK a «Versión móvil» en GREÑA Live para PC.

Hasta concluir el paso 2, el APK inicial **solo consulta** el listado central y no escribe presencia ni modifica configuraciones globales.
