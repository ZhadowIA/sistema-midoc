# Paso 9 — Infraestructura en Azure (2026-06-11)

Infraestructura cloud para Paso 9: servidor de releases, base de datos staging, y almacenamiento de backups.

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENTE (Desktop App)                   │
│                         Tauri Windows                         │
└──────────────────────────────────────────────────────────────┘
                               │
                 ┌─────────────┴─────────────┐
                 ↓                           ↓
          ┌──────────────┐          ┌──────────────────┐
          │   Consultar  │          │   Descargar &    │
          │   releases   │          │   actualizar     │
          └──────────────┘          └──────────────────┘
                 │                           │
                 ↓                           ↓
    ┌──────────────────────────┐  ┌──────────────────┐
    │   Storage Account        │  │  Function App    │
    │ releases/manifest.json   │  │ (auto-updater)   │
    │ (JSON estático)          │  │                  │
    └──────────────────────────┘  └──────────────────┘
                 
    ┌──────────────────────────────────────────┐
    │     Instaladores firmados (MSI)          │
    │  releases/Midoc_X.Y.Z_x64.msi            │
    │  releases/Midoc_X.Y.Z_x64.msi.sig        │
    └──────────────────────────────────────────┘

    ┌──────────────────────────────────────────┐
    │  Backups cifrados (privados)             │
    │  staging-backups/backup-YYYYMMDD.db      │
    │  (solo para restauración en staging)     │
    └──────────────────────────────────────────┘
    
    ┌──────────────────────────────────────────┐
    │    PostgreSQL (opcional para staging)    │
    │    midoc-staging-db.postgres....         │
    │    (para drill de restauración)          │
    └──────────────────────────────────────────┘
```

## 🔧 Componentes creados

### 1️⃣ Azure Function App (Servidor de releases)

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `midoc-releases-func` |
| **Ubicación** | Mexico Central |
| **Runtime** | Node.js 24 |
| **Plan** | Consumption (sin costo cuando no se usa) |
| **Estado** | Running |
| **URL** | https://midoc-releases-func.azurewebsites.net |

**Propósito**: Servir el manifiesto JSON para el updater de Tauri

**Endpoint para tauri.conf.json**:
```json
"endpoints": [
  "https://midocstorage01.blob.core.windows.net/releases/manifest-{{version}}-{{target}}-{{arch}}.json"
]
```

---

### 2️⃣ Azure Storage Account (Releases + Backups)

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `midocstorage01` |
| **Tipo** | StorageV2 |
| **Ubicación** | Mexico Central |

#### Contenedores

| Nombre | Acceso | Propósito |
|--------|--------|----------|
| `clinical-studies` | Privado | Datos clínicos (existente) |
| `releases` | **Público** | Instaladores MSI + manifiesto |
| `staging-backups` | **Privado** | Backups cifrados para restauración |

**URLs base**:
```
Releases (público):
  https://midocstorage01.blob.core.windows.net/releases/

Backups (privado):
  https://midocstorage01.blob.core.windows.net/staging-backups/
```

**Archivos actuales**:
- `releases/manifest.json` → Manifiesto de actualización
- `releases/Midoc_0.2.0_x64.msi.txt` → Ejemplo de instalador

---

### 3️⃣ Azure Database for PostgreSQL (Base de staging)

| Propiedad | Valor |
|-----------|-------|
| **Nombre** | `midoc-staging-db` |
| **Ubicación** | Mexico Central |
| **Versión** | PostgreSQL 14 |
| **SKU** | Standard_B1ms (Burstable) |
| **Almacenamiento** | 32 GB |
| **Estado** | Creando (puede tardar 5-10 min) |

**Connection String**:
```
postgresql://postgres:MiDoc2026Staging!Secure@midoc-staging-db.postgres.database.azure.com:5432/postgres
```

**Para psql**:
```bash
psql -h midoc-staging-db.postgres.database.azure.com \
     -U postgres \
     -d postgres
```

**Propósito**: Base de datos real para correr el drill de restauración contra datos representativos

---

## 🔐 Seguridad

### Storage Account

✅ CORS configurado:
- Orígenes: `*` (abierto a todos, necesario para cliente Tauri)
- Métodos: GET, HEAD
- Headers: `*`

✅ Acceso:
- `releases`: Público (lectura para descargas)
- `staging-backups`: Privado (acceso solo con credentials)

### PostgreSQL

⚠️ **Configuración actual**:
- Firewall: Abierto a `0.0.0.0/0` (acceso público)
- Usuario: `postgres`
- Contraseña: `MiDoc2026Staging!Secure` (cambiar en producción)

🔒 **Para producción**:
```bash
# Restringir firewall a IPs específicas
az postgres flexible-server firewall-rule create \
  --name "AllowCI" \
  --resource-group midoc-rg \
  --server-name midoc-staging-db \
  --start-ip-address 203.0.113.0 \
  --end-ip-address 203.0.113.255
