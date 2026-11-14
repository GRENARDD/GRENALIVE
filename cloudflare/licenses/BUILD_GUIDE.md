# GREÑA Live — compilación del Worker de licencias

Esta carpeta es un proyecto independiente del desktop.

## Configuración Cloudflare Build

- Rama de producción: `main`
- Root directory: `cloudflare/licenses`
- Build command: vacío
- Deploy command: `npx wrangler deploy --config wrangler.jsonc`

La carpeta incluye `package.json` y `package-lock.json` independientes, sin dependencias de gRPC. La aplicación de escritorio usa su propio `package.json` en la raíz del repositorio.

**Importante:** Reintentar un build antiguo puede fijar un SHA anterior a la incorporación de este lockfile. Se debe revisar que el build use un commit posterior a `de084aebe968b8f73d17c3b530e67a43c8b0ff65`.

La modificación de este documento no altera datos ni rutas de GREÑA ID; no constituye despliegue del módulo Dinámicas 5.1.26.
