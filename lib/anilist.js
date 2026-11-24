'use strict';
// Cliente de AniList GraphQL (sin clave). Es la fuente de catalogos y metadatos:
// fiable, con portada, sinopsis, generos y episodios. Los streams vienen de los
// scrapers en providers/.

const API = 'https://graphql.anilist.co';

async function gql(query, variables = {}) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
  const json = await res.json();
  if (json.errors && json.errors.length) throw new Error(json.errors[0].message || 'AniList error');
  return json.data;
}

const FRAG = `
  id
  idMal
  title { romaji english native }
  description
  genres
  coverImage { extraLarge large }
  bannerImage
  seasonInt
  format
  status
  averageScore
  episodes
  duration
  startDate { year month day }
  endDate { year month day }
  studios { nodes { name } }
  trailer { youtubeId }
`;

function toType(format) {
  return format === 'MOVIE' ? 'movie' : 'series';
}

function toMeta(media) {
  if (!media) return null;
  const title = media.title?.english || media.title?.romaji || media.title?.native || 'Sin titulo';
  const type = toType(media.format);
  const meta = {
    id: `anilist:${media.id}`,
    type,
    name: title,
    poster: media.coverImage?.extraLarge || media.coverImage?.large || undefined,
    background: media.bannerImage || undefined,
    description: media.description ? media.description.replace(/<[^>]+>/g, '') : undefined,
    genres: media.genres || [],
    year: media.startDate?.year || undefined,
    imdbRating: media.averageScore ? (media.averageScore / 10).toFixed(1) : undefined,
    trailers: media.trailer?.youtubeId ? [{ source: media.trailer.youtubeId, type: 'Trailer', id: 'yt1' }] : undefined,
    videos: [],
  };
  // Episodios: AniList no da numeros por episodio, generamos 1..N
  const count = media.episodes || 0;
  if (type === 'series' && count > 0) {
    for (let i = 1; i <= count; i++) {
      meta.videos.push({
        id: `anilist:${media.id}:${i}`,
        title: `${title} — Episodio ${i}`,
        season: 1,
        episode: i,
        number: i,
        thumbnail: meta.poster,
        available: true,
      });
    }
  } else if (type === 'movie') {
    meta.videos = [{ id: `anilist:${media.id}:1`, title, season: 1, episode: 1, number: 1, thumbnail: meta.poster, available: true }];
  }
  return meta;
}

async function searchAnime(query, { page = 1, perPage = 30, genre, sort = 'SEARCH_MATCH' } = {}) {
  const q = `
    query($search:String,$page:Int,$perPage:Int,$genre:String,$sort:[MediaSort]) {
      Page(page:$page, perPage:$perPage) {
        pageInfo { hasNextPage currentPage }
        media(search:$search, genre:$genre, sort:$sort, type:ANIME, isAdult:false) { ${FRAG} }
      }
    }`;
  const data = await gql(q, { search: query || null, page, perPage, genre: genre || null, sort: [sort] });
  return (data.Page.media || []).map(toMeta).filter(Boolean);
}

async function trendingAnime({ page = 1, perPage = 30 } = {}) {
  const q = `
    query($page:Int,$perPage:Int) {
      Page(page:$page, perPage:$perPage) {
        pageInfo { hasNextPage }
        media(sort:TRENDING_DESC, type:ANIME, isAdult:false) { ${FRAG} }
      }
    }`;
  const data = await gql(q, { page, perPage });
  return (data.Page.media || []).map(toMeta).filter(Boolean);
}

async function airingAnime({ page = 1, perPage = 30 } = {}) {
  const q = `
    query($page:Int,$perPage:Int) {
      Page(page:$page, perPage:$perPage) {
        pageInfo { hasNextPage }
        media(sort:POPULARITY_DESC, type:ANIME, status:RELEASING, isAdult:false) { ${FRAG} }
      }
    }`;
  const data = await gql(q, { page, perPage });
  return (data.Page.media || []).map(toMeta).filter(Boolean);
}

async function getByAnilistId(id) {
  const q = `query($id:Int){ Media(id:$id, type:ANIME) { ${FRAG} } }`;
  const data = await gql(q, { id: Number(id) });
  return toMeta(data.Media);
}

async function getByMalId(id) {
  const q = `query($id:Int){ Media(idMal:$id, type:ANIME) { ${FRAG} } }`;
  const data = await gql(q, { id: Number(id) });
  return toMeta(data.Media);
}

// kitsu/anidb -> anilist via api.ani.zip (sin clave). Si falla, null.
async function resolveViaAniZip(source, id) {
  const key = source === 'kitsu' ? 'kitsu_id' : source === 'anidb' ? 'anidb_id' : 'anilist_id';
  try {
    const res = await fetch(`https://api.ani.zip/mappings?${key}=${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    const json = await res.json();
    const anilistId = json?.mappings?.anilist_id;
    if (!anilistId) return null;
    return await getByAnilistId(anilistId);
  } catch { return null; }
}

async function getMetaById(id) {
  // id: "anilist:123", "mal:456", "kitsu:789", "anidb:101"
  const [source, raw] = String(id).split(':');
  if (source === 'anilist') return getByAnilistId(raw);
  if (source === 'mal') return getByMalId(raw);
  if (source === 'kitsu' || source === 'anidb') return resolveViaAniZip(source, raw);
  return null;
}

// Titulo romaji para buscar en los sitios en español
async function getRomaji(id) {
  const meta = await getMetaById(id).catch(() => null);
  return meta ? meta.name : null;
}

module.exports = { searchAnime, trendingAnime, airingAnime, getMetaById, getRomaji, toMeta };
