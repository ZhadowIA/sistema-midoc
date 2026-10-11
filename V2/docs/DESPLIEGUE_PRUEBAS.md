# Despliegue de pruebas del portal (Vercel + Neon, gratis)

Entorno para **probar** el portal con la app de escritorio. No es produccion:

- **Solo datos ficticios.** Nada de pacientes reales, aunque el portal no guarde expediente clinico.
- **Vercel Hobby es de uso no comercial.** Sirve para pruebas; para medicos que paguen hace falta el plan Pro (o el despliegue de Azure del workflow `main_midoc-web-prod.yml`).
- Se despliega solo la rama **`dev`** (`vercel.json` ignora las demas): un PR nunca toca la base de pruebas.

## Que funciona y que no

| Funciona | No funciona en este entorno |
|---|---|
| Registro e inicio de sesion del medico | **Correos** (verificacion, recuperar contrasena): se encolan pero nadie los envia; el envio esta congelado desde el paso 27 (ver `PENDIENTES.md`) |
| Cuenta, datos para la receta (regla 4.6) | SMS y pagos (proveedores simulados) |
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

## Secretos

- El archivo de variables se genero fuera del repositorio y **no se commitea**. Sus secretos son solo de este entorno.
- La llave de licencias de este entorno (`LICENSE_SIGNING_KID=midoc-pruebas-2026-10`) **no es la de produccion**; esa sigue pendiente (`PENDIENTES.md`).
- Si un secreto se filtra: genera otro, actualizalo en Vercel y vuelve a desplegar. Cambiar `NEXTAUTH_SECRET` cierra las sesiones abiertas.
