# F19b — Recall de nombres de negocio sin violar cumplimiento

Seguimiento del MAJOR de `specs/reviews/F19-r3.md`: la lista blanca estricta de `keepBusinessName` descartaba el 74 % de los restaurantes reales de Bogotá y el 13 % de las clínicas dentales (SPEC §8: nunca guardar nombres de personas).

## Diseño
- **Categoría OSM** (`nameCategory`): `professional` (`amenity|healthcare=dentist|doctors|clinic`, `healthcare=*`, `office=lawyer|accountant|notary|…`), `commerce` (`amenity=restaurant|cafe|bar|fast_food|pub…`, `shop=*`) o `unknown` (se trata como profesional).
- **Profesional**: lista blanca estricta (palabra de negocio, tag `brand`). **Comercio**: se conserva el nombre salvo que `looksLikePersonName` o un título profesional seguido de un nombre lo marquen como persona.
- **Persona dentro del nombre** ("Doctora X - Odontología", "Consultorio Dra. Ana Gómez"): se guarda enmascarada ("Consultorio odontológico (por verificar)"), sin teléfono ni correo, con `isLegalEntity=false` (nunca contactable). "Dr. Smile", "Dra. Sonrisa" y "Doc Dental" siguen siendo marcas.
- **Palabras de negocio**: ortho/orto, odont*/ondont, dent*, poli(clínico|salud…), *salud, oral, sonri*, smile, implant*, estética, coop, IPS, centro, unidad, san/santa, y comida (carne, pollo, brasa…). Prefijos cortos como `corp` y `medic` exigen palabra completa (Corpas y Medicis son apellidos).

## Criterios de aceptación
1. Los 26+ nombres de persona de las reviews siguen excluidos en las tres categorías (tabla en `f19-person-name.test.ts`).
2. La Mona, Bellini, Trento, Coodontólogos, OroSalud, Orthoclinic, Dr. Smile, Vargas Odontólogos, Corpas Pizza y Medicis Restaurante se conservan.
3. Con fixtures reales de OSM (`fixtures/overpass-restaurants-bogota.json`, `overpass-dental-bogota-wide.json`): ≥ 90 % de restaurantes y ≥ 90 % de clínicas conservadas (`f19b-recall.test.ts`).
4. Criterios del drawer con tildes ("genérico", "jurídica", "Señales") y título del hunt en 390 px sin cortar la ciudad.
5. README: sección F19 actualizada con capturas `F19-*.png` y fila de requisitos en "Hecho".
