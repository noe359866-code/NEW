# Nébula ES · Cine, anime y deportes

**Un solo addon para Nuvio y Stremio**, preparado para desplegarse en Render. No hace falta instalar plugins VOD ni un addon deportivo por separado.

| Fuente | Qué busca el addon |
| --- | --- |
| TioAnime | Anime en japonés con subtítulos: directorio → ficha → episodio → Voe/YourUpload. |
| FuegoCine | Películas y series: catálogo → ficha → temporada/episodio → Unlimplay, Abyssplayer o Videro. Unlimplay entrega HLS directo desde su API JSON. |
| KatDrama | Doramas y películas asiáticas de `k-drama.in`: con el id de TMDB del addon se abre la página del episodio y se recorren sus servidores. |
| frameXTV | API de `framextv.cc` (VidSync) por id de TMDB: entrega HLS/MP4 con sus cabeceras y subtítulos VTT. |
| Latanime | Fuentes directas para películas de anime y episodios. |
| CinePlus123 | Fuentes directas para películas y episodios de series, con sus idiomas disponibles. |
| FlixLatam | En el repositorio, **desactivado**: Embed69 devuelve 403 a las IP del servidor. |
| kdesa.stream | **No incluido**: Cloudflare responde «Just a moment…» (403) a todas las rutas desde el servidor, incluidas las de `/media/tmdb-*`. |
| TVEnVivo, OnDemand y TheDaddy | Catálogos de canales y eventos deportivos y sus enlaces directos. |

### Idiomas

Cada enlace se etiqueta con el idioma que **publica su fuente**, y esa etiqueta se
añade al nombre de la opción (`Nébula · KatDrama · 1080p · Latino`), al título y a
`behaviorHints.filename`, así que se ve en la lista de Stremio/Nuvio.

| Etiqueta | Cuándo aparece |
| --- | --- |
| `Multi` | La fuente declara varios audios: `multi`/`dual audio` o varios idiomas distintos en la API de Unlimplay. |
| `Latino` | `latino`, `LAT`, `Español Latino`, `Latinoamérica`. **Se comprueba antes que «español»**, así que nunca cae en Castellano. |
| `Castellano` | `castellano`, `español`, `es`, `spanish`. |
| `Inglés` | `english`, `en`, `eng`. |
| `<Idioma> Subtitulado` | La fuente declara el idioma y además subtítulos: `English subtitles`, `Japonés Subtitulado`. |
| `Subtitulado` | Solo se declaran subtítulos, sin idioma de audio. |
| Otros | Hindi, Coreano, Chino, Japonés, Portugués, Francés, Alemán… cuando el sitio los publica. |

De dónde sale el idioma en cada web:

| Web | Origen del idioma |
| --- | --- |
| FuegoCine | Clave del objeto `embeds` de la API de Unlimplay (`latino`, `castellano`, `subtitulado`…) y texto del botón de cada reproductor. Varios idiomas ⇒ `Multi`. |
| KatDrama | Etiqueta visible de cada botón (`Kat 1 - Hindi`, `Kat 2 - English`, `Aurora - English subtitles`); `Original` se marca como versión original. |
| CinePlus123 | Texto del botón de opción (`LATINO`, `CASTELLANO`, `SUBTITULADO`). |
| TioAnime | Catálogo en japonés con subtítulos en español ⇒ `Japonés Subtitulado`. |
| Latanime | Catálogo en español latinoamericano ⇒ `Latino`, salvo que el reproductor declare otro idioma. |
| frameXTV | `audioLanguage`/`audioLabel`/`audio` de cada `source` de la API de VidSync. |

Al ordenar, dentro de la misma calidad van primero `Multi`, `Latino`, `Castellano`
y después las versiones que solo llevan subtítulos. El idioma **declarado por la
fuente** es el que se muestra: el addon no analiza el audio, así que si un sitio
etiqueta mal una pista, la etiqueta heredará ese error.

