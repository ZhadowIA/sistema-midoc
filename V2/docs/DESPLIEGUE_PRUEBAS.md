# Despliegue de pruebas del portal (Vercel + Neon, gratis)

Entorno para **probar** el portal con la app de escritorio. No es produccion:

- **Solo datos ficticios.** Nada de pacientes reales, aunque el portal no guarde expediente clinico.
- **Vercel Hobby es de uso no comercial.** Sirve para pruebas; para medicos que paguen hace falta el plan Pro (o el despliegue de Azure del workflow `main_midoc-web-prod.yml`).
- Se despliega solo la rama **`dev`** (`vercel.json` ignora las demas): un PR nunca toca la base de pruebas.

## Que funciona y que no

| Funciona | No funciona en este entorno |
|---|---|
| Registro e inicio de sesion del medico | SMS y pagos (proveedores simulados) |
| Correos de la cuenta (verificar correo, recuperar contrasena) con Resend, ver seccion 5 | Notificaciones al paciente (congeladas desde el paso 27) |
| Cuenta, datos para la receta (regla 4.6) | |
| Licencia, equipos y creditos | IA (`AI_GATEWAY_PROVIDER=none` hasta tener proveedor real con BAA) |
| Vincular la app de escritorio y sincronizar perfil y licencia | Transcripcion en nube: apagada, y ademas Vercel limita cada peticion a 4.5 MB |

## 1. Base de datos en Neon

1. Crea una cuenta en [neon.com](https://neon.com) (plan Free).
2. Crea un proyecto. Region: **AWS US East (N. Virginia)**, la misma de las funciones de Vercel (`iad1`), para no sumar latencia.
3. En **Connect**, copia dos cadenas de conexion:
   - **Pooled** (el host dice `-pooler`): va en `DATABASE_URL`, agregando `&pgbouncer=true` al final (Prisma lo necesita con el pooler).
   - **Directa** (desactiva "Connection pooling"): va en `DIRECT_DATABASE_URL`. La usan las migraciones, que no funcionan a traves del pooler.

## 2. Portal en Vercel

1. Crea una cuenta en [vercel.com](https://vercel.com) con tu cuenta de GitHub (plan Hobby).
2. **Add New → Project** e importa `ZhadowIA/sistema-midoc`.
3. **Root Directory**: `V2/consultorio-app`. Framework: Next.js (lo detecta solo).
4. **Environment Variables**: pega el contenido del archivo de variables que se genero para este entorno (Vercel acepta pegar varias lineas `CLAVE=valor` a la vez) y reemplaza:
   - `DATABASE_URL` y `DIRECT_DATABASE_URL` con las cadenas de Neon.
   - `APP_BASE_URL` despues del primer despliegue, con la URL que te asigne Vercel.
5. **Deploy**. El primer intento sale como *Canceled* (Ignored Build Step) porque Vercel construye `main` y este entorno solo despliega `dev`. Es lo esperado.
6. **Settings → Git → Production Branch**: cambia a `dev`. Luego **Deployments → Redeploy** sobre el ultimo commit de `dev` (o haz push a `dev`).
7. Con la URL definitiva (p. ej. `https://midoc-pruebas.vercel.app`), actualiza `APP_BASE_URL` y vuelve a desplegar.

Cada despliegue de `dev` aplica las migraciones pendientes antes de construir (`scripts/vercel-build.mjs`).

## 3. Cuenta de medico de prueba

1. Abre `https://<tu-proyecto>.vercel.app/medico/registro` y crea la cuenta. Puedes entrar sin verificar el correo (la cuenta queda en revision).
2. Otorga la licencia y creditos de piloto desde tu equipo. Los scripts validan todo el entorno del portal, asi que se corren con el archivo de variables completo (ya con las cadenas de Neon), igual que `npm run` usa `.env.local`. Desde `V2/consultorio-app`:

```bash
npx tsx --env-file="<ruta del archivo de variables>" scripts/license-grant.ts medico@ejemplo.com
```

```bash
npx tsx --env-file="<ruta del archivo de variables>" scripts/credits-grant.ts medico@ejemplo.com 50
```

Guarda el archivo de variables en un lugar seguro **fuera del repositorio** (p. ej. tus Documentos): lo vas a reutilizar para estos scripts.

## 4. App de escritorio contra el portal de pruebas

1. En `V2/desktop-app/src-tauri/.env` agrega la llave publica de licencias que viene al final del archivo de variables (`MIDOC_LICENSE_PUBKEYS=...`). Sin ella la app no reconoce las licencias que firma este portal.
2. En `V2/desktop-app/.env` agrega `VITE_MIDOC_PORTAL_URL=https://<tu-proyecto>.vercel.app` (sin la variable, la app usa `http://localhost:3000`).
3. Arranca la app (`npm run tauri:dev`), abre tu perfil y usa **Vincular cuenta** con el correo y la contrasena del paso 3.
4. La revision de seguridad de medicamentos (interacciones, alergias y duplicidad) va apagada mientras no responda COFEPRIS (paso 33). Para probarla, compila con la variable de entorno `MIDOC_MEDICATION_SAFETY=on` (en PowerShell: `$env:MIDOC_MEDICATION_SAFETY = "on"; npm run tauri:dev`). No va en `.env`: Rust la lee al compilar.

## 5. Correos con Resend

Verificar correo y recuperar contrasena salen en el momento en que se piden (no dependen de la cola congelada).

1. Crea una cuenta en [resend.com](https://resend.com) (plan Free: 3,000 correos al mes, 100 al dia).
2. **API Keys → Create API Key**, con permiso de solo envio (*Sending access*). Pegala en Vercel como `EMAIL_API_KEY`; nunca en el repositorio ni en un chat.
3. En Vercel deja `EMAIL_PROVIDER=resend`, `EMAIL_BASE_URL=https://api.resend.com` y `EMAIL_FROM=MiDoc Pruebas <onboarding@resend.dev>`, y vuelve a desplegar.
4. **Sin dominio propio**, el remitente `onboarding@resend.dev` solo entrega al correo de tu cuenta de Resend: registra al medico de prueba con ese mismo correo. Para que lleguen a cualquier destinatario, verifica un dominio en Resend (registros DNS) y cambia `EMAIL_FROM` a una direccion de ese dominio.
5. Si un correo no llega, revisa en Resend la seccion **Emails/Logs**: un `403` con el remitente de pruebas indica que el destinatario no es el correo de tu cuenta.

## Secretos

- El archivo de variables se genero fuera del repositorio y **no se commitea**. Sus secretos son solo de este entorno.
- La llave de licencias de este entorno (`LICENSE_SIGNING_KID=midoc-pruebas-2026-10`) **no es la de produccion**; esa sigue pendiente (`PENDIENTES.md`).
- Si un secreto se filtra: genera otro, actualizalo en Vercel y vuelve a desplegar. Cambiar `NEXTAUTH_SECRET` cierra las sesiones abiertas.
