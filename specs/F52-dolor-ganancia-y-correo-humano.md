# F52 — Dolor y ganancia con datos, y un correo que suene a persona

## Por qué
La página y el correo dicen *qué* encontramos, pero no *cuánto le cuesta* al negocio. El correo además suena a plantilla:
- no tiene humor;
- no deja ver que detrás hay una persona;
- el diseño HTML todavía es plano.

## Datos con fuente (verificados el 2026-11-07)
Solo usamos cifras con fuente primaria o de un medio reconocido, citadas en la página. No se inventan cifras.

| Hallazgo | Dato | Fuente |
|---|---|---|
| whatsapp, form | Las empresas que intentan contactar un lead web en la primera hora tienen casi **7 veces** más probabilidad de concretar una conversación que las que esperan una hora más. | Harvard Business Review, "The Short Life of Online Sales Leads" (2011), 1,25 millones de leads. https://hbr.org/2011/03/the-short-life-of-online-sales-leads |
| booking (salud) | El **42 %** de las citas reservadas en línea se hicieron con el consultorio cerrado. | Zocdoc, What Patients Want 2024, vía TechTarget. https://www.techtarget.com/patientengagement/news/366617196/Zocdoc-Timeliness-is-key-patient-self-scheduling-preference |
| booking (salud) | El **44 %** de los pacientes elegiría, entre dos médicos parecidos, al que deja agendar en línea. | Encuesta Surescripts, vía MobiHealthNews. https://www.mobihealthnews.com/news/survey-44-percent-patients-prefer-doctors-offer-online-appointment-scheduling |
| no-website, freshness | El **76 %** de quienes buscan algo cercano en el celular visita un negocio relacionado en menos de un día. | Think with Google. https://www.thinkwithgoogle.com/data/mobile-near-me-searches/ |

Los datos de salud solo se muestran en búsquedas de salud. El de WhatsApp en Colombia (92 %) no se usa porque no se pudo confirmar.

## Qué cambia

### Datos compartidos (`features/offer/evidence.ts`)
Para cada hallazgo hay un dato con estos campos: cifra grande, frase, fuente y URL. Lo usan el correo y la página.

### Página /d
- **"Lo que está en juego"**, justo después del hero: hasta 3 tarjetas con la cifra grande, la frase de dolor o ganancia y la fuente enlazada, según los hallazgos abiertos.
- **Tarjetas de hallazgo:** cada una lleva su dato en una franja ("Dato: …", con la fuente).

### Correo
- **Apertura humana.** El modelo escribe una primera frase con un elogio honesto y breve, seguido de "pero" y el hallazgo. Ejemplo: "Su página se ve muy bien, pero le encontré un detalle: no tiene botón de WhatsApp." Se mantiene el trato de usted.
  - Prohibido insultar ("horrible", "fea", "mala").
  - Sin "jaja" ni emojis.
- **Consecuencia con dato.** La frase del dato viene de `evidence.ts`, no del modelo, para que la cifra no se invente.
- **Posdata con humor**, fija y elegida por lead entre 3 opciones. Ninguna dice que no hay IA detrás:
  - "PD: prometemos que este no es otro correo de «aumente sus ventas 300 %». Vimos algo concreto y quisimos contárselo."
  - "PD: si no es el momento, responda «ahora no» y quedamos tan amigos como antes."
  - "PD: no le vamos a escribir cada semana como el gimnasio en enero. Si le sirve, aquí estamos."
- **Puente del hallazgo a Mokub:** la prueba ya no va suelta. Una frase conecta el hallazgo con lo que hacemos, con la prueba entre paréntesis, y cuando el servicio es un agente invita a probarlo. Ejemplo: "Justo eso resolvemos en Mokub: un agente de IA que responde por WhatsApp en segundos, también de noche (más de 15 proyectos en producción). Pruébelo usted mismo: +57 301 473 4934."
- **Firma de persona.** Si existe `SENDER_PERSON_NAME`, el correo lo firma esa persona (`SENDER_PERSON_ROLE`, de Mokub) y lleva su foto (`SENDER_PERSON_PHOTO_URL`). Si no existe, firma "Equipo de Mokub".
- **Tope:** 100 palabras sobre la firma. Las posdatas no cuentan.

### HTML del correo
- Franja superior en noche con el logo.
- Tarjeta blanca con:
  - el saludo;
  - la apertura;
  - el **dato destacado** (cifra grande en acento, frase y fuente);
  - la prueba;
  - un **botón verde "Probar el agente por WhatsApp"**;
  - la pregunta de cierre.
- En la variante B, además, un botón secundario "Ver el diagnóstico".
- Firma con foto (o logo), nombre, cargo y WhatsApp.
- Posdata en cursiva.
- Pie legal.
- Sigue en tablas con estilos en línea y 600 px.

## Criterios verificables
1. Cada hallazgo que abre un correo tiene un dato con fuente. La página lo muestra con su enlace.
2. El correo contiene la cifra exacta de `evidence.ts`, y el modelo nunca escribe números.
3. El verificador rechaza "horrible", "fea", "mala", "jaja" y los emojis, y acepta un elogio breve.
4. Con `SENDER_PERSON_NAME`, la firma es la persona. Sin esa variable, es "Equipo de Mokub".
5. Las posdatas no cuentan para el tope de 100 palabras.
6. En la variante A el HTML trae el botón de WhatsApp; en la B también trae "Ver el diagnóstico".
7. `npm run check` queda en verde. Se generan 5 correos de muestra y se revisan las capturas.
