# GREÑA Live Mobile 0.2 BETA — aplicación Android independiente

**Esta es la app Android instalable**, no la interfaz web móvil de GREÑA Live. El código en \`mobile-android/\` se compila en GitHub Actions como APK de prueba. No se integra ni sustituye aún al instalador Windows.

## Nuevo en 0.2: configuración desde el teléfono

Tras entrar con GREÑA ID, el panel nativo tiene dos botones:

- **✨ Configurar alertas**: elegir los temas Minecraft Pixelcraft, Dominó, GREÑITO, Personajes Pixel y otras plantillas existentes de GREÑA; volumen, intensidad, sonidos por tipo de evento, fuente y colores; guardar en la sección \`alerts\` de tu GREÑA ID.
- **🔗 Vincular y configurar canales**: guardar enlaces públicos de TikTok, Twitch, Kick, YouTube y Starvios (incluido escribir \`@usuario\`); activar/desactivar cada fuente para una integración futura, en la sección \`channels\` de GREÑA ID.

Las pantallas son nativas Android (Java) y usan HTTPS con Bearer GREÑA ID. La cuenta usa ajustes separados por sección y revisionado para detectar cambios simultáneos y no sobrescribir a otro dispositivo por accidente.

**Requisito para usar Guardar y Cargar:** desplegar primero el endpoint \`GET/POST /api/license/mobile-settings?section=alerts|channels\` del Worker \`cloudflare/licenses/src/worker.mjs\` de esta rama tras revisar sus pruebas. Esta rama NO despliega ni altera la producción por sí sola.

**Alcance actual:** guardar un enlace público NO es OAuth ni autentica la cuenta de Twitch/Kick/YouTube, y NO conecta automáticamente chat ni alertas del LIVE. El overlay flotante sigue siendo DEMO y está identificado como tal. El PC todavía no sincroniza automáticamente sus ajustes AFTERGLOW locales con las nuevas secciones Cloudflare; esa integración es el siguiente paso. No afirmar que los estilos se reflejan ya en la PC.

## Base Android anterior

## Qué funciona en esta primera base

- Inicio de sesión con el mismo GREÑA ID utilizado por GREÑA Live de escritorio (Cloudflare Worker existente).
- Consulta a `GET /api/license/community` con Bearer token para mostrar **la misma lista central de streamers activos** que consulta el PC. Recarga cuando la app está visible (cada 15 segundos).
- Sesión protegida mediante Android Keystore con AES-GCM; contraseña no persistida y copia de seguridad de app desactivada.
- Interfaz para activar el permiso Android de **Mostrar sobre otras apps**, iniciar/detener una ventana flotante y mostrar una alerta marcada como **DEMO**.
- La ventana lleva `FLAG_NOT_TOUCHABLE|FLAG_NOT_FOCUSABLE` y opacidad efectiva reducida para minimizar la interferencia de toques del juego. La garantía depende de versión Android, fabricante y sistema de seguridad.
- Servicio en primer plano con notificación: permite saber cuándo el overlay está activo. Detener desde la app.
- **No modifica los registros de comunidad**, para no provocar que una sesión móvil borre la transmisión activa de escritorio.

## Cómo compilar APK de prueba

Requiere **Android Studio** con Android SDK API 35, Java/JDK 17 y Gradle 8.9+ (por ejemplo 8.10.2).

1. Descomprime y abre esta carpeta como proyecto de Android Studio.
2. Espera a que Gradle sincronice, con Internet para resolver el Android Gradle Plugin.
3. En **Build → Build APK(s)** genera el APK de depuración, o ejecuta `gradle assembleDebug` desde la raíz si tienes Gradle instalado.
4. El APK se generará en `app/build/outputs/apk/debug/app-debug.apk`.
5. Instálalo únicamente en un teléfono Android de pruebas. Si Android solicita permiso de instalación de esta fuente, consiéntelo en el dispositivo de pruebas.

## Configuración en el teléfono

1. Abre **GREÑA Live Mobile** y entra con tu **GREÑA ID existente**.
2. En **Canales en vivo** aparecerán las transmisiones que los usuarios han autorizado publicar y que el backend considere activas.
3. Pulsa **Activar ventana flotante**, acepta **Mostrar sobre otras apps** y vuelve a la aplicación para pulsarlo de nuevo.
4. Activa la notificación si Android lo solicita. Abre tu juego: la ventana flotante informativa se mostrará sin capturar toques.
5. Usa **Probar alerta (DEMO)** para comprobar cómo se ve y **Detener ventana flotante** para apagarla.

## Importante: trabajo pendiente antes de una beta con chat real

- Añadir la fuente **central de eventos** (chat, follows, regalos y alertas) autorizada por usuario y por LIVE, con reanudación, deduplicación y filtros. El WebSocket de escritorio en `127.0.0.1:8787` **no es accesible desde otro teléfono**, y tampoco sirve cuando el PC está apagado.
- Migrar presencia `community_presence` de una fila por usuario a **varias fuentes por usuario**, con heartbeat/TTL, para que desconectar móvil no oculte un PC que sigue en directo. Se encuentra documentado en `SINCRONIZACION.md`.
- Guardar la opción de compartir transmisión y configuraciones de usuario en el mismo backend central, con configuraciones locales específicas para el overlay de cada dispositivo.
- Probar compatibilidad/consumo/batería con juegos reales Android 12 a 15+ y ajustes de ahorro de batería de fabricantes.
- Empaquetar release firmada con certificado propio cuando la app esté lista; **un APK debug no es distribución oficial**.
- Añadir su descarga a la sección «Versión móvil» **solo después** de probar la app de manera independiente, según lo acordado.

## Seguridad y límites

- No registra contraseñas, tokens, ni datos privados en logs.
- No coloca el token en URLs ni lo comparte con los widgets; se envía por `Authorization: Bearer` exclusivamente al servicio central HTTPS.
- No envía estado de transmisión hasta que el backend gestione correctamente varios dispositivos.
- Los eventos/alertas de ejemplo están marcados explícitamente como demostración.
- Android puede bloquear algunos toques a través de superposiciones por seguridad; no se deben prometer excepciones universales.

Proyecto independiente, **no cambia la aplicación de escritorio ni el Worker de producción**.
