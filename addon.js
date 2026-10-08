/**
 * Nexo Play - Stremio Addon
 * Tu Cine a tu alcance
 * 
 * Addon para Stremio que proporciona streaming de peliculas, series y anime
 * mediante proxy inverso para manifiestos HLS/M3U8 de Vimeus
 * 
 * Usa la API de Vimeus con view_key para obtener URLs de embed
 */

const addonBuilder = require('stremio-addon-sdk')
const express = require('express')
const axios = require('axios')
const { URL } = require('url')

// ============================================================================
// CONFIGURACIÓN DEL ADDON
// ============================================================================

const ADDON_CONFIG = {
  id: 'com.nexoplay.stremio',
  name: 'Nexo Play',
  description: 'Tu Cine a tu alcance',
  version: '1.1.0',
  icon: 'https://raw.githubusercontent.com/noe359866-code/NEW/main/icon.png',
  background: 'https://raw.githubusercontent.com/noe359866-code/NEW/main/background.jpg',
  catalogs: [],
  resources: ['stream'],
  types: ['movie', 'series', 'anime'],
  idPrefixes: ['tt']
}

// ============================================================================
// BASE DE DATOS SIMULADA DE TÍTULOS IMDb
// (En producción, esto debería obtenerse de una API como OMDb o TMDb)
// ============================================================================

const IMDb_TITLES = {
  // Series populares
  'tt0452046': 'Mentes Criminales',
  'tt0944947': 'Juego de Tronos',
  'tt0813715': 'Breaking Bad',
  'tt0795176': 'Dexter',
  'tt1190634': 'The Boys',
  'tt0413573': 'Dr. House',
  'tt0944949': 'The Walking Dead',
  'tt2085059': 'Black Mirror',
  'tt2306299': 'Vikings',
  'tt1825683': 'Black Panther',
  
  // Películas populares
  'tt0111161': 'Matrix',
  'tt1375666': 'El Origen',
  'tt0468569': 'El Caballero Oscuro',
  'tt0816692': 'Interestelar',
  'tt1392190': 'Mad Max: Furia en la Carretera',
  'tt0266543': 'El Señor de los Anillos: La Comunidad del Anillo',
  'tt0167260': 'El Señor de los Anillos: Las Dos Torres',
  'tt0120737': 'El Señor de los Anillos: El Retorno del Rey',
  'tt0109830': 'Forrest Gump',
  'tt0137523': 'El Padrino',
  'tt0068646': 'El Padrino II',
  'tt0167261': 'El Padrino III',
  'tt0102926': 'El Silencio de los Inocentes',
  'tt0110912': 'Pulp Fiction',
  'tt0114369': 'Seven',
  'tt0133093': 'El Show de Truman',
  'tt0120338': 'Titanic',
  'tt0482571': 'El Orfanato',
  'tt0367879': 'El Laberinto del Fauno',
  
  // Anime populares
  'tt0423731': 'Attack on Titan',
  'tt2560140': 'Attack on Titan',
  'tt0450447': 'Death Note',
  'tt0810143': 'Naruto',
  'tt0479703': 'Naruto Shippuden',
  'tt0434709': 'One Piece',
  'tt0412649': 'Bleach',
  'tt0803081': 'Dragon Ball Z',
  'tt2593560': 'My Hero Academia',
  'tt0809547': 'Demon Slayer',
  'tt10233238': 'Jujutsu Kaisen',
  'tt12413974': 'Chainsaw Man'
}

// ============================================================================
// CREAR EL BUILDER DEL ADDON
// ============================================================================

const builder = new addonBuilder(ADDON_CONFIG)

// ============================================================================
// CONFIGURACIÓN DEL PROXY
// ============================================================================

const PROXY_PORT = process.env.PORT || process.env.NEXOPLAY_PORT || 3000
const PROXY_BASE_URL = process.env.PROXY_BASE_URL || process.env.NEXOPLAY_BASE_URL || `http://localhost:${PROXY_PORT}`

// ============================================================================
// CONFIGURACIÓN DE VIMEUS
// ============================================================================

// View Key de Vimeus (requerida para todos los embeds)
const VIMEUS_VIEW_KEY = process.env.VIMEUS_VIEW_KEY || 'KgY3ACTXKP1F-sv8M6TEKIxqWToi6pyhFkLI1qDkUmA'

// URL base de Vimeus
const VIMEUS_BASE_URL = process.env.VIMEUS_BASE_URL || 'https://vimeus.com'

// Headers requeridos por Vimeus
const VIMEUS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://vimeus.com/',
  'Origin': 'https://vimeus.com'
}

// ============================================================================
// CREAR APLICACIÓN EXPRESS PARA EL PROXY
// ============================================================================

const app = express()

// Middleware para logging de requests
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  next()
})

// Middleware para CORS (permitir acceso desde cualquier origen)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
  next()
})

