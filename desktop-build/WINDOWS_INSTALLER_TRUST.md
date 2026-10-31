# GREÑA Live · Verificación de seguridad del instalador Windows

## Diagnóstico del archivo oficial
La versión 5.1.12 se publica como `GRENA.LIVE.Setup.5.1.12.exe` desde
`https://github.com/GRENARDD/GRENALIVE/releases/tag/v5.1.12`.

Para comprobar el archivo descargado (PowerShell):

```powershell
$installer = "$env:USERPROFILE\Downloads\GRENA.LIVE.Setup.5.1.12.exe"
Get-FileHash -LiteralPath $installer -Algorithm SHA256
Get-AuthenticodeSignature -LiteralPath $installer | Format-List Status,StatusMessage,SignerCertificate
```

SHA-256 oficial v5.1.12:
`422b93fc4241336fb68136cf58b3f5ea69f65e42f12ea2e301eeea349771aedc`

Verificar que el hash coincida con GitHub antes de dar instrucciones al usuario.
Que el hash coincida prueba que son los mismos bytes publicados, no que el
programa esté libre de malware.

## Dos bloqueos diferentes

1. **Microsoft Defender SmartScreen: app no reconocida / editor desconocido.**
   Es un aviso de reputación o firma. No significa por sí solo malware.
   Firmar de forma consistente ayuda a construir reputación; NO garantiza
   que cada versión nueva carezca de avisos.
2. **Defender Antivirus / PUA: amenaza detectada, en cuarentena.**
   Recoger el nombre exacto de la amenaza desde Windows Security ->
   Virus & threat protection -> Protection history. Auditar el archivo y
   reportar un posible falso positivo a Microsoft como desarrollador:
   https://www.microsoft.com/en-us/wdsi/filesubmission/?persona=SoftwareDeveloper .
   No solicitar al usuario desactivar Defender o SmartScreen.

## Firmar compilaciones oficiales (cuando exista un certificado auténtico)

Windows necesita una firma Authenticode de un editor verificado. Obtener un
certificado de firma de código válido OV (organización) o una alternativa
compatible con la elegibilidad del desarrollador; un certificado autofirmado
NO corrige SmartScreen.

### Requisito 2026: clave protegida en HSM

Desde junio de 2023, los certificados de firma de código de confianza
pública nuevos exigen almacenar sus claves privadas en hardware criptográfico
seguro o en un HSM alojado por un proveedor. Por lo tanto, **no asumir que
al comprar un certificado OV se entregará un PFX exportable**. Un certificado
nuevo comprado hoy normalmente requiere USB/HSM o servicio de firma remota,
como DigiCert KeyLocker o la opción de firma en la nube del proveedor.

- **Para usuarios de República Dominicana:** la firma pública Azure Artifact
  Signing no incluye actualmente a desarrolladores individuales residentes
  allí. Consultar con una CA reconocida la elegibilidad de la identidad
  personal o de la empresa para certificado de firma de código.
- **Firma en GitHub Actions:** elegir con el emisor un proveedor HSM/cloud
  compatible con CI. El método de autenticación y firma dependen del proveedor;
  no añadir claves privadas al repositorio ni al chat.
- **Certificados PFX heredados válidos:** solo si existe legalmente un PFX
  exportable de una emisión anterior (u otro formato admitido por la CA),
  configurar los secretos:
  - `GRENA_WINDOWS_CERT_BASE64`: PFX codificado Base64
  - `GRENA_WINDOWS_CERT_PASSWORD`: contraseña del PFX

El workflow `.github/workflows/grena-desktop-from-kit.yml` ya detecta el
método PFX con los secretos anteriores y valida la firma Authenticode del EXE.
**No está conectado todavía a ningún emisor de certificado ni a un HSM**.
Para una CA nueva habrá que integrar la herramienta de firma remota elegida,
firmar tanto el ejecutable como el instalador y verificar su identidad.

Si no hay certificado, el flujo advierte de que el instalador está sin firmar
en vez de declarar falsamente un editor verificado. El PR no firma ni publica
ningún archivo por sí mismo.

### Alternativa de distribución

Microsoft Store puede firmar paquetes MSIX tras su aprobación, sin comprar
un certificado propio. Esto requiere preparar la distribución MSIX y someter
GREÑA Live a revisión: **no firma automáticamente el .exe de GitHub**.

Una firma válida cambia el «Editor desconocido» por la identidad legal
verificada; si el instalador necesita privilegios de administrador, Windows
puede seguir mostrando UAC. SmartScreen también puede requerir que la firma
o el programa acumulen reputación.


Tras configurar la firma, publicar una **nueva versión** de GREÑA Live
con su propio número, instalador y manifiesto; no reemplazar el binario
oficial v5.1.12. Comprobar en una máquina limpia y con SmartScreen activo.

Fuentes:
- https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation
- https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options
- https://www.electron.build/docs/features/code-signing/
- https://knowledge.digicert.com/general-information/export-a-code-signing-certificate-as-a-pfx-file
- https://learn.microsoft.com/en-us/azure/artifact-signing/quickstart
