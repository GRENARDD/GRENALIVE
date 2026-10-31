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

Configurar en GitHub Actions -> Secrets and variables -> Actions ->
Repository secrets:

- `GRENA_WINDOWS_CERT_BASE64`: contenido binario de un certificado PFX válido
  codificado en Base64 (nunca subir el PFX al repositorio).
- `GRENA_WINDOWS_CERT_PASSWORD`: contraseña del PFX.

El workflow `.github/workflows/grena-desktop-from-kit.yml` pasa estas
credenciales exclusivamente a la compilación de `push`, no a PRs. El paso
`Get-AuthenticodeSignature` inspecciona el instalador; si se proporcionó
certificado pero la firma no es válida, la compilación falla. Si aún no se
dispone de certificado, lanza una advertencia y conserva el comportamiento
anterior, sin afirmar falsamente que el instalador está firmado.

Tras configurar la firma, publicar una **nueva versión** de GREÑA Live
con su propio número, instalador y manifiesto; no reemplazar el binario
oficial v5.1.12. Comprobar en una máquina limpia y con SmartScreen activo.

Fuentes:
- https://learn.microsoft.com/windows/apps/package-and-deploy/smartscreen-reputation
- https://learn.microsoft.com/windows/apps/package-and-deploy/code-signing-options
- https://www.electron.build/docs/features/code-signing/
