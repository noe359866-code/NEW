# Dossier de investigación · noviembre de 2026

Notas tomadas abriendo cada sitio (no de artículos de blog) y contrastadas con definiciones de
Jackett, con implementaciones previas verificadas y, cuando hizo falta, descifrando los enlaces con
Python antes de portar la lógica a JavaScript.

Leyenda: ✅ comprobado en vivo · ⚠️ parcial / no verificable · ❌ sin servicio

Once sitios: los siete del encargo original, **SubTorrents**, y los tres de la segunda tanda
(**TorrentGalaxy**, **GranTorrent** y **Cinecalidad**).

---

## 1. DonTorrent — `dontorrent.tips` ✅

- Cadena de dominios: `dontorrent.in` (muerto) → `dontorrent.meme` (redirige) → **`dontorrent.tips`**.
- Formulario de búsqueda: `POST /buscar` con `valor=<término>`, `Buscar=Buscar`, `p=<página>`.
- Resultados: `div.seccion#buscador > div.card > div.card-body > ul > li`; enlace en
  `li > span > a[href]` (`/pelicula/<id>/<slug>` o `/serie/<id>/<slug>`); calidad en `li > span > span`.
- Ficha de película: botón `a.protected-download[data-content-id][data-tabla]`.
- Ficha de serie: `div.descargar table.table tbody tr`, con la etiqueta del episodio en la primera
  celda (`1x02 - Título`) y la fecha en la tercera (`yyyy-MM-dd`). Los nombres usan `1x02` **y**
  `1×02`; el parser normaliza `×`/`✕`/`✖` a `x`.
- Descarga protegida:
  1. `POST /api_validate_pow.php` con `{"action":"generate","content_id":…,"tabla":…}` → `challenge`.
  2. Resolver PoW: `nonce` tal que `sha256(challenge + nonce)` empiece por `"000"` (dificultad 3).
  3. `POST` `{"action":"validate","challenge":…,"nonce":…}` → `download_url` (`.torrent`).
- El sitio ata la descarga a la sesión: el provider guarda las cookies por host y las reenvía.
- Límite práctico: `maxResults` 8 por defecto, 4M de nonces como tope de seguridad.

## 2. MejorTorrent — `www47.mejortorrent.eu` ✅

- Mismo software que DonTorrent: `POST /buscar`, `a.protected-download`, `/api_validate_pow.php`.
- El número del subdominio (`www45`, `www46`, `www47`) rota como técnica anti-bloqueo; el provider
  prueba `www47`, `www46`, `www45` y el dominio sin número.
- Diferencias: catálogo y slugs propios, y respuesta hostil (HTML de bloqueo) con frecuencia. El
  provider valida que la ficha contenga el título antes de aceptar el resultado.
- No se pudo verificar el flujo PoW completo con una descarga real desde el sandbox (sin salida a
  internet); se validó con fixtures construidos a partir del HTML capturado y el contrato de la API.

## 3. EliteTorrent — `www.elitetorrent.com` ✅

- WordPress clásico. Búsqueda `GET /?s=<término>`; fichas `/peliculas/<slug>/` y `/series/<slug>/`.
- Idiomas por bandera: `images/espanol.png`, `latino.png`, `vose.png`, `ingles.png`.
- Descarga: enlace a `https://acortame-esto.com/s.php?i=<base64>&st=et`.
  - El parámetro `i` está codificado con **varias capas de Base64** (5 en los ejemplos capturados) y
    luego **ROT13** aplicado a cada capa.
  - Al decodificar sale una URL directa `.torrent` o, en algunas fichas, un `magnet:` ya listo.
- Fixture verificado con Python y luego con JS: el `.torrent` real produce el infohash
  `6D6FE32F4A7540CFD698C387A9F91084F16C70E3`.
- `maxResults` 8, `includeVose` para descartar el audio original subtitulado.

## 4. DivxTotal — `divxtotal.foo` ✅

- WordPress. Búsqueda `GET /?s=<término>` (también `page/<n>/?s=`), tabla con
  `Nombre | Categoría | Fecha | Tamaño`.
