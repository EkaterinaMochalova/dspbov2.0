// geo.js
console.log("geo.js loaded");

(function () {
  // ===== config =====
  const CACHE = new Map(); // key -> result|null
  const TTL_MS = 24 * 60 * 60 * 1000; // 24h
  const CACHE_TS = new Map();

  // Номинатим (OpenStreetMap). Обычно точнее для адресов РФ, чем "поиск-площадки" у агрегаторов.
  // Важно: иногда CDN/браузер может кэшировать — добавим cache-buster.
  const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

  function now() { return Date.now(); }

  function cacheGet(key) {
    const ts = CACHE_TS.get(key);
    if (!ts) return undefined;
    if (now() - ts > TTL_MS) {
      CACHE.delete(key);
      CACHE_TS.delete(key);
      return undefined;
    }
    return CACHE.get(key);
  }

  function cacheSet(key, val) {
    CACHE.set(key, val);
    CACHE_TS.set(key, now());
  }

  // чистим запрос: "Тверская 7" -> "тверская 7"
  function normQuery(q) {
    return String(q || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/[，、]/g, ",")
      .toLowerCase();
  }

  function buildUrl(params) {
    const u = new URL(NOMINATIM_URL);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
    // cache-buster
    u.searchParams.set("_", String(Date.now()));
    return u.toString();
  }

  // ===== geo math =====
  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function pickBestResult(list, queryNorm) {
    if (!Array.isArray(list) || !list.length) return null;

    // эвристика: если в запросе есть цифры (дом), то предпочитаем результат,
    // где есть house_number / road / residential и т.п.
    const hasHouse = /\d/.test(queryNorm);

    let best = null;
    let bestScore = -1;

    for (const it of list) {
      const cls = String(it.class || "");
      const typ = String(it.type || "");
      const dn = String(it.display_name || "").toLowerCase();

      let score = 0;

      // если есть дом — предпочитаем адресные типы
      if (hasHouse) {
        if (typ.includes("house") || typ.includes("building")) score += 5;
        if (dn.match(/\b\d+\b/)) score += 3; // номер в display_name
      }

      // немного предпочтений к "place/road/amenity" — но ниже, чем house
      if (cls === "place") score += 1;
      if (cls === "highway" || typ.includes("road")) score += 2;
      if (cls === "building") score += 3;

      // если запрос содержит кусок строки — плюс
      const qParts = queryNorm.split(/[,\s]+/).filter(Boolean);
      let hits = 0;
      for (const p of qParts) {
        if (p.length >= 3 && dn.includes(p)) hits++;
      }
      score += Math.min(5, hits);

      // Небольшой бонус за “importance”, если есть
      if (typeof it.importance === "number") score += Math.min(2, it.importance);

      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }

    return best || list[0];
  }

  // ===== public api =====
  async function geocodeAddress(query) {
    const qRaw = String(query || "").trim();
    const q = normQuery(qRaw);
    if (!q) return null;

    // супер-короткие запросы обычно дают "центр города"
    if (q.length < 6) return null;

    const cached = cacheGet(q);
    if (cached !== undefined) return cached; // может быть null

    // Nominatim parameters:
    // - addressdetails=1: больше структурированных полей
    // - limit=5: берём несколько и выбираем best
    // - countrycodes=ru: если у тебя РФ-инвентарь; можно убрать, если география шире
    const url = buildUrl({
      q: qRaw,
      format: "json",
      addressdetails: 1,
      limit: 5,
      // если у тебя в CSV только РФ — оставь; если есть другие страны, убери.
      countrycodes: "ru",
      "accept-language": "ru"
    });

    try {
      const res = await fetch(url, {
        method: "GET",
        cache: "no-store",
        headers: {
          // многие публичные сервисы любят нормальный UA/Referer, но браузер не всё даст.
          // Оставим минимально.
          "Accept": "application/json"
        }
      });

      if (!res.ok) {
        console.warn("geocode failed:", res.status, url);
        cacheSet(q, null);
        return null;
      }

      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        cacheSet(q, null);
        return null;
      }

      const best = pickBestResult(data, q);

      const lat = Number(best.lat);
      const lon = Number(best.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        cacheSet(q, null);
        return null;
      }

      const out = {
        lat,
        lon,
        display_name: best.display_name || "",
        provider: "nominatim",
        raw: best
      };

      cacheSet(q, out);
      return out;
    } catch (e) {
      console.error("geocode exception:", e);
      cacheSet(q, null);
      return null;
    }
  }

  function filterByRadius(screens, centerLat, centerLon, radiusM) {
    const lat0 = Number(centerLat);
    const lon0 = Number(centerLon);
    const r = Number(radiusM);

    if (!Array.isArray(screens)) return [];
    if (!Number.isFinite(lat0) || !Number.isFinite(lon0) || !Number.isFinite(r) || r <= 0) {
      return [];
    }

    const out = [];
    for (const s of screens) {
      const lat = Number(s.lat);
      const lon = Number(s.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

      const d = haversineMeters(lat0, lon0, lat, lon);
      if (d <= r) out.push(s);
    }
    return out;
  }

  // expose
  window.GeoUtils = {
    geocodeAddress,
    filterByRadius
  };
})();
