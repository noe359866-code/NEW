# Nébula ✦

Cliente **móvil** de cine y series con estética inspirada en **Apple TV**, construido sobre el
ecosistema de **Stremio**. Viene con **Cinemeta ya activado** y acepta cualquier addon que hable el
protocolo de Stremio.

> Solo móvil: la interfaz está diseñada para pantallas de teléfono (retrato). En escritorio se
> muestra dentro de un marco de teléfono como referencia de diseño.

---

## Qué incluye

- **Apple TV vibes**: ambiente difuminado que cambia según el título, vidrio esmerilado, carteles
  redondeados, pestañas tipo tvOS, tipografía del sistema (SF Pro), animaciones de foco y hoja de
  detalle a pantalla completa.
- **Cinemeta integrado**: catálogos de películas y series populares, géneros, búsqueda y metadatos
  completos (sinopsis, reparto, dirección, duración, nota IMDb, logo y fondo).
- **Protocolo de addons de Stremio**: instala por URL (`manifest.json`), lee `resources` con
  `types`/`idPrefixes`, consume `/catalog`, `/meta` y `/stream`, agrega resultados de todos los
  addons activos y los etiqueta por addon.
- **Fuentes agregadas** con detección de calidad (4K · 1080p · 720p · SD · CAM), seeders, tamaño,
  enlaces `http`, `magnet`, `infoHash`, `ytId` y `externalUrl`; copia el magnet con un toque.
- **Series**: temporadas agrupadas, lista de episodios con sinopsis y salto directo a fuentes del
  episodio (`tt123:1:2`).
- **Mi lista** local, **"Continuar viendo"** con lo último que abriste, **búsqueda global** con
  historial, **exploración por género** y **"Cargar más"** en catálogos paginables.
- **Gestor de addons con salud**: latencia real de cada manifest, aviso de addons caídos o lentos,
  instalación masiva (varias URLs a la vez) y soporte de enlaces `stremio://`.
- **PWA instalable y offline**: service worker propio (mismo origen, sin CDN) que cachea el shell,
  las respuestas de los addons y las imágenes; la app abre y navega sin red.
- **Sin servidores propios ni terceros**: cero backend, cero analítica, cero fuentes web, cero
  recursos de CDN. Cinemeta se puede apuntar a tu propia instancia y hay modo "solo datos
  guardados" que corta toda petición externa.
- Enlaces profundos: `?addon=https://…/manifest.json` instala un addon al abrir la app.

## Plugin de Nuvio (extra)

La carpeta [`nuvio-plugin/`](nuvio-plugin/README.md) contiene un repositorio de plugins para
[Nuvio](https://nuvio.wiki/integrations/plugins) con siete scrapers en español (DonTorrent,
MejorTorrent, EliteTorrent, DivxTotal, TorrentLandia, WolfMax4K y SinSitio), escritos tras inspeccionar
cada sitio en noviembre de 2026. Cada provider es un único archivo CommonJS sin dependencias; se
compila con `npm run build` dentro de esa carpeta y se instala en Nuvio pegando la URL de su
`manifest.json`.

- Dossier de investigación: [`nuvio-plugin/docs/research.md`](nuvio-plugin/docs/research.md)
- Panel interactivo (estado de los sitios + decodificador de acortadores):
  [`nuvio-plugin/docs/index.html`](nuvio-plugin/docs/index.html)

## Cómo funciona

```
Navegador (móvil)
   └── Nébula (React + Vite)
         ├── Cinemeta  https://v3-cinemeta.strem.io   → catálogos + metadatos
         └── Addons    manifest.json / catalog / meta / stream  → fuentes
```

Todo se resuelve en el cliente: no hay backend ni base de datos. Tus addons y tu lista viven en
`localStorage`.

## Sin servidores externos

Nébula es una **app estática**: no hay backend de Nébula, ni cuentas, ni analítica, ni llamadas a
CDN. Todo lo que necesita para arrancar (HTML, JS, CSS, iconos SVG, tipografía del sistema) viaja
con la app y se guarda en el dispositivo gracias al service worker.

Tres controles en **Addons → Datos y privacidad**:

| Control | Qué hace |
| --- | --- |
| **Solo datos guardados** | Bloquea cualquier petición de red. La app usa únicamente lo que ya está en caché local. |
| **Caché local** | Catálogos y metadatos se guardan 7 días en el dispositivo (hasta 80 respuestas, 250 KB por respuesta). |
| **Servidor de Cinemeta** | Por defecto el público de Stremio; puedes apuntarlo a tu instancia autoalojada. |

Y para que el servidor de la app también sea tuyo:

```bash
docker compose up -d --build   # http://localhost:8080
```

El `Dockerfile` compila y sirve con nginx: no hay procesos ni servicios de terceros.

**El límite honesto**: una app no puede inventar contenido. Catálogos, metadatos, imágenes y
fuentes vienen necesariamente de los addons que configures. Si quieres que ningún tercero
intervenga, autoaloja Cinemeta y tus addons en tu red, apunta ahí y activa el modo solo-local.

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # typecheck + build de producción
npm run preview  # sirve dist/
docker compose up -d --build   # autoalojado en http://localhost:8080
```

Requisitos: Node 18+.

## Estructura

```
src/
  App.tsx                 navegación, pila de pantallas, addons, lista y toasts
  lib/
    addons.ts             protocolo Stremio: manifests, catálogos, meta, streams, búsqueda
    api.ts                fetch con timeout/caché, URLs de imágenes, magnet, calidad
    types.ts              tipos del protocolo
    storage.ts, hooks.ts  persistencia y utilidades de React
  components/
    Home.tsx              hero + estanterías + géneros
    Detail.tsx            ficha, reparto, temporadas y episodios
    Streams.tsx           fuentes agregadas con filtros de calidad
    SearchView.tsx        búsqueda multi-addon
    LibraryView.tsx       Mi lista
    AddonsView.tsx        instalar, activar, eliminar addons + sugeridos
    GridView.tsx          "ver todo" con paginación
    ui.tsx, icons.tsx     piezas de interfaz e iconografía
  styles.css              sistema visual (tvOS)
```

## Añadir addons

1. Abre la pestaña **Addons**.
2. Pega la URL del addon (por ejemplo `https://torrentio.strem.fun/manifest.json`) o toca uno de
   los **sugeridos** (Torrentio, OpenSubtitles v3, WatchHub).
3. Actívalo o desactívalo con el interruptor; los addons integrados no se pueden eliminar.
4. Toca **Salud** para medir la latencia de cada addon y detectar los que estén caídos.

Si un addon exige configuración previa (por ejemplo filtros de Torrentio), usa la URL que genera su
página de configuración: ya incluye los ajustes.

## Notas

- Algunos addons no envían cabeceras CORS; en ese caso Nébula muestra el error y puedes probar con
  otro addon o abrir su enlace directamente.
- Los `magnet` se copian al portapapeles porque un navegador móvil no puede abrirlos; pégalos en tu
  cliente de torrents.
- **Nébula no aloja ni distribuye contenido.** Los enlaces provienen de los addons que tú decides
  activar. Respeta las leyes de tu país.

## Licencia

MIT.
