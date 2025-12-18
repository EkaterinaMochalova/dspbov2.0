// geo.js
console.log("geo.js loaded (Nominatim)");

(function () {
  const cache = new Map();

  // простейший rate-limit: 1 запрос/сек (по политике Nominatim)
  let lastTs = 0;
  async function rateLimit() {
    const now = Date.now();
    const wait = Math.max(0, 1100 - (now - lastTs));
    if (wait) await new Promise(r => setTimeout(r, wait));
    lastTs = Date.now();
  }

  async function geocodeViaNominatim(query) {
    const q = String(query || "").trim();
    if (!q) return null;

    // кеш по полному запросу
    if (cache.has(q)) return cache.get(q);

    // мини-защита: слишком короткие запросы часто дают “центр города”
    if (q.length < 6) return null;

    await rateLimit();

    const url =
      "https://nominatim.openstreetmap.org/search" +
      "?format=jsonv2" +
      "&addressdetails=1" +
      "&limit=1" +
      "&accept-language=ru" +
      "&q=" + encodeURIComponent(q);

    const res = await fetch(url, {
      // В браузере нельзя поставить нормальный User-Agent, но Referer будет от твоего сайта.
      headers: { "Accept": "application/json" }
    });

    if (!res.ok) throw new Error("Nominatim failed: " + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) {
      cache.set(q, null);
      return null;
    }

    const first = data[0];
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      cache.set(q, null);
      return null;
    }

    const geo = {
      lat,
      lon,
      display_name: first.display_name || q,
      provider: "nominatim",
      raw: first
    };

    cache.set(q, geo);
    return geo;
  }

  // haversine, метры
  function distanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function filterByRadius(screens, lat, lon, radiusMeters) {
    const r = Number(radiusMeters) || 500;
    const out = [];
    for (const s of (screens || [])) {
      const slat = Number(s.lat);
      const slon = Number(s.lon);
      if (!Number.isFinite(slat) || !Number.isFinite(slon)) continue;
      if (distanceMeters(lat, lon, slat, slon) <= r) out.push(s);
    }
    return out;
  }

  window.GeoUtils = {
    geocodeAddress: geocodeViaNominatim,
    filterByRadius
  };
})();
