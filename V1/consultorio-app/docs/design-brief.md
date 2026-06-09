# MiDoc - Brief de diseno UI/UX para rediseno

Estado: Referencia de diseno  
Ultima actualizacion: 2026-04-15  
Referencia funcional: `docs/SISTEMA_ACTUAL.md`  
Notas: este documento guia decisiones visuales y de experiencia; no reemplaza la documentacion tecnica de backend/API.

> Este documento esta orientado a una IA generadora de interfaces. Describe pantallas, flujos de usuario, componentes clave y lineamientos visuales para producir un rediseno coherente con la funcionalidad del sistema.

---

## 🎨 Sistema de Colores Actual

### Paleta principal (Light Mode)

| Token | Hex | Uso |
|---|---|---|
| `background` | `#FDFCFA` | Fondo general de la app — crema muy claro, casi blanco cálido |
| `foreground` | `#2C2A27` | Texto principal — marrón oscuro |
| `card` | `#FFFFFF` | Fondo de tarjetas y paneles |
| `primary` | `#C9A55A` | Color de acento principal — **dorado cálido** |
| `primary-hover` | `#B89349` | Estado hover del color primario |
| `secondary` | `#F5F1EB` | Fondo de secciones secundarias — beige claro |
| `muted` | `#E8E4DD` | Fondos terciarios, bordes suaves |
| `muted-foreground` | `#6B6862` | Texto secundario / hints / placeholders |
| `border` | `#E0DCD3` | Bordes de tarjetas e inputs |
| `input-background` | `#F9F7F4` | Fondo de campos de formulario |

### Colores de estado

| Token | Hex | Uso |
|---|---|---|
| `success` | `#5B9279` | Verde salvia — confirmaciones y estados exitosos |
| `warning` | `#D4A055` | Ámbar — alertas no críticas |
| `destructive` | `#C94A4A` | Rojo apagado — errores, cancelaciones, alérgicos |

### Colores de agenda

| Token | Hex | Uso |
|---|---|---|
| `available` | `#F5F1EB` | Franja disponible (fondo beige) |
| `occupied` | `#C9A55A` | Franja con cita (dorado) |
| `blocked` | `#6B6862` | Franja bloqueada (gris marrón) |
| `private` | `#E8E4DD` | Reserva privada interna |

### Tipografía

- **Fuente:** Sistema (sans-serif nativa del OS)
- **Base:** 16px
- **Pesos usados:** 400 (normal), 500 (medium), 600 (semibold)
- **Headings:** `font-weight: 500` (medium — deliberadamente más suave que bold)
- **Radio de bordes:** `0.75rem` (12px) — bordes redondeados consistentes

### Sensación visual actual

> Cálida, profesional, con toques de lujo discreto. El dorado evoca confianza y exclusividad sin saturar. El fondo crema reduce la fatiga visual. No hay colores fríos (azules, grises puros) en la paleta principal.

---

## 👤 Roles de Usuario

El sistema tiene **dos tipos de usuario** con experiencias completamente separadas:

### 1. Paciente (usuario final)
Accede desde la app pública. Puede ser:
- **Invitado** — no tiene cuenta, solo agenda con nombre, teléfono y fecha de nacimiento
- **Registrado** — tiene cuenta vinculada, puede ver su historial de citas

### 2. Médico (usuario interno)
Accede a un panel administrativo protegido. Gestiona agenda, pacientes y expedientes.

---

## 📱 Pantallas del Sistema

---

### PANTALLAS PÚBLICAS (para el Paciente)

---

#### P1 — Página de perfil del médico (Landing)
**URL:** `/` o `/?slug=dr-nombre`

**Propósito:** Página de presentación pública del médico. Primer contacto del paciente.

**Contenido:**
- Foto de perfil del médico (círculo grande)
- Nombre y especialidad
- Biografía corta
- Botón CTA principal: **"Agendar Cita"** → lleva a `/agendar`
- Precios de consulta normal y extendida (si están configurados)

**Experiencia:** El paciente llega aquí desde un link compartido por el médico. Debe transmitir confianza en segundos.

---

#### P2 — Flujo de Agendado (Wizard)
**URL:** `/agendar` o `/agendar?doctor=dr-nombre`

Wizard lineal de **7 pasos**. Cada paso ocupa una sola pantalla. El progreso se muestra con un indicador de pasos en la parte superior con íconos (candado, usuario, documento, calendario, reloj, usuario, check).

