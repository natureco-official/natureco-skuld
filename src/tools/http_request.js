/**
 * http_request — HTTP GET/POST/PUT/DELETE isteği (v4.9.0)
 *
 * Hermes'ın http_request'ine benzer. API çağrıları için.
 */

const { agOnayi } = require('../utils/gateway');

async function httpRequest({ url, method = 'GET', headers = {}, body = null, timeoutMs = 30000, agOnayli = false }) {
  if (!url) return { success: false, error: 'url gerekli' };

  // AĞ İZİN SINIFI (ADR-0002, T2). Bu araç doğrudan `fetch()` çağırıyordu ve
  // hiçbir onay yoktu: model "şu dosyayı şu adrese POST et" dediğinde duracak
  // bir şey yoktu. Kapı hedefi doğrular, şifresiz/yerel/veri-gönderen
  // durumları işaretler ve onaysız geçişi engeller. İsteğin kendisi burada
  // kalıyor — başlık, gövde ve zaman aşımı mantığı bu aracın.
  try {
    await agOnayi({ url, yontem: method, amac: 'http_request aracı', kararVerildi: agOnayli === true });
  } catch (hata) {
    return { success: false, error: hata && hata.message ? hata.message : String(hata) };
  }

  // fetch global olarak Node 18+'da var
  if (typeof fetch !== 'function') {
    return { success: false, error: 'fetch() Node 18+ gerektirir' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const options = {
      method: method.toUpperCase(),
      headers: { 'User-Agent': 'NatureCo-CLI/4.9.0', ...headers },
      signal: controller.signal,
    };
    if (body && ['POST', 'PUT', 'PATCH'].includes(options.method)) {
      if (typeof body === 'string') options.body = body;
      else {
        options.body = JSON.stringify(body);
        if (!headers['Content-Type']) options.headers['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(url, options);
    clearTimeout(timeout);

    const contentType = response.headers.get('content-type') || '';
    let responseBody;
    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
      if (responseBody.length > 10000) {
        responseBody = responseBody.slice(0, 10000) + '\n... (kesildi)';
      }
    }

    return {
      success: response.ok,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries()),
      body: responseBody,
    };
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') return { success: false, error: `Timeout (${timeoutMs}ms)` };
    return { success: false, error: e.message, url, method };
  }
}

module.exports = {
  name: 'http_request',
  description: 'HTTP GET/POST/PUT/DELETE isteği. JSON veya text response döndürür. Örn: API\'lerden veri çekmek için.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'Hedef URL (https://api.example.com/data)' },
      method: { type: 'string', description: 'HTTP metodu', enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] },
      headers: { type: 'object', description: 'HTTP header\'ları (Auth, Content-Type, vs.)' },
      body: { type: 'string', description: 'Request body (JSON string veya object)' },
      timeoutMs: { type: 'number', description: 'Timeout ms (default 30000)' },
    },
    required: ['url'],
  },
  async execute(params) {
    return await httpRequest(params);
  },
};