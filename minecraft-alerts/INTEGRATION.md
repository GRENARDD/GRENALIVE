# Integración Minecraft — rama de pruebas

Esta rama NO modifica el servidor en producción, los ajustes de usuarios ni los overlays actuales.

## Estado
- Adaptador independiente de eventos: `minecraft-alerts/adapter.mjs`
- Identificación de regalos conocidos (rosa, corazón, diamante, cofre, corona, TNT)
- Fallback para regalos desconocidos con su imagen/animación original cuando el conector la entregue
- Filtro de URLs y deduplicación por identificador de evento
- Pruebas con `node --test minecraft-alerts/adapter.test.mjs`

## Pendiente antes de integrar
1. Incorporar y revisar los recursos y motor visual del ZIP externo (no están incorporados aún en esta rama).
2. Conectar el adaptador en el punto central de emisión de alertas de cada plataforma, respetando los eventos existentes.
3. Agregar selector Original/Minecraft y configuración por usuario.
4. Crear overlays OBS horizontal/vertical con URLs autenticadas o tokens de solo lectura.
5. Verificar en directos reales el formato de regalos, repetición/combo, nombres y datos de Starvios.
6. Pruebas de navegador y carga, y revisión de seguridad antes de desplegar.

## Contrato de integración
```js
import {normalizeMinecraftAlert,chooseMinecraftGiftVisual,createMinecraftAlertDeduper} from './minecraft-alerts/adapter.mjs';
const shouldPlay=createMinecraftAlertDeduper();
function onPlatformAlert(raw) {
  const event=normalizeMinecraftAlert(raw);
  if (!event || !shouldPlay(event)) return;
  const visual=event.type==='gift' ? chooseMinecraftGiftVisual(event) : null;
  // Enviar {event,visual} al overlay Minecraft del usuario autorizado.
}
```

No se garantiza cobertura total de regalos hasta verificar qué metadatos entregan los conectores. Nunca se debe perder un regalo por falta de un modelo: el fallback muestra su nombre y, si está disponible, su imagen original.
