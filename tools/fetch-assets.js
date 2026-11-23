#!/usr/bin/env node
/**
 * Descarga activos de un reproductor concreto para analizarlos fuera del
 * entorno de ejecución (el sandbox de desarrollo no tiene salida a internet).
 *
 * Escribe en `.probe-assets/` y el workflow los publica como artefacto.
 * No descarga medios, solo páginas y scripts del reproductor.
 *
 * Uso: node tools/fetch-assets.js
 */
'use strict';

const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const OUT = path.join(__dirname, '..', '.probe-assets');
const PLAYER = 'https://player.abyssplayer.com/K8R6OOjS7';
const SCRIPT = 'https://iamcdn.net/player-v2/core.bundle.js';

async function grab(url, file) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-ES,es;q=0.9' } });
  const body = await res.text();
  fs.writeFileSync(path.join(OUT, file), body);
  console.log(file + ': ' + res.status + ' ' + body.length + ' bytes');
  return body;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const page = await grab(PLAYER, 'player.html');
  await grab(SCRIPT, 'core.bundle.js');
  // Scripts adicionales que referencia la página del reproductor.
  const srcs = [...page.matchAll(/<script[^>]+src="(https:\/\/[^"]+)"/g)].map(m => m[1]);
  console.log('scripts: ' + srcs.join(' '));
  for (const src of srcs.slice(0, 6)) {
    const name = src.split('/').pop().replace(/[^\w.-]/g, '_');
    try { await grab(src, name); } catch (e) { console.log(name + ': ERR ' + e.message); }
  }
})();
