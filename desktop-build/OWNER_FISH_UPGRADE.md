# GREÑA Live · actualización segura de Fish Audio

**Estado:** cambios de prueba, sin publicación automática. No activar `GRENA_LICENSE_REQUIRE` hasta probar el sistema con cuentas de prueba y verificar la cuenta propietaria.

## Conservar las dos APIs originales del propietario

La versión anterior tenía una API incrustada en el código, que no es un lugar seguro. Esta versión elimina ese respaldo de `chat-server.mjs`. Para evitar perder el acceso, **crear primero la bóveda de Windows**, antes de reemplazar la instalación antigua.

1. Hacer copia de seguridad de `%APPDATA%\GREÑA LIVE PRO` y conservar temporalmente la instalación anterior.
2. Si se dispone del archivo **antiguo** `chat-server.mjs`, ejecutar **en el mismo usuario Windows que abre GREÑA**:

   ```powershell
   node desktop-build/migrate_owner_fish.cjs "C:\ruta-al-programa-anterior\chat-server.mjs"
   ```

   La migración **no imprime la API**, no la sube a GitHub ni pisa una bóveda anterior. Guarda la clave legada protegida con Windows DPAPI CurrentUser. La segunda API solo se migra automáticamente si existía como variable de entorno `GRENA_FISH_API_KEY_2`.

3. Si no se dispone del antiguo archivo (por ejemplo, solo queda un EXE empaquetado), **no es posible reconstruir de forma fiable la clave desde la nueva versión**. Antes de publicar, introducir cada clave en **Administración → Mis dos APIs Fish Audio**; nunca compartirlas por chats, capturas o repositorios.
4. Comprobar que ambos espacios aparecen como «Protegida» y probar la voz de ambas cuentas en el Windows del propietario **antes de publicar o actualizar**.
5. La bóveda está en `%APPDATA%\GREÑA LIVE PRO\owner-fish-vault.json`. Contiene solo datos DPAPI cifrados; el descifrado necesita la misma cuenta Windows. No eliminarla al reinstalar. Una copia de seguridad cifrada en otra cuenta Windows no se puede abrir directamente.

> La API incrustada en una versión anterior fue expuesta al incluirse en el código; proteger el archivo local no revoca esa exposición. Rotarla en Fish Audio una vez migrada o sustituyéndola por una nueva.

## Yaqui y demás usuarios

El propietario puede asignar una API por GREÑA ID en **Administración → Fish Audio → API individual**, o la persona puede poner su propia API desde Configuración, tanto en FREE como en PRO. El servidor D1 cifra cada API individual con AES-GCM. La clave de cifrado `FISH_CREDENTIALS_KEY` se debe configurar manualmente como **secreto de Cloudflare** (32 bytes aleatorios en base64), y **no** guardarla en GitHub ni en el código.

La API entregada en la conversación no debe copiarse a GitHub ni a CI. Recomendar a Yaqui regenerarla y pegar la nueva directamente en la pantalla privada. No hay asignación real hasta desplegar Cloudflare, comprobar el secreto y pulsar «Guardar API cifrada».

## Verificaciones antes de fusionar

- Prueba completa de Windows DPAPI de las dos APIs, persistencia y aislamiento por usuario.
- D1: alta, consulta y revocación en cuentas de prueba; no devolver claves al administrador.
- Owner: autorización permanente, sin acceso cruzado de cuentas.
- Prueba de 3 días y conversión a 30 días sin sumar la prueba.
- OBS, alertas y chat siguen funcionando para cuentas activas; se bloquean al caducar solo cuando se habilite el guard.
- Windows: `npm test`, creación del instalador y `desktop-build/smoke.ps1`.

**No fusionar ni publicar una actualización que haga perder el acceso del propietario a Fish Audio.**