- Rutas de ficha: `/peliculas/<slug>/`, `/peliculas-hd/`, `/peliculas-4k/`, `/peliculas-3-d/`,
  `/series/<slug>/`.
- Descarga: `a[href*="/download_tt.php"]` con `u=<base64(URL del .torrent)>`. La URL decodificada tiene
  la forma `https://divxtotal.foo/wp-content/uploads/2026/11/<slug>-(central).torrent`.
  - Hay una segunda variante ofuscada con `short-info.link/s.php?i=<base64 ×N + ROT13>`, el mismo
    servicio que usa EliteTorrent; el decodificador del núcleo cubre ambas.
- Calidad deducida de la ruta de categoría y del texto de la tabla.

## 5. TorrentLandia — ❌ sin dominio

- `torrentlandia.site` **no resuelve** y no aparece ningún TLD alternativo activo (probados `.site`,
  `.com`, `.net`, `.org`, `.info`, `.es`). Los listados de foros que lo mencionan son de 2023–2024.
- Se entrega con `enabled: false`, un ajuste `baseUrl` y un parser genérico (listado tipo tabla +
  `a[href*=".torrent"]` / magnet) que **no pudo validarse contra HTML real**. Es honesto decirlo: sirve
  como punto de partida si el sitio reaparece.

## 6. WolfMax4K → WolfTorrent — `wolftorrent.com` ⚠️

- El dominio histórico `wolfmax4k.com` hace **301 a `wolftorrent.com`** (rediseño completo, ya no es
  el panel `admin.<host>/admin/admpctn/data.find.php` que documenta Jackett).
- Rutas actuales: `/pelicula/<shortid>`, `/serie/<id>`, `/serie/episodio/<id>`, búsqueda `/buscar/<término>`.
- Cadena de descarga:
  1. `/api/descargas?tabla=<…>&code=<…>` devuelve el HTML del reproductor/descarga.
  2. Dentro aparece un enlace de **Enlacito** y una variable `var link_out = "…"`.
  3. Ese valor es Base64 directo del `.torrent` o un blob **AES-CBC** con la clave que aparece en el
     propio HTML; en las versiones antiguas era la contraseña `fee631d2cffda38a78b96ee6d2dfb43a`
     (CryptoJS, que Nuvio expone como `require('crypto-js')`). El provider intenta Base64 y, si el
     resultado no parece una URL, AES con la clave detectada y con la histórica.
- **Cloudflare Turnstile** protege la descarga desde octubre de 2026: sin navegador no hay cookie
  `cf_clearance`. El provider detecta el desafío y devuelve `[]` (con traza en consola), en lugar de
  fallar o mentir con resultados vacíos sin explicación.
- Consecuencia: el flujo completo no se pudo ejecutar de principio a fin; sí la parte de parseo y
  decodificación con fixtures.

## 7. SinSitio — `www.sinsitio.site` ✅

- DataLife Engine. Búsqueda:
  `GET /index.php?do=search&subaction=search&story=<término>`.
- Entradas con la forma `/<categoría>/<id>-<slug>.html`.
- Calidades enlazadas a `https://www.sinsitio.site/ddlUrl.php?url=<base64>` donde el Base64 decodifica
  a `index.php?do=download&id=<NNNNN>` (a veces además URL-encoded y con `&name=<base64 del título>`).
- El tamaño se lee de la propia línea de la calidad; el idioma, de la etiqueta de la ficha.

---

## Contra qué se contrastó

- **Nuvio**: documentación oficial de plugins (`nuvio.wiki/integrations/plugins`), formato del
  manifiesto y del runtime QuickJS verificado contra el código de NuvioTV/NuvioMobile por terceros
  (`nuvio-plugin-format.md`): `module.exports.getStreams` o global, `getStreams(tmdbId, type, season,
  episode)`, campos de stream leídos por la app, límites (30 s de fetch, 1 MiB de cuerpo, 60 s por
  plugin, 10 concurrentes), globals `TMDB_API_KEY` y `SCRAPER_SETTINGS`.
