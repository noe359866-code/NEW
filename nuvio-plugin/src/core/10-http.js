/* ------------------------------------------------------------------
 * Nébula Scrapers · core/http
 * Capa de red mínima sobre el fetch que inyecta Nuvio.
 * - Nunca lanza por HTTP no-2xx: devuelve { ok, status }.
 * - Timeout propio (AbortController) y reintentos cortos.
 * - Sin APIs de Node: solo fetch / AbortController / Promise.
 * ------------------------------------------------------------------ */

var DEFAULT_TIMEOUT = 12000;

function sleep(ms) {
  return new Promise(function (resolve) {
    try {
      setTimeout(resolve, ms);
    } catch (e) {
      resolve();
    }
  });
}

function timeoutError(ms) {
  var err = new Error('timeout ' + ms + 'ms');
  err.code = 'ETIMEDOUT';
  return err;
}

function withTimeout(promise, ms) {
  if (typeof AbortController === 'function') {
    var controller = new AbortController();
    var timer = null;
    var timed = new Promise(function (_, reject) {
      try {
        timer = setTimeout(function () {
          try { controller.abort(); } catch (e) { /* ignora */ }
          reject(timeoutError(ms));
        }, ms);
      } catch (e) { /* sin timers */ }
    });
    var wrapped = promise(controller.signal);
    return Promise.race([wrapped, timed]).then(function (value) {
      if (timer) clearTimeout(timer);
      return value;
    }, function (error) {
      if (timer) clearTimeout(timer);
      throw error;
    });
  }
  return promise(null);
}

/* Tarro de cookies mínimo: algunos sitios (DonTorrent, MejorTorrent) atan
 * la descarga protegida a la sesión que abrió la ficha. Nuvio no garantiza
 * un cookie jar nativo, así que lo llevamos nosotros por host. */
var COOKIE_JAR = {};

