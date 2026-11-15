# Guion de consulta simulada para probar la transcripción

**Para qué sirve:** grabar una consulta de unos 10 minutos y medir si Whisper (turbo y small, en CPU y GPU) **omite o cambia datos clínicos**: dosis, cifras, medicamentos, negaciones y fechas. También sirve para probar la separación de hablantes.

**Todos los datos son inventados.** No uses nombres, teléfonos ni datos de personas reales.

## Cómo grabar

- **Dos personas:** una lee al **Médico** y otra al **Paciente**. Si no hay nadie más, una sola persona puede leer las dos partes cambiando un poco la voz, pero la separación de hablantes saldrá peor y no contará como prueba de diarización.
- **Dónde:** un cuarto normal, no silencioso de estudio; un poco de ruido de fondo es realista. Laptop o celular sobre la mesa, a 1 metro de los dos, como estaría en un consultorio.
- **Formato:** MP3 o WAV. La grabadora de voz de Windows o la del celular sirven.
- **Ritmo:** hablen natural, no leído despacio. Respeten las marcas:
  - `[PAUSA 5 s]`: silencio real; sirve para probar los cortes por trozos.
  - `[SE ENCIMAN]`: el segundo empieza a hablar antes de que el primero termine.
  - `[TOS]`, `[RISA]`: háganlo de verdad.
- **No corrijan errores al leer.** Si alguien se traba, sigan como en una consulta real.
- Al terminar, guarda el archivo como `consulta_simulada_1.mp3` y tráelo.

---

## Guion

**Médico:** Buenas tardes, pásele. Siéntese, por favor. ¿Cómo se llama?

**Paciente:** Buenas tardes, doctor. Me llamo Rosa Elena Quintanar Ibarra.

**Médico:** ¿Y su fecha de nacimiento?

**Paciente:** El catorce de marzo de mil novecientos setenta y uno.

**Médico:** O sea que tiene cincuenta y cinco años. ¿Qué la trae por aquí, Rosa?

**Paciente:** Pues mire, vengo por dos cosas. La primera es que traigo un dolor de cabeza desde hace como tres semanas, y la segunda, que me mandaron unos estudios y no les entiendo.

**Médico:** Muy bien, vamos por partes. El dolor de cabeza, ¿dónde le duele?

**Paciente:** Aquí, en la nuca y en las sienes, sobre todo en las mañanas.

**Médico:** ¿Se ha tomado la presión?

**Paciente:** Sí, en la farmacia me la tomaron el sábado y me salió ciento cincuenta y ocho sobre noventa y cuatro.

**Médico:** Ciento cincuenta y ocho sobre noventa y cuatro. ¿Alguna vez le habían dicho que tenía la presión alta?

**Paciente:** No, nunca. Bueno, una vez en el embarazo, pero de eso hace mucho.

**Médico:** ¿Toma algún medicamento ahorita?

**Paciente:** Tomo metformina de ochocientos cincuenta, una en la mañana y una en la noche, para el azúcar. Y a veces paracetamol cuando me duele la cabeza.

**Médico:** ¿Cuántas pastillas de paracetamol al día, más o menos?

**Paciente:** Dos, a veces tres. De quinientos.

**Médico:** ¿Es alérgica a algún medicamento?

**Paciente:** Sí, a la penicilina. Me salieron ronchas una vez. Pero al naproxeno no, ese sí lo tolero bien.

**Médico:** Penicilina, ronchas. Lo anoto. ¿Algo más? ¿Sulfas, aspirina?

**Paciente:** No, nada más la penicilina.

`[PAUSA 5 s]`

**Médico:** A ver, enséñeme los estudios.

**Paciente:** Aquí están. Me los hice el tres de noviembre.

**Médico:** A ver… La glucosa en ayuno salió en ciento cuarenta y dos. La hemoglobina glucosilada en siete punto ocho por ciento. El colesterol total en doscientos treinta y uno, y los triglicéridos en ciento noventa y seis. La creatinina en cero punto nueve, está bien. Y el potasio en cuatro punto uno, también normal.

**Paciente:** ¿Y eso está muy mal, doctor?

**Médico:** No está muy mal, pero la diabetes no está bien controlada. Lo ideal es que la glucosilada esté por debajo de siete. Usted está en siete punto ocho.

**Paciente:** Es que confieso que la de la noche a veces se me olvida. `[RISA]`

**Médico:** `[SE ENCIMAN]` Eso pasa mucho, no se preocupe. Pero es importante.

`[TOS]`

**Médico:** ¿Ha tenido mucha sed, orina seguido?

**Paciente:** Sed sí, un poco. Orinar, me levanto una vez en la noche.

**Médico:** ¿Visión borrosa, hormigueo en los pies?

**Paciente:** Visión borrosa no. Hormigueo tampoco.

**Médico:** ¿Dolor en el pecho, falta de aire al caminar?

**Paciente:** No, eso no.

`[PAUSA 5 s]`

**Médico:** Le voy a revisar. Súbase aquí, por favor… Presión: ciento cincuenta y dos sobre noventa y dos, en el brazo derecho. La frecuencia cardiaca en setenta y ocho. Peso, setenta y cuatro kilos con quinientos gramos. Talla, uno sesenta. Eso da un índice de masa corporal de veintinueve punto uno.

**Paciente:** ¿Estoy pasada de peso?