- **Jackett**: definiciones `DonTorrent.cs`, `DivxTotal.cs` y el `Wolfmax4K.cs` de un fork (pre-rediseño)
  para confirmar selectores y contratos de API.
- **Implementaciones previas**: providers de Hydra-Vault (`dontorrent`, `elitetorrent`, `sinsitio`,
  `pow`, `torrent`, `bencode`) usadas solo como referencia; el código de este repositorio se escribió
  de nuevo y se probó aparte.

## Callejones sin salida (para no repetirlos)

- `curl` a `raw.githubusercontent.com` devuelve cuerpos vacíos en este entorno: hay que usar
  `gh api .../contents/<ruta> --jq .content | base64 -d`.
- Los proxies públicos probados (codetabs, allorigins) responden 520/522; `r.jina.ai` solo convierte
  HTML a texto y oculta los anclajes de descarga.
- La vista de texto de las páginas de DonTorrent/WolfTorrent no muestra los botones de descarga: hizo
  falta leer el HTML con selectores.
- Jackett no incluye `Wolfmax4K.cs` en la rama principal; solo en forks, y describe el diseño antiguo.
- `fetch_page` no ejecuta JavaScript: Turnstile y los `var link_out` generados en cliente no aparecen.

## 8. SubTorrents — `www1.subtorrents.zip` ✅

- WordPress con tema propio, catálogo centrado en **versión original subtitulada al español**.
- Búsqueda de películas: `GET /peliculas-subtituladas/?s=<término>`; devuelve una tabla
  `Título (con bandera de idioma) | Fecha dd-mm-yyyy | Género | Calidad`.
- Búsqueda de series: `GET /series-2/?s=<término>`; las fichas viven en `/series/<slug>/`.
- Ficha de película (`/peliculas/<slug>/`): metadatos (`Calidad`, `Audio`, `Idioma`, `Año`) y dos
  opciones de descarga:
  1. `https://enlace-protegido.com/s.php?i=<ofuscado>`
  2. `.torrent` directo en `/wp-content/uploads/<año>/<mes>/<slug>-(central).torrent`
- Ficha de serie: una tabla por temporada; cada fila es un episodio etiquetado `Título 4x1`, `4x2`…
  y solo ofrece el acortador.
- Cadena del acortador (comprobada con el payload real de "Toy Story 5" y de "Reacher 4x1"):
  **cinco capas de Base64 y un ROT13 al final**:
  `VjJ0YWEy…` → `b64 ×5` → `uggcf://jjj1.fhogbeeragf.mvc/…` → `ROT13` →
  `https://www1.subtorrents.zip/wp-content/uploads/2026/08/Toy-Story-559-(central).torrent`.
  El decodificador del núcleo acepta también el enlace completo y no solo el parámetro `i`.
- Como la ficha trae el `.torrent` directo y el acortador a la vez, el provider resuelve ambos y
  deduplica por infohash: es una prueba real de que la deduplicación funciona.
- Otros hosts probados: `subtorrents.zip` y `www2.subtorrents.zip` (mismo sitio, por si cae el `www1`).

---

## 9. TorrentGalaxy — `en.torrentgalaxy-official.is` ⚠️ Cloudflare

- Qué es: la marca «TorrentGalaxy» reabierta como catálogo de películas y series en inglés. El
  índice original (`torrentgalaxy.to`) cerró en 2025; este dominio se presenta como el oficial y es
  el que llega en las listas de proxies de 2026. `torrentgalaxy-official.com` hace **301** a `.is`.
- Estructura: navegación `Browse` → `/home`, `/movies`, `/series`; el listado se sirve como tarjetas
  de TMDB con póster, nota, año y título; paginación `/movies?page=N`.
- Ficha: `/movies/<slug>-<año>` (p. ej. `/movies/pain-hustlers-2023`) y `/series/<slug>-<año>`.
  En la ficha conviven dos bloques:
  1. `## 🔥Popular` (recomendados, ruido para el scraper),
  2. **`🧲 Torrents N`** con la tabla real: por fila, nombre del release, calidad (2160p, 1080p,
     720p), tamaño, seeders y un enlace 🧲 (`magnet:?xt=urn:btih:…`). Muchas fichas enlazan también
     el `.torrent` del release.
  3. Un reproductor **«▶ Stream VidSrc»** montado con el id de TMDB (`/embed/movie/<id>`,
     `/embed/tv/<id>/<temporada>/<episodio>`).
