// geo.js
console.log("geo.js loaded");

(function () {
  const cache = new Map();

  async function geocodeViaMapsCo(q) {
    const url = "https://geocode.maps.co/search?q=" + encodeURIComponent(q);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error("maps.co geocode failed: " + res.status);
    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;

    const first = data[0];
    const lat = Number(first.lat);
    const lon = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return {
      lat,
      lon,
      display_name: first.display_name || "",
      provider: "maps.co",
      raw: first
    };
  }

  async function geocodeAddress(query) {
    const q = String(query || "").trim();
    if (!q) return null;

    // нормальный кэш: ключ = полный запрос
    if (cache.has(q)) return cache.get(q);

    // мини-защита: слишком короткие запросы почти всегда дают центр города
    if (q.length < 6) return null;

    const geo = await geocodeViaMapsCo(q);
    cache.set(q, geo);
    return geo;
  }

  // Haversine distance
  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function filterByRadius(screens, lat, lon, radiusMeters) {
    const r = Number(radiusMeters);
    if (!Number.isFinite(r) || r <= 0) return [];

    return (screens || []).filter((s) => {
      const slat = Number(s.lat);
      const slon = Number(s.lon);
      if (!Number.isFinite(slat) || !Number.isFinite(slon)) return false;
      return haversineMeters(lat, lon, slat, slon) <= r;
    });
  }

  window.GeoUtils = {
    geocodeAddress,
    filterByRadius,
    haversineMeters
  };
})();
