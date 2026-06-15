# Landing paciente con busqueda de medico

Fecha: 2026-06-14  
Estado: aprobado para especificacion, pendiente de plan de implementacion  
Superficie: `V2/consultorio-app`, ruta publica `/`

## Objetivo

Convertir la home actual, que hoy comunica estado tecnico del proyecto, en una landing publica orientada al paciente. La primera tarea del visitante sera encontrar a su medico por nombre, ciudad o especialidad y llegar al perfil publico para agendar.

La pagina tambien debe ofrecer una entrada secundaria para medicos nuevos, sin competir con la busqueda del paciente.

## Decisiones aprobadas

- Direccion visual elegida: paciente primero.
- Estructura elegida: hero con buscador simple como accion central.
- La busqueda debe aceptar nombre del medico, ciudad y especialidad desde el primer lanzamiento.
- La home debe explicar brevemente MiDoc para pacientes y medicos, pero sin convertirse en una landing comercial larga.

## Principios de producto y privacidad

MiDoc V2 es local-first. Esta landing pertenece al portal nube y solo puede operar con informacion publica u operativa.

La busqueda solo debe listar medicos con perfil publico publicado. Los resultados deben exponer unicamente:

- Nombre profesional.
- Especialidad publica.
- Ciudad y estado configurados en el perfil.
- Foto de perfil si existe.
- Servicios activos resumidos.
- Enlace a `/perfil/[slug]`.

La busqueda no debe exponer:

- Datos clinicos.
- Pacientes, citas individuales o disponibilidad granular fuera del perfil publico.
- Metadatos internos de suscripcion, auditoria, sincronizacion o seguridad.
- Medicos sin perfil publico usable.

## Experiencia de usuario

La home abre con una navegacion sobria:

- Marca `MiDoc`.
- Enlace a portal del paciente.
- Enlace `Soy medico` hacia registro o login medico.

El hero contiene:

- Titulo orientado a tarea: `Encuentra a tu medico y agenda tu consulta`.
- Texto de apoyo breve: busqueda por nombre, ciudad o especialidad; agenda desde el perfil del medico; recordatorios por SMS/correo.
- Campo de busqueda con label real, no solo placeholder.
- Boton primario `Buscar medico`.

Comportamiento esperado:

1. El paciente escribe una consulta.
2. El sistema busca contra medicos publicados.
3. Los resultados aparecen en la ruta dedicada `/buscar`, conservando el termino.
4. Cada resultado permite abrir el perfil publico del medico.
5. Desde el perfil existente, el paciente agenda usando el flujo actual.

La home debe redirigir a `/buscar` con query params, por ejemplo `/buscar?q=...`. Esto mantiene la home ligera, permite compartir resultados y preserva el estado al volver desde un perfil.

## Estados requeridos

La busqueda debe tener estados completos:

- Inicial: ejemplos discretos de busqueda, como `Medicina general en Chihuahua`.
- Loading: skeleton de resultados, no spinner aislado.
- Resultados: lista escaneable con nombre, especialidad, ciudad, servicios resumidos y CTA `Ver perfil`.
- Vacio: mensaje util, por ejemplo revisar escritura, ciudad o pedir al consultorio su enlace.
- Error: mensaje claro con accion de reintento.

Los estados no deben registrar ni mostrar contenido sensible. La query de busqueda es operativa y debe tratarse como texto publico de busqueda, no como dato clinico.

## Arquitectura propuesta

Agregar un servicio de dominio en `src/services/doctor/doctor-search-service.ts` para centralizar el query publico. La UI y los route handlers no deben consultar Prisma directamente.

Agregar endpoint publico:

- `GET /api/public/doctors?q=&city=&specialty=`

El endpoint debe:

- Validar query params con Zod.
- Limitar longitud de busqueda.
- Aplicar paginacion o limite inicial.
- Devolver solo el DTO publico necesario.
- No loggear el texto buscado con contenido de usuario si el logger no esta gobernado para datos de entrada.

Agregar una pagina de busqueda:

- `/buscar` usa parametros en URL, para compartir resultados y preservar estado al volver.
- La home `/` contiene el formulario principal y no muestra resultados destacados en esta iteracion.

## Visual y contenido

Registro visual: producto clinico sobrio, no wellness ni SaaS generico.

Usar el sistema existente:

- Public Sans.
- Fondo blanco puro `--bg`.
- Superficies `--surface`.
- Tinta `--ink`.
- Cobalto `--primary` solo para accion, seleccion y focus.
- Radios existentes: 6px controles, 10px paneles.

Evitar:

- Gradientes pastel.
- Ilustraciones blandas de salud.
- Glassmorphism.
- Tarjetas repetidas con icono, titulo y texto como estructura principal.
- Promesas que impliquen custodia permanente de expediente clinico en la nube.
- WhatsApp como canal de producto.

La seccion posterior al hero debe ser breve:

1. Para pacientes: buscar medico, revisar perfil, agendar.
2. Para medicos: publicar perfil, servicios y horarios.
3. Privacidad local-first: portal para agenda y notificaciones; expediente clinico cifrado en el equipo del medico.

## Accesibilidad y responsivo

- Mobile-first.
- Campo y boton con al menos 44px de alto.
- Labels visibles y `aria-describedby` para ayuda/error.
- Focus visible usando el token actual.
- Contraste AA en texto normal y estados.
- Navegacion por teclado completa.
- En mobile, el buscador ocupa ancho completo y los resultados se apilan.
- En desktop, el hero tendra composicion asimetrica, pero el buscador queda visualmente dominante.
- Respetar `prefers-reduced-motion`.

## Pruebas y validacion

Pruebas unitarias del servicio:

- Devuelve solo perfiles publicados.
- Busca por nombre profesional.
- Busca por ciudad.
- Busca por especialidad.
- No devuelve campos privados.
- Maneja query vacia o demasiado larga.

Pruebas de endpoint:

- Camino feliz con resultados.
- Resultado vacio.
- Rechazo de parametros invalidos.

Verificacion manual:

- Home en desktop y mobile.
- Busqueda con resultado, sin resultado y error simulado.
- Abrir resultado lleva a `/perfil/[slug]`.
- No hay datos clinicos en respuesta ni consola.

Antes de cerrar implementacion:

```bash
npm run test
npm run lint
npm run build
```