// ============================================================================
// ENDPOINT: /proxy/manifest
// Procesa manifiestos .m3u8 de Vimeus
// ============================================================================

app.get('/proxy/manifest', async (req, res) => {
  const { url, title } = req.query

  if (!url) {
    console.error('[Nexo Play] Error: URL parameter is required for /proxy/manifest')
    return res.status(400).json({ 
      error: 'URL parameter is required',
      addon: ADDON_CONFIG.id 
    })
  }

  try {
    console.log(`[Nexo Play] Processing manifest from: ${url}`)

    // Obtener el manifiesto original de Vimeus con las cabeceras requeridas
    const response = await axios.get(decodeURIComponent(url), {
      headers: {
        ...VIMEUS_HEADERS,
        'Accept': 'application/vnd.apple.mpegurl,application/x-mpegURL,text/plain'
      },
      timeout: 15000
    })

    let manifest = response.data

    // Inyectar la etiqueta #PLAYLIST-TITLE si se proporciona
    if (title) {
      const decodedTitle = decodeURIComponent(title)
      manifest = `#PLAYLIST-TITLE:${decodedTitle}\n${manifest}`
      console.log(`[Nexo Play] Injected PLAYLIST-TITLE: ${decodedTitle}`)
    }

    // Reescribir todas las líneas de segmentos (.ts, .m4s)
    const lines = manifest.split('\n')
    const baseUrl = new URL(decodeURIComponent(url))
    baseUrl.pathname = baseUrl.pathname.substring(0, baseUrl.pathname.lastIndexOf('/') + 1)

    const rewrittenLines = lines.map(line => {
      // Mantener comentarios y etiquetas M3U8
      if (line.startsWith('#') || line.trim() === '') {
        return line
      }

      // Es un segmento de video
      // Construir URL absoluta si es relativa
      let segmentUrl = line.trim()
      if (!segmentUrl.startsWith('http://') && !segmentUrl.startsWith('https://')) {
        segmentUrl = new URL(segmentUrl, baseUrl.href).href
      }

      // Reescribir para que pase por el endpoint /proxy/segment
      return `/proxy/segment?url=${encodeURIComponent(segmentUrl)}`
    })

    const newManifest = rewrittenLines.join('\n')
    
    // Establecer el Content-Type adecuado para M3U8
    res.type('application/vnd.apple.mpegurl')
    res.send(newManifest)
    
    console.log(`[Nexo Play] Manifest processed successfully`)
  } catch (error) {
    console.error('[Nexo Play] Error processing manifest:', error.message)
    if (error.response) {
      console.error('[Nexo Play] Response status:', error.response.status)
      console.error('[Nexo Play] Response data:', error.response.data?.substring(0, 200))
    }
    
    res.status(500).json({
      error: 'Error processing manifest',
      details: error.message,
      addon: ADDON_CONFIG.id
    })
  }
})

// ============================================================================
// ENDPOINT: /proxy/segment
// Proxy de segmentos con streaming continuo (sin saturar RAM)
// ============================================================================

app.get('/proxy/segment', async (req, res) => {
  const { url } = req.query

  if (!url) {
    console.error('[Nexo Play] Error: URL parameter is required for /proxy/segment')
    return res.status(400).json({ 
      error: 'URL parameter is required',
      addon: ADDON_CONFIG.id 
    })
  }

  try {
    console.log(`[Nexo Play] Proxying segment from: ${url}`)

    // Obtener el segmento con streaming (responseType: 'stream')
    const response = await axios({
      method: 'get',
      url: decodeURIComponent(url),
      responseType: 'stream',
      headers: VIMEUS_HEADERS,
      timeout: 30000
    })

    // Configurar headers para el response
    res.set({
      'Content-Type': response.headers['content-type'] || 'video/MP2T',
      'Content-Length': response.headers['content-length'],
      'Cache-Control': 'no-cache'
    })

    // Stream directamente sin cargar en memoria usando .pipe()
    response.data.pipe(res)
    
    console.log(`[Nexo Play] Segment streaming started`)
  } catch (error) {
    console.error('[Nexo Play] Error proxying segment:', error.message)
    if (error.response) {
      console.error('[Nexo Play] Response status:', error.response.status)
    }
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Error proxying segment',
        details: error.message,
        addon: ADDON_CONFIG.id
      })
    }
  }
})

// ============================================================================
// ENDPOINT: /manifest.json
// Servir el manifest del addon
// ============================================================================

app.get('/manifest.json', (req, res) => {
  res.json(ADDON_CONFIG)
})

// ============================================================================
// INICIAR EL SERVIDOR PROXY
// ============================================================================

