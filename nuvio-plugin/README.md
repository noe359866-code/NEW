# Nuvio · Scrapers en español

Repositorio de plugins para [Nuvio](https://nuvio.wiki/integrations/plugins) con siete scrapers
escritos a mano a partir de la inspección real de cada sitio (noviembre de 2026), no de recetas
antiguas de blogs.

Cada scraper es un **único archivo CommonJS** autocontenido, sin dependencias externas: dentro se
inyecta un núcleo común (texto, HTTP, SHA-1/SHA-256, bencode, magnet, TMDB, descifrado de
acortadores) y el provider solo añade la lógica del sitio.

```
manifest.json                # índice que Nuvio descarga cada 6 h
providers/<id>.js            # bundles listos para producción (1 archivo por sitio)
src/core/*.js                # núcleo compartido (00-util … 80-shortlink)
src/providers/<id>.js        # fuente delgada de cada sitio (marcador /*__CORE__*/)
build.js                     # concatenación + validación del manifiesto
tests/                       # 32 pruebas con fixtures HTML reales y red simulada
tools/live-check.js          # prueba contra los sitios reales (necesita red)
docs/                        # dossier de investigación + panel interactivo
```

## Instalación en Nuvio

1. Publica este repositorio (o solo la carpeta `nuvio-plugin`) en GitHub, en la raíz.
2. Nuvio → **Ajustes → Contenido y descubrimiento → Plugins → Añadir repositorio**.
3. Pega la URL del `manifest.json` (por ejemplo
   `https://raw.githubusercontent.com/<usuario>/<repo>/main/nuvio-plugin/manifest.json`)
   o del repositorio si el manifiesto está en la raíz.
4. Activa los scrapers que quieras. Nuvio solo permite instalar plugins por sideload; cada uno se
   ejecuta aislado en QuickJS, sin acceso a Node, `Buffer` ni almacenamiento.

## Los siete sitios

| id | Sitio | Dominio comprobado (nov 2026) | Cómo se obtiene la fuente |
|----|-------|-------------------------------|---------------------------|
| `dontorrent` | DonTorrent | `dontorrent.tips` | `POST /buscar` → ficha → `a.protected-download` → **proof-of-work SHA-256** (`/api_validate_pow.php`) → `.torrent` → infohash → magnet |
| `mejortorrent` | MejorTorrent | `www47.mejortorrent.eu` | Mismo software que DonTorrent (mismo PoW y mismas rutas) |
| `elitetorrent` | EliteTorrent | `www.elitetorrent.com` | `GET /?s=` → `acortame-esto.com/s.php?i=…` → Base64 ×N + ROT13 → `.torrent` o magnet |
| `divxtotal` | DivxTotal | `divxtotal.foo` | `GET /?s=` → ficha → `download_tt.php?u=<base64(URL .torrent)>` (y variante `short-info.link`) |
| `torrentlandia` | TorrentLandia | sin dominio activo | Se envía **desactivado**; acepta un `baseUrl` manual si el sitio reaparece |
| `wolfmax4k` | WolfMax4K → WolfTorrent | `wolftorrent.com` | `/api/descargas` → Enlacito → `var link_out` (Base64 o AES-CBC) → `.torrent`. **Cloudflare Turnstile** desde oct-2026 |
| `sinsitio` | SinSitio | `www.sinsitio.site` | DLE `?do=search` → ficha → `ddlUrl.php?url=<base64>` → `.torrent` |

Todos los providers comprueban varios dominios en orden y se quedan con el primero que responde
(menos TorrentLandia, que no tiene ninguno vivo).

## Qué devuelve cada fuente

Objetos de stream que Nuvio entiende:

```js
{
  name: 'DonTorrent',
  title: 'Reacher · T1E2 · 1080p',
  url: 'magnet:?xt=urn:btih:<sha1(info)>',
  quality: '1080p',           // normalizada a 2160p/1080p/720p/480p/SD
  size: '1.35 GB',
  language: 'Castellano',
  provider: 'dontorrent',
  type: 'torrent',
  infoHash: '…',
  headers: { Referer: 'https://dontorrent.tips/pelicula/…' }
}
```

Los `.torrent` se descargan en memoria, se parsean con bencode y se convierten en magnet con el
**infohash real** (SHA-1 del diccionario `info`), así que funcionan con cualquier cliente y no
dependen de que el enlace siga vivo. Los ficheros descargados nunca superan el límite de 1 MiB que
impone Nuvio; si el `.torrent` es mayor, se descarta.

Idioma: se detecta de las banderas/etiquetas de cada ficha (Castellano, Latino, VOSE, VO) y se
descarta el audio original en inglés cuando el sitio lo distingue. EliteTorrent tiene un ajuste para
incluir o no VOSE.

## Ajustes por provider

Todos exponen `onSettings()` (`hasSettings: true` en el manifiesto) con:

- `maxResults`: número máximo de fuentes (4–12) — todos.
- `includeVose`: incluir inglés subtitulado — EliteTorrent.
- `baseUrl`: dominio manual — TorrentLandia.

Los ajustes llegan como `SCRAPER_SETTINGS` (clave → valor en texto) y se leen con el helper
`settings()` del núcleo, con validación de rangos y valores.

## Construir y probar

```bash
cd nuvio-plugin
npm run build      # regenera providers/*.js a partir de src/ y valida manifest.json
npm test           # 32 pruebas: núcleo + providers con red simulada
npm run check      # build + test
```

Las pruebas usan fixtures HTML capturados de los sitios reales y cadenas de descifrado verificadas
con Python contra el sitio en vivo (por ejemplo el infohash
`6D6FE32F4A7540CFD698C387A9F91084F16C70E3` de un `.torrent` real de EliteTorrent). No hay llamadas
de red: `fetch` está simulado.

Contra los sitios reales:

```bash
TMDB_API_KEY=tu_clave node tools/live-check.js --site divxtotal --type movie --id 31199
TMDB_API_KEY=tu_clave node tools/live-check.js --all --type tv --id 94997 --season 1 --episode 2
# sin clave TMDB puedes simular el título:
node tools/live-check.js --site elitetorrent --type movie --id 1 --title "Reacher" --year 2022
```

## Cómo funciona por dentro

- **Núcleo** (`src/core/`): normalización de texto y títulos, HTML sin DOM, `request()` que nunca
  lanza (12 s, reintento, cookies por host), SHA-1/SHA-256 en JS puro (QuickJS no trae `crypto`),
  bencode, magnet, TMDB (API oficial con respaldo por scraping de la web), deduplicación/orden de
  streams y decodificador de acortadores (hasta 10 capas de Base64 + ROT13).
- **Build**: `build.js` concatena `src/core/*.js` en orden alfabético dentro de cada provider (en el
  marcador `/*__CORE__*/`), envuelve todo en un IIFE con `'use strict'` y escribe
  `providers/<id>.js` (~58–68 KB). También valida ids únicos, existencia de archivos y tamaño < 5 MB.
- **Compatibilidad QuickJS**: sin ESM, sin `Buffer`, sin `XMLHttpRequest`; solo `fetch`, `URL`,
  `TextDecoder`, `atob/btoa`, `Promise`, `setTimeout`. `require()` se evita por completo.

## Limitaciones honestas

- **Cloudflare Turnstile** (WolfTorrent desde octubre de 2026) no se puede resolver desde un plugin:
  no hay navegador ni cookies de sesión válidas. El provider detecta el desafío, registra el motivo y
  devuelve `[]` en vez de fallar. Si el sitio lo retira, vuelve a funcionar sin cambios.
- **TorrentLandia** no tiene dominio operativo: `torrentlandia.site` no resuelve y ningún TLD alternativo
  responde. Se entrega desactivado y con `baseUrl` configurable, pero su parser no se pudo validar
  contra HTML real.
- **DonTorrent/MejorTorrent** dependen de un PoW con dificultad 3 y de la sesión que abre la ficha: el
  proveedor mantiene su propio tarro de cookies, pero un cambio en el endpoint o un bloqueo por IP
  dejará el provider sin resultados (siempre devolviendo `[]`, nunca un error).
- Los dominios cambian cada pocas semanas. Los providers prueban una lista corta de hosts conocidos;
  para arreglarlo basta editar el array de hosts y volver a ejecutar `npm run build`.
- Un plugin de Nuvio solo aporta fuentes: no descarga, no reproduce y no aloja contenido. Úsalo solo
  donde sea legal hacerlo.

## Documentación adicional

- `docs/research.md`: dossier por sitio (endpoints, selectores, cadenas de descifrado, fechas de
  comprobación y callejones sin salida).
- `docs/index.html`: panel interactivo con el estado de los siete sitios, la tubería de descarga y un
  decodificador de acortadores que funciona sin conexión.
