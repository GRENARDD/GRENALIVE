# GREÑA LIVE PRO — Android v0.3 BETA

**Estado: APK de pruebas compilado; NO ES UNA VERSIÓN COMPLETA NI ESTABLE.**
Este código es una aplicación Android Java dentro de `mobile-android/`. No es la web móvil.

## Implementado en el APK

- **Identidad e ícono:** el mismo símbolo «G» de `favicon.svg` en GREÑA Live de PC.
- **Diseño móvil:** encabezado GREÑA LIVE PRO, controles de canal, chat en vivo, pestañas Inicio / Flotante / Alertas / Widgets / Más, colores morados y paneles redondeados siguiendo el PDF del usuario.
- **Ventana flotante:** chat no interactivo, botón independiente de 53dp que se puede **arrastrar** a cualquier posición; tocarlo oculta / muestra solo el chat. La posición y visibilidad se recuerdan. Las alertas no dependen de que el chat esté visible.
- **ALERTAS PC:** copia íntegra de la carpeta `assets/` del proyecto PC, plantillas de ajolote, Mascot Alerts, catálogo premium y pantalla completa, junto con `afterglow-overlay.html` adaptado para funcionar **sin conexión al WebSocket local del PC**. Se muestran mediante WebView transparente, con controles de sonido y tema locales. Las personalizaciones privadas de cada PC no están sincronizadas todavía.
- **GREÑA ID:** autenticación con token protegido en Android Keystore; consulta central de comunidad en modo lectura.
- **TikTok relay Android:** botones Conectar / Desconectar y cliente HTTPS que consulta una ruta confiable de GREÑA ID para descubrir el servidor, nunca un host ingresado arbitrariamente. Una conexión solo se marca como real si el servidor confirma el LIVE.
- **Sin regresiones PC:** no escribe presencia de usuario, no modifica backend ni licencia de producción. Fuente de eventos desarrollada bajo `mobile-relay/`, separada del servidor de PC.

## Lo que falta antes de poder usarlo como producto terminado

1. **El servicio móvil aún NO está desplegado.** La cuenta Railway conectada contestó «Your trial has expired. Please select a plan to continue using Railway» al intentar crear un proyecto independiente. NO se inició ningún servicio ni se creó un cargo.
2. **Cloudflare:** la nueva ruta de descubrimiento `/api/license/mobile-relay` y `/api/license/mobile-settings` solo están en la rama de desarrollo. No se han desplegado ni migrado a producción.
3. **Eventos reales:** el código del relay usa `tiktok-live-connector` 2.5.0 (API no oficial). Hasta activar Railway y probar con un LIVE público en curso, las alertas de TikTok son visualización de DEMO, no eventos comprobados. El conector depende de proveedor de firmas, sus límites y cambios de TikTok.
4. **Twitch, Kick, YouTube y Starvios:** se pueden guardar enlaces, pero **no** hay conexiones de eventos móviles reales ni OAuth.
5. **Widgets avanzados y TTS Fish Audio:** no se han adaptado todos a Android. Los ajustes del escritorio siguen siendo locales y no se han migrado a nube. Los efectos de sonido pueden depender de permisos de audio del dispositivo y de reproducción de WebView.
6. **Verificación real de dispositivo:** no se han hecho pruebas en teléfono Android físico, diferentes juegos y versiones Android. Compilar no garantiza superposición o sonido en todos los modelos.

## Cómo probar la beta

1. Instala el APK `app-debug.apk` que genera GitHub Actions (solo en Android de pruebas).
2. Accede con GREÑA ID.
3. En **Flotante**, acepta `Mostrar sobre otras apps`, activa el overlay y prueba una alerta **DEMO**.
4. Abre un juego y **arrastra el botón circular** a donde quieras; tócala para ocultar o recuperar el chat. Confirma que no obstaculiza controles fuera del botón.
5. En **Alertas** selecciona las plantillas originales, guarda, vuelve y prueba. Si Cloudflare no dispone de ruta de settings, queda guardado **solo en ese teléfono**, con aviso.
6. En **Canales**, guarda el enlace público de TikTok. La opción «Conectar TikTok LIVE» mostrará el error del servicio hasta que Railway y Cloudflare estén habilitados; ese estado es esperado y explícito, no un falso éxito.

## Copias de seguridad antes del trabajo

- Código Windows / Worker publicado en GitHub main: `backup/2026-11-03-pc-production-before-mobile-integration` desde commit `b992fcaf5aeb6f612175499ef47bf9a0bba4f7b4`.
- Código Android 0.2: `backup/2026-11-03-android-v0-2-before-floating-chat` desde commit `c2dc5adfa6f54fa8cf9528d0d527d6f197027552`.
- **Estos respaldos son Git, no un dump de Cloudflare D1 ni Railway volumen.** No se realizaron mutaciones sobre esos datos de producción.

La nueva infraestructura exige activar un plan de Railway (o conectar un alojamiento compatible) y desplegar el Worker con pruebas. Hasta entonces **no se puede afirmar que la aplicación esté lista para disfrutar con eventos reales**.
