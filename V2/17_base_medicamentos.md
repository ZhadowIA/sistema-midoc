# Paso 33 — Base de medicamentos: marcas, CNIS y seguridad

Diseño acordado con el dueño el 2026-10-20, antes de programar. Sustituye la definición breve del paso 33 en `10_linea_de_desarrollo.md`, que remite aquí.

## 1. Idea

Una base de referencia de medicamentos que entienda lo que el médico escribe en la receta, sea marca o genérico, y lo desglose en sus principios activos. Cada principio activo se liga a su clave del CNIS y al motor de seguridad. Con ella:

- **La receta lleva las dos formas:** lo que escribió el médico y la denominación genérica con su clave CNIS, para que la farmacia encuentre el medicamento y el FHIR vaya codificado.
- **La revisión de seguridad crece:** interacciones entre medicamentos (motor actual), y además medicamento contra padecimiento (nuevo) y alergias, todo por principio activo, de modo que también cubra marcas y combinaciones.

Principios:

- **El texto del médico manda.** El desglose se muestra antes de firmar y el médico puede corregirlo; nunca se reescribe lo que escribió.
- **Ante la duda, nada.** Sin coincidencia segura no hay desglose ni clave (la misma regla del CNIS en FHIR).
- **Referencia pública, no PHI.** La base va empaquetada en la app, como el CIE-10; la nube nunca ve recetas.

## 2. Modelo

```
Producto comercial        "Tempra 500 mg tabletas": marca, laboratorio, registro COFEPRIS (si se conoce), forma
   └─ Componentes          paracetamol 500 mg (uno o varios)
        ├─ Clave CNIS      producto 010.000.0104 (y envase cuando la receta dice la cantidad)
        └─ Ingrediente     paracetamol: nombre DCI en español, sinónimos y equivalente en las fuentes de interacciones
```

- **Ingrediente canónico** es la pieza central. Todo cuelga de él: CNIS, interacciones, contraindicaciones, alergias.
- **Producto comercial** se desglosa en componentes con su concentración. Una combinación entra completa a la revisión de seguridad.
- **Clave CNIS** según la regla acordada el 2026-10-20 (opción 3): clave de producto (`010.000.XXXX`) cuando se identifica el producto, y clave completa con envase solo si la receta dice la cantidad y ese envase existe. La clave de producto va en un sistema de códigos propio, distinto del de clave completa, porque no es una clave oficial.

## 3. De dónde salen los productos comerciales

Decisión 2026-10-20: **núcleo curado propio** más **altas del médico**.

- **Núcleo curado:** las marcas más recetadas (meta inicial de 500 a 1,000), con su composición verificada contra fuentes públicas (COFEPRIS, información para prescribir) y revisada por el **farmacéutico** del piloto. Crece la tabla de marcas que ya existe (`reference_data/medications.csv`).
- **Altas del médico:** si escribe una marca que la base no conoce, la app le pregunta una vez qué contiene y lo guarda **solo en su computadora** (decisión 2026-10-20). Compartirlas entre médicos queda para después y requeriría otra decisión.
- Una licencia comercial (PLM u otro catálogo) queda descartada por ahora. Se puede reconsiderar con médicos piloto y presupuesto.

## 4. La receta

Ejemplo: el médico escribe "Tempra 500 mg, 1 cada 8 h", y la receta imprime:

> **Tempra 500 mg** — 1 cada 8 h
> Paracetamol 500 mg tableta · CNIS 010.000.0104

- Va en el PDF y en el FHIR (`medicationCodeableConcept` con el texto del médico más las codificaciones).
- Según el Reglamento de Insumos para la Salud (art. 31, a confirmar en el texto vigente del DOF), en medicamentos genéricos intercambiables la receta debe llevar la denominación genérica y puede llevar la distintiva. La doble forma lo cumple aunque el médico escriba solo la marca.

## 5. Seguridad

Todo por ingrediente:

| Revisión | Estado | Fuente |
|---|---|---|
| Medicamento contra medicamento | Existe (paso de seguridad determinista), base chica | ONChigh/DDInter y la base actual; se amplía con la nueva capa de ingredientes |
| Medicamento contra alergias | Existe | Mejora al conocer los componentes de cada marca |
| Duplicidad terapéutica | Existe | Mejora con marcas y combinaciones |
| Medicamento contra padecimiento | **Nuevo** | Los apartados "Contraindicaciones y Precauciones" e "Interacciones" del propio CNIS, estructurados y ligados a CIE-10 |