---

##### P2.1 — Paso: Cuenta
**Tres estados posibles:**

**Estado A — Bienvenida (sin sesión)**
- Título: "Bienvenido"
- Subtítulo explicativo
- Botón primario: "Iniciar Sesión" (dorado)
- Botón secundario: "Crear una cuenta" (beige)
- Separador "o"
- Botón terciario: "Continuar como Invitado" (texto simple)

**Estado B — Formulario de login**
- Inputs: Correo, Contraseña
- Botón: "Entrar"
- Link: "¿No tienes cuenta? Regístrate aquí"
- Botón: "Volver"

**Estado C — Formulario de registro**
- Inputs: Nombre, Correo, Contraseña, Confirmar contraseña
- Botón: "Crear cuenta y continuar"
- Link: "¿Ya tienes cuenta? Inicia sesión"
- Botón: "Volver"

**Estado D — Sesión activa**
- Ícono de check verde grande
- "Has iniciado sesión"
- Opciones: "Continuar con esta cuenta" / "Agendar sin vincular" / "Cerrar sesión"

---

##### P2.2 — Paso: Médico *(solo si no viene por slug directo)*
- Grid de tarjetas de médicos (2 columnas en desktop)
- Cada tarjeta: foto, nombre, especialidad
- Al seleccionar → borde dorado + fondo ligero

---

##### P2.3 — Paso: Tipo de consulta
- Dos opciones tipo radio card:
  - **"Consulta Normal"** — Revisión habitual / Chequeo
  - **"Primera Vez / Integral"** — Mayor duración y revisión especializada
- La seleccionada resalta con borde dorado

---

##### P2.4 — Paso: Fecha
- Navegador mensual: `< Abril 2026 >`
- Grid 7 columnas: Lun | Mar | Mié | Jue | Vie | Sáb | Dom
- **Días disponibles:** resaltados con fondo dorado suave (`primary/10`), texto dorado, hoverable
- **Días sin horario / pasados:** texto gris desvanecido, no clickeables
- **Día de hoy:** aro/ring alrededor del número
- **Día seleccionado:** fondo dorado sólido, texto blanco
- Footer con leyenda: cuadro de muestra + "Con disponibilidad" + estado de carga
- Al seleccionar un día → avanza automáticamente al siguiente paso

---

##### P2.5 — Paso: Horario
- Texto: "Disponibilidad para: [día, dd de mes]"
- Grid de chips de hora: 3 columnas en móvil, 5 en desktop
- Cada chip: muestra hora en formato `HH:mm`
- Estado: disponible (borde dorado), seleccionado (fondo dorado), no disponible (gris)
- Si no hay horarios: mensaje vacío + botón "Probar otro día"

---

##### P2.6 — Paso: Datos del Paciente
- Formulario de 4 campos:
  - Nombre completo (ancho completo)
  - Teléfono
  - Fecha de nacimiento (date picker nativo)
  - Correo electrónico **(opcional)**
- Si el usuario tiene sesión activa: campos prellenados, editables

---

##### P2.7 — Paso: Confirmar
- Tarjeta de resumen con borde izquierdo dorado:
  - Fecha y hora de la cita (fuente grande)
  - Nombre del paciente
  - Teléfono + fecha de nacimiento
- Botón grande: "Confirmar Reserva"

---

#### P3 — Confirmación de Cita
**URL:** `/confirmacion`

- Animación de check completado
- "¡Tu cita fue reservada!"
- Detalles de la cita resumidos
- Si aplica: "También te enviamos un cuestionario por WhatsApp"

---

#### P4 — Cuestionario Pre-clínico
**URL:** `/cuestionario/[token]`

Wizard de **3 pasos** en una página limpia sin navegación del médico.

**Paso 1 — Síntomas**
- Título: "¿Qué te trae hoy?"
- Grid de chips/tarjetas de síntomas seleccionables (multi-selección):
  - Dolor, Fiebre, Tos, Problemas digestivos, Dificultad respiratoria, Piel, Otro
- Cada chip puede tener un ícono descriptivo

**Paso 2 — Preguntas específicas** *(según síntoma elegido)*
- 4–8 preguntas relevantes al síntoma
- Tipos de input: selección única, escala 0–10, texto libre
- Ejemplos: "¿Dónde sientes el dolor?", "¿Desde hace cuánto?", "¿Qué tan intenso del 1 al 10?"

