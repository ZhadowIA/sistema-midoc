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

## 5. Propuesta de precios (investigacion del 2026-10-18)

Referencias del mercado, con cifras de blogs comerciales y sitios de proveedores que no siempre coinciden; verificarlas antes de fijar precios:

| Producto | Modelo | Precio aproximado |
|---|---|---|
| Expedientes en Mexico (Nimbo, Medisel, HuliPractice, Mi-Consultorio, GestMedica, SaludTotal) | Suscripcion mensual por medico | 180 a 800 MXN al mes; lo comun, 300 a 650 MXN |
| Doctoralia Pro | Suscripcion (visibilidad y agenda) | 1,230 a 1,950 MXN al mes + IVA |
| Dentalink | Suscripcion (odontologia) | desde 29 USD al mes |
| Escribas con IA (Freed, Heidi, Nabla) | Suscripcion mensual | 39 a 119 USD al mes por medico (unos 700 a 2,200 MXN); Heidi tiene plan gratuito |
| Licencia perpetua | Casi no se ofrece en Mexico; solo sistemas antiguos, con mantenimiento anual opcional | sin precios publicos |

Lectura: no hay competencia directa de pago unico con expediente local e IA. El medico compara contra 300 a 650 MXN al mes por el expediente y, por separado, contra escribas que cuestan 10 a 20 veces mas en dolares.

Propuesta inicial, a validar con medicos piloto:

- **Licencia**: 5,990 MXN (IVA incluido), 2 equipos, 12 meses de actualizaciones. Equivale a unos 12 a 18 meses de una suscripcion de gama media; a partir de ahi, el medico ahorra.
- **Renovacion de actualizaciones**: 1,490 MXN al ano (alrededor del 25 % de la licencia), opcional.
- **Creditos de IA**: alrededor de 2.50 MXN por credito en recargas sin caducidad (paquetes de 100 por 290 MXN y de 500 por 1,190 MXN). Con el catalogo actual (`services/ai/ai-credits.ts`), una consulta con IA en la nube cuesta de 2 a 4 creditos: de 5 a 10 MXN por consulta.
- **Plan mensual de creditos**: 449 MXN al mes con 250 creditos (60 a 120 consultas con IA), por debajo de cualquier escriba con IA y del orden de un expediente mexicano de gama media.
- **Costo del proveedor**: un borrador de texto con un modelo rapido cuesta centavos de dolar y la transcripcion en nube, centavos por minuto. Recalcular el margen con las tarifas reales del proveedor elegido (paso 30) antes de publicar.

Fuentes: comparativas de Medesk, Huli, Turnito, Mi-Consultorio, SaludTotal y Astramedik (expedientes); Freed, Keragon, Pabau, Clairemed y Clunic (escribas con IA).

## 5.1 Pendiente de decidir

- Precios: licencia, renovacion de actualizaciones, paquetes de creditos y plan mensual (se puede investigar a la competencia en Mexico para tener referencias).
- Cuantos equipos por licencia (por ejemplo consultorio + casa).
- Duracion del periodo de parches criticos sin renovacion.
- Equivalencia de creditos por tarea de IA (el catalogo de creditos del portal ya existe en `services/ai/ai-credits.ts`).
