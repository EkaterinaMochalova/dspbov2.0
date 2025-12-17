// ===== GEO / near_address =====

function haversineMeters(lat1, lon1, lat2, lon2) {
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

function geoCacheKey(addr) {
  return "geoaddr:" + String(addr || "").trim().toLowerCase();
}

async function geocodeAddress(address) {
  const addr = String(address || "").trim();
  if (!addr) return null;

  // cache
  try {
    const cached = localStorage.getItem(geoCacheKey(addr));
    if (cached) return JSON.parse(cached);
  } catch (_) {}

  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" +
    encodeURIComponent(addr);

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  if (!data?.length) return null;

  const lat = Number(data[0].lat);
  const lon = Number(data[0].lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const out = { lat, lon };

  try {
    localStorage.setItem(geoCacheKey(addr), JSON.stringify(out));
  } catch (_) {}

  return out;
}

function filterByRadius(screens, centerLat, centerLon, radiusMeters) {
  const r = Number(radiusMeters);
  if (!Number.isFinite(r) || r <= 0) return screens;

  return screens.filter(s => {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return false;
    const d = haversineMeters(centerLat, centerLon, s.lat, s.lon);
    return d <= r;
  });
}

// 👇 экспортируем в глобал (важно для Тильды)
window.GeoUtils = {
  geocodeAddress,
  filterByRadius
};