**Médico:** Un poco, sí. Sobrepeso. Ruidos cardiacos rítmicos, sin soplos. Campos pulmonares bien ventilados. Pulsos en los pies presentes. Sin edema.

**Paciente:** ¿Y entonces qué tengo?

**Médico:** Mire, Rosa: lo más probable es que tenga hipertensión arterial, por eso el dolor de cabeza en las mañanas. Y la diabetes tipo dos que ya tenía no está bien controlada.

`[PAUSA 5 s]`

**Médico:** Le voy a dejar lo siguiente. Primero: losartán de cincuenta miligramos, una tableta cada veinticuatro horas, en la mañana. Segundo: la metformina se la cambio a la de liberación prolongada, de un gramo, una tableta al día con la cena; así no se le olvida porque es una sola. Tercero: deje el paracetamol diario; si le duele la cabeza, máximo una de quinientos cada ocho horas, y no más de tres días seguidos.

**Paciente:** ¿Losartán de cincuenta, en la mañana?

**Médico:** Exacto, cincuenta miligramos en la mañana. Y quiero que se tome la presión en casa, en la mañana y en la noche, y lo anote en una libreta durante dos semanas.

**Paciente:** ¿Y si me sale muy alta?

**Médico:** Si le sale arriba de ciento ochenta sobre ciento diez, o si siente dolor de pecho, se le duerme un lado de la cara o del cuerpo, o se le nubla la vista, se va a urgencias de inmediato. No espere a la cita.

**Paciente:** Ciento ochenta sobre ciento diez. Está bien.

**Médico:** También le voy a pedir un examen general de orina, un perfil de lípidos de nuevo en tres meses, y un electrocardiograma. Y la mando con nutrición.

**Paciente:** ¿Me puede dar algo para el colesterol de una vez?

**Médico:** Por ahora no. Vamos a ver cómo responde con la dieta tres meses, y si en el próximo perfil sigue arriba de doscientos, empezamos con atorvastatina de veinte miligramos. Pero hoy no.

**Paciente:** De acuerdo.

**Médico:** La espero en dos semanas, el veintiocho de noviembre, con su libreta de presiones. ¿Tiene alguna duda?

**Paciente:** No, doctor, todo claro. Muchas gracias.

**Médico:** Con gusto, Rosa. Cuídese.

---

## Lista de verificación (para revisar la transcripción)

Marca cada dato que la transcripción traiga **correcto**. Lo que falte o cambie es justo lo que buscamos.

| # | Dato | Qué vigilar |
|---|---|---|
| 1 | Rosa Elena Quintanar Ibarra | Nombre completo |
| 2 | 14 de marzo de 1971; 55 años | Fecha y edad |
| 3 | Dolor de cabeza, 3 semanas, nuca y sienes, en las mañanas | Duración y localización |
| 4 | Presión en farmacia 158/94 | Cifra |
| 5 | Metformina 850 mg, mañana y noche | Dosis y frecuencia |
| 6 | Paracetamol 500 mg, 2 a 3 al día | Dosis |
| 7 | **Alérgica a penicilina** (ronchas) | Alergia |
| 8 | **Naproxeno sí lo tolera** | Negación: no debe quedar como alergia |
| 9 | **No** alergia a sulfas ni aspirina | Negación |
| 10 | Estudios del 3 de noviembre | Fecha |
| 11 | Glucosa 142; HbA1c 7.8 %; colesterol 231; triglicéridos 196 | Cuatro cifras |
| 12 | Creatinina 0.9; potasio 4.1 | Decimales |
| 13 | Meta HbA1c menor de 7 | Cifra de comparación |
| 14 | Olvida la metformina de la noche | Dato de apego |
| 15 | Sed sí; nicturia 1 vez | Síntomas positivos |
| 16 | **Sin** visión borrosa, hormigueo, dolor de pecho ni disnea | Cuatro negaciones |
| 17 | TA 152/92 brazo derecho; FC 78 | Signos |
| 18 | Peso 74.5 kg; talla 1.60; IMC 29.1 | Tres cifras con decimales |
| 19 | Exploración: rítmicos sin soplos, pulmones ventilados, pulsos presentes, sin edema | Hallazgos |
| 20 | Diagnóstico: hipertensión probable; DM2 descontrolada | Diagnóstico |
| 21 | **Losartán 50 mg cada 24 h, en la mañana** | Medicamento nuevo, dosis y horario |
| 22 | **Metformina de liberación prolongada 1 g, una al día con la cena** | Cambio de dosis |
| 23 | Paracetamol máximo 500 mg cada 8 h, no más de 3 días | Límite |
| 24 | Bitácora de presión mañana y noche, 2 semanas | Indicación |
| 25 | **Urgencias si más de 180/110**, dolor de pecho, adormecimiento o visión nublada | Datos de alarma |
| 26 | Examen general de orina; perfil de lípidos en 3 meses; electrocardiograma; nutrición | Estudios |
| 27 | **Atorvastatina 20 mg: NO se inicia hoy** (solo si colesterol sigue arriba de 200) | Negación con dosis: el error más peligroso sería que quede como indicada |
| 28 | Cita el 28 de noviembre, en 2 semanas | Fecha de seguimiento |

**Separación de hablantes:** revisa también que las frases del Médico y del Paciente queden con la persona correcta, sobre todo justo después de cada `[SE ENCIMAN]` y de cada `[PAUSA]`.
