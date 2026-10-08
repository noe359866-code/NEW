# Nexo Play - Stremio Addon Dockerfile
# Usa Node.js oficial como base

FROM node:18-alpine

# Configurar directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias
RUN npm ci --only=production

# Copiar archivos de la aplicación
COPY . .

# Exponer puerto
EXPOSE 3000

# Configurar variables de entorno
ENV NODE_ENV=production
ENV PORT=3000
ENV PROXY_BASE_URL=http://localhost:3000

# Comando de inicio
CMD ["node", "addon.js"]