- La extracción de reglas desde el texto del CNIS puede apoyarse en IA, pero **cada regla entra a la base solo tras la revisión del médico piloto y el farmacéutico** (decisión 2026-10-20). Cada regla guarda su fuente y quién la revisó.
- **Alertas** (decisión 2026-10-20): las graves piden que el médico confirme antes de firmar y la confirmación queda en la bitácora; las demás solo avisan. Nunca bloquean definitivamente: decide el médico.
- Los padecimientos del paciente salen de sus diagnósticos CIE-10 y de sus antecedentes estructurados.

## 6. Regulatorio (revisado 2026-10-20, sin resolver)

- La **Guía para la obtención del registro sanitario de dispositivos médicos** de COFEPRIS ya incluye la categoría **software como dispositivo médico (ScDM)**, tomada del Suplemento para Dispositivos Médicos de la FEUM 5.0. La define como software "utilizado con uno o más propósitos médicos" que funciona en plataformas generales. La propia guía reconoce que la categoría aún no está en la Ley General de Salud. Cuando aplica, pide registro sanitario con clasificación de riesgo, validación técnica y clínica, ciclo de vida y ciberseguridad.
- Entre las finalidades de un dispositivo médico están la prevención y el auxilio en el tratamiento de enfermedades. Un aviso de interacciones o contraindicaciones **podría** caer ahí. Un expediente que solo registra probablemente no.
- No se encontró en México un criterio publicado que exima al software de apoyo a decisiones clínicas (como el de la FDA para software que el profesional puede revisar de forma independiente). Tampoco hay una guía específica de COFEPRIS sobre ese tipo de software.
- **Esto toca también la revisión de interacciones que ya existe**, no solo la etapa nueva.
- **Antes de lanzar las etapas 4 y 5 al público** (y conviene antes de vender con la revisión actual): consulta con un especialista regulatorio o con COFEPRIS sobre si MiDoc o su módulo de seguridad requiere registro, y en qué clase. Mientras tanto, el diseño ya favorece una postura defendible: avisos para el profesional, con su fuente visible, que él revisa y decide.

## 7. Separar lo regulado para poder lanzar antes (decision 2026-10-20)

Mientras no haya respuesta de COFEPRIS, todo lo que **avisa al médico sobre la seguridad** de un medicamento queda tras un interruptor de capacidad (`capability flag`), apagado en el instalador que se venda: la revisión de interacciones que ya existe, las alergias, la duplicidad y, cuando llegue, medicamento contra padecimiento. Igual que los módulos congelados del reenfoque: apagado, nunca borrado.

Cómo quedó (2026-10-20, rama `v2/interruptor-seguridad-farmaco`):

- El interruptor lo fija Rust al compilar: `MIDOC_MEDICATION_SAFETY=on` lo enciende; sin esa variable, o con cualquier otro valor, va apagado.
- Con el interruptor apagado, los comandos de la revisión se niegan a correr aunque alguien los llame, no solo se ocultan: verificar la receta, extraer sus medicamentos para verificarlos, y ver, importar o actualizar la base de interacciones.
- La interfaz pregunta a Rust (`get_capabilities`) y oculta la verificación en la consulta y la pantalla "Medicamentos". Si no puede saberlo, la deja apagada.
- Para encenderla basta compilar con la variable y publicar la versión. Llega a los equipos como una actualización normal, sin reinstalar. Ojo: los equipos con las actualizaciones de su licencia vencidas no la recibirían. Si eso importa al llegar la respuesta, la alternativa es que la licencia firmada traiga la capacidad.
- En el navegador de desarrollo, `?mockSeguridad=1` la enciende.

Lo que **no** queda tras el interruptor, porque solo registra o describe y no sugiere conductas clínicas: el CNIS, el desglose de marcas a genérico, la receta con doble denominación y el FHIR codificado. Así las etapas 1 a 4 pueden salir con la app y las 5 en adelante esperan la consulta.