**Paso 3 — Datos básicos**
- Confirmación del nombre del paciente
- Enviar respuestas

---

### PANTALLAS DEL MÉDICO (Panel Interno)

Todas las pantallas del médico tienen una **barra lateral izquierda** (sidebar) con navegación y una **área de contenido principal** a la derecha.

**Sidebar contiene:**
- Logo / nombre del consultorio
- Avatar del médico
- Ítems de navegación: Dashboard, Agenda, Pacientes, Configuración
- Indicador de estado WhatsApp (punto verde/rojo)
- Botón de cerrar sesión

---

#### M1 — Login del Médico
**URL:** `/medico/login`

- Pantalla centrada, limpia
- Logo o nombre del sistema
- Formulario: Correo, Contraseña
- Botón: "Iniciar Sesión"
- No tiene registro público (los médicos son registrados por un admin)

---

#### M2 — Dashboard
**URL:** `/medico/dashboard`

- Tarjetas de resumen del día:
  - Total de citas hoy
  - Citas pendientes / confirmadas / completadas
  - Citas canceladas
- Lista cronológica de citas del día con chip de estado y nombre del paciente
- Acceso rápido: "Ver detalle" de cada cita

---

#### M3 — Agenda (vista de día)
**URL:** `/medico/agenda`

- Filtro de fecha (selector de día, con flechas < >)
- Lista de franjas horarias del día:
  - Franjas disponibles (beige)
  - Citas agendadas (dorado) → clickeables
  - Franjas bloqueadas (gris)
- Cada cita muestra: hora, nombre del paciente, tipo de consulta, estado

---

#### M4 — Detalle de Cita
**URL:** `/medico/citas/[id]`

Layout de 2 columnas:

**Columna izquierda — Datos del Paciente:**
- Nombre, teléfono, email, edad calculada, tipo de consulta
- Duración, origen de la cita (online / manual)

**Columna derecha — Estado:**
- Selector de estado: Pendiente | Confirmada | Realizada | Cancelada | Reagendada
- Si "Reagendada": aparecen inputs de nueva fecha y nueva hora
  - Advertencia ámbar si el horario está fuera de disponibilidad
- Campo de notas del médico (solo visible internamente)
- Botón: "Guardar cambios"

**Panel inferior — Tabs:**
- Tab "Nota Clínica (SOAP)":
  - 4 áreas de texto: Subjetivo, Objetivo, Evaluación, Plan
  - Área de notas privadas
  - Sección de medicamentos recetados
  - Botón: "Guardar nota"
- Tab "Cuestionario del paciente":
  - Respuestas del cuestionario pre-clínico en formato legible

**Botón flotante o al final:** "Imprimir Receta" → abre vista de impresión

---

#### M4.1 — Hoja de Receta (Imprimible)
**URL:** `/medico/citas/[id]/receta`

Vista de impresión en tamaño carta:
- Header: nombre del médico, especialidad, datos del consultorio
- Datos del paciente: nombre, edad, fecha
- Lista de medicamentos: medicamento | dosis | frecuencia | duración | indicaciones
- Firma del médico al final

---

#### M5 — Directorio de Pacientes
**URL:** `/medico/pacientes`

- Buscador de texto en tiempo real
- Tabla o lista de tarjetas por paciente:
  - Nombre completo
  - Edad (calculada de `dateOfBirth`)
  - Teléfono
  - Última cita
  - Número total de citas
- Click → va a la ficha del paciente

---

#### M6 — Ficha del Paciente
**URL:** `/medico/pacientes/[id]`

**Header con fondo degradado dorado:**
- Avatar con iniciales, nombre en grande
- Edad, teléfono, correo
- Badges: tipo de sangre, "Alérgico" (rojo si aplica)
- Botón: "Fusionar Expediente" → abre un modal

**Tabs de contenido:**

**Tab 1 — Expediente Médico**
- Campos editables: Tipo de sangre, Alergias, Enfermedades crónicas, Antecedentes familiares
- Botón: "Guardar expediente"

**Tab 2 — Historial de Citas**
- Lista de citas pasadas y próximas del paciente
- Cada ítem: fecha, estado (chip de color), tipo de consulta

