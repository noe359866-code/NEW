'use strict';

// Validación de URLs y DNS usada por el transporte de documentos del addon.
// Las direcciones obtenidas aquí nunca abren un socket sin publicLookup.
const dns = require('node:dns');
const { BlockList, isIP } = require('node:net');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const blocked = new BlockList();
for (const [ip, bits] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) blocked.addSubnet(ip, bits, 'ipv4');

function publicAddress(address) {
  return isIP(address) === 4 && !blocked.check(address, 'ipv4');
}

// El DNS validado se pasa directamente al socket. No hay segunda resolución.
function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { family: 4, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) {
      return callback(new Error('Destino no público'));
    }
    if (options && options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, 4);
  });
}

function safeUrl(value, base, { page = false } = {}) {
  if (value == null || !String(value).trim()) return null;
  let url;
  try { url = new URL(String(value), base); } catch { return null; }
  if (!(url.protocol === 'https:' || (!page && url.protocol === 'http:'))) return null;
  const host = String(url.hostname || '').toLowerCase().replace(/\.+$/, '');
  if (url.username || url.password || !host || !host.includes('.') ||
      isIP(host.replace(/^\[|\]$/g, '')) || /[%\\]/.test(host) ||
      /(?:^|\.)(?:localhost|local|internal|localdomain)$/.test(host) ||
      /^(?:\d+|0x[0-9a-f]+)(?:\.(?:\d+|0x[0-9a-f]+))*$/i.test(host)) return null;
  if (page && url.port && url.port !== '443') return null;
  return url.href;
}

function mediaUrl(value, base) {
  const url = safeUrl(value, base);
  if (!url) return null;
  return /\.(?:m3u8|mp4)$/i.test(new URL(url).pathname) ? url : null;
}

// Heurística conservadora para anuncios y trailers identificables. No se
// incorpora a mediaUrl: el transporte debe seguir reconociendo esas URLs como
// medios para no descargarlas aunque no se vayan a entregar al cliente.
function isAdvertisementUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.toLowerCase();
    return /(?:^|\.)(?:ads?|adserver|adservice|advert(?:ising|isement)?|doubleclick|googlesyndication|google-analytics|youtube|youtube-nocookie|youtu)(?:[.-]|$)/.test(host) ||
      /(?:^|\/)(?:ads?|adverts?|advertising|advertisement|anuncios?|publicidad|trailers?|pre-?rolls?|banners?)(?:[\/_.-]|$)/.test(path);
  } catch { return true; }
}

module.exports = { UA, safeUrl, mediaUrl, isAdvertisementUrl, publicAddress, publicLookup };
