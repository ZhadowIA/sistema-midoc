# Paso 9 — Drill de restauración del respaldo cifrado

Objetivo: demostrar, con evidencia capturada, que un respaldo cifrado de la base
clínica local se puede restaurar y que el contenido clínico (expediente,
encuentros, notas firmadas) sobrevive intacto. Sin esto no hay piloto real
(compuerta del paso 9: "No hay piloto real sin backups probados").

## Cómo funciona el respaldo

- Toda la base clínica vive cifrada con SQLCipher en el equipo del médico
  (`app_data/midoc.db`). La frase de seguridad nunca se persiste.
- En cada desbloqueo, la app crea un respaldo cifrado automático en
  `app_data/backups/midoc-<timestamp>.db` (`create_encrypted_backup`, vía
  `VACUUM INTO`). El respaldo queda cifrado con la misma frase del médico.
- Restaurar = abrir el archivo de respaldo con la frase correcta. No requiere
  herramientas externas ni descifrado manual.

## Drill automatizado (reproducible)

El guion ejecutable vive en `desktop-app/src-tauri/src/restore_drill.rs`. Siembra
un expediente real (cita → encuentro → nota SOAP firmada), crea el respaldo,
**borra la base de origen** (pérdida total simulada), restaura desde el respaldo
y verifica que el contenido clínico volvió. Correr y capturar evidencia:

```bash
cd V2/desktop-app/src-tauri
cargo test --lib restore_drill -- --nocapture
```

### Evidencia capturada (2026-06-11)

```text
===== DRILL DE RESTAURACION (paso 9) =====
fecha (UTC):       2026-06-11T18:36:14.558339200+00:00
1) base de origen creada y poblada
   esquema:        v5
   citas:          1
   pacientes:      1
   encuentros:     1
   notas:          1
2) respaldo cifrado creado
   tamano:         110592 bytes
   cabecera (hex): 4133fb9e662951a6832de856e203d326
   (no es 'SQLite format 3\0' => cifrado en disco)
3) perdida simulada: base de origen eliminada
4) restauracion verificada desde el respaldo
   esquema:        v5
   citas:          1
   encuentros:     1
   notas:          1
   encuentro:      5f9bec71-9a67-41f2-9a4a-1bbae93116f0
   estado nota:    SIGNED
   diagnostico:    Lumbalgia
5) frase incorrecta rechazada: true
===== DRILL OK: contenido clinico recuperado =====

test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 27 filtered out
```

Interpretación de la evidencia:

- **Cabecera hex distinta de `53514c69746520666f726d6174203300`** (`"SQLite format 3\0"`): el respaldo está cifrado en disco, no es SQLite en claro.
- **Esquema v5 antes y después**, mismos conteos: la base se restauró completa.
- **`estado nota: SIGNED` y `diagnostico: Lumbalgia`**: el expediente firmado sobrevivió bit a bit.
- **`frase incorrecta rechazada: true`**: el respaldo no se abre sin la frase del médico. En la salida aparece justo antes un `ERROR ... hmac check failed` de SQLCipher: es **esperado** (es el rechazo de la frase incorrecta), no un fallo del drill.

## Drill manual contra una base de staging

Para validar con una base real (no la sembrada por el test):

1. Localizar el respaldo más reciente en `app_data/backups/` (el de mayor timestamp).
2. Copiarlo a una carpeta de trabajo aislada (no tocar el original).
3. Abrirlo con la frase del médico. Vía la app: apuntar una instancia de prueba a la copia y desbloquear. Vía CLI de SQLCipher: `PRAGMA key='<frase>'; SELECT count(*) FROM encounters;`.
4. Verificar contra una referencia conocida: conteo de encuentros/notas y un diagnóstico esperado del último expediente.
5. Confirmar que con una frase incorrecta el archivo no abre (`NotADatabase`).
6. Capturar la salida (recortes de pantalla o copia de texto) y archivarla con fecha.

Criterio de aprobación: los conteos y el contenido de muestra coinciden con la referencia, y la frase incorrecta es rechazada.

## Relación con la auto-actualización y el rollback

El respaldo automático en cada desbloqueo es también la red de seguridad ante una
actualización defectuosa: antes de aplicar cualquier versión nueva existe un
respaldo cifrado reciente. Ver `paso-9-actualizacion-tauri.md` para el
procedimiento de rollback.

## Cobertura automatizada relacionada

- `db::tests::backup_is_encrypted_and_restorable_with_correct_key`
- `db::tests::backup_rejects_wrong_restore_key`
- `restore_drill::restore_drill_recovers_clinical_data_with_evidence` (este drill)
