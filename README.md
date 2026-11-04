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
- **Backend interno para addons**: consulta manifests, catálogos, metadatos y streams sin depender
  del CORS del navegador. La API limita destinos, tiempo y tamaño de respuesta.
- **PWA instalable y offline**: el service worker cachea el shell y las imágenes; la app guarda
  catálogos y metadatos en el dispositivo para consultarlos sin conexión.
- **Sin analítica ni CDN**: los addons y la lista se guardan localmente. El modo "solo datos
  guardados" evita las consultas a addons; las imágenes y enlaces aún pueden usar la red.
- Enlaces profundos: `?addon=https://…/manifest.json` instala un addon al abrir la app.

## Cómo funciona

```
Navegador (React + Vite)
   └── POST /api/addon (servidor interno de Nébula)
         ├── Cinemeta → catálogos y metadatos
         └── Addons → manifest, catalog, meta y stream
```

El servidor hace las consultas JSON, por lo que los addons no necesitan habilitar CORS. Las URLs
configuradas de los addons pueden contener claves: se envían al servidor interno y al addon, sin
registrarse ni almacenarse deliberadamente en el servidor. La lista de addons, favoritos y la caché
persistente permanecen en `localStorage` del navegador. Las imágenes y los enlaces de reproducción
se cargan directamente desde sus proveedores; el backend no transmite vídeo ni convierte torrents.

Por seguridad, el backend solo permite HTTP(S) hacia direcciones IP públicas, valida cada resolución
DNS y redirección y bloquea localhost, redes privadas y otros destinos reservados. Esto significa que
**no puede consultar addons autoalojados accesibles únicamente por la red local**. Limita cada respuesta
a 2 MB y la consulta a 12 segundos. No expongas el servidor a Internet sin protección adicional:
la API no tiene cuentas ni autenticación; usa un proxy autenticado o restringe el acceso a tu red de
confianza. No actúa como proxy general de archivos.

En **Addons → Datos y privacidad**, «Solo datos guardados» desactiva las consultas a addons y usa
la caché guardada; no bloquea la carga de imágenes ni la apertura de enlaces. La caché local guarda
catálogos y metadatos hasta 7 días (80 respuestas, 250 KB por respuesta). Cinemeta puede cambiarse
por una instancia con dirección pública.

Para alojar frontend y backend juntos:

```bash
docker compose up -d --build   # http://localhost:8080
```

## Desarrollo

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # typecheck + build de producción
npm run preview  # sirve dist/ con la API
npm start        # servidor de producción (ejecutar npm run build primero)
npm test         # pruebas del backend
docker compose up -d --build   # autoalojado en http://localhost:8080
```

Requisitos: Node 18+ (recomendado Node 20+).

## Estructura

```
server/                  API interna y servidor de producción
test/                    pruebas de la API
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

- Los errores de conexión pueden deberse a que el addon esté caído, devuelva JSON inválido o use
  una dirección privada bloqueada por seguridad.
- Los `magnet` se copian al portapapeles porque un navegador móvil no puede abrirlos; pégalos en tu
  cliente de torrents.
- **Nébula no aloja ni distribuye contenido.** Los enlaces provienen de los addons que tú decides
  activar. Respeta las leyes de tu país.

## Licencia

MIT.