- Búsqueda: caja global con `?search=<término>` y ruta `/search/?q=<término>`; los listados aceptan
  además `?keyword=<término>` (es la forma que usan los enlaces de «Browse by year»:
  `/movies?keyword=2023`). `robots.txt` desautoriza `/?search=`, `/?quality=` y compañía, así que el
  provider prefiere `/movies?keyword=` y `/series?keyword=`.
- **Cloudflare**: el HTML servido a clientes automatizados es la página «Just a moment…» /
  «Performing security verification»; `robots.txt` responde `Disallow: /`. Comprobado también con
  proxys de lectura (r.jina.ai devuelve el desafío) y con `api.microlink.io` («uses antibot
  protection»). El provider detecta ese HTML en las primeras 4 KB y devuelve `[]` sin lanzar; los
  selectores se validaron sobre la versión renderizada (árbol de accesibilidad), no sobre el HTML
  crudo.
- Callejones sin salida: `/api/torrents`, `/api/movies`, `/api/search` y `/_next/static/...` no
  existen: cualquier ruta desconocida devuelve la portada de «Popular» (soft-404), así que el parser
  nunca se apoya en códigos de estado.

## 10. GranTorrent — `grantorrent.fyi` ✅

- WordPress con tema **DooPlay/PichoTorrent**. Marca «GranTorrent»; dominios históricos
  `grantorrent.zip`, `gran-torrent.net`, `.lol`, `.wf`, `.bz`, `.si`, `.re`, `.ch` (rotan).
- Búsqueda: `GET /?s=<término>`; las tarjetas traen póster (`image.tmdb.org`), nota, año y el título
  dentro de `<h3>`/ancla larga. Los listados usan `/peliculas/` y `/series/`.
- Series: `/series/<slug>/` → `/temporada/<slug>-temporada-<n>/` (ficha de temporada con la lista
  `2 - 1`, `2 - 2`, …) → `/episodios/<slug>-<n>x<m>/` (ficha real del episodio).
- Tabla de enlaces de una ficha (película o episodio): columnas
  `Opciones | Calidad | Idioma | Tamaño | Clicks`. Dos familias de fila:
  - icono `s2.googleusercontent.com/s2/favicons?domain=utorrent.com` + texto «Obtener torrent»,
  - icono de un host externo (`free.7hd.club`, …) + texto «Descarga».
  Calidades vistas: `4K UHDRip`, `BluRay-1080p`, `BluRay-720p`, `BluRay-Rip`, `HD 1080p`.
  Idiomas: `Castellano`, `Español Latino`.
- Descarga: ambas filas apuntan a `/enlaces/<code>/` (10 caracteres), que hace **302** a un host de
  ficheros — comprobado con `daopocb6lt` → `filess.top/es/QCNuXssbOO9lazZ/file` y con `mczlwfzdtb`
  → `filess.top/es/fA4naEokrsVfw0G/file`. La página del host muestra el nombre del `.torrent`
  (`The-Mongoose-(BluRay-720p)-(dqLY).torrent`, 94,05 KB), un contador «Espere por favor 3Seconds» y
  el botón de descarga. El provider sigue la cadena con `resolveTorrentOrMagnet` (máx. 2 saltos),
  descarga el `.torrent`, lo parsea con bencode y entrega el magnet con su infohash real.
- **Cloudflare** intermitente: la búsqueda llegó a responder con el desafío mientras las fichas se
  servían completas. Se detecta y se devuelve `[]`.
- Callejones sin salida: los «Descarga» de host externo (Mega/1fichier) no son torrents; se prueban
  igual y, si no dan un `.torrent`, se descartan solos.

## 11. Cinecalidad — `www.cinecalidad.am` ✅

