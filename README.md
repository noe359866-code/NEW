# Nexo Play - Stremio Addon

> **Tu Cine a tu alcance**

Addon para [Stremio](https://www.stremio.com/) que proporciona streaming de películas y series mediante proxy inverso para manifiestos HLS/M3U8.

## ✨ Características

- 🎬 **Soporte para películas y series** con ID de IMDb (prefijo `tt`)
- 🔄 **Proxy inverso** para manifiestos .m3u8 de Vimeus
- 📡 **Simulación de cabeceras HTTP** requeridas por Vimeus:
  - `User-Agent`: Navegador moderno
  - `Referer`: https://vimeus.com/
  - `Origin`: https://vimeus.com
- 🔧 **Reescritura de URLs** de segmentos (.ts, .m4s) para pasar por el proxy
- 🏷️ **Inyección de etiqueta `#PLAYLIST-TITLE`** con formato personalizado
- 💨 **Streaming de segmentos** con flujo continuo (responseType: 'stream' y .pipe()) para no saturar memoria RAM
- 📝 **Formato de títulos personalizado**:
  - Series: `Nexo Playes [Nombre] T[Temporada]-EPI[Episodio]`
  - Películas: `Nexo Playes [Nombre de la película]`

## 📦 Instalación

### Requisitos

- [Node.js](https://nodejs.org/) 16+ (recomendado 18+)
- [npm](https://www.npmjs.com/) o [yarn](https://yarnpkg.com/)
- [Stremio](https://www.stremio.com/) instalado

### Pasos

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/noe359866-code/NEW.git nexoplay-addon
   cd nexoplay-addon
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno (opcional)**
   
   Crear un archivo `.env` o exportar variables:
   ```bash
   export PORT=3000
   export PROXY_BASE_URL=http://localhost:3000
   ```
   
   | Variable | Descripción | Valor por defecto |
   |----------|-------------|------------------|
   | `PORT` | Puerto del servidor proxy | 3000 |
   | `PROXY_BASE_URL` | URL base del proxy | http://localhost:3000 |
   | `NEXOPLAY_PORT` | Alternativa a PORT | 3000 |
   | `NEXOPLAY_BASE_URL` | Alternativa a PROXY_BASE_URL | http://localhost:3000 |

4. **Iniciar el addon**
   ```bash
   npm start
   ```
   
   O para desarrollo con auto-reload:
   ```bash
   npm run dev
   ```

5. **Configurar en Stremio**
   
   - Abrir Stremio
   - Ir a "Addons" (o "Complementos" en español)
   - Hacer clic en "Install from URL" (o "Instalar desde URL")
   - Ingresar la URL del manifest: `http://tuservidor:3000/manifest.json`
   - Hacer clic en "Install" (o "Instalar")

## 🎯 Uso

### Formato de IDs

El addon soporta dos formatos de IDs basados en IMDb:

#### Películas
```
tt1234567
```
Ejemplo: `tt1375666` → "Nexo Playes El Origen"

#### Series
```
tt0452046:1:1
```
- `tt0452046`: ID de IMDb de la serie
- `1`: Temporada
- `1`: Episodio

Ejemplo: `tt0452046:1:1` → "Nexo Playes Mentes Criminales T1-EPI1"

### Ejemplos de búsqueda en Stremio

| Tipo | ID | Título resultante |
|------|-----|-------------------|
| Película | `tt0111161` | Nexo Playes Matrix |
| Película | `tt1375666` | Nexo Playes El Origen |
| Serie | `tt0452046:1:1` | Nexo Playes Mentes Criminales T1-EPI1 |
| Serie | `tt0944947:8:10` | Nexo Playes Juego de Tronos T8-EPI10 |

## 🏗️ Arquitectura

### Componentes principales

```
┌─────────────────────────────────────────────────────────────┐
│                        Stremio Client                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Nexo Play Addon                          │
│  ┌─────────────────────────────────────────────────────────┐│
│  │  Stream Handler                                             ││
│  │  - Recibe: type, id (ej: tt0452046:1:1)                   ││
│  │  - Formatea título                                         ││
│  │  - Devuelve URL del proxy                                  ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Proxy Server                              │
│  ┌───────────────────────┐  ┌─────────────────────────────┐  │
│  │  /proxy/manifest       │  │  /proxy/segment               │  │
│  │  - Obtiene M3U8 de      │  │  - Proxy de segmentos .ts    │  │
│  │    Vimeus               │  │  - Streaming con .pipe()     │  │
│  │  - Inyecta PLAYLIST-    │  │  - Sin saturación de RAM     │  │
│  │    TITLE                │  │                             │  │
│  │  - Reescribe URLs de    │  │                             │  │
│  │    segmentos            │  │                             │  │
│  └───────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        Vimeus Server                           │
│  - Proveedor de contenido HLS/M3U8                             │
└─────────────────────────────────────────────────────────────┘
```

### Flujo de datos

1. **Stremio** solicita streams para un ID (ej: `tt0452046:1:1`)
2. **Stream Handler** del addon:
   - Parse el ID
   - Obtiene el nombre de la base de datos
   - Formatea el título: `Nexo Playes Mentes Criminales T1-EPI1`
   - Devuelve URL: `http://localhost:3000/proxy/manifest?url=...&title=...`
3. **Stremio** solicita el manifiesto al proxy
4. **Proxy /proxy/manifest**:
   - Descarga el M3U8 de Vimeus con cabeceras correctas
   - Inyecta `#PLAYLIST-TITLE:Nexo Playes Mentes Criminales T1-EPI1`
   - Reescribe URLs de segmentos: `/proxy/segment?url=...`
   - Devuelve el M3U8 modificado
5. **Stremio** solicita segmentos al proxy
6. **Proxy /proxy/segment**:
   - Descarga el segmento de Vimeus con streaming
   - Usa `.pipe()` para transmitir sin cargar en memoria
   - Devuelve el segmento al cliente

## 🔧 Configuración Avanzada

### Usar una API real de IMDb

Actualmente, el addon usa una base de datos simulada de títulos. Para usar una API real:

1. **Registrarse en [OMDb API](http://www.omdbapi.com/)** para obtener una API key
2. **Modificar el Stream Handler** en `addon.js`:

```javascript
// Reemplazar la función getIMDbName con una llamada a la API
async function getIMDbName(imdbId) {
  try {
    const response = await axios.get(`http://www.omdbapi.com/?i=${imdbId}&apikey=YOUR_API_KEY`)
    return response.data.Title
  } catch (error) {
    console.error('Error fetching from OMDb:', error.message)
    return 'Contenido'
  }
}
```

### Desplegar en producción

Para desplegar el addon en un servidor:

1. **Usar PM2 para gestión de procesos**
   ```bash
   npm install -g pm2
   pm2 start addon.js --name nexoplay-addon
   pm2 save
   pm2 startup
   ```

2. **Configurar Nginx como reverse proxy (opcional)**
   ```nginx
   server {
       listen 80;
       server_name nexoplay.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

3. **Usar HTTPS con Let's Encrypt**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d nexoplay.yourdomain.com
   ```

4. **Configurar en Stremio**
   Usar la URL: `https://nexoplay.yourdomain.com/manifest.json`

## 📊 Endpoints del Proxy

| Endpoint | Método | Descripción | Parámetros |
|----------|--------|-------------|-------------|
| `/manifest.json` | GET | Devuelve el manifest del addon | - |
| `/proxy/manifest` | GET | Procesa manifiestos M3U8 | `url` (requerido), `title` (opcional) |
| `/proxy/segment` | GET | Proxy de segmentos de video | `url` (requerido) |

## 🎨 Formato de Títulos

El addon formatea automáticamente los títulos según el tipo de contenido:

### Series
```
Nexo Playes [Nombre de la Serie] T[Temporada]-EPI[Episodio]
```

Ejemplos:
- `Nexo Playes Mentes Criminales T1-EPI1`
- `Nexo Playes Juego de Tronos T8-EPI10`
- `Nexo Playes Breaking Bad T5-EPI16`

### Películas
```
Nexo Playes [Nombre de la Película]
```

Ejemplos:
- `Nexo Playes El Origen`
- `Nexo Playes Matrix`
- `Nexo Playes El Padrino`

## 🛠️ Tecnologías Utilizadas

- **[Node.js](https://nodejs.org/)** - Entorno de ejecución JavaScript
- **[Express](https://expressjs.com/)** - Framework para servidor HTTP
- **[Axios](https://axios-http.com/)** - Cliente HTTP para requests
- **[Stremio Addon SDK](https://github.com/Stremio/stremio-addon-sdk)** - SDK oficial de Stremio
- **[HLS/M3U8](https://developer.apple.com/streaming/fps/)** - Protocolo de streaming

## 📜 Licencia

MIT License - Ver archivo [LICENSE](LICENSE) para más detalles.

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor, abre un Issue o envía un Pull Request.

## 📞 Soporte

Si tienes problemas o preguntas:

1. Verifica que el servidor proxy esté en ejecución
2. Revisa los logs de la consola
3. Asegúrate de que las URLs estén correctamente configuradas
4. Abre un Issue en el repositorio

## 📝 Notas

- Este addon está diseñado para trabajar con **Vimeus** como proveedor de contenido
- Las URLs de Vimeus deben ser accesibles desde el servidor donde se ejecuta el proxy
- El addon simula las cabeceras requeridas por Vimeus para evitar bloqueos
- El streaming de segmentos usa `.pipe()` para evitar saturación de memoria RAM

---

**© 2024 Nexo Play - Tu Cine a tu alcance**