function hostKeyOf(url) {
  var match = /^https?:\/\/([^/?#]+)/i.exec(String(url));
  return match ? match[1].toLowerCase() : '';
}

function absorbCookies(hostKey, headers) {
  try {
    var raw = headers && headers.get ? headers.get('set-cookie') : null;
    if (!raw || !hostKey) return;
    var parts = String(raw).split(/,(?=[^;,]+=)/);
    for (var i = 0; i < parts.length; i++) {
      var pair = parts[i].split(';')[0];
      var eq = pair.indexOf('=');
      if (eq <= 0) continue;
      COOKIE_JAR[hostKey] = COOKIE_JAR[hostKey] || {};
      COOKIE_JAR[hostKey][pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  } catch (e) { /* headers opacos */ }
}

function cookieHeaderFor(hostKey) {
  var jar = COOKIE_JAR[hostKey];
  if (!jar) return null;
  var parts = [];
  for (var name in jar) {
    if (Object.prototype.hasOwnProperty.call(jar, name)) parts.push(name + '=' + jar[name]);
  }
  return parts.length ? parts.join('; ') : null;
}

function baseHeaders(extra) {
  var headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.6'
  };
  if (extra) {
    for (var key in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, key)) headers[key] = extra[key];
    }
  }
  return headers;
}

/**
 * Petición HTTP con timeout.
 * @returns {Promise<{ok:boolean,status:number,url:string,bytes:Uint8Array,text:string,headers:any}>}
 */
function request(url, options) {
  var opts = options || {};
  var ms = opts.timeout || DEFAULT_TIMEOUT;
  var retries = opts.retries == null ? 1 : opts.retries;
  var attempt = 0;

  function run() {
    attempt++;
    return withTimeout(function (signal) {
      var hostKey = hostKeyOf(url);
      var headers = baseHeaders(opts.headers);
      if (hostKey && !headers.Cookie) {
        var jarCookie = cookieHeaderFor(hostKey);
        if (jarCookie) headers.Cookie = jarCookie;
      }
      var init = {
        method: opts.method || 'GET',
        headers: headers
      };
      if (signal) init.signal = signal;
      if (opts.body != null) init.body = opts.body;
      if (opts.redirect) init.redirect = opts.redirect;

      return fetch(url, init).then(function (response) {
        absorbCookies(hostKey, response && response.headers);
        var status = response && typeof response.status === 'number' ? response.status : 0;
        var finalUrl = (response && response.url) || url;
        if (!response || !response.ok) {
          return { ok: false, status: status, url: finalUrl, bytes: new Uint8Array(0), text: '', headers: (response && response.headers) || {} };
        }
        return response.arrayBuffer().then(function (buffer) {
          var bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
          return { ok: true, status: status, url: finalUrl, bytes: bytes, text: bytesToText(bytes), headers: response.headers || {} };
        }, function () {
          return response.text().then(function (text) {
            return { ok: true, status: status, url: finalUrl, bytes: utf8ToBytes(text), text: text, headers: response.headers || {} };
          });
        });
      });
    }, ms).catch(function (error) {
      return { ok: false, status: 0, url: url, bytes: new Uint8Array(0), text: '', error: error, headers: {} };
    });
  }

  return run().then(function (result) {
    if (!result.ok && attempt <= retries && result.status !== 404 && result.status !== 403) {
      return sleep(280 * attempt).then(run);
    }
    return result;
  });
}

function getText(url, options) {
  return request(url, options).then(function (res) {
    if (!res.ok) {
      log('http', res.status || res.error && res.error.message, url);
      return '';
    }
    return res.text;
  });
}

function getBytes(url, options) {
  return request(url, options).then(function (res) {
    if (!res.ok) return null;
    return res.bytes;
  });
}

function getJson(url, options) {
  return request(url, options).then(function (res) {
    if (!res.ok || !res.text) return null;
    try {
      return JSON.parse(res.text);
    } catch (e) {
      return null;
    }
  });
}

function postForm(url, fields, options) {
  var body = '';
  for (var key in fields) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    if (body) body += '&';
    body += encodeURIComponent(key) + '=' + encodeURIComponent(fields[key] == null ? '' : fields[key]);
  }
  var opts = {};
  if (options) for (var k in options) if (Object.prototype.hasOwnProperty.call(options, k)) opts[k] = options[k];
  opts.method = 'POST';
  opts.body = body;
  opts.headers = baseHeaders({
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'Origin': opts.origin || '',
    'Referer': opts.referer || url
  });
  delete opts.origin;
  return request(url, opts);
}

function postJson(url, payload, options) {
  var opts = {};
  if (options) for (var k in options) if (Object.prototype.hasOwnProperty.call(options, k)) opts[k] = options[k];
  opts.method = 'POST';
  opts.body = typeof payload === 'string' ? payload : JSON.stringify(payload);
  opts.headers = baseHeaders({
    'Content-Type': 'application/json; charset=utf-8',
    'Accept': 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
    'Origin': opts.origin || '',
    'Referer': opts.referer || url
  });
  delete opts.origin;
  return request(url, opts);
}

/**
 * Prueba hosts en orden hasta que uno responda con HTML útil.
 * @param {string[]} hosts lista de orígenes
 * @param {function(string):string} pathFn ruta relativa por host
 * @param {object} options { headers, method, body, expect }
 */
function pickHost(hosts, pathFn, options) {
  var opts = options || {};
  var index = 0;

  function next() {
    if (index >= hosts.length) return Promise.resolve(null);
    var host = hosts[index++];
    var url = host.replace(/\/$/, '') + pathFn(host);
    var reqOpts = { headers: opts.headers, method: opts.method, body: opts.body, timeout: opts.timeout };
    return request(url, reqOpts).then(function (res) {
      if (!res.ok || !res.text) return next();
      if (opts.expect && !opts.expect.test(res.text)) return next();
      return { host: host.replace(/\/$/, ''), url: url, text: res.text, response: res };
    }, next);
  }

  return next();
}

/** Extrae el valor de `<meta property="og:title" content="...">` y similares. */
function metaContent(html, property) {
  var re = new RegExp('<meta[^>]+(?:property|name)=["\']' + property + '["\'][^>]*>', 'i');
  var tag = re.exec(String(html || ''));
  return tag ? attrOf(tag[0], 'content') : null;
}
