# Entrega de pruebas — GREÑA LIVE 5.1.26 (sin publicar)

## Qué está preparado en GitHub
- Worker real `cloudflare/licenses/src/worker.mjs` importa y monta `./dynamics.mjs`, con sesiones centrales de GREÑA ID.
- D1: salas, miembros, invitaciones, follows en cola, votos y eventos, creados como tablas nuevas `dynamics_*` cuando se usan por primera vez.
- El escritorio tiene menú `Dinámicas`, pantalla `dynamics.html`, catálogo de 200 retos, proxy seguro al Worker y un puente local `/mc/poll`.
- El paquete de pruebas de Windows usa `5.1.26-beta.1` solo en pull requests. `main` permanece con 5.1.25.
- Los botones de simulación NO escriben en la sala central.
- El motor de votación central solo acepta votos del streamer dueño del reto activo (vinculados a su token central).

## Para no poner en riesgo las licencias
1. NO reemplazar código en `grena-live-licenses` de producción ni fusionar la rama sin pruebas.
2. Crear un Worker de pruebas y una D1 **separada y vacía**, con el esquema de identidad de prueba, antes de comprobar invitaciones. Las vistas previas de GitHub podrían heredar el binding D1 de producción: verificar que NO ocurra.
3. Apuntar SOLO un ejecutable de prueba de escritorio al Worker de pruebas; no tocar `GRENA_LICENSE_URL` de la instalación estable.
4. Probar con dos GREÑA ID ficticios y dos máquinas/sesiones:
   - crear sala, invitar, rechazar, volver a invitar, aceptar;
   - verificar que desconocidos no entren ni vean datos;
   - emitir follow por creador A, emitir votos A/B desde A y B: B debe rechazarse;
   - emitir follow por creador B, repetir aislamiento;
   - comprobar duplicados, fin de votación, resultado, reconexión y cambios de sala.
5. Verificar integración real de Twitch/Kick/TikTok/YouTube con directos de prueba, en especial IDs de eventos y cuotas de YouTube.
6. Minecraft: confirmar si el servidor Aternos Bedrock usado admite conexiones HTTP salientes del addon; el puente actual se diseñó para Bedrock Dedicated Server con soporte de `@minecraft/server-net`. No asumir compatibilidad en Aternos. Verificar también permisos y que ningún reto cause destrucción permanente.
7. Ejecutar suite completa y upgrade sobre una COPIA de perfil real 5.1.25, sin sobrescribir el original.
8. Recién entonces revisar PR #100, aprobar, construir y publicar un artefacto oficial **5.1.26**.

## Comprobaciones automáticas agregadas
- `dynamics/central-d1.test.mjs`: usa SQLite en memoria para comprobar invitaciones, sesión, aislamiento de votos y resultado.
- `dynamics/central-integration.test.mjs`: revisa montaje del Worker y el proxy sin tokens expuestos.
- `dynamics/questions.test.mjs`: valida los 200 retos.
- `.github/workflows/grena-desktop-from-kit.yml`: comprueba módulos en el instalador.

## Estado que NO debe confundirse con estable
- El código está en la rama `feature/dinamicas-salas-multistreamer`, PR #100 en borrador.
- NO hay despliegue del módulo Dinámicas al Worker de producción.
- NO hay prueba real de dos equipos y servidor Aternos.
- NO hay autorización para anunciar `5.1.26 ESTABLE` sin superar las pruebas anteriores.