Las fuentes activas son TioAnime, FuegoCine, KatDrama, frameXTV, Latanime y CinePlus123. Las películas, series y anime se buscan desde los **títulos que ya aparecen en el catálogo del cliente**; este addon no aporta un catálogo propio de películas o anime. Sí aporta catálogos de deportes. Solo devuelve enlaces `.m3u8` o `.mp4` identificados en los sitios: **no inventa enlaces ni convierte páginas HTML en vídeo**. La disponibilidad depende de las fuentes, la región y el reproductor.

## Desplegar en Render

1. Publica en GitHub la rama que contiene estos cambios. El `main` remoto no los incorpora automáticamente; Render debe tener acceso a la rama correcta.
2. En [Render](https://dashboard.render.com/), elige **New → Blueprint**, conecta el repositorio y selecciona esa rama. Render leerá el archivo `render.yaml` de la raíz. Revisa el plan y confirma **Deploy Blueprint**.
3. **Opcional, pero recomendada:** en **Environment** del servicio añade `TMDB_API_KEY` con tu propia clave **API v3** de [TMDB](https://www.themoviedb.org/settings/api), guarda los cambios y redespliega si Render lo solicita. No pongas la clave en el repositorio ni la compartas en el chat. Se utiliza para títulos localizados y recuentos de temporadas; IMDb también se consulta mediante Cinemeta. Sin la clave se intenta la redirección corta de la página pública de TMDB y, si falla, Wikidata + IMDb/TVMaze. Wikidata se consulta con su Action API (`www.wikidata.org/w/api.php`) y no con el servicio SPARQL (`query.wikidata.org`), que responde **403** a las IP de los servidores por su política de *User-Agent*. Cuando ningún origen da el título, KatDrama y frameXTV siguen resolviendo por el id de TMDB: sus URLs y su API solo dependen de ese número, así que Nuvio recibe fuentes igualmente (la etiqueta muestra `TMDB <id>`).
4. Cuando Render muestre el servicio como activo, abre la URL HTTPS que te haya asignado. La página principal tiene un botón para copiar el manifiesto. La dirección para instalar tendrá esta forma, usando **tu dominio real**:

   ```text
   https://<nombre-asignado-por-render>.onrender.com/manifest.json
   ```

5. En **Nuvio**, abre **Ajustes → Contenido y descubrimiento → Addons**, añade ese enlace y habilita el addon. En **Stremio**, añade la misma URL de manifiesto desde la sección de addons. No la agregues como repositorio de plugins.
6. Abre una película, serie o anime desde tu catálogo habitual y busca sus fuentes. Para deportes, selecciona los catálogos marcados **Nuvio** en Nuvio y **Stremio** en Stremio. Son los mismos canales presentados con el tipo que usa cada cliente; puedes ocultar los catálogos que no necesites.

El manifiesto ofrece cuatro listas deportivas por cliente: todos, TVEnVivo, OnDemand y TheDaddy. Nuvio trata `tv` como sinónimo de serie en partes de su interfaz, por eso sus listas usan el tipo `channel`; las listas `tv` están destinadas a Stremio. No se anuncia una guía EPG porque no se dispone de horarios reales.

`render.yaml` usa el plan **Free**, Node fijado por `.node-version`, `npm ci --omit=dev && npm run build`, `npm start` y `/healthz`. Revisa los límites y condiciones actuales de Render antes de desplegar. Los servicios gratuitos pueden suspenderse tras 15 minutos sin tráfico y tardar alrededor de un minuto en despertar; su almacenamiento es efímero. El indicador `/healthz` confirma que el servidor responde, **no** que las fuentes externas funcionen.

## Ejecutar localmente

Requiere Node.js 20.3 o superior (hasta la versión 24; Render usa la versión fijada en `.node-version`).

```bash
npm ci
npm run build
npm start                           # escucha en 0.0.0.0:7000
# Opcional: PORT=8080 TMDB_API_KEY=tu_clave npm start
```

Abre `http://127.0.0.1:7000/` en la máquina que ejecuta el servidor. Para instalarlo en otro dispositivo hace falta una URL que ese dispositivo pueda alcanzar; `127.0.0.1` apunta al propio dispositivo, no al servidor. Una vista previa local o temporal no equivale a un despliegue persistente en Render.

Rutas del protocolo:

```text
/manifest.json
/healthz
/catalog/channel/nuvio-deportes.json              # Nuvio: también nuvio-tvenvivo, nuvio-ondemand, nuvio-thedaddy
/catalog/tv/deportes.json                         # Stremio: también tvenvivo, ondemand, thedaddy
/catalog/channel/nuvio-deportes/search=ESPN.json
/meta/channel/nebula-sport:tvenvivo:espn-2.json
/stream/channel/nebula-sport:tvenvivo:espn-2.json
/stream/movie/tt0816692.json
/stream/series/tmdb:44:2:1.json                   # formato: ID:temporada:episodio
/stream/anime/kitsu:7442:1:1.json                 # también mal:, anilist:, anidb:, tvdb:
/meta/series/tmdb:1399:1:1.json
```

Los IDs admitidos son IMDb `tt…`, TMDB `tmdb:…`, `tmdb:`, `tmdb_`, `tmdb-` o el número suelto, y los espacios de anime/TV `kitsu:`, `mal:`, `anilist:`, `anidb:` y `tvdb:`. Para episodios se requieren temporada y episodio positivos: un ID de serie sin `:temporada:episodio` se reconoce, pero no se buscan fuentes con él. Con un ID de anime o TVDB el addon traduce primero a IMDb/TMDB con ani.zip o Wikidata. El addon deja los metadatos de películas y series a los otros catálogos instalados; `/meta` solo responde a los deportes. Para deportes únicamente acepta IDs presentes en los catálogos filtrados; el cliente no puede pedirle que consulte una URL arbitraria.

## Reproducción y límites

- El servidor consulta documentos HTML/JSON para descubrir fuentes, pero **no tiene proxy de vídeo ni retransmite playlists o segmentos**. No solicita URLs identificadas como `.m3u8`/`.mp4`, tampoco sigue redirecciones a esos medios y corta las respuestas que no son documentos. El reproductor conecta directamente al origen.
- Las cabeceras necesarias se entregan en `behaviorHints.proxyHeaders.request`: es el nombre del campo del protocolo, no un proxy proporcionado por este servicio. Además de la URL se envían `behaviorHints.bingeGroup` (mantiene el mismo reproductor al pasar de episodio) y `behaviorHints.filename` (insignias de calidad); no se marca `notWebReady` para no desactivar la reproducción del cliente. Algunos reproductores o versiones del cliente podrían no respetarlas. Los enlaces pueden caducar o requerir cookies, CAPTCHA, DRM u otras protecciones que no se puedan resolver.
- Las solicitudes de documentos usan HTTPS, puerto estándar, comprobación DNS IPv4 contra redes no públicas, límites de tamaño y tiempo, redirecciones limitadas y un máximo de seis búsquedas o catálogos simultáneos. Son GET, salvo el POST JSON restringido a la API conocida de Vidara (`/api/stream` y parámetros validados); ese POST no sigue redirecciones y cada salto GET vuelve a validarse. La resolución VOD tiene un presupuesto de 30 segundos, 96 solicitudes en total y 32 por fuente; las redirecciones que se siguen también cuentan. Los enlaces que CinePlus123 ya haya resuelto se conservan si otra opción agota el plazo. El catálogo deportivo se guarda en memoria durante 60 segundos por fuente; OnDemand se actualiza al buscar un stream. El servicio no incluye autenticación ni límites por usuario: si lo expones públicamente, añade protección contra abuso en el perímetro.
- El filtro deportivo es heurístico: puede omitir o incluir algún canal mal etiquetado. En Latanime se usan los recuentos de TMDB para temporadas con numeración continua; si no están disponibles, se acude a ani.zip y, si tampoco, se evita adivinar el episodio. CinePlus123 sigue el enlace publicado para cada episodio, comprueba título y año cuando están disponibles, y solo conserva los reproductores que puede resolver. Cuando Vidara proporciona subtítulos externos con URL válida, se adjuntan al stream sin descargarlos. Las opciones que exijan otros métodos, CAPTCHA o que vinculen sus enlaces a la IP del servidor pueden no funcionar en el cliente. FuegoCine devuelve los HLS que publica Unlimplay en su JSON (`embeds.<idioma>.direct`; la API pide `season`/`episode` para series) y recorre los iframes de los demás reproductores. Su catálogo está en español: cuando el título llega en inglés (sin `TMDB_API_KEY`) solo se acepta una ficha si coinciden la primera palabra y el año, y esos enlaces se marcan como «título traducido». Su buscador es `/search_elastic` (el que usa el propio sitio): `/search` responde 500 porque le falta la vista `pages.search`; si la sugerencia no coincide con el título se puntúa contra el catálogo paginado. Pelis24 (`ww1.pelis24.blog`) queda fuera: responde **403** al runner de GitHub y a este entorno, y sus reproductores están tras un desafío de Cloudflare.
- Las pruebas automatizadas utilizan datos **simulados**, y además el CI ejecuta una comprobación en vivo (`[live]` en el mensaje del commit) que analiza los sitios reales desde el runner: FuegoCine devolvió HLS de Unlimplay para *La Odisea* y para `VisionQuest` S01E02, y TioAnime devolvió MP4 de YourUpload. No se descargan medios, así que no se verifica la reproducción de extremo a extremo. Se consultó la API pública de opciones de CinePlus123, pero no se pudo verificar aquí la extracción y reproducción de sus medios. Un enlace devuelto tampoco garantiza que siga funcionando.
- `crypto-js` se usa para descifrar enlaces de algunos reproductores. Su desarrollo ha sido descontinuado; conviene supervisar la dependencia y sustituirla en una futura actualización.
- El proyecto solo busca y entrega enlaces. Utilízalo únicamente con contenidos para los que tengas los derechos necesarios.

## Sonda y comprobación en vivo

`tools/probe-sites.js` lee el HTML de las fuentes candidatas y muestra solo las líneas del reproductor, la búsqueda y los enlaces de fichas; no descarga medios. Este entorno no alcanza los sitios, así que el reconocimiento se hace en GitHub Actions:

```bash
# .github/workflows/ci.yml responde a marcadores en el mensaje del commit
git commit -m "[probe] revisar selectores"   # escribe probe.txt y lo confirma en la rama
git commit -m "[live] comprobar fuentes"     # ejecuta tools/live-check.js y confirma live.txt
```

## Desarrollo

```bash
npm run check                       # build y pruebas sin red
node tools/live-check.js --site flixlatam --type movie --id 157336 --title "Interstellar"
node tools/live-check.js --site latanime --type tv --id 44 --season 2 --episode 1 --title "One Piece" --season-counts 12
node tools/live-check.js --site cineplus123 --type movie --id 157336 --title "Interstellar" --year 2014
node tools/live-check.js --site cineplus123 --type tv --id 106379 --season 1 --episode 1 --title "Fallout" --year 2024
```

En `live-check`, `--title` simula los metadatos, pero las páginas de la fuente se consultan realmente. Se ocultan los parámetros de las URLs en la salida. Esta herramienta no reproduce los medios ni garantiza que funcionen.

```text
manifest.json              # manifiesto único servido por el addon
render.yaml                # Blueprint de Render
addon/                     # servidor unificado, interfaz y transporte de documentos
src/core/ + src/providers/ # extractores VOD fuente
providers/                 # bundles internos generados por build.js
sports/                    # catálogo y extractores deportivos
  http.js                  # validación de URLs y DNS
  sources.js, extract.js   # filtros y resolución por fuente
tests/                     # pruebas y fixtures sintéticos
```

El descifrado de `_econfig` se contrastó con `dlhd-bridge`; su aviso MIT se incluye en `licenses/dlhd-bridge-MIT.txt`.
