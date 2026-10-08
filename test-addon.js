/**
 * Script de prueba para el addon Nexo Play
 * 
 * Este script permite probar el addon sin necesidad de Stremio
 */

const axios = require('axios')

// Configuración
const PROXY_BASE_URL = 'http://localhost:3000'

// Función para probar el manifest del addon
async function testManifest() {
  console.log('\n📋 Probando manifest del addon...')
  try {
    const response = await axios.get(`${PROXY_BASE_URL}/manifest.json`)
    console.log('✅ Manifest obtenido correctamente:')
    console.log(JSON.stringify(response.data, null, 2))
  } catch (error) {
    console.error('❌ Error al obtener manifest:', error.message)
  }
}

// Función para probar el stream handler (simulado)
async function testStreamHandler() {
  console.log('\n🎬 Probando Stream Handler...')
  
  const testCases = [
    { type: 'movie', id: 'tt1375666', description: 'Película: El Origen' },
    { type: 'series', id: 'tt0452046:1:1', description: 'Serie: Mentes Criminales T1-EPI1' },
    { type: 'series', id: 'tt0944947:8:10', description: 'Serie: Juego de Tronos T8-EPI10' }
  ]
  
  for (const testCase of testCases) {
    console.log(`\n  Probando: ${testCase.description}`)
    console.log(`  Type: ${testCase.type}, ID: ${testCase.id}`)
    
    // Simular lo que haría el stream handler
    const parts = testCase.id.split(':')
    const imdbId = parts[0].toLowerCase()
    let season, episode
    
    if (parts.length === 3) {
      season = parts[1]
      episode = parts[2]
    }
    
    // Base de datos simulada
    const IMDb_TITLES = {
      'tt1375666': 'El Origen',
      'tt0452046': 'Mentes Criminales',
      'tt0944947': 'Juego de Tronos'
    }
    
    const name = IMDb_TITLES[imdbId] || 'Contenido'
    let streamTitle
    
    if (season && episode) {
      streamTitle = `Nexo Playes ${name} T${season}-EPI${episode}`
    } else {
      streamTitle = `Nexo Playes ${name}`
    }
    
    const vimeusManifestUrl = `https://vimeus.com/hls/${imdbId}/index.m3u8`
    const proxyManifestUrl = `${PROXY_BASE_URL}/proxy/manifest?url=${encodeURIComponent(vimeusManifestUrl)}&title=${encodeURIComponent(streamTitle)}`
    
    console.log(`  Título: ${streamTitle}`)
    console.log(`  URL del proxy: ${proxyManifestUrl}`)
  }
}

// Función para probar el proxy de manifest
async function testProxyManifest() {
  console.log('\n🔄 Probando proxy de manifest...')
  
  // URL de ejemplo (esto no funcionará sin un servidor Vimeus real)
  const testUrl = 'https://example.com/stream/master.m3u8'
  const testTitle = 'Nexo Playes Test Movie'
  
  console.log(`  URL: ${testUrl}`)
  console.log(`  Título: ${testTitle}`)
  
  try {
    const proxyUrl = `${PROXY_BASE_URL}/proxy/manifest?url=${encodeURIComponent(testUrl)}&title=${encodeURIComponent(testTitle)}`
    console.log(`  URL del proxy: ${proxyUrl}`)
    
    // Nota: Esto fallará porque la URL de ejemplo no existe
    // Pero muestra cómo sería la estructura
    console.log('  ⚠️  No se puede probar sin una URL real de Vimeus')
  } catch (error) {
    console.error('  ❌ Error:', error.message)
  }
}

// Función para probar el proxy de segmentos
async function testProxySegment() {
  console.log('\n📦 Probando proxy de segmentos...')
  
  // URL de ejemplo
  const testUrl = 'https://example.com/segment1.ts'
  
  console.log(`  URL: ${testUrl}`)
  
  try {
    const proxyUrl = `${PROXY_BASE_URL}/proxy/segment?url=${encodeURIComponent(testUrl)}`
    console.log(`  URL del proxy: ${proxyUrl}`)
    console.log('  ⚠️  No se puede probar sin una URL real de Vimeus')
  } catch (error) {
    console.error('  ❌ Error:', error.message)
  }
}

// Función principal
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗')
  console.log('║              NEXO PLAY - SCRIPT DE PRUEBAS                  ║')
  console.log('╚═══════════════════════════════════════════════════════════════╝')
  console.log('')
  
  await testManifest()
  await testStreamHandler()
  await testProxyManifest()
  await testProxySegment()
  
  console.log('\n')
  console.log('✅ Pruebas completadas!')
  console.log('')
  console.log('Para probar el addon completamente:')
  console.log('1. Inicia el servidor: npm start')
  console.log('2. Configura el addon en Stremio con: http://localhost:3000/manifest.json')
  console.log('3. Busca contenido con IDs como: tt1375666 o tt0452046:1:1')
  console.log('')
}

// Ejecutar pruebas
main().catch(error => {
  console.error('❌ Error en pruebas:', error.message)
  process.exit(1)
})