- WordPress con reproductor propio (DooPlay). Dominios: `.am` (actual), `.org`, `.ro`, `.is`.
- Búsqueda: `GET /?s=<término>`; tarjetas `.ml-item` con póster de TMDB, título limpio en
  `.in_title`, tipo (`Película`/`Series`) y calidad (`Dual 1080p`, `Full HD`).
- Rutas: `/ver-pelicula/<slug>/`, `/ver-serie/<slug>/` (ficha de serie con la lista
  `S1-E1 … S1-E5` → `/ver-el-episodio/<slug>-<n>x<m>/`) y `/ver-el-episodio/<slug>-<n>x<m>/`.
- Ficha de película: sinopsis + `Títulos`, `TMDB`, `Género`, `Audio: Latino e idioma original`,
  `Calidad: Dual 1080p`, reparto. Debajo, dos bloques:
  - **VER ONLINE**: `#playeroptionsul li[data-option]` con `Vimeos`/`Hlswish` (embeds cifrados y con
    captcha → fuera del alcance del plugin),
  - **DESCARGAR**: filas por idioma/calidad con **magnets directos**
    (`magnet:?xt=urn:btih:cbbc40761a1fe12d94e70ddde1def7dc180b1cd8&dn=Trackers.S01E02…`) y enlaces
    `uTorrent…` a `https://acortalink.net/s.php?i=<Base64>`; además `Mega`, `Megaup`, `1fichier`,
    `Mediafire` con la forma `?download=<Base64>` (Base64 de un token de 16 bytes, no de una URL: no
    se puede abrir sin navegador).
- `acortalink.net`: el mismo tipo de acortador que usan EliteTorrent y DivxTotal, pero con su propio
  alfabeto Base64 (dígitos, minúsculas, mayúsculas, `+`, `/`) y apertura por JS ofuscado
  (`rot13(atob(linkacorta.substring(30)))`, según el bypass `acortalink` de FastForward). El provider
  prueba primero Base64 estándar y después la traducción de alfabeto; si el resultado es una URL, un
  `.torrent` o un magnet, esa es la fuente. Las muestras capturadas el 5-nov-2026 decodifican a
  `Salted__…` (carga AES con contraseña), por eso existe la vía de respaldo.
- Calidad/idioma: `Audio:` de la ficha → `Latino` por defecto; `Calidad:` → `Dual 1080p`, `Full HD`.

---

## Sesión de Cloudflare (transversal a los sitios ⚠️)

- `src/core/15-cloudflare.js` centraliza lo único que un plugin puede hacer frente a un challenge:
  - `isChallengeHtml(html)`: reconoce «Just a moment…», «Performing security verification»,
    «Checking your browser», `cf-chl`, `cdn-cgi/challenge`, «Attention Required», «Enable JavaScript
    and cookies» y DDoS-Guard. Un HTML vacío también cuenta como bloqueo.
  - `browserHeaders(extra)`: añade `Cookie: cf_clearance=…; __cf_bm=…` y el `User-Agent` exacto del
    navegador del usuario (ajustes `cfCookie` y `userAgent`) a **todas** las peticiones del provider,
    incluida la cadena `/enlaces/<code>/` → host de ficheros.
  - `hasCloudflareSession()`: distingue en el log «sin cfCookie» de «cookie caducada».
- Copiar la sesión: DevTools → Application → Cookies → `cf_clearance` (y `__cf_bm`), y el UA de ese
  mismo navegador. Cloudflare liga la cookie al UA y a la IP; caduca en horas o días.
- `tools/probe.js` (nuevo) permite comprobarlo sin móvil: imprime estado, URL final, si es el desafío,
  y los magnets / `.torrent` / infohashes / enlaces de descarga que ve el parser. Con
  `CF_COOKIE='…' UA='…' node tools/probe.js <url>` usa la misma sesión que el provider.
- Comprobado en este entorno (5-nov-2026): `en.torrentgalaxy-official.is` sirve el desafío a clientes
  automatizados (también a proxys de lectura tipo r.jina.ai o microlink), mientras
  `www.cinecalidad.am` y `grantorrent.fyi` sí entregan el HTML completo a un `fetch` normal.