**Modal — Fusionar Expediente:**
- Búsqueda de paciente por nombre
- Lista de resultados clickeables
- Advertencia: "El paciente secundario será eliminado"
- Botón: "Confirmar Fusión"

---

#### M7 — Configuración
**URL:** `/medico/configuracion`

Tabs o secciones:

**Perfil Público:**
- Nombre, especialidad, bio, imagen de perfil, slug (URL pública)

**Parámetros del Consultorio:**
- Duración de consulta normal (minutos)
- Habilitar consulta extendida (toggle)
- Precios de cada tipo

**Disponibilidad:**
- Vista por semana de los bloques de horario definidos
- Botón: "Agregar bloque" → modal con selector de fecha, hora inicio y fin
- Toggle por bloque: activo / inactivo, público / privado

**WhatsApp:**
- Estado de conexión: punto verde "Conectado" / rojo "Desconectado"
- Instrucciones para conectar el microservicio
- Botón: "Verificar conexión"

---

## 🧩 Componentes Reutilizables

| Componente | Descripción |
|---|---|
| **Button** | 3 variantes: `primary` (dorado sólido), `secondary` (beige), `tertiary` (solo texto) |
| **Input** | Campo con label flotante arriba, fondo `#F9F7F4`, borde `#E0DCD3` |
| **TextArea** | Igual al Input pero multilinea |
| **Badge** | Etiqueta pequeña de colores para estados de cita |
| **Card** | Contenedor redondeado con sombra sutil, fondo blanco |
| **TimeSlot** | Chip de hora: borde dorado si disponible, sólido si seleccionado |
| **RadioCard** | Tarjeta seleccionable con borde que resalta en dorado al elegir |
| **DoctorLayout** | Wrapper del panel médico: sidebar + área de contenido |
| **Modal** | Overlay centrado con fondo oscuro semitransparente |
| **FeedbackState** | Estado de loading, error o vacío (con spinner o ícono) |

---

## 🔄 Flujos (User Flows)

### Flujo 1 — Agendar cita (Invitado)
```
Landing → /agendar → [Cuenta: Invitado] → [Tipo] → [Fecha] → [Horario] → [Datos] → [Confirmar] → /confirmacion
```

### Flujo 2 — Agendar cita (Con sesión)
```
/agendar → [Cuenta: Login o Registro] → [Tipo] → [Fecha] → [Horario] → [Datos: prellenados] → [Confirmar] → /confirmacion
```

### Flujo 3 — Responder cuestionario
```
WhatsApp → link → /cuestionario/token → [Síntomas] → [Preguntas] → [Enviar] → Pantalla de gracias
```

### Flujo 4 — Médico gestiona cita
```
Login → Dashboard → click en cita → M4 → Cambiar estado / Escribir nota SOAP → Guardar
```

### Flujo 5 — Médico revisa paciente
```
Sidebar > Pacientes → Buscar → seleccionar → M6 → editar expediente o fusionar
```

---

## 📐 Principios de Diseño (Actuales)

1. **Calidez médica** — No es frío ni clínico como hospitales. Se siente como un consultorio privado de confianza.
2. **Wizard lineal** — Nunca se muestra demasiado de golpe. Un paso a la vez en el agendado.
3. **Progresiva disclosure** — Opciones avanzadas aparecen solo cuando se necesitan (ej. reagendamiento aparece solo si se selecciona ese estado).
4. **Jerarquía clara** — Un solo CTA visible dominante por pantalla.
5. **Feedback inmediato** — Estado de carga, errores inlineados y animaciones de transición entre pasos.
6. **Móvil primero** — La app es responsiva; el flujo de agendado fue diseñado pensando en el teléfono del paciente.

---

## 📌 Notas para el Rediseño

- El sistema NO tiene modo oscuro implementado para la experiencia del paciente (solo existe el CSS de dark mode en la configuración base pero no está activo).
- Los colores de estado de citas (pendiente, confirmada, cancelada, etc.) deben mantenerse diferenciables con chips/badges.
- El cuestionario es el punto más creativo del sistema — puede beneficiarse mucho de íconos, animaciones y una UX más lúdica que reduzca la percepción de "formulario médico aburrido".
- La receta imprimible debe verse profesional en un contexto de letra tamaño carta, con datos estructurados claramente.
- El sidebar del médico es fijo en desktop y colapsable en tablet.