```

---

## 📋 Procedimientos operacionales

### 1. Publicar un nuevo release (Instalador + Manifiesto)

```bash
#!/bin/bash
VERSION="0.2.1"
STORAGE_ACCOUNT="midocstorage01"
STORAGE_KEY="<key>"

# 1. Obtener contraseña de firma
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<contrasena en secretos del pipeline>"
export TAURI_SIGNING_PRIVATE_KEY="~/.tauri/midoc-updater.key"

# 2. Compilar en src-tauri
cargo tauri build --release

# 3. Obtener instalador firmado
INSTALLER="target/release/bundle/msi/Midoc_${VERSION}_x64.msi"

# 4. Obtener firma del build de Tauri
SIGNATURE=$(cat "target/release/bundle/msi/Midoc_${VERSION}_x64.msi.sig")

# 5. Subir instalador
az storage blob upload \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" \
  --container-name releases \
  --name "Midoc_${VERSION}_x64.msi" \
  --file "$INSTALLER"

# 6. Actualizar manifest.json
cat > manifest.json <<EOF
{
  "version": "$VERSION",
  "notes": "Nueva versión con mejoras de seguridad",
  "pub_date": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "platforms": {
    "windows-x86_64": {
      "signature": "$SIGNATURE",
      "url": "https://midocstorage01.blob.core.windows.net/releases/Midoc_${VERSION}_x64.msi"
    }
  }
}
EOF

# 7. Subir manifiesto
az storage blob upload \
  --account-name "$STORAGE_ACCOUNT" \
  --account-key "$STORAGE_KEY" \
  --container-name releases \
  --name "manifest.json" \
  --file manifest.json \
  --overwrite

echo "✓ Release $VERSION publicado"
```

---

### 2. Restauración contra BD staging

```bash
# 1. Conectarse a PostgreSQL
psql -h midoc-staging-db.postgres.database.azure.com \
     -U postgres -d staging

# 2. Crear BD de staging (si no existe)
CREATE DATABASE staging_test;
\c staging_test

# 3. Restaurar backup cifrado
# (Copiar primero del Storage Account, descifrarlo localmente con SQLCipher)
sqlcipher midoc-backup.db
sqlite> PRAGMA key='frase-del-medico';
sqlite> SELECT COUNT(*) FROM encounters;

# 4. Verificar integridad
sqlite> SELECT * FROM encounters ORDER BY created_at DESC LIMIT 1;
```

---

### 3. Monitoreo de releases

```bash
# Ver historial de releases
az storage blob list \
  --account-name midocstorage01 \
  --account-key <KEY> \
  --container-name releases \
  --query "[].{Name: name, Size: properties.contentLength, Modified: properties.lastModified}" \
  --output table

# Ver manifiestos
curl https://midocstorage01.blob.core.windows.net/releases/manifest.json
```

---

## 💰 Costos estimados (USD/mes)

| Servicio | SKU | Estimado |
|----------|-----|----------|
| Function App | Consumption | ~$0-5 (pay per execution) |
| Storage Account | Standard, 32GB | ~$0.50 |
| PostgreSQL | Standard_B1ms | ~$25-30 |
| **Total** | | **~$25-35** |

---

## 🎯 Checklist de activación

- [x] Function App creada
- [x] Storage Account configurado (releases + backups + CORS)
- [x] Manifiesto JSON listo
- [x] PostgreSQL creándose...
- [ ] Minisign keys generadas (ver MINISIGN-SETUP.md)
- [ ] Certificado de firma generado localmente y cargado como secreto (nunca en el repo)
- [ ] Primer release compilado y subido
- [ ] Tauri updater habilitado en app (tauri.conf.json)
- [ ] Test E2E de actualización
- [ ] Certificado CA para producción

---

## 🔗 Enlaces rápidos

- **Storage Account**: https://portal.azure.com/#@microsoft.onmicrosoft.com/resource/subscriptions/f23c3629-b273-4289-a722-3532c440de54/resourceGroups/midoc-rg/providers/Microsoft.Storage/storageAccounts/midocstorage01
- **Function App**: https://portal.azure.com/#@microsoft.onmicrosoft.com/resource/subscriptions/f23c3629-b273-4289-a722-3532c440de54/resourceGroups/midoc-rg/providers/Microsoft.Web/sites/midoc-releases-func
- **PostgreSQL**: https://portal.azure.com/#@microsoft.onmicrosoft.com/resource/subscriptions/f23c3629-b273-4289-a722-3532c440de54/resourceGroups/midoc-rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/midoc-staging-db

