# 15 - Modelo de negocio: compra unica + creditos de IA (2026-10-06)

Decision del usuario del 2026-10-06. Sustituye la suscripcion obligatoria que suponian `14_reenfoque_expediente_ia.md` (seccion 5, "Modelo de negocio") y el paso 29 de `10_linea_de_desarrollo.md`. Local-first y las reglas de residencia no cambian.

## 1. Decision

MiDoc se vende como **programa de compra unica**. El medico es dueno de su herramienta: el expediente, las recetas, la exportacion y la transcripcion local funcionan sin pagar nada mas. La **principal fuente de ingreso son los creditos de IA**, que son el unico costo variable real del producto (proveedores de IA en la nube).

Motivo: la arquitectura local-first no genera costo de servidor por consulta; cobrar mensualidad por eso se siente como renta de algo que el medico ya deberia poseer. La IA en la nube si cuesta por uso, asi que cobrarla por uso alinea ingreso y costo. Ademas, "la compras una vez y es tuya" diferencia a MiDoc frente a la competencia por suscripcion.

## 2. Que incluye cada cosa

| Pieza | Que es | Como se paga |
|---|---|---|
| Licencia | La app completa sin IA en la nube: expediente, consulta SOAP, plantillas, odontograma, receta, seguridad de medicacion determinista, documentos, busqueda, exportacion (PDF/FHIR/CSV) y transcripcion **local** (Whisper en el equipo). | Pago unico. |
| Actualizaciones | Nuevas versiones durante **12 meses** desde la compra. Al terminar, la ultima version recibida es del medico **para siempre** (modelo "fallback license" tipo JetBrains/Sketch). | Incluidas el primer ano; renovacion opcional despues. |
| Parches criticos | Seguridad y cambios obligatorios por norma (NOM-004, NOM-024, catalogos oficiales) dentro de un periodo de soporte razonable, aunque no se renueven actualizaciones. | Sin costo. El periodo exacto queda por definir. |
| Creditos de IA | Escriba, redaccion asistida, anamnesis asistida, notas dentales por IA y transcripcion en la nube. | Recargas que **no caducan** y, opcional, un plan mensual con X creditos para quien usa mucho. |
| Creditos de cortesia | Una dotacion al comprar para que el medico pruebe la IA. | Incluidos en la compra. |

## 3. Consecuencias tecnicas

1. **Licencia firmada que funciona sin conexion.** Se activa una vez con conexion (vinculando la cuenta); el portal entrega una licencia firmada (por ejemplo Ed25519) que la app verifica localmente sin internet. Despues de activar, todo lo que no es IA en la nube funciona **sin conexion indefinidamente**, aunque MiDoc deje de existir. La licencia dice hasta cuando corresponden actualizaciones; la app no se apaga al vencer, solo deja de ofrecer versiones nuevas.
2. **La vinculacion ya no es requisito para usar la app**, solo para activar, para los creditos de IA y para actualizaciones. Esto **reemplaza** la decision del 2026-10-06 de que "la app requiere estar vinculada para verificar la suscripcion". El nombre y la cedula del medico siguen bajando del portal (al activar y al sincronizar) y quedan guardados en el equipo.
3. **El paso 29 se rehace**: deja de ser "suscripcion y capacidades" y pasa a ser licencia + activacion + creditos. El gating por capacidad del paso 12 se reduce a: tener licencia valida (local) y tener creditos (servidor, en la pasarela de IA del paso 30).
4. **Los creditos viven en el servidor** y se descuentan en la pasarela de IA (paso 30). No se pueden piratear; una copia pirata de la app base cuesta poco al negocio.
5. **Pagos**: compra unica, renovacion de actualizaciones, recargas y plan mensual de creditos. Cada cobro requiere CFDI.

## 4. Riesgos y como se atienden

| Riesgo | Respuesta |
|---|---|
| Ingreso concentrado en IA: quien nunca la usa solo paga una vez. | Creditos de cortesia para probarla, IA realmente util y comoda, y renovacion de actualizaciones a precio razonable. |
| Costos recurrentes sin ingreso recurrente (normas, catalogos, Windows/WebView2, firma de codigo, soporte). | Las actualizaciones despues del primer ano se renuevan aparte; los parches criticos tienen un periodo de soporte acotado. |
| Pirateria de la app base. | Se acepta: el ingreso principal (creditos) es de servidor. |
| PROFECO y creditos prepagados que caducan. | Las recargas no caducan; solo los creditos del plan mensual pueden caducar o acumularse con tope, avisado claramente. |
| Fiscal: CFDI y reconocimiento de ingreso. | Revisar con contador antes de lanzar: CFDI por cada cobro y creditos como ingreso diferido hasta su uso. |

## 5. Pendiente de decidir

- Precios: licencia, renovacion de actualizaciones, paquetes de creditos y plan mensual (se puede investigar a la competencia en Mexico para tener referencias).
- Cuantos equipos por licencia (por ejemplo consultorio + casa).
- Duracion del periodo de parches criticos sin renovacion.
- Equivalencia de creditos por tarea de IA (el catalogo de creditos del portal ya existe en `services/ai/ai-credits.ts`).
