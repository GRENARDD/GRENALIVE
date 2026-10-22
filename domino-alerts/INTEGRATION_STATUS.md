# GREÑA Dominó Alerts — integración pendiente
Rama de desarrollo independiente; no desplegar sin pruebas.

Fuente visual aprobada por el usuario: archivo `GRENA_DOMINO_ALERTS_PRUEBA.html` generado a partir de `grena-domino-alerts (1).zip`.

## Requisitos
- Preservar exactamente el aspecto, animaciones y sonido de la demostración aprobada.
- Incorporar motor, assets y normalizador del ZIP; no sustituirlo por otro simulador.
- Agregar opción de estilo `domino` en el sistema existente de alertas, sin alterar estilos originales.
- Adaptar los eventos de TikTok, Twitch, Kick y Starvios al contrato del motor; verificar tipos reales de cada conector.
- Soportar regalos desconocidos con fallback, cantidad y nombre; combos sin perder eventos.
- Aislar configuración por usuario; overlays horizontal y vertical, transparentes y con token de lectura.
- Probar sin LIVE y con eventos reales antes de habilitar en producción.

## Estado
Solo rama de integración creada y plan registrado. Ningún cambio de runtime ni despliegue en Railway.
