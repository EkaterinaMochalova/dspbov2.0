console.log("🔥 GEO NOMINATIM ACTIVE 🔥", location.href);

(function () {
  const cache = new Map();

  async function geocodeAddress(query) {
    const q = String(query || "").trim();
    if (!q) return null;

    // кэш (чтобы не дергать Nominatim по 10 раз)
    if (cache.has(q)) return cache.get(q);

    const url =
      "https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&q=" +
      encodeURIComponent(q);

    const res = await fetch(url, {
      headers: {
        "Accept": "application/json"
        // User-Agent с браузера выставить нельзя — это ок
      }
    });

    if (!res.ok) throw new Error("Nominatim failed: " + res.status);

    const data = await res.json();
    if (!Array.isArray(data) || !data.length) return null;

    const first = data[0];
    const geo = {
      lat: Number(first.lat),
      lon: Number(first.lon),
      display_name: first.display_name || "",
      provider: "nominatim",
      raw: first
    };

    cache.set(q, geo);
    return geo;
  }

  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  function filterByRadius(screens, lat, lon, radiusMeters) {
    const r = Number(radiusMeters || 0);
    return (screens || []).filter(s => {
      const slat = Number(s.lat);
      const slon = Number(s.lon);
      if (!Number.isFinite(slat) || !Number.isFinite(slon)) return false;
      return haversineMeters(lat, lon, slat, slon) <= r;
    });
  }

  window.GeoUtils = { geocodeAddress, filterByRadius, haversineMeters };
})();
