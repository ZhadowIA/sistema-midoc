# Product

## Register

product

## Users

Medicos de consultorio privado en Mexico (medicina general/familiar y odontologia), tipicamente 35-60 años, que atienden 10-25 pacientes al dia. Usan MiDoc entre consultas, con prisa y luz de oficina: agenda, expediente, nota clinica, receta. Sus pacientes tocan solo el portal publico: agendar, confirmar por enlace, llenar preconsulta desde el celular.

## Product Purpose

MiDoc V2 es un sistema clinico local-first: el expediente vive cifrado en el equipo del medico (app de escritorio Tauri) y la nube opera solo la agenda publica, el buzon temporal y las notificaciones (portal Next.js). Exito = el medico completa cita → consulta → nota → receta sin friccion, y confia en que los datos de sus pacientes estan bajo su control fisico.

## Brand Personality

Sobria, clinica, precisa. Como un buen instrumento medico: serio sin ser frio. La confianza se gana con orden, legibilidad y consistencia, no con adornos. Tinta cobalto sobre blanco puro: la estetica de una receta bien escrita.

## Anti-references

- El SaaS-cream generico (fondo beige, tarjetas glassmorphism, esquinas de 28px+): era el look del prototipo previo y se elimina.
- Apps de salud "wellness" (gradientes pastel, ilustraciones blandas, tono infantilizante): MiDoc es herramienta de trabajo profesional, no app de bienestar.
- Software medico legado (Windows 2005, formularios grises interminables): la densidad es bienvenida, el descuido no.

## Design Principles

1. **La herramienta desaparece en la tarea.** Familiaridad ganada: patrones estandar (Linear/Stripe/Notion son el listón), cero affordances inventadas.
2. **Legibilidad clinica.** Lo que el medico lee a 50cm con prisa: contraste AA minimo, jerarquia por peso y escala, nada de gris claro decorativo.
3. **Un solo vocabulario.** Mismo boton, mismo campo, mismo estado en cada pantalla. La inconsistencia se percibe como riesgo clinico.
4. **Estados completos o nada.** Todo interactivo tiene hover, focus, disabled, loading, error y empty. Un formulario medico sin estado de error es un formulario roto.
5. **El color señala, no decora.** Cobalto para accion y seleccion; semanticos (exito/alerta/peligro) solo para estado. El resto es blanco, tinta y neutros.

## Accessibility & Inclusion

WCAG AA: contraste ≥4.5:1 en texto, ≥3:1 en UI; navegacion completa por teclado con focus visible; `prefers-reduced-motion` respetado en toda animacion; formularios con labels reales y errores asociados (aria-describedby); idioma es-MX.
