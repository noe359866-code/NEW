'use strict';
// Utilidades de texto para comparar titulos entre AniList y los sitios en español.

function normalize(str) {
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function slugify(str) {
  return normalize(str).replace(/\s+/g, '-');
}

// Similitud simple por palabras (0..1). Suficiente para elegir el mejor candidato.
function titleScore(candidate, target) {
  const a = new Set(normalize(candidate).split(' ').filter(Boolean));
  const b = new Set(normalize(target).split(' ').filter(Boolean));
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

function bestTitleScore(candidate, titles) {
  let best = 0;
  for (const t of titles || []) best = Math.max(best, titleScore(candidate, t));
  return best;
}

// Extrae temporada de titulos tipo "Nombre S2", "Nombre 2", "Nombre - Temporada 2"
function parseSeason(title) {
  const m = /\b(?:s|season|temporada|temp)\s*0*(\d{1,2})\b/i.exec(String(title || '')) ||
            /\b0*(\d{1,2})\s*(?:temporada|season)\b/i.exec(String(title || ''));
  return m ? parseInt(m[1], 10) : null;
}

function stripDubSuffix(title) {
  return String(title || '')
    .replace(/\s+(latino|castellano|catal[aá]n|sub|subs)\s*$/i, '')
    .replace(/\s+(s|season|temporada)\s*\d{1,2}\s*$/i, '')
    .trim();
}

module.exports = { normalize, slugify, titleScore, bestTitleScore, parseSeason, stripDubSuffix };