## 8. Etapas

1. **CNIS confiable** (entregada 2026-10-20, rama `v2/cnis-etapa1`): grupos 010 a 040, nombres con notas ("AMOXICILINA (Acceso)"), alternativas con su propia concentración, la columna de indicaciones fuera de la descripción, claves que van antes de su descripción, unidades por envase y la opción 3 (producto siempre que se identifique; clave completa con un solo envase o con la cantidad escrita). `correcciones.csv` con motivo y revisor obligatorios, y comparación contra la tabla anterior al regenerar. Filas completas: de 999 a 1,601 (1,224 productos). En 30 recetas comunes: producto en 20 y clave completa en 15 (antes 13).
2. **Ingredientes canónicos** (entregada 2026-10-20, rama `v2/ingredientes-canonicos`): `scripts/ingredients` arma `ingredients.csv` con 1,025 ingredientes (1,004 del CNIS). Liga sola, por nombre exacto, 68 con la base de interacciones. Las variantes y marcas de esa base quedan en `por-revisar.csv` hasta que el farmacéutico las pase a `sinonimos.csv` con motivo y revisor. Lo usan el FHIR (una línea abre medicamento si nombra un ingrediente: en 30 recetas comunes pasa de 17 a 30), el CNIS (sinónimos revisados) y la revisión de seguridad (nombres que la base no tiene con esa escritura). La tabla del CNIS ahora guarda el nombre con acentos y desinvierte las sales ("ISOSORBIDA, DINITRATO DE" → "Dinitrato de isosorbida").
3. **Productos comerciales** (entregada 2026-10-22, rama `v2/marcas-medicamentos`): `scripts/brands` valida el núcleo curado (`marcas.csv`: marca, ingredientes, laboratorio, fuente y revisor obligatorios) contra el catálogo de ingredientes y genera `brands.csv`. Arranca vacío: lo llena el farmacéutico desde `por-revisar.csv`. Altas del médico: si una línea de la receta escribe una dosis con un nombre que la app no conoce, la consulta pregunta "¿Qué contiene?" con un buscador de principios activos y lo guarda en `local_brands` (solo en su base cifrada, nunca se sincroniza); se revisan y borran en Mis datos > Mis marcas. Las marcas, del núcleo o del médico, cuentan para el FHIR (la línea abre medicamento) y para la revisión de seguridad (sus ingredientes). La marca → CNIS en la receta impresa es de la etapa 4.
4. **Receta con doble denominación** (entregada 2026-10-25, rama `v2/receta-doble-denominacion`): `prescription.rs` analiza cada línea que nombra un medicamento (genérico, ingrediente o marca del núcleo o del médico) y da sus principios activos y, si la coincidencia es exacta, la denominación del CNIS con su clave; una marca de un solo principio activo se busca en el CNIS como su genérico ("Tempra 500 mg" → paracetamol 500 mg). El PDF agrega bajo "Receta" el bloque "Denominación genérica" ("Fictimed → Paracetamol 500 mg tableta · CNIS 010.000.0104.00"), solo con lo que agrega información; el FHIR usa el mismo análisis (las marcas también se codifican, con la denominación como `display`). En la consulta, "Así saldrá en la receta" lo muestra antes de firmar. Lo escrito por el médico no cambia. Dos marcas en una línea no se adivinan; una combinación lista sus principios activos sin clave.
5. **Medicamento contra padecimiento** con CIE-10 y reglas revisadas; alertas graves con confirmación.
6. **Mantenimiento:** el CNIS con cada publicación del DOF y el núcleo de marcas con revisión periódica.

## 9. Cómo se guarda el CNIS

La app **no lee el PDF**. Un script corre una vez por edición, fuera de la app, y convierte el PDF a una tabla (`reference_data/cnis.csv`) que va empaquetada; la app solo lee esa tabla. Desde la etapa 1, esa tabla es la fuente de verdad versionada en el repositorio:

- Lo que el lector automático no puede leer se completa en un archivo de correcciones escrito a mano y revisado.
- Con una edición nueva, el script genera la tabla y se revisa la diferencia contra la anterior antes de aceptarla. Así las correcciones no se pierden y cada cambio queda visible en el PR.
