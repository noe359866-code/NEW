# Anime Solo Streams — Addon de Stremio (solo streams)

Addon de Stremio que **solo resuelve streams** de anime en español latino. **Sin catálogos ni metadatos**: usa tu addon de metadatos favorito (Cinemeta, TMDB, Kitsu...) y este solo pone los enlaces desde **TioAnime**, **Latanime** y **AnimeAV1**.

Inspirado en la arquitectura de [animeflv-stremio-addon](https://github.com/Pigamer37/animeflv-stremio-addon) (Pigamer37), implementado desde cero en Node.js + Express. Pensado para **Render**.

## Despliegue en Render

1. Sube este repo a GitHub.
2. En Render → **New → Web Service** → conecta el repo.
3. Render detecta `render.yaml` (build `npm install`, start `npm start`). Si lo creas manual:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node, versión 20.x
4. Cuando esté en línea, instala en Stremio con:
   ```
   https://TU-SERVICIO.onrender.com/manifest.json
   ```

Local:
```bash
npm install
npm start   # http://localhost:8080
```

## IDs compatibles

- `anilist:123:2`, `mal:456:2`, `kitsu:789:2`, `anidb:101:2` (ID + episodio)
- `tt1234567:1:2` (IMDB + temporada + episodio), `tmdb:123:1:2`
- Nativos: `tioanime:slug:ep`, `latanime:slug:ep`, `animeav1:slug:ep`

AniList/ani.zip solo se usan **internamente** para traducir el ID al título romaji que buscan los sitios. No se expone ningún endpoint de catálogo o metadatos.

## Endpoints

```
/manifest.json   (solo recurso "stream", sin catalogos)
/stream/:type/:id.json
/health
```

## Estructura

```
index.js            Servidor Express + manifest (solo stream)
lib/anilist.js      Resolucion ID -> titulo (interna, para streams)
lib/http.js         Fetch con UA de navegador + cache
lib/text.js         Normalizacion y comparacion de titulos
lib/streams.js      Extraccion de m3u8/mp4 de reproductores
providers/tioanime.js
providers/latanime.js
providers/animeav1.js
```

## Notas

- Los sitios pueden bloquear IPs de datacenter o cambiar su HTML. Si un proveedor falla, los otros dos siguen funcionando.
- Los streams directos se intentan extraer del reproductor; si no es posible, se devuelve `externalUrl` para abrir en el navegador.
- No retransmite video: solo devuelve enlaces.

## Licencia

MIT. No afiliado a AniList, TioAnime, Latanime ni AnimeAV1.
