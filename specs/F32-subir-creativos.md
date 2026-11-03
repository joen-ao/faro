# F32 · Subir imágenes y videos de anuncios desde Faro

**Prioridad:** P0. **Contexto:** F28/F29 solo aceptaban la imagen como URL https, así que había que publicarla antes en otro lado, y los videos no estaban soportados. Ahora la imagen o el video se sube en el copiloto y Faro los manda directo a la biblioteca de la cuenta publicitaria de Meta. Faro no guarda archivos.

## Comprobado con la API real (2026-11-02, v25.0)
- **Imágenes:** `POST /act_{id}/adimages` con el archivo en multipart (`filename`) devuelve `images.<nombre>.hash`.
- **Videos:** `POST /act_{id}/advideos` en tres fases.
  - `start`: recibe `file_size` y devuelve `video_id`, `upload_session_id`, `start_offset` y `end_offset`.
  - `transfer`: recibe `start_offset` y `video_file_chunk`. Meta pide trozos de unos 5 MB pero **acepta trozos más pequeños** y responde con los siguientes offsets según lo que recibió.
  - `finish`: recibe el título.
  - Luego `GET /{video}?fields=status` pasa de `video_status: processing` a `ready`; tardó unos 20 s con 12 MB.
- **Miniatura obligatoria:** un creativo de video sin `image_hash` ni `image_url` falla con el error "El anuncio necesita una miniatura". Las miniaturas que genera Meta están en `/{video}/thumbnails` (`is_preferred`).
- **Bloqueo externo:** con la app `faro-api` en modo de desarrollo, Meta rechaza **todo** creativo (imagen o video) con el error 1885183: "debe estar en modo público". El dueño debe pasar la app a modo público (Live). Esto no lo cubre el código.

## Alcance
1. **Adaptador Meta Ads:**
   - `uploadImage(bytes, nombre)` devuelve hash, URL, ancho y alto;
   - `startVideoUpload(tamaño)`, `transferVideoChunk(sesión, offset, bytes)` y `finishVideoUpload(sesión, título)`;
   - `getVideo(id)` devuelve estado (processing, ready o error) y miniatura;
   - el mock responde de forma determinista.
2. **Rutas** (todas con `requireAppAccess` y registradas en `api_calls`):
   - `POST /api/ads/meta/media/image`: multipart `file`, JPG o PNG, hasta 4 MB.
   - `POST /api/ads/meta/media/video`: `{fileSize, name}` inicia la subida; MP4 o MOV, hasta 1 GB.
   - `PUT /api/ads/meta/media/video?session=&offset=`: cuerpo binario de hasta 4 MB por trozo, para no pasar el límite de 4,5 MB por petición de Vercel.
   - `POST /api/ads/meta/media/video/finish`: `{session, name}`.
   - `GET /api/ads/meta/media/video/{id}`: estado y miniatura.
3. **Navegador (copiloto):** cada variante tiene "Subir imagen o video".
   - Una imagen de más de 4 MB, o en otro formato, se convierte en el navegador a JPEG de máximo 2048 px antes de subirla.
   - El video se sube en trozos de 3,5 MB con barra de progreso, y luego Faro consulta su estado hasta que esté listo.
   - Muestra una vista previa, permite quitar el archivo y deja la URL https como alternativa.
   - No se puede crear la campaña mientras un video siga en proceso.
4. **Creativo:**
   - imagen: `link_data.image_hash`;
   - video: `video_data` con `video_id`, `message`, `title`, `link_description`, el CTA con el enlace y `image_hash` de miniatura. Si el equipo no sube una miniatura, Faro baja la preferida de Meta (solo hosts `*.fbcdn.net`) y la sube a la biblioteca de imágenes.
   - Antes de crear nada, Faro comprueba que todos los videos estén `ready`; si alguno no lo está, no crea la campaña.
5. **Registro:** `ad_variants` guarda `media_type` (image, video o url) y `media_ref` (hash, ID del video o URL) para que el aprendizaje de F29 compare imagen contra video (migración 0015).

## No-alcance
Carruseles, recorte o edición de video, varios tamaños por anuncio (Meta los adapta), generación de imágenes con IA y subir miniaturas propias para video (por ahora se usa la de Meta).

## Criterios de aceptación
1. Una imagen subida en el copiloto crea el anuncio con `image_hash`, sin URL externa.
2. Un video de más de 4,5 MB se sube completo en trozos y crea el anuncio de video con miniatura; mientras se procesa, crear está bloqueado.
3. Sin sesión, todas las rutas responden 401. Un archivo de tipo o tamaño no permitido responde 400. El token nunca aparece en respuestas ni registros.
4. En modo mock todo funciona sin llamar a Meta.
