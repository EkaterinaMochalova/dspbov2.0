console.log("planner.js loaded");

/** CSV */
const SCREENS_CSV_URL = "https://raw.githubusercontent.com/EkaterinaMochalova/dspbov2.0/planner/inventories_sync.csv";

/** Форматы */
const FORMAT_LABELS = {
  "BILLBOARD": { label: "Билборды", desc: "экраны 3×6 м вдоль трасс" },
  "CITY_BOARD": { label: "City Board", desc: "небольшие экраны в центре города, видимые и авто-, и пешеходному траффику" },
  "CITY_FORMAT": { label: "Ситиформаты", desc: "вертикальные экраны, остановки/пешеходные зоны" },
  "CITY_FORMAT_RC": { label: "Ситиформаты на МЦК", desc: "экраны на МЦК" },
  "CITY_FORMAT_RD": { label: "Ситиформаты на вокзалах", desc: "экраны на вокзале" },
  "CITY_FORMAT_WD": { label: "Ситиформаты в метро", desc: "экраны в метро" },
  "MEDIAFACADE": { label: "Медиафасады", desc: "огромные экраны на стенах домов" },
  "METRO_LIGHTBOX": { label: "Metro Lightbox", desc: "экраны в метро, горизонтальные" },
  "OTHER": { label: "Indoor-экраны", desc: "экраны внутри БЦ, ТЦ и иных помещений" },
  "PVZ_SCREEN": { label: "Экраны в ПВЗ", desc: "экраны в пунктах выдачи заказов" },
  "SKY_DIGITAL": { label: "Аэропорты", desc: "экраны в аэропортах" },
  "SUPERSITE": { label: "Суперсайты", desc: "крупные конструкции с высокой дальностью видимости" }
};

/** POI queries for Overpass (OpenStreetMap)
 *  nwr = node + way + relation
 */
const POI_QUERIES = {

  // 🏋️ ФИТНЕС
  fitness: `
    nwr(around:{R},{LAT},{LON})["leisure"="fitness_centre"];
    nwr(around:{R},{LAT},{LON})["amenity"="gym"];
    nwr(around:{R},{LAT},{LON})["sport"="fitness"];
    nwr(around:{R},{LAT},{LON})["leisure"="sports_centre"]["sport"="fitness"];
  `,

  // 🐶 PET
  pet_store: `
    nwr(around:{R},{LAT},{LON})["shop"="pet"];
    nwr(around:{R},{LAT},{LON})["shop"="pet_grooming"];
    nwr(around:{R},{LAT},{LON})["amenity"="veterinary"];
  `,

  // 🛒 СУПЕРМАРКЕТЫ
  supermarket: `
    nwr(around:{R},{LAT},{LON})["shop"="supermarket"];
    nwr(around:{R},{LAT},{LON})["shop"="convenience"];
    nwr(around:{R},{LAT},{LON})["shop"="hypermarket"];
  `,

  // 🏬 ТОРГОВЫЕ ЦЕНТРЫ
  mall: `
    nwr(around:{R},{LAT},{LON})["shop"="mall"];
  `,

  // ☕ КАФЕ / КОФЕЙНИ
  cafe: `
  nwr(around:{R},{LAT},{LON})["amenity"="cafe"];
  nwr(around:{R},{LAT},{LON})["shop"="coffee"];
  `,

  // 🍽 РЕСТОРАНЫ
  restaurant: `
    nwr(around:{R},{LAT},{LON})["amenity"="restaurant"];
    nwr(around:{R},{LAT},{LON})["amenity"="fast_food"];
    nwr(around:{R},{LAT},{LON})["amenity"="food_court"];
  `,

  // 💊 АПТЕКИ
  pharmacy: `
    nwr(around:{R},{LAT},{LON})["amenity"="pharmacy"];
  `,

  // 🏫 ШКОЛЫ
  school: `
    nwr(around:{R},{LAT},{LON})["amenity"="school"];
  `,

  // 🎓 ВУЗЫ
  university: `
    nwr(around:{R},{LAT},{LON})["amenity"="university"];
    nwr(around:{R},{LAT},{LON})["amenity"="college"];
  `,

  // 🏥 БОЛЬНИЦЫ / КЛИНИКИ
  hospital: `
    nwr(around:{R},{LAT},{LON})["amenity"="hospital"];
    nwr(around:{R},{LAT},{LON})["amenity"="clinic"];
  `,

  // ⛽ АЗС
  gas_station: `
    nwr(around:{R},{LAT},{LON})["amenity"="fuel"];
  `,

  // 🏦 БАНКИ
  bank: `
    nwr(around:{R},{LAT},{LON})["amenity"="bank"];
    nwr(around:{R},{LAT},{LON})["amenity"="atm"];
  `,

  // 🚇 МЕТРО / ТРАНСПОРТ
  transport: `
    nwr(around:{R},{LAT},{LON})["public_transport"];
    nwr(around:{R},{LAT},{LON})["railway"="station"];
    nwr(around:{R},{LAT},{LON})["railway"="subway_entrance"];
  `
};

const POI_LABELS = {
  fitness: "Фитнес-клубы",
  pet_store: "Pet stores / Vet",
  supermarket: "Супермаркеты",
  mall: "Торговые центры",
  cafe: "Кафе / кофе",
  restaurant: "Рестораны / фастфуд",
  pharmacy: "Аптеки",
  school: "Школы",
  university: "ВУЗы",
  hospital: "Больницы / клиники",
  gas_station: "АЗС",
  bank: "Банки / банкоматы",
  transport: "Транспорт (метро/станции)"
};

