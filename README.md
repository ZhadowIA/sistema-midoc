# Sistema MiDoc

Plataforma para consultorios medicos. El repositorio contiene dos generaciones del sistema:

```text
Sistema MiDoc/
├── V1/   # Sistema anterior (Next.js SaaS + bot WhatsApp). Congelado, solo referencia.
└── V2/   # Sistema en desarrollo: app de escritorio local-first + portal nube.
```

## V2 (activo)

V2 es un rediseño local-first: los datos clinicos viven cifrados en el ordenador del medico (app de escritorio Tauri 2 + SQLite cifrado) y la nube solo opera agenda publica, buzon temporal, notificaciones SMS/correo y suscripcion (portal Next.js).

- Punto de entrada documental: `V2/README.md`
- Contexto y arquitectura: `V2/01_contexto_v2.md`
- Linea de desarrollo: `V2/10_linea_de_desarrollo.md`
- Inventario funcional heredado de V1: `V2/12_inventario_funcional_v1.md`
- Reglas obligatorias de desarrollo: `V2/REGLAS_DESARROLLO.md`

## V1 (congelado)

V1 no se mantiene ni se despliega; se conserva como referencia de reglas de negocio para la reimplementacion. Su documentacion vive en `V1/consultorio-app/docs/` (indice: `INDICE_DOCUMENTACION.md`).