const server = app.listen(PROXY_PORT, () => {
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║                   NEXO PLAY - STREMIO ADDON                  ║')
  console.log('║                  Tu Cine a tu alcance                       ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')
  console.log('')
  console.log(`📡 Addon ID: ${ADDON_CONFIG.id}`)
  console.log(`🌐 Server running on port: ${PROXY_PORT}`)
  console.log(`🔗 Proxy base URL: ${PROXY_BASE_URL}`)
  console.log(`🔑 Vimeus View Key: ${VIMEUS_VIEW_KEY.substring(0, 10)}...`)
  console.log('')
  console.log('📋 Endpoints disponibles:')
  console.log(`   - GET /manifest.json - Manifest del addon`)
  console.log(`   - GET /proxy/manifest?url={url}&title={title} - Procesar M3U8`)
  console.log(`   - GET /proxy/segment?url={url} - Proxy de segmentos`)
  console.log('')
  console.log('🎬 Formato de IDs:')
  console.log('   - Películas: tt1234567')
  console.log('   - Series: tt0452046:1:1 (IMDb:temporada:episodio)')
  console.log('   - Anime: tt0452046:1:1 (IMDb:temporada:episodio)')
  console.log('')
  console.log('✅ Addon listo para usar en Stremio!')
  console.log('')
})

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGTERM', () => {
  console.log('\n[Nexo Play] Recibida señal SIGTERM, apagando gracefully...')
  server.close(() => {
    console.log('[Nexo Play] Servidor cerrado correctamente')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('\n[Nexo Play] Recibida señal SIGINT, apagando gracefully...')
  server.close(() => {
    console.log('[Nexo Play] Servidor cerrado correctamente')
    process.exit(0)
  })
})

// ============================================================================
// STREAM HANDLER
// Maneja las solicitudes de streams de Stremio
// ============================================================================

builder.defineStreamHandler(async ({ type, id, extra }) => {
  console.log(`[Nexo Play] Stream request - Type: ${type}, ID: ${id}`)

  // Parsear el ID
  const parts = id.split(':')
  const imdbId = parts[0].toLowerCase().trim()
  let season, episode

  if (parts.length === 3) {
    // Serie o Anime: tt0452046:1:1
    season = parts[1].trim()
    episode = parts[2].trim()
    console.log(`[Nexo Play] Detected series/anime - Season: ${season}, Episode: ${episode}`)
  } else {
    // Película: tt1234567
    console.log(`[Nexo Play] Detected movie`)
  }

  // Obtener el nombre de la película/serie/anime de la base de datos simulada
  const name = IMDb_TITLES[imdbId] || 'Contenido'
  console.log(`[Nexo Play] Found title: ${name}`)

  // Formatear el título del stream según el tipo
  let streamTitle
  if (season && episode) {
    // Serie o Anime: Nexo Playes [Nombre] T[Temporada]-EPI[Episodio]
    streamTitle = `Nexo Playes ${name} T${season}-EPI${episode}`
  } else {
    // Película: Nexo Playes [Nombre de la película]
    streamTitle = `Nexo Playes ${name}`
  }

  console.log(`[Nexo Play] Stream title: ${streamTitle}`)

  // Construir la URL de Vimeus según el tipo de contenido
  // Usando la API de Vimeus con view_key
  let vimeusEmbedUrl
  
  if (season && episode) {
    // Para series y anime con temporada y episodio
    // Determinar si es anime o serie basado en el type
    const contentType = type === 'anime' ? 'anime' : 'serie'
    vimeusEmbedUrl = `${VIMEUS_BASE_URL}/e/${contentType}?imdb=${imdbId}&se=${season}&ep=${episode}&view_key=${VIMEUS_VIEW_KEY}`
  } else {
    // Para películas
    vimeusEmbedUrl = `${VIMEUS_BASE_URL}/e/movie?imdb=${imdbId}&view_key=${VIMEUS_VIEW_KEY}`
  }
  
  console.log(`[Nexo Play] Vimeus embed URL: ${vimeusEmbedUrl}`)

  // Construir la URL del proxy con el título codificado
  const proxyManifestUrl = `${PROXY_BASE_URL}/proxy/manifest?url=${encodeURIComponent(vimeusEmbedUrl)}&title=${encodeURIComponent(streamTitle)}`
  console.log(`[Nexo Play] Proxy manifest URL: ${proxyManifestUrl}`)

  // Devolver el stream
  return {
    streams: [
      {
        url: proxyManifestUrl,
        title: streamTitle,
        behaviorHints: {
          // Indicar que es un stream HLS
          proxy: false,
          notWebReady: false,
          type: 'hls',
          // Configuración para mejor reproducción
          container: 'm3u8',
          videoCodec: 'h264',
          audioCodec: 'aac'
        }
      }
    ]
  }
})

// ============================================================================
// EXPORTAR EL INTERFACE DEL ADDON
// ============================================================================

console.log('[Nexo Play] Initializing addon interface...')
module.exports = builder.getInterface()
