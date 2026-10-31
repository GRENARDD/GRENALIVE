# GREÑA Live PRO · Licencias con Cloudflare (sin Railway)

El programa y su chat/voz/alertas se ejecutan en cada PC. Solo los registros, la validación de códigos y los estados de presencia dependen de Cloudflare Worker + D1. GitHub aloja el código y compila instaladores; **GitHub no es una base de datos de licencias**.

## Primera configuración (solo propietario)

1. Inicia sesión en Cloudflare con `npx wrangler login` desde `cloudflare/licenses` (Node 24).
2. Crea la base con `npx wrangler d1 create grena-live-licenses --binding DB --update-config`. Comprueba que `wrangler.jsonc` tenga la entrada `d1_databases` con el ID real de la base; de ser necesario agrega manualmente el binding DB que imprime Wrangler.
3. Ejecuta `npx wrangler d1 migrations apply DB --remote` para crear las tablas.
4. Genera una **clave administrativa nueva**, aleatoria, de al menos 32 caracteres. Ejecuta `npx wrangler secret put ADMIN_KEY` y pégala en la consola (no la subas a GitHub, no la incluyas en el EXE).
5. Publica con `npx wrangler deploy` y guarda la URL HTTPS `https://grena-live-licenses.TU-SUBDOMINIO.workers.dev` que Wrangler mostrará. Esta URL es un **ejemplo**: copia la URL real.
6. Configura `GRENA_LICENSE_URL` en la versión local o, para instaladores públicos, coloca la URL real en el campo público `licenseServiceUrl` de `grena-public-config.json`. No guardes claves administrativas allí.
7. Ejecuta el programa local y abre `http://127.0.0.1:8787/license-admin.html` con sesión GREÑA ID iniciada. Escribe la clave privada y genera licencias.
8. Prueba con otro GREÑA ID: activa código de 30, 60, 90 u otros días. El primer canje arranca el conteo; renovar suma desde la fecha de vencimiento si sigue vigente.

### Automatizar posteriores publicaciones desde GitHub Actions

Configura los *secrets* `CLOUDFLARE_API_TOKEN` (permiso Workers Scripts Edit y D1 Edit) y `CLOUDFLARE_ACCOUNT_ID` en el repositorio GitHub, con autorización del propietario. Selecciona el workflow **Publicar licencias Cloudflare** y ejecútalo manualmente. El ID D1 debe estar guardado en el Wrangler config del repositorio. Nunca subas `ADMIN_KEY` al repositorio.

### Protecciones y límites

- Código aleatorio de un solo uso; se guarda solo SHA-256 del código. Duraciones aceptadas: de 1 a 3650 días.
- Un GREÑA ID puede iniciar sesión desde varias computadoras; la licencia y los días activos pertenecen a la cuenta central, sin duplicar el período de prueba. Cada PC mantiene sus perfiles locales y la misma cuenta puede usar su API Fish cifrada en Cloudflare.
- Las claves de sesión central se guardan hasheadas en D1; las contraseñas centrales con PBKDF2-SHA256 y sal individual.
- Sin conexión a internet no se pueden activar ni renovar códigos. Una licencia validada puede tener hasta 24 horas de gracia local. La revocación requiere una actualización de estado y no será instantánea mientras el equipo esté desconectado.
- El panel indica *en línea* cuando recibió señal reciente (menos de ~135 segundos), no una transmisión en directo.
- **No habilites `GRENA_LICENSE_REQUIRE=1` en la distribución pública hasta que el Worker, D1 y las cuentas se hayan probado de punta a punta**. Cuando lo actives, protege también todas las funcionalidades ejecutadas localmente: la comprobación de licencia de una app distribuida no resiste una modificación deliberada del binario.
- El Worker carece de funciones de procesamiento de pago; los códigos se entregan manualmente.
- Informar a los usuarios que GREÑA transmite usuario, correo y última conexión al registro central; no almacena chat, tokens de streaming ni configuraciones OBS en D1.

La configuración anterior no implica que este Worker ya esté desplegado: requiere acceso autorizado a tu cuenta Cloudflare.