// модель
const BID_MULTIPLIER = 1.2; // +20%
const SC_OPT = 30;          // оптимум: 30 выходов/час/экран
const SC_MAX = 60;          // максимум: 60 выходов/час/экран

const state = {
  screens: [],
  citiesAll: [],
  formatsAll: [],
  selectedCity: null,
  selectedFormats: new Set(),
  lastChosen: []
};
window.state = state;

function el(id){ return document.getElementById(id); }

function setStatus(msg){
  const s = el("status");
  if(s) s.textContent = msg || "";
}

function cssButtonBase(btn){
  if(!btn) return;
  btn.classList.add("ux-btn");
  btn.style.padding = "8px 10px";
  btn.style.borderRadius = "999px";
  btn.style.border = "1px solid #ddd";
  btn.style.background = "#fff";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "13px";
}

function getBudgetMode(){
  return document.querySelector('input[name="budget_mode"]:checked')?.value || "fixed";
}
function getScheduleType(){
  return document.querySelector('input[name="schedule"]:checked')?.value || "all_day";
}

function parseCSV(text){
  const res = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  if (res.errors && res.errors.length) console.warn("CSV parse errors:", res.errors.slice(0, 8));
  return res.data || [];
}

function toNumber(x){
  if(x == null) return NaN;
  const s = String(x).trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function avgNumber(arr){
  let sum = 0, cnt = 0;
  for(const v of arr){
    if(Number.isFinite(v)){ sum += v; cnt++; }
  }
  return cnt ? (sum / cnt) : null;
}

function daysInclusive(startStr, endStr){
  const s = new Date(startStr + "T00:00:00");
  const e = new Date(endStr + "T00:00:00");
  return Math.floor((e - s) / (24*3600*1000)) + 1;
}

function hoursPerDay(schedule){
  if(schedule.type === "all_day") return 15; // 07–22
  if(schedule.type === "peak") return 7;     // 07–10 + 17–21
  if(schedule.type === "custom"){
    const [fh,fm] = (schedule.from || "07:00").split(":").map(Number);
    const [th,tm] = (schedule.to || "22:00").split(":").map(Number);
    return Math.max(0, (th + tm/60) - (fh + fm/60));
  }
  return 15;
}

function formatMeta(fmt){
  return FORMAT_LABELS[fmt] || {
    label: fmt,
    desc: "Описание формата пока не задано (можно добавить в словарь FORMAT_LABELS)."
  };
}

// ===== UI: selection extra =====
function renderSelectionExtra(){
  const mode = el("selection-mode")?.value || "city_even";
  const extra = el("selection-extra");
  if(!extra) return;
  extra.innerHTML = "";

  if(mode === "near_address"){
    extra.innerHTML = `
      <input id="planner-addr" type="text" placeholder="Адрес"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">
      <input id="planner-radius" type="number" min="50" value="500" placeholder="Радиус, м"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">
      <div style="font-size:12px; color:#666; margin-top:6px;">
        Геокодим адрес и выбираем экраны в радиусе.
      </div>
    `;
  }
  else if(mode === "poi"){
  const keys = Object.keys(POI_QUERIES || {});
  const options = keys.map(k => {
    const label = POI_LABELS[k] || k;
    return `<option value="${k}">${label}</option>`;
  }).join("");

  extra.innerHTML = `
    <select id="poi-type"
            style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">
      ${options}
    </select>

    <input id="planner-radius" type="number" min="50" value="500" placeholder="Радиус вокруг POI, м"
           style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">

    <div style="font-size:12px; color:#666; margin-top:6px;">
      POI-тип берём из OpenStreetMap (Overpass), затем выбираем экраны вокруг POI.
    </div>
  `;
}
  else if(mode === "route"){
    extra.innerHTML = `
      <input id="route-from" type="text" placeholder="Точка А"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">
      <input id="route-to" type="text" placeholder="Точка Б"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">
      <input id="planner-radius" type="number" min="50" value="300" placeholder="Радиус от маршрута, м"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">
      <div style="font-size:12px; color:#666; margin-top:6px;">
        MVP: маршрут сохраняем в бриф (без построения).
      </div>
    `;
  }
}
// ===== Data load =====

async function loadScreens(){
  setStatus("Загружаю список экранов…");

  const res = await fetch(SCREENS_CSV_URL, { cache: "no-store" });
  if(!res.ok) throw new Error("Не удалось загрузить CSV: " + res.status);

  const text = await res.text();
  const rows = parseCSV(text);

  state.screens = rows.map(r => {
    const city = String(r.city ?? r.City ?? r.CITY ?? "").trim();
    const format = String(r.format ?? r.Format ?? r.FORMAT ?? "").trim();
    const address = String(r.address ?? r.Address ?? r.ADDRESS ?? "").trim();

    const screenId =
      r.screen_id ?? r.screenId ??
      r.inventory_id ?? r.inventoryId ??
      r.id ?? "";

    return {
      ...r,
      screen_id: String(screenId).trim(),
      city,
      format,
      address,

      // числа
      minBid: toNumber(r.minBid ?? r.min_bid ?? r.MINBID ?? r.minbid),
      ots: toNumber(r.ots ?? r.OTS),
      grp: toNumber(r.grp ?? r.GRP),

      // lat/lon (для near_address)
      lat: toNumber(r.lat ?? r.Lat ?? r.LAT),
      lon: toNumber(r.lon ?? r.Lon ?? r.LON ?? r.lng ?? r.Lng ?? r.LNG)
    };
  });

  state.citiesAll = [...new Set(state.screens.map(s => s.city).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b, "ru"));

  state.formatsAll = [...new Set(state.screens.map(s => s.format).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b));

  renderFormats();
  renderSelectedCity();

  setStatus(`Готово. Экранов: ${state.screens.length}. Городов: ${state.citiesAll.length}. Форматов: ${state.formatsAll.length}.`);
}

// ===== UI: formats =====

function renderFormats(){
  const wrap = el("formats-wrap");
  if(!wrap) return;
  wrap.innerHTML = "";

  state.formatsAll.forEach(fmt => {
    const meta = formatMeta(fmt);
    const b = document.createElement("button");
    cssButtonBase(b);
    b.style.borderRadius = "14px";
    b.style.padding = "10px 12px";
    b.style.textAlign = "left";
    b.style.maxWidth = "240px";
    b.innerHTML = `
      <div style="font-weight:700;">${meta.label}</div>
      <div style="font-size:12px; color:#666;">${meta.desc}</div>
      <div style="font-size:11px; color:#999; margin-top:4px;">Код: ${fmt}</div>
    `;

    const sync = () => { b.style.borderColor = state.selectedFormats.has(fmt) ? "#111" : "#ddd"; };
    sync();

    b.addEventListener("click", () => {
      if(el("formats-auto")?.checked) return;
      if(state.selectedFormats.has(fmt)) state.selectedFormats.delete(fmt);
      else state.selectedFormats.add(fmt);
      sync();
    });

    wrap.appendChild(b);
  });
}

// ===== UI: city =====

function renderSelectedCity(){
  const wrap = el("city-selected");
  if(!wrap) return;
  wrap.innerHTML = "";

  if(!state.selectedCity){
    wrap.innerHTML = `<div style="font-size:12px; color:#666;">Город не выбран</div>`;
    return;
  }

  const chip = document.createElement("button");
  cssButtonBase(chip);
  chip.textContent = "✕ " + state.selectedCity;
  chip.addEventListener("click", () => {
    state.selectedCity = null;
    renderSelectedCity();
  });
  wrap.appendChild(chip);
}

function renderCitySuggestions(q){
  const sug = el("city-suggestions");
  if(!sug) return;
  sug.innerHTML = "";
  if(!q) return;

  const qq = q.toLowerCase();
  const matches = state.citiesAll.filter(c => c.toLowerCase().includes(qq)).slice(0, 12);

  matches.forEach(c => {
    const b = document.createElement("button");
    cssButtonBase(b);
    b.textContent = "+ " + c;
    b.addEventListener("click", () => {
      state.selectedCity = c;
      if(el("city-search")) el("city-search").value = "";
      sug.innerHTML = "";
      renderSelectedCity();
    });
    sug.appendChild(b);
  });
}

// ===== Brief =====
function buildBrief(){
  const root = document.getElementById("planner-widget") || document; // scoped для Тильды

  const budgetMode = getBudgetMode();
  const budgetVal = el("budget-input")?.value;

  const scheduleType = getScheduleType();
  const timeFrom = el("time-from")?.value;
  const timeTo = el("time-to")?.value;

  const selectionMode = el("selection-mode")?.value || "city_even";

  const brief = {
    budget: {
      mode: budgetMode,
      amount: budgetMode === "fixed" ? Number(budgetVal || 0) : null,
      currency: "RUB"
    },
    dates: {
      start: el("date-start")?.value || null,
      end: el("date-end")?.value || null
    },
    schedule: {
      type: scheduleType,
      from: scheduleType === "custom" ? timeFrom : null,
      to: scheduleType === "custom" ? timeTo : null
    },
    geo: { city: state.selectedCity },
    formats: {
      mode: el("formats-auto")?.checked ? "auto" : "manual",
      selected: el("formats-auto")?.checked ? [] : [...state.selectedFormats]
    },
    selection: { mode: selectionMode },
    grp: {
      enabled: !!el("grp-enabled")?.checked,
      min: toNumber(el("grp-min")?.value ?? 0),
      max: toNumber(el("grp-max")?.value ?? 9.98)
    }
  };

  // helpers: берём значения внутри виджета (и поддерживаем старые id)
  const qsVal = (sel) => (root.querySelector(sel)?.value ?? "");
  const pickAnyVal = (...sels) => {
    for (const s of sels) {
      const v = qsVal(s);
      if (String(v).trim()) return String(v).trim();
    }
    return "";
  };
  const pickAnyNum = (fallback, ...sels) => {
    for (const s of sels) {
      const v = qsVal(s);
      if (v !== "" && v != null) {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
    }
    return fallback;
  };

  if(selectionMode === "near_address"){
    brief.selection.address = pickAnyVal("#planner-addr", "#addr");
    brief.selection.radius_m = pickAnyNum(500, "#planner-radius", "#radius");
  }

  if(selectionMode === "poi"){
    brief.selection.poi_type = String(qsVal("#poi-type") || "pet_store").trim();
    brief.selection.radius_m = pickAnyNum(500, "#planner-radius", "#radius");
  }

  if(selectionMode === "route"){
    brief.selection.from = String(qsVal("#route-from") || "").trim();
    brief.selection.to   = String(qsVal("#route-to") || "").trim();
    brief.selection.radius_m = pickAnyNum(300, "#planner-radius", "#radius");
  }

  // защита
  if(!Array.isArray(brief.formats.selected)) brief.formats.selected = [];
  if(!brief.formats.mode) brief.formats.mode = "auto";

  if (!Number.isFinite(brief.grp.min)) brief.grp.min = 0;
  if (!Number.isFinite(brief.grp.max)) brief.grp.max = 9.98;
  brief.grp.min = Math.max(0, Math.min(9.98, brief.grp.min));
  brief.grp.max = Math.max(0, Math.min(9.98, brief.grp.max));
  if (brief.grp.max < brief.grp.min) [brief.grp.min, brief.grp.max] = [brief.grp.max, brief.grp.min];

  return brief;
}

// ===== Calc helpers =====

function pickScreensByMinBid(screens, n){
  const sorted = [...screens].sort((a,b) => {
    const aa = Number.isFinite(a.minBid) ? a.minBid : 1e18;
    const bb = Number.isFinite(b.minBid) ? b.minBid : 1e18;
    if(aa !== bb) return aa - bb;
    return String(a.screen_id||"").localeCompare(String(b.screen_id||""));
  });
  return sorted.slice(0, n);
}

function downloadXLSX(rows){
  if(!rows || !rows.length) return;

  const out = rows.map(r => ({
    GID: r.screen_id ?? "",
    format: r.format ?? "",
    placement: r.placement ?? "",
    installation: r.installation ?? "",
    owner_id: r.owner_id ?? "",
    owner: r.owner ?? "",
    city: r.city ?? "",
    address: r.address ?? "",
    lat: r.lat ?? "",
    lon: r.lon ?? ""
  }));

  const ws = XLSX.utils.json_to_sheet(out, {
    header: ["GID","format","placement","installation","owner_id","owner","city","address","lat","lon"]
  });

  ws["!cols"] = [
    { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 18 }, { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 12 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Screens");
  XLSX.writeFile(wb, "screens_selected.xlsx");
}

// ===== Route corridor helpers (единственная версия) =====

// lat/lon -> XY метры (плоская аппроксимация вокруг lat0)
function _llToXYMeters(lat, lon, lat0) {
  const R = 6371000;
  const toRad = (x) => x * Math.PI / 180;
  return {
    x: R * toRad(lon) * Math.cos(toRad(lat0)),
    y: R * toRad(lat)
  };
}

// расстояние от точки P до отрезка AB (в метрах)
function _distPointToSegmentMeters(pLat, pLon, aLat, aLon, bLat, bLon) {
  const lat0 = (aLat + bLat) / 2;

  const A = _llToXYMeters(aLat, aLon, lat0);
  const B = _llToXYMeters(bLat, bLon, lat0);
  const P = _llToXYMeters(pLat, pLon, lat0);

  const ABx = B.x - A.x, ABy = B.y - A.y;
  const APx = P.x - A.x, APy = P.y - A.y;

  const ab2 = ABx*ABx + ABy*ABy;
  if (ab2 === 0) return Math.hypot(P.x - A.x, P.y - A.y);

  let t = (APx*ABx + APy*ABy) / ab2;
  t = Math.max(0, Math.min(1, t));

  const Cx = A.x + t*ABx;
  const Cy = A.y + t*ABy;

  return Math.hypot(P.x - Cx, P.y - Cy);
}

// фильтр экранов по коридору маршрута A->B
function filterByRouteCorridor(screens, aLat, aLon, bLat, bLon, radiusMeters) {
  const r = Number(radiusMeters || 0);
  return (screens || []).filter(s => {
    const slat = Number(s.lat);
    const slon = Number(s.lon);
    if (!Number.isFinite(slat) || !Number.isFinite(slon)) return false;
    return _distPointToSegmentMeters(slat, slon, aLat, aLon, bLat, bLon) <= r;
  });
}

// ===== Geo helpers for ROUTE =====
// перевод lat/lon -> локальные метры (плоская аппроксимация вокруг lat0)
function _llToXYMeters(lat, lon, lat0) {
  const R = 6371000;
  const toRad = (x) => x * Math.PI / 180;
  const x = R * toRad(lon) * Math.cos(toRad(lat0));
  const y = R * toRad(lat);
  return { x, y };
}

// расстояние от точки P до отрезка AB (в метрах)
function _distPointToSegmentMeters(pLat, pLon, aLat, aLon, bLat, bLon) {
  const lat0 = (aLat + bLat) / 2;

  const A = _llToXYMeters(aLat, aLon, lat0);
  const B = _llToXYMeters(bLat, bLon, lat0);
  const P = _llToXYMeters(pLat, pLon, lat0);

  const ABx = B.x - A.x, ABy = B.y - A.y;
  const APx = P.x - A.x, APy = P.y - A.y;

  const ab2 = ABx*ABx + ABy*ABy;
  if (ab2 === 0) {
    // A и B совпали
    const dx = P.x - A.x, dy = P.y - A.y;
    return Math.hypot(dx, dy);
  }

  let t = (APx*ABx + APy*ABy) / ab2;
  t = Math.max(0, Math.min(1, t));

  const Cx = A.x + t*ABx;
  const Cy = A.y + t*ABy;

  return Math.hypot(P.x - Cx, P.y - Cy);
}

function filterByRouteCorridor(screens, aLat, aLon, bLat, bLon, radiusMeters) {
  const r = Number(radiusMeters || 0);
  return (screens || []).filter(s => {
    const slat = Number(s.lat);
    const slon = Number(s.lon);
    if (!Number.isFinite(slat) || !Number.isFinite(slon)) return false;
    return _distPointToSegmentMeters(slat, slon, aLat, aLon, bLat, bLon) <= r;
  });
}

/** Overpass */
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter"
];

const _poiCache = new Map(); // key -> { ts, data }

/** достаём центр города по экранам (чтобы не городить Nominatim для границ) */
function cityCenterFromScreens(screensInCity){
  const pts = (screensInCity || [])
    .map(s => ({ lat: Number(s.lat), lon: Number(s.lon) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!pts.length) return null;

  let latMin=Infinity, latMax=-Infinity, lonMin=Infinity, lonMax=-Infinity;
  for (const p of pts){
    if (p.lat < latMin) latMin = p.lat;
    if (p.lat > latMax) latMax = p.lat;
    if (p.lon < lonMin) lonMin = p.lon;
    if (p.lon > lonMax) lonMax = p.lon;
  }
  return { lat: (latMin+latMax)/2, lon: (lonMin+lonMax)/2 };
}

function _fillTemplate(q, vars){
  return q
    .replaceAll("{LAT}", String(vars.LAT))
    .replaceAll("{LON}", String(vars.LON))
    .replaceAll("{R}", String(vars.R));
}

async function fetchPOIsOverpass(poiType, lat, lon, radiusMeters, limit = 200){
  const t = String(poiType || "").trim();
  if (!t || !POI_QUERIES[t]) throw new Error("Unknown poi_type: " + t);

  const R = Math.max(100, Number(radiusMeters || 0));
  const cacheKey = `${t}|${lat.toFixed(5)}|${lon.toFixed(5)}|${R}|${limit}`;

  // кэш на 10 минут (чтобы не долбить Overpass)
  const cached = _poiCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < 10 * 60 * 1000) return cached.data;

  const body = `
    [out:json][timeout:25];
    (
      ${_fillTemplate(POI_QUERIES[t], { LAT: lat, LON: lon, R })}
    );
    out center ${limit};
  `;

  let lastErr = null;

  for (const url of OVERPASS_URLS){
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: "data=" + encodeURIComponent(body)
      });

      if (!res.ok) throw new Error(`Overpass ${res.status} @ ${url}`);

      const json = await res.json();
      const els = Array.isArray(json.elements) ? json.elements : [];

      const pois = els.map(el => {
        const name = el.tags?.name || "";
        const lat0 = Number(el.lat ?? el.center?.lat);
        const lon0 = Number(el.lon ?? el.center?.lon);
        if (!Number.isFinite(lat0) || !Number.isFinite(lon0)) return null;
        return { id: `${el.type}/${el.id}`, name, lat: lat0, lon: lon0, raw: el };
      }).filter(Boolean);

      _poiCache.set(cacheKey, { ts: Date.now(), data: pois });
      return pois;
    } catch (e) {
      lastErr = e;
      console.warn("[poi] overpass fail:", String(e));
    }
  }

  throw lastErr || new Error("Overpass failed");
}

/** выбираем экраны, попадающие в радиус вокруг хотя бы одного POI */
function pickScreensNearPOIs(screens, pois, radiusMeters){
  const r = Number(radiusMeters || 0);
  if (!r || !Array.isArray(pois) || !pois.length) return [];

  const dist = window.GeoUtils?.haversineMeters;
  if (!dist) throw new Error("GeoUtils.haversineMeters is missing");

  const picked = [];
  for (const s of (screens || [])){
    const slat = Number(s.lat), slon = Number(s.lon);
    if (!Number.isFinite(slat) || !Number.isFinite(slon)) continue;

    let ok = false;
    for (const p of pois){
      if (dist(slat, slon, p.lat, p.lon) <= r) { ok = true; break; }
    }
    if (ok) picked.push(s);
  }
  return picked;
}

// ===== MAIN click handler =====

async function onCalcClick(){
  const brief = buildBrief();

  // validation
  if(!brief.dates.start || !brief.dates.end){
    alert("Выберите даты начала и окончания.");
    return;
  }
  if(!brief.geo.city){
    alert("Выберите город (один).");
    return;
  }
  if(brief.budget.mode === "fixed" && (!brief.budget.amount || brief.budget.amount <= 0)){
    alert("Введите бюджет или выберите «нужна рекомендация».");
    return;
  }

  const city = brief.geo.city;

  // pool by city
  let pool = state.screens.filter(s => s.city === city);

  // formats filter (manual)
  let selectedFormatsText = "—";
  if(brief.formats.mode === "manual" && brief.formats.selected.length > 0){
    const fset = new Set(brief.formats.selected);
    pool = pool.filter(s => fset.has(s.format));
    selectedFormatsText = brief.formats.selected.join(", ");
  } else if(brief.formats.mode === "auto"){
    selectedFormatsText = "рекомендация";
  } else {
    selectedFormatsText = "не выбраны";
  }

  if(pool.length === 0){
    alert("Нет экранов под выбранные условия (город/форматы).");
    return;
  }

  // ===== near_address filter =====
  let geoResult = null;

  if (brief.selection.mode === "near_address") {

    if (!window.GeoUtils?.geocodeAddress || !window.GeoUtils?.filterByRadius) {
      alert("GeoUtils не найден. Проверь подключение geo.js");
      return;
    }

    const addr = String(brief.selection.address || "").trim();
    const radius = Number(brief.selection.radius_m || 500);

    if (!addr) {
      alert("Введите адрес.");
      return;
    }

    const query = `${city}, ${addr}`;

    console.log("[geo] query:", query);
    setStatus(`Ищу адрес: ${query}`);

    try {
      geoResult = await GeoUtils.geocodeAddress(query);
    } catch (e) {
      console.error("[geo] error:", e);
      alert("Ошибка геокодинга (сервис недоступен).");
      setStatus("");
      return;
    }

    console.log("[geo] result:", geoResult);

    if (!geoResult || !Number.isFinite(geoResult.lat) || !Number.isFinite(geoResult.lon)) {
      alert("Адрес не найден. Уточните улицу и дом.");
      setStatus("");
      return;
    }

    setStatus(`Найдено: ${geoResult.display_name}`);

    const before = pool.length;
    pool = GeoUtils.filterByRadius(pool, geoResult.lat, geoResult.lon, radius);

    if (!pool.length) {
      alert("В этом радиусе нет экранов (или у них нет координат lat/lon).");
      setStatus("");
      return;
    }

    setStatus(`Экраны в радиусе: ${pool.length} из ${before}`);
  }

  // сохраняем результаты геокодинга в бриф (только если был geo)
  if (geoResult) {
    brief.selection.address_display = geoResult.display_name;
    brief.selection.address_lat = geoResult.lat;
    brief.selection.address_lon = geoResult.lon;
  }

// ===== POI filter =====
if (brief.selection.mode === "poi") {
  if (!window.GeoUtils?.haversineMeters) {
    alert("GeoUtils не найден. Проверь подключение geo.js");
    return;
  }

  const poiType = String(brief.selection.poi_type || "").trim();
  const radius = Number(brief.selection.radius_m || 500);

  // центр берём по экранам города (быстро и без Nominatim)
  const center = cityCenterFromScreens(pool);
  if (!center) {
    alert("Для POI-подбора нужны координаты экранов (lat/lon) в этом городе.");
    return;
  }

  setStatus(`Ищу POI: ${POI_LABELS[poiType] || poiType}…`);

  let pois = [];
  try {
    // радиус поиска POI можно сделать шире, чем радиус “вокруг POI”
    const searchR = Math.max(2000, Math.min(15000, radius * 10));
    pois = await fetchPOIsOverpass(poiType, center.lat, center.lon, searchR, 200);
  } catch (e) {
    console.error("[poi] error:", e);
    alert("Ошибка Overpass (OSM). Попробуй ещё раз.");
    setStatus("");
    return;
  }

  // сохраняем для summary/брфа
  brief.selection.poi_found = pois.length;
  brief.selection.poi_center_lat = center.lat;
  brief.selection.poi_center_lon = center.lon;

  if (!pois.length) {
    alert("POI не найдены в зоне поиска. Попробуй другой тип или увеличь радиус.");
    setStatus("");
    return;
  }

  const before = pool.length;
  pool = pickScreensNearPOIs(pool, pois, radius);

  if (!pool.length) {
    alert("В радиусе вокруг найденных POI нет экранов (или нет lat/lon).");
    setStatus("");
    return;
  }

  setStatus(`Экраны у POI: ${pool.length} из ${before} (POI: ${pois.length})`);
}
  
// ===== route filter =====
if (brief.selection.mode === "route") {

  if (!window.GeoUtils?.geocodeAddress) {
    alert("GeoUtils не найден. Проверь подключение geo.js");
    return;
  }

  const from = String(brief.selection.from || "").trim();
  const to   = String(brief.selection.to || "").trim();
  const radius = Number(brief.selection.radius_m || 300);

  if (!from || !to) {
    alert("Введите обе точки маршрута (А и Б).");
    return;
  }

  const qFrom = `${city}, ${from}`;
  const qTo   = `${city}, ${to}`;

  console.log("[route] qFrom:", qFrom);
  console.log("[route] qTo:", qTo);

  setStatus("Геокодирую маршрут…");

  let geoA, geoB;
  try {
    geoA = await GeoUtils.geocodeAddress(qFrom);
    geoB = await GeoUtils.geocodeAddress(qTo);
  } catch (e) {
    console.error("[route] geocode error:", e);
    alert("Ошибка геокодинга маршрута (сервис недоступен).");
    setStatus("");
    return;
  }

  console.log("[route] A:", geoA);
  console.log("[route] B:", geoB);

  if (!geoA || !Number.isFinite(geoA.lat) || !Number.isFinite(geoA.lon)) {
    alert("Точка А не найдена. Уточните адрес.");
    setStatus("");
    return;
  }
  if (!geoB || !Number.isFinite(geoB.lat) || !Number.isFinite(geoB.lon)) {
    alert("Точка Б не найдена. Уточните адрес.");
    setStatus("");
    return;
  }

  const before = pool.length;
  pool = filterByRouteCorridor(pool, geoA.lat, geoA.lon, geoB.lat, geoB.lon, radius);

  // сохраним для summary (красиво)
  brief.selection.route_from_display = geoA.display_name || from;
  brief.selection.route_to_display   = geoB.display_name || to;
  brief.selection.route_from_lat = geoA.lat;
  brief.selection.route_from_lon = geoA.lon;
  brief.selection.route_to_lat   = geoB.lat;
  brief.selection.route_to_lon   = geoB.lon;

  if (!pool.length) {
    alert("В коридоре маршрута нет экранов (или у них нет lat/lon).");
    setStatus("");
    return;
  }

  setStatus(`Экраны вдоль маршрута: ${pool.length} из ${before}`);
}



  
  // GRP filter (optional)
  let grpWarning = "";
  let grpDroppedNoValue = 0;

  if (brief.grp?.enabled) {
    grpDroppedNoValue = pool.filter(s => !Number.isFinite(s.grp)).length;

    pool = pool.filter(s =>
      Number.isFinite(s.grp) &&
      s.grp >= brief.grp.min &&
      s.grp <= brief.grp.max
    );

    if (pool.length === 0) {
      alert("Нет экранов под выбранный GRP-диапазон. Учти: не все экраны передают GRP.");
      return;
    }

    grpWarning = `⚠️ GRP-фильтр включён: экраны без GRP исключены (без GRP: ${grpDroppedNoValue}).`;
  }

  // avg minBid
  const avgBid = avgNumber(pool.map(s => s.minBid));
  if(avgBid == null){
    alert("Не могу посчитать: у выбранных экранов нет minBid.");
    return;
  }

  const bidPlus20 = avgBid * BID_MULTIPLIER;
  const budget = brief.budget.amount;

  const days = daysInclusive(brief.dates.start, brief.dates.end);
  const hpd = hoursPerDay(brief.schedule);

  if(days <= 0 || hpd <= 0){
    alert("Проверь даты/расписание.");
    return;
  }

  // theory plays
  const totalPlaysTheory = Math.floor(budget / bidPlus20);
  const playsPerHourTotalTheory = totalPlaysTheory / days / hpd;

  // screens needed
  const screensNeeded = Math.max(1, Math.ceil(playsPerHourTotalTheory / SC_OPT));
  const screensChosenCount = Math.min(pool.length, screensNeeded);
  const chosen = pickScreensByMinBid(pool, screensChosenCount);

  const playsPerHourPerScreen = playsPerHourTotalTheory / screensChosenCount;

  let warning = "";
  let totalPlaysEffective = totalPlaysTheory;

  if(playsPerHourPerScreen > SC_OPT && playsPerHourPerScreen <= SC_MAX){
    warning = `⚠️ В среднем получается ${playsPerHourPerScreen.toFixed(1)} выходов/час на экран (выше оптимальных ${SC_OPT}). Выходов может быть меньше: ёмкость экранов ограничена.`;
  } else if(playsPerHourPerScreen > SC_MAX){
    const maxPlaysByCapacity = Math.floor(SC_MAX * screensChosenCount * days * hpd);
    totalPlaysEffective = Math.min(totalPlaysTheory, maxPlaysByCapacity);
    warning = `⚠️ На заданный бюджет не хватает ёмкости: максимум ${SC_MAX} выходов/час на экран. В расчёте показаны данные по ёмкости (часть бюджета может не утилизироваться).`;
  }

  const playsPerDay = totalPlaysEffective / days;
  const playsPerHourTotal = totalPlaysEffective / days / hpd;

  // OTS
  const avgOts = avgNumber(pool.map(s => s.ots));
  const otsTotal = (avgOts == null) ? null : totalPlaysEffective * avgOts;
  const otsPerDay = (avgOts == null) ? null : otsTotal / days;
  const otsPerHour = (avgOts == null) ? null : otsTotal / days / hpd;

  state.lastChosen = chosen;

  const nf = (n) => Math.floor(n).toLocaleString("ru-RU");
  const of = (n) => Math.round(n).toLocaleString("ru-RU");

const selectionLine =
  brief.selection.mode === "near_address"
    ? `— Адрес: ${(brief.selection.address_display || brief.selection.address || "—")} (радиус: ${brief.selection.radius_m || 500} м)\n`
    : brief.selection.mode === "route"
      ? `— Маршрут: ${(brief.selection.route_from_display || brief.selection.from || "—")} → ${(brief.selection.route_to_display || brief.selection.to || "—")} (коридор: ${brief.selection.radius_m || 300} м)\n`
      : "";

const summaryText =
`Бриф:
— Бюджет: ${budget.toLocaleString("ru-RU")} ₽
— Даты: ${brief.dates.start} → ${brief.dates.end} (дней: ${days})
— Расписание: ${brief.schedule.type} (часов/день: ${hpd})
— Город: ${city}
— Форматы: ${selectedFormatsText}
— Подбор: ${brief.selection.mode}
${selectionLine}— GRP: ${brief.grp.enabled ? `${brief.grp.min.toFixed(2)}–${brief.grp.max.toFixed(2)}` : "не учитываем"}


Расчёт через minBid:
— Средний minBid: ${bidPlus20.toFixed(2)} ₽
— Выходов всего: ${nf(totalPlaysEffective)}
— Выходов/день: ${nf(playsPerDay)}
— Выходов/час (в сумме): ${nf(playsPerHourTotal)}
— Экранов выбрано: ${screensChosenCount}
— OTS всего: ${otsTotal == null ? "—" : of(otsTotal)}
— OTS/день: ${otsTotal == null ? "—" : of(otsPerDay)}
— OTS/час: ${otsTotal == null ? "—" : of(otsPerHour)}`
  + (warning ? `\n\n${warning}` : "")
  + (grpWarning ? `\n\n${grpWarning}` : "");
  
  if(el("summary")) el("summary").textContent = summaryText;
  if(el("download-csv")) el("download-csv").disabled = chosen.length === 0;

  if(el("results")){
    el("results").innerHTML =
      `<div style="font-size:13px; color:#666;">Показаны первые 10 выбранных экранов.</div>` +
      `<div style="margin-top:8px; border:1px solid #eee; border-radius:12px; overflow:hidden;">` +
      `<table style="width:100%; border-collapse:collapse; font-size:13px;">` +
      `<thead><tr style="background:#fafafa;">` +
      `<th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">screen_id</th>` +
      `<th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">format</th>` +
      `<th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">minBid</th>` +
      `<th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">ots</th>` +
      `<th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">grp</th>` +
      `<th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">address</th>` +
      `</tr></thead><tbody>` +
      chosen.slice(0,10).map(r => (
        `<tr>` +
        `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${r.screen_id || ""}</td>` +
        `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${r.format || ""}</td>` +
        `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number.isFinite(r.minBid) ? r.minBid.toFixed(2) : ""}</td>` +
        `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number.isFinite(r.ots) ? r.ots : ""}</td>` +
        `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number.isFinite(r.grp) ? r.grp.toFixed(2) : ""}</td>` +
        `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${r.address || ""}</td>` +
        `</tr>`
      )).join("") +
      `</tbody></table></div>`;
  }
}

// ===== BIND UI =====

function bindPlannerUI() {
  // preset buttons
  document.querySelectorAll(".preset").forEach(b => {
    cssButtonBase(b);
    b.addEventListener("click", () => {
      if (el("date-start")) el("date-start").value = b.dataset.start;
      if (el("date-end")) el("date-end").value = b.dataset.end;
    });
  });

  // budget mode
  document.querySelectorAll('input[name="budget_mode"]').forEach(r => {
    r.addEventListener("change", () => {
      const mode = getBudgetMode();
      const wrap = el("budget-input-wrap");
      if (wrap) wrap.style.display = mode === "fixed" ? "block" : "none";
    });
  });

  // schedule
  document.querySelectorAll('input[name="schedule"]').forEach(r => {
    r.addEventListener("change", () => {
      const v = getScheduleType();
      const wrap = el("custom-time-wrap");
      if (wrap) wrap.style.display = (v === "custom") ? "flex" : "none";
    });
  });

  // grp
  const grpEnabled = el("grp-enabled");
  if (grpEnabled) {
    grpEnabled.addEventListener("change", (e) => {
      const wrap = el("grp-wrap");
      if (wrap) wrap.style.display = e.target.checked ? "block" : "none";
    });
  }

  // formats auto
  const formatsAuto = el("formats-auto");
  if (formatsAuto) {
    formatsAuto.addEventListener("change", (e) => {
      const wrap = el("formats-wrap");
      if(e.target.checked){
        state.selectedFormats.clear();
        if (wrap) [...wrap.querySelectorAll("button")].forEach(btn => btn.style.borderColor = "#ddd");
      }
    });
  }

  // selection mode
  const selectionMode = el("selection-mode");
  if (selectionMode) selectionMode.addEventListener("change", renderSelectionExtra);

  // city search
  const citySearch = el("city-search");
  if (citySearch) citySearch.addEventListener("input", (e) => renderCitySuggestions(e.target.value));

  // download
  const downloadBtn = el("download-csv");
  if (downloadBtn) downloadBtn.addEventListener("click", () => downloadXLSX(state.lastChosen));

  // calc
  const calcBtn = el("calc-btn");
  if (calcBtn) calcBtn.addEventListener("click", () => onCalcClick());
}

// ===== START =====

async function startPlanner() {
  renderSelectionExtra();
  bindPlannerUI();
  await loadScreens();
}

function bootPlanner(){
  startPlanner().catch(e => {
    console.error("Planner init failed:", e);
    setStatus("Ошибка инициализации. Открой консоль — там причина (Planner init failed).");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootPlanner);
} else {
  bootPlanner(); // DOM уже готов (часто в Tilda)
}

// === DEBUG/INTEGRATION EXPORTS (для консоли и внешних модулей) ===
window.PLANNER = window.PLANNER || {};
window.PLANNER.state = state;
window.PLANNER.loadScreens = loadScreens;
window.PLANNER.startPlanner = startPlanner;
window.PLANNER.bootPlanner = bootPlanner;

// простой флаг "готово"
window.PLANNER.ready = false;

// помечаем готовность после успешной загрузки CSV
const _origLoadScreens = loadScreens;
loadScreens = async function () {
  const res = await _origLoadScreens();
  window.PLANNER.ready = true;
  window.dispatchEvent(new CustomEvent("planner:screens-ready", { detail: { count: state.screens.length } }));
  return res;
};
