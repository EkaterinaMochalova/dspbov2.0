console.log("planner.js loaded");

// ========== GLOBAL ==========
window.PLANNER = window.PLANNER || {};

const REF = "planner";
const SCREENS_CSV_URL =
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@24ada9ff4b42b7426b4c954e8b7bebc97efed72c/inventories_sync.csv?v=" + Date.now();

const TIERS_JSON_URL =
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@main/tiers_v1.json?v=" + Date.now();

// ===== CITY -> REGION =====
const CITY_REGIONS_URL =
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@f6f96a16980cda4d7165e692526ef08f2cd0c22e/city_regions.json?v=" + Date.now();

// ===== Labels =====
const FORMAT_LABELS = {
  BILLBOARD: { label: "Билборды", desc: "экраны 3×6 м вдоль трасс" },
  CITY_BOARD: { label: "City Board", desc: "небольшие экраны в центре города, видимые и авто-, и пешеходному траффику" },
  CITY_FORMAT: { label: "Ситиформаты", desc: "вертикальные экраны, остановки/пешеходные зоны" },
  CITY_FORMAT_RC: { label: "Ситиформаты на МЦК", desc: "экраны на МЦК" },
  CITY_FORMAT_RD: { label: "Ситиформаты на вокзалах", desc: "экраны на вокзале" },
  CITY_FORMAT_WD: { label: "Ситиформаты в метро", desc: "экраны в метро" },
  RW_PLATFORM: { label: "Ситиформаты на МЦД", desc: "экраны на МЦД" },
  METRO_SCREEN_3X1: { label: "Горизонтальные экраны в метро", desc: "экраны в метро" },
  MEDIAFACADE: { label: "Медиафасады", desc: "огромные экраны на стенах домов" },
  METRO_LIGHTBOX: { label: "Metro Lightbox", desc: "экраны в метро, горизонтальные" },
  OTHER: { label: "Indoor-экраны", desc: "экраны внутри БЦ, ТЦ и иных помещений" },
  PVZ_SCREEN: { label: "Экраны в ПВЗ", desc: "экраны в пунктах выдачи заказов" },
  SKY_DIGITAL: { label: "Аэропорты", desc: "экраны в аэропортах" },
  SUPERSITE: { label: "Суперсайты", desc: "крупные конструкции с высокой дальностью видимости" }
};


// Экспортируем метки форматов наружу (для UI-скриптов в Tilda)
window.PLANNER = window.PLANNER || {};
window.PLANNER.FORMAT_LABELS = FORMAT_LABELS;
window.PLANNER.ui = window.PLANNER.ui || {};
window.PLANNER.ui.photosAllowed = false;

// (опционально) чтобы проще было обращаться из любого места
window.FORMAT_LABELS = window.FORMAT_LABELS || FORMAT_LABELS;


const POI_QUERIES = {
  fitness: `
    nwr(area.a)["leisure"="fitness_centre"];
    nwr(area.a)["amenity"="gym"];
    nwr(area.a)["sport"="fitness"];
    nwr(area.a)["leisure"="sports_centre"]["sport"="fitness"];
  `,
  pet_store: `
    nwr(area.a)["shop"="pet"];
    nwr(area.a)["shop"="pet_grooming"];
    nwr(area.a)["amenity"="veterinary"];
  `,
  supermarket: `
    nwr(area.a)["shop"="supermarket"];
    nwr(area.a)["shop"="convenience"];
    nwr(area.a)["shop"="hypermarket"];
  `,
  mall: `
    nwr(area.a)["shop"="mall"];
  `,
  cafe: `
    nwr(area.a)["amenity"="cafe"];
    nwr(area.a)["shop"="coffee"];
  `,
  restaurant: `
    nwr(area.a)["amenity"="restaurant"];
    nwr(area.a)["amenity"="fast_food"];
    nwr(area.a)["amenity"="food_court"];
  `,
  pharmacy: `
    nwr(area.a)["amenity"="pharmacy"];
  `,
  school: `
    nwr(area.a)["amenity"="school"];
  `,
  university: `
    nwr(area.a)["amenity"="university"];
    nwr(area.a)["amenity"="college"];
  `,
  hospital: `
    nwr(area.a)["amenity"="hospital"];
    nwr(area.a)["amenity"="clinic"];
  `,
  gas_station: `
    nwr(area.a)["amenity"="fuel"];
  `,
  bank: `
    nwr(area.a)["amenity"="bank"];
    nwr(area.a)["amenity"="atm"];
  `,
  transport: `
    nwr(area.a)["public_transport"];
    nwr(area.a)["railway"="station"];
    nwr(area.a)["railway"="subway_entrance"];
  `
};

const POI_LABELS = {
  fitness: "Фитнес-клубы",
  pet_store: "Зоомагазины",
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

// ===== Model =====
const BID_MULTIPLIER = 1.2;
const SC_OPT = 30;
const SC_MAX = 60;
const RECO_HOURS_PER_DAY = 12;  // для режима "нужна рекомендация"

// ===== State =====
const state = {
  screens: [],
  citiesAll: [],
  formatsAll: [],

  // ===== Regions =====
  regionsAll: [],              // ["Москва", "Санкт-Петербург", "Московская область", ...]
  regionsByCity: {},           // { "Москва": "Москва", "Химки": "Московская область", ... }

  // ===== Diagnostics =====
  unknownCities: [],           // ["Троицк", "Долгопрудный", ...]
  unknownCitiesTop: [],        // [{ city, screens }, ...]

  // ===== UI =====
  selectedCity: null,
  selectedFormats: new Set(),
  lastChosen: []
};
  
window.PLANNER.state = state;
// ===== Utils =====
function el(id){ return document.getElementById(id); }

function setStatus(msg){
  const s = el("status");
  if(s) s.textContent = msg || "";
}

function normKey(s){
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
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
  return document.querySelector('input[name="schedule"]:checked')?.value || "весь день";
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
  if(schedule.type === "all_day") return 15;
  if(schedule.type === "peak") return 7;
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
    return;
  }

  if(mode === "poi"){
    const keys = Object.keys(POI_QUERIES || {});
    const options = keys.map(k => `<option value="${k}">${POI_LABELS[k] || k}</option>`).join("");

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
    return;
  }

  if(mode === "route"){
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
    return;
  }
}

function _normCityKey(city) {
  // нормализация ключей: пробелы, регистр, ё/е
  return String(city || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е");
}

function normalizeCityKey(s){
  return String(s || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

async function loadCityRegions(){
  try {
    const res = await fetch(CITY_REGIONS_URL, { cache: "no-store" });
    if(!res.ok) throw new Error("city_regions http " + res.status);

    const json = await res.json();
    const regionsRaw = (json?.regions && typeof json.regions === "object") ? json.regions : null;
    if(!regionsRaw) throw new Error("city_regions has no 'regions' object");

    // Собираем city -> region (нормализованный ключ города)
    const cityToRegion = {};
    let citiesCount = 0;
    let regionsCount = 0;

    for (const [k, v] of Object.entries(regionsRaw)) {
      // Вариант A (старый): "Москва": "Москва"
      if (typeof v === "string") {
        const city = k;
        const region = v;
        const key = normalizeCityKey(city);
        if (key) {
          cityToRegion[key] = String(region).trim();
          citiesCount++;
        }
        continue;
      }

      // Вариант B (новый): "Московская область": ["Химки", ...]
      if (Array.isArray(v)) {
        const region = String(k).trim();
        regionsCount++;
        for (const city of v) {
          const key = normalizeCityKey(city);
          if (!key) continue;
          cityToRegion[key] = region;
          citiesCount++;
        }
        continue;
      }
    }

    window.PLANNER.cityRegions = cityToRegion;          // dict: normalizedCity -> region
    window.PLANNER.cityRegionsMeta = json?.meta || null;

    console.log("[city_regions] loaded:", { cities: citiesCount, regions: regionsCount || "n/a" });
    return true;

  } catch (e) {
    console.warn("[city_regions] load failed:", e);
    window.PLANNER.cityRegions = {};
    window.PLANNER.cityRegionsMeta = null;
    return false;
  }
}

function getRegionForCity(city){
  const key = normalizeCityKey(city);
  const r = window.PLANNER?.cityRegions?.[key];
  return (typeof r === "string" && r.trim()) ? r.trim() : "Не назначено";
}

function renderSelectedCity() {
  const box = el("city-selected");
  if (!box) return;

  const city = state.selectedCity || "";
  if (!city) {
    box.innerHTML = "";
    return;
  }

  box.innerHTML = `
    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
      <span style="padding:6px 10px; border:1px solid #ddd; border-radius:999px; background:#fafafa;">
        ${escapeHtml(city)}
      </span>
      <button type="button" id="city-clear"
        style="padding:6px 10px; border:1px solid #ddd; border-radius:10px; background:#fff; cursor:pointer;">
        Очистить
      </button>
    </div>
  `;

  const btn = el("city-clear");
  if (btn) {
    btn.onclick = () => {
      state.selectedCity = null;
      renderSelectedCity();
      renderCitySuggestions(""); // если у тебя есть эта функция; если нет — убери строку
    };
  }
}
function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

// ===== Data load =====
async function loadScreens(){
  setStatus("Загружаю список экранов…");
  console.log("[screens] url:", SCREENS_CSV_URL);

  const res = await fetch(SCREENS_CSV_URL, { cache: "no-store" });
  console.log("[screens] status:", res.status, res.statusText);
  if(!res.ok) throw new Error("Не удалось загрузить CSV: " + res.status);

  const text = await res.text();
  const rows = parseCSV(text);

  // 1) Сначала парсим экраны БЕЗ region (region добавим после того, как соберём citiesAll)
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
      minBid: toNumber(r.minBid ?? r.min_bid ?? r.MINBID ?? r.minbid),
      ots: toNumber(r.ots ?? r.OTS),
      grp: toNumber(r.grp ?? r.GRP),
      lat: toNumber(r.lat ?? r.Lat ?? r.LAT),
      lon: toNumber(r.lon ?? r.Lon ?? r.LON ?? r.lng ?? r.Lng ?? r.LNG)
      // region добавим позже
    };
  });

  // 2) citiesAll / formatsAll
  state.citiesAll = [...new Set(state.screens.map(s => s.city).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b, "ru"));

  state.formatsAll = [...new Set(state.screens.map(s => s.format).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b));

    // regionsByCity + regionsAll
  state.regionsByCity = {};
  state.regionsAll = [];

  for (const c of state.citiesAll) {
    const reg = getRegionForCity(c);
    state.regionsByCity[c] = reg;
    if (!state.regionsAll.includes(reg)) state.regionsAll.push(reg);
  }
  state.regionsAll.sort((a,b)=>a.localeCompare(b,"ru"));
  
  for (const city of state.citiesAll) {
    const region = getRegionForCity(city); // важно: справочник уже должен быть загружен loadCityRegions()
    state.regionsByCity[city] = region;
    if (!state.regionsAll.includes(region)) state.regionsAll.push(region);
  }

  state.regionsAll.sort((a,b)=>a.localeCompare(b, "ru"));

  // 4) Проставляем region каждому экрану
  for (const s of state.screens) {
    s.region = state.regionsByCity[s.city] || "Не назначено";
  }

  // 5) UI
  renderFormats();
  renderSelectedCity();

  setStatus(
    `Всего доступно:` +
    `Экранов: ${state.screens.length}. ` +
    `Городов: ${state.citiesAll.length}. ` +
    `Форматов: ${state.formatsAll.length}. ` +
    `Регионов: ${state.regionsAll.length}.`
  );

  window.PLANNER.ready = true;
  window.dispatchEvent(new CustomEvent("planner:screens-ready", { detail: { count: state.screens.length } }));
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
function renderSelectedRegion(){
  const wrap = el("city-selected");
  if(!wrap) return;
  wrap.innerHTML = "";

  if(!state.selectedRegion){
    wrap.innerHTML = `<div style="font-size:12px; color:#666;">Регион не выбран</div>`;
    return;
  }

  const chip = document.createElement("button");
  cssButtonBase(chip);
  chip.textContent = "✕ " + state.selectedRegion;
  chip.addEventListener("click", () => {
    state.selectedRegion = null;
    renderSelectedRegion();
  });
  wrap.appendChild(chip);
}

function renderRegionSuggestions(q){
  const sug = el("city-suggestions");
  if(!sug) return;
  sug.innerHTML = "";
  if(!q) return;

  const qq = q.toLowerCase();
  const matches = state.regionsAll
    .filter(r => r.toLowerCase().includes(qq))
    .slice(0, 12);

  matches.forEach(r => {
    const b = document.createElement("button");
    cssButtonBase(b);
    b.textContent = "+ " + r;
    b.addEventListener("click", () => {
      state.selectedRegion = r;
      if(el("city-search")) el("city-search").value = "";
      sug.innerHTML = "";
      renderSelectedRegion();
    });
    sug.appendChild(b);
  });
}

// ===== Brief =====
function buildBrief(){
  const root = document.getElementById("planner-widget") || document;

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
    geo: { region: state.selectedRegion },
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

  const qsVal = (sel) => (root.querySelector(sel)?.value ?? "");
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
  const pickAnyVal = (...sels) => {
    for (const s of sels) {
      const v = qsVal(s);
      if (String(v).trim()) return String(v).trim();
    }
    return "";
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
    brief.selection.from = pickAnyVal("#route-from");
    brief.selection.to   = pickAnyVal("#route-to");
    brief.selection.radius_m = pickAnyNum(300, "#planner-radius", "#radius");
  }

  if (!Number.isFinite(brief.grp.min)) brief.grp.min = 0;
  if (!Number.isFinite(brief.grp.max)) brief.grp.max = 9.98;
  brief.grp.min = Math.max(0, Math.min(9.98, brief.grp.min));
  brief.grp.max = Math.max(0, Math.min(9.98, brief.grp.max));
  if (brief.grp.max < brief.grp.min) [brief.grp.min, brief.grp.max] = [brief.grp.max, brief.grp.min];

  return brief;
}

async function loadTiers(){
  try {
    const res = await fetch(TIERS_JSON_URL, { cache: "no-store" });
    if(!res.ok) throw new Error("tiers json http " + res.status);
    const json = await res.json();

    // ожидаем { tiers: {city: tier} }
    const tiers = json?.tiers && typeof json.tiers === "object" ? json.tiers : null;
    if(!tiers) throw new Error("tiers json has no 'tiers' object");

    window.PLANNER.tiers = tiers;
    window.PLANNER.tiersMeta = {
      version: json?.version || "unknown",
      generated_at: json?.generated_at || null
    };

    console.log("[tiers] loaded:", Object.keys(tiers).length, "cities", window.PLANNER.tiersMeta);
    return true;
  } catch(e){
    console.warn("[tiers] load failed:", e);
    window.PLANNER.tiers = {}; // чтобы код дальше не падал
    window.PLANNER.tiersMeta = { version: "missing", generated_at: null };
    return false;
  }
}

function getTierForGeo(name){
  const key = String(name || "").trim();
  const t = window.PLANNER?.tiers?.[key];
  return (t === "A" || t === "B" || t === "C" || t === "D") ? t : "C";
}

function getTierForRegion(region, poolScreens){
  // poolScreens: экраны уже отфильтрованы по region
  const tiers = window.PLANNER?.tiers || {};

  // веса tier'ов по числу экранов
  const w = { A: 0, B: 0, C: 0, D: 0, U: 0 };

  for(const s of (poolScreens || [])){
    const city = String(s.city || "").trim();
    if(!city) continue;

    const t = tiers[city]; // tiers.json по городам
    if(t === "A" || t === "B" || t === "C" || t === "D") w[t] += 1;
    else w.U += 1; // unknown
  }

  // выбираем максимум (если все unknown — дефолт C)
  const order = ["A","B","C","D"];
  let best = "C";
  let bestW = -1;

  for(const t of order){
    if(w[t] > bestW){ bestW = w[t]; best = t; }
  }

  // если вообще нет экранов или все unknown
  if(bestW <= 0) return "C";
  return best;
}


// ===== Helpers =====
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

function downloadPOIsCSV(pois){
  if(!pois || !pois.length) return;
  const rows = pois.map(p => ({
    id: p.id || "",
    name: p.name || "",
    lat: p.lat,
    lon: p.lon,
    region: state.selectedRegion || ""
  }));
  const csv = Papa.unparse(rows, { quotes: true });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "pois.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadPOIsXLSX(pois){
  if(!pois || !pois.length) return;

  const rows = pois.map(p => ({
    id: p.id || "",
    name: p.name || "",
    lat: p.lat,
    lon: p.lon,
    city: state.selectedCity || ""
  }));

  const ws = XLSX.utils.json_to_sheet(rows, { header: ["id","name","lat","lon","city"] });
  ws["!cols"] = [{wch:22},{wch:40},{wch:12},{wch:12},{wch:18}];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "POIs");
  XLSX.writeFile(wb, "pois.xlsx");
}

function clearPhotosCarousel(){
  const box = document.getElementById("screens-photos");
  const row = document.getElementById("screens-photos-row");
  if(row) row.innerHTML = "";
  if(box) box.style.display = "none";
}

function renderPhotosCarousel(chosen){
  console.log("[photos] renderPhotosCarousel called", new Error().stack);
  if(!window.PLANNER?.ui?.photosAllowed) return; 
  const box = document.getElementById("screens-photos");
  const row = document.getElementById("screens-photos-row");
  if(!box || !row) return;

  row.innerHTML = "";

  const items = Array.isArray(chosen) ? chosen : [];
  // показываем только те, у кого есть image_url
  const withImg = items.filter(s => String(s.image_url || "").trim());

  if(!withImg.length){
    box.style.display = "none";
    return;
  }

  // ограничим, чтобы не грузить 1000 фоток сразу
  const MAX = 25;

  for(const s of withImg.slice(0, MAX)){
    const gid = s.screen_id || s.gid || "";
    const owner = s.owner || s.owner_name || "";
    const addr = s.address || "";
    const img = String(s.image_url || "").trim();

    const card = document.createElement("div");
    card.className = "photo-card";

    card.innerHTML = `
      <img src="${escapeHtml(img)}" alt="">
      <div class="meta">
        <div class="gid">${escapeHtml(gid)}</div>
        <div class="sub">${escapeHtml(owner)}</div>
        <div class="sub">${escapeHtml(addr)}</div>
      </div>
    `;

    // (опц.) клик — открыть в новом окне
    card.addEventListener("click", () => {
      try { window.open(img, "_blank"); } catch(e){}
    });

    row.appendChild(card);
  }

  box.style.display = "block";
}

function renderPOIList(pois){
  const wrap = document.getElementById("poi-results");
  if(!wrap) return;

  if(!pois || !pois.length){
    wrap.innerHTML = `<div style="font-size:13px; color:#666;">POI не найдены.</div>`;
    return;
  }

  wrap.innerHTML =
    `<div style="font-size:13px; color:#666;">Найдено POI: <b>${pois.length}</b> (показываю первые 20)</div>` +
    `<div style="margin-top:8px; border:1px solid #eee; border-radius:12px; overflow:hidden;">` +
    `<table style="width:100%; border-collapse:collapse; font-size:13px;">` +
    `<thead><tr style="background:#fafafa;">` +
    `<th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">name</th>` +
    `<th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">lat</th>` +
    `<th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">lon</th>` +
    `<th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">id</th>` +
    `</tr></thead><tbody>` +
    pois.slice(0,20).map(p => (
      `<tr>` +
      `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${p.name || "—"}</td>` +
      `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number(p.lat).toFixed(6)}</td>` +
      `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number(p.lon).toFixed(6)}</td>` +
      `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${p.id || ""}</td>` +
      `</tr>`
    )).join("") +
    `</tbody></table></div>`;
}

function cityCenterFromScreens(screens){
  const pts = (screens || [])
    .map(s => ({ lat: Number(s.lat), lon: Number(s.lon) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!pts.length) return null;
  const lat = pts.reduce((a,p)=>a+p.lat,0) / pts.length;
  const lon = pts.reduce((a,p)=>a+p.lon,0) / pts.length;
  return { lat, lon };
}

// ===== Overpass =====
const OVERPASS_URLS = [
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.nchc.org.tw/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
  "https://overpass.private.coffee/api/interpreter"
];

const _sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function _fetchOverpass(url, body, timeoutMs = 45000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: "data=" + encodeURIComponent(body),
      signal: ac.signal
    });
  } finally {
    clearTimeout(t);
  }
}

async function _runOverpassWithFailover(body, timeoutMs = 45000) {
  let lastErr = null;
  let attempt = 0;

  for (const url of OVERPASS_URLS) {
    attempt++;
    try {
      const res = await _fetchOverpass(url, body, timeoutMs);
      const txt = await res.text();

      if (!res.ok) {
        throw new Error(`Overpass ${res.status} @ ${url} :: ${txt.slice(0, 180)}`);
      }

      let json;
      try { json = JSON.parse(txt); }
      catch { throw new Error(`Overpass non-JSON @ ${url} :: ${txt.slice(0, 180)}`); }

      return json;

    } catch (e) {
      lastErr = e;
      console.warn("[poi] overpass fail:", String(e));
      await _sleep(350 * attempt + Math.floor(Math.random() * 500));
    }
  }

  throw lastErr || new Error("Overpass failed (all endpoints)");
}

function _escapeOverpassString(s){
  return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

function _normalizePOIs(json){
  const els = Array.isArray(json?.elements) ? json.elements : [];
  return els.map(el => {
    const name = el.tags?.name || "";
    const lat0 = Number(el.lat ?? el.center?.lat);
    const lon0 = Number(el.lon ?? el.center?.lon);
    if (!Number.isFinite(lat0) || !Number.isFinite(lon0)) return null;
    return { id: `${el.type}/${el.id}`, name, lat: lat0, lon: lon0, raw: el };
  }).filter(Boolean);
}

/**
 * POI in city administrative area WITHOUT turbo macros
 * poiType: key in POI_QUERIES
 * cityName: "Москва"
 * limit: <= 50
 */
async function fetchPOIsOverpassInCity(poiType, cityName, limit = 50){
  const t = String(poiType || "").trim();
  if (!t || !POI_QUERIES[t]) throw new Error("Unknown poi_type: " + t);

  const city = _escapeOverpassString(cityName);
  if (!city) throw new Error("City is empty");

  const safeLimit = Math.max(1, Math.min(50, Number(limit || 50)));

  // Ищем area по name или name:ru, на разных admin_level (город/регион) — берём что найдём
  const body = `
    [out:json][timeout:40];
    (
      area["boundary"="administrative"]["name"="${city}"];
      area["boundary"="administrative"]["name:ru"="${city}"];
    )->.cand;
    .cand->.a;
    (
      ${POI_QUERIES[t]}
    );
    out center ${safeLimit};
  `;

  const json = await _runOverpassWithFailover(body, 55000);
  const pois = _normalizePOIs(json).slice(0, safeLimit);

  if (!pois.length) {
    throw new Error(`POI не найдены: «${POI_LABELS?.[t] || t}» в городе «${cityName}». Попробуй другой тип.`);
  }

  return pois;
}

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

function _poiQueryWithScope(poiType, scopeExpr){
  // scopeExpr examples:
  //  - "area.a"
  //  - "55.6,37.3,55.9,37.9"        (bbox)
  //  - "around:25000,55.75,37.61"  (around)
  const raw = POI_QUERIES[poiType];
  if(!raw) throw new Error("Unknown poi_type: " + poiType);

  // заменяем ровно "nwr(area.a)" -> "nwr(<scopeExpr>)"
  return String(raw).replace(/nwr\s*\(\s*area\.a\s*\)/g, `nwr(${scopeExpr})`);
}

function _bboxFromScreens(screens){
  const pts = (screens || [])
    .map(s => ({ lat: Number(s.lat), lon: Number(s.lon) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  if(!pts.length) return null;

  let minLat =  90, maxLat = -90, minLon =  180, maxLon = -180;
  for(const p of pts){
    if(p.lat < minLat) minLat = p.lat;
    if(p.lat > maxLat) maxLat = p.lat;
    if(p.lon < minLon) minLon = p.lon;
    if(p.lon > maxLon) maxLon = p.lon;
  }

  // padding: чтобы POI на границе не отрезались
  const padLat = 0.05; // ~5-6 км
  const padLon = 0.08; // ~5-8 км в средней полосе (грубо)

  return {
    minLat: minLat - padLat,
    minLon: minLon - padLon,
    maxLat: maxLat + padLat,
    maxLon: maxLon + padLon
  };
}

function _centerFromBbox(bb){
  if(!bb) return null;
  return { lat: (bb.minLat + bb.maxLat)/2, lon: (bb.minLon + bb.maxLon)/2 };
}

function _estimateRadiusFromBbox(bb){
  // грубая оценка радиуса (в метрах) по диагонали bbox
  if(!bb) return 25000;
  const latSpan = Math.abs(bb.maxLat - bb.minLat);
  const lonSpan = Math.abs(bb.maxLon - bb.minLon);
  // 1 градус широты ~111км, долготы ~111км * cos(lat)
  const latKm = latSpan * 111;
  const midLat = (bb.minLat + bb.maxLat)/2;
  const lonKm = lonSpan * 111 * Math.cos((midLat * Math.PI)/180);
  const diagKm = Math.sqrt(latKm*latKm + lonKm*lonKm);
  // radius примерно половина диагонали, но ограничим
  const r = Math.max(8000, Math.min(120000, (diagKm * 0.6) * 1000));
  return Math.round(r);
}

/**
 * POI in REGION administrative area (Oblast/Republic/Federal city)
 * regionName: "Московская область", "Москва", "Санкт-Петербург", ...
 */
async function fetchPOIsOverpassInRegion(poiType, regionName, screensInRegion, limit = 50){
  const t = String(poiType || "").trim();
  if (!t || !POI_QUERIES[t]) throw new Error("Unknown poi_type: " + t);

  const region = _escapeOverpassString(regionName);
  if (!region) throw new Error("Region is empty");

  const safeLimit = Math.max(1, Math.min(50, Number(limit || 50)));

  // ---------- Attempt 1: admin area by name ----------
  try {
    const bodyArea = `
      [out:json][timeout:40];
      (
        area["boundary"="administrative"]["name"="${region}"]["admin_level"~"4|6"];
        area["boundary"="administrative"]["name:ru"="${region}"]["admin_level"~"4|6"];
        area["boundary"="administrative"]["name"="${region}"];
        area["boundary"="administrative"]["name:ru"="${region}"];
      )->.cand;

      .cand->.a;

      (
        ${POI_QUERIES[t]}
      );

      out center ${safeLimit};
    `;

    const json = await _runOverpassWithFailover(bodyArea, 55000);
    const pois = _normalizePOIs(json).slice(0, safeLimit);
    if (pois.length) return pois;

  } catch(e){
    console.warn("[poi] area attempt failed:", String(e));
    // идём дальше
  }

  // ---------- Attempt 2: bbox from screens ----------
  const bb = _bboxFromScreens(screensInRegion || []);
  if (bb) {
    try {
      const scope = `${bb.minLat},${bb.minLon},${bb.maxLat},${bb.maxLon}`;
      const q = _poiQueryWithScope(t, scope);

      const bodyBbox = `
        [out:json][timeout:40];
        (
          ${q}
        );
        out center ${safeLimit};
      `;

      const json2 = await _runOverpassWithFailover(bodyBbox, 55000);
      const pois2 = _normalizePOIs(json2).slice(0, safeLimit);
      if (pois2.length) return pois2;

    } catch(e){
      console.warn("[poi] bbox attempt failed:", String(e));
    }
  }

  // ---------- Attempt 3: around center ----------
  const c = _centerFromBbox(bb);
  if (c) {
    try {
      const r = _estimateRadiusFromBbox(bb); // динамический радиус
      const scope = `around:${r},${c.lat},${c.lon}`;
      const q = _poiQueryWithScope(t, scope);

      const bodyAround = `
        [out:json][timeout:40];
        (
          ${q}
        );
        out center ${safeLimit};
      `;

      const json3 = await _runOverpassWithFailover(bodyAround, 55000);
      const pois3 = _normalizePOIs(json3).slice(0, safeLimit);
      if (pois3.length) return pois3;

    } catch(e){
      console.warn("[poi] around attempt failed:", String(e));
    }
  }

  throw new Error(`POI не найдены: «${POI_LABELS?.[t] || t}» в регионе «${regionName}». Попробуй другой тип или увеличь радиус/поменяй регион.`);
}


// ===== MAIN =====
async function onCalcClick(){
  const brief = buildBrief();

  if(!brief.dates.start || !brief.dates.end){
    alert("Выберите даты начала и окончания.");
    return;
  }
  if(!brief.geo.region){
  alert("Выберите регион (один).");
  return;
  }

  const region = brief.geo.region;
  const tier = getTierForGeo(region);
  let pool = state.screens.filter(s => s.region === region);

  if(brief.budget.mode === "fixed" && (!brief.budget.amount || brief.budget.amount <= 0)){
    alert("Введите бюджет или выберите «нужна рекомендация».");
    return;
  }

  const days = daysInclusive(brief.dates.start, brief.dates.end);
  if(!Number.isFinite(days) || days <= 0){
    alert("Выберите корректные даты начала и окончания.");
    return;
  }

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
  if (window.PLANNER?.getScreensFilteredByOwner) {
  pool = window.PLANNER.getScreensFilteredByOwner(pool);
  }
  if(pool.length === 0){
    alert("Нет экранов под выбранные условия (город/форматы).");
    return;
  }

  // ===== POI MODE =====
  if (brief.selection.mode === "poi") {
    if (!window.GeoUtils?.haversineMeters) {
      alert("GeoUtils не найден. Проверь подключение geo.js");
      return;
    }

    const poiType = String(brief.selection.poi_type || "").trim();
    const screenRadius = Number(brief.selection.radius_m || 500);

    setStatus(`Ищу POI в регионе «${region}»: ${POI_LABELS?.[poiType] || poiType}…`);

    let pois = [];
    try {
      pois = await fetchPOIsOverpassInRegion(poiType, region, pool, 50);
    } catch (e) {
      console.error("[poi] error:", e);
      alert(e?.message || "Ошибка Overpass (OSM). Попробуй ещё раз.");
      setStatus("");
      return;
    }

    window.PLANNER.lastPOIs = pois;

    const b1 = el("download-poi-csv");
    const b2 = el("download-poi-xlsx");
    if (b1) b1.disabled = !pois.length;
    if (b2) b2.disabled = !pois.length;

    renderPOIList(pois);

    const before = pool.length;
    pool = pickScreensNearPOIs(pool, pois, screenRadius);

    if (!pool.length) {
      alert("В радиусе вокруг найденных POI нет экранов (или у экранов нет lat/lon).");
      setStatus("");
      return;
    }

    setStatus(`Экраны у POI: ${pool.length} из ${before} (POI: ${pois.length})`);
  }

  // ===== GRP filter (optional) =====
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

  // avg bid
  const avgBid = avgNumber(pool.map(s => s.minBid));
  if(avgBid == null){
    alert("Не могу посчитать: у выбранных экранов нет minBid.");
    return;
  }
  const bidPlus20 = avgBid * BID_MULTIPLIER;

  // hpd
  const hpdFixed = hoursPerDay(brief.schedule);
  if(!Number.isFinite(hpdFixed) || hpdFixed <= 0){
    alert("Проверь расписание.");
    return;
  }

  // budget
  let budget = brief.budget.amount;

  if(brief.budget.mode === "fixed"){
    if(!Number.isFinite(budget) || budget <= 0){
      alert("Введите бюджет или выберите «нужна рекомендация».");
      return;
    }
  } else {
    const screensCount = pool.length;

    const maxPlays = Math.floor(SC_MAX * RECO_HOURS_PER_DAY * screensCount * days);
    const maxBudget = maxPlays * bidPlus20;

    const BASE_MONTHLY_BY_TIER = { A: 2000000, B: 1000000, C: 500000, D: 200000 };
    const DAYS_IN_MONTH = 30;

    const baseMonthly = BASE_MONTHLY_BY_TIER[tier] ?? BASE_MONTHLY_BY_TIER.C;
    const baseBudgetForPeriod = Math.floor(baseMonthly * (days / DAYS_IN_MONTH));

    budget = Math.floor(Math.min(baseBudgetForPeriod, maxBudget));

    if(!Number.isFinite(budget) || budget <= 0){
      alert("Не получилось посчитать рекомендацию бюджета для выбранных условий.");
      return;
    }
  }

  const hpd = (brief.budget.mode !== "fixed") ? RECO_HOURS_PER_DAY : hpdFixed;

  // ===== CALC =====
  const totalPlaysTheory = Math.floor(budget / bidPlus20);
  const playsPerHourTotalTheory = totalPlaysTheory / days / hpd;

  const screensNeeded =
    (brief.budget.mode !== "fixed")
      ? Math.max(1, Math.ceil(playsPerHourTotalTheory / SC_MAX))
      : Math.max(1, Math.ceil(playsPerHourTotalTheory / SC_OPT));

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

  const avgOts = avgNumber(pool.map(s => s.ots));
  const otsTotal = (avgOts == null) ? null : totalPlaysEffective * avgOts;
  const otsPerDay = (avgOts == null) ? null : otsTotal / days;
  const otsPerHour = (avgOts == null) ? null : otsTotal / days / hpd;

  state.lastChosen = chosen;
  window.dispatchEvent(new CustomEvent("planner:calc-done", { detail: { chosen } }));
  window.PLANNER.ui.photosAllowed = true;
  renderPhotosCarousel(chosen);

  const nf = (n) => Math.floor(n).toLocaleString("ru-RU");
  const of = (n) => Math.round(n).toLocaleString("ru-RU");

  const summaryText =
`Бриф:
— Бюджет: ${budget.toLocaleString("ru-RU")} ₽
— Даты: ${brief.dates.start} → ${brief.dates.end} (дней: ${days})
— Расписание: ${brief.schedule.type} (часов/день: ${hpd})
— Регион: ${region}
— Форматы: ${selectedFormatsText}
— Подбор: ${brief.selection.mode}
— GRP: ${brief.grp.enabled ? `${brief.grp.min.toFixed(2)}–${brief.grp.max.toFixed(2)}` : "не учитываем"}
— Страта: ${tier}

Расчёт через minBid:
— Средняя ставка: ${bidPlus20.toFixed(2)} ₽
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
  el("results").innerHTML = `
    <div id="results-toggle"
         style="font-size:13px; color:#555; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;">
      <span id="results-arrow">▾</span>
      <span>Показаны первые 10 выбранных экранов</span>
    </div>

    <div id="results-body"
         style="margin-top:8px; border:1px solid #eee; border-radius:12px; overflow:hidden;">
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead>
          <tr style="background:#fafafa;">
            <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">screen_id</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">format</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">minBid</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">ots</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">grp</th>
            <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">address</th>
          </tr>
        </thead>
        <tbody>
          ${chosen.slice(0,10).map(r => `
            <tr>
              <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${r.screen_id || ""}</td>
              <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${r.format || ""}</td>
              <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number.isFinite(r.minBid) ? r.minBid.toFixed(2) : ""}</td>
              <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number.isFinite(r.ots) ? r.ots : ""}</td>
              <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number.isFinite(r.grp) ? r.grp.toFixed(2) : ""}</td>
              <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${r.address || ""}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
const toggle = document.getElementById("results-toggle");
  const body   = document.getElementById("results-body");
  const arrow  = document.getElementById("results-arrow");

  if(toggle && body && arrow){
    let opened = false;
    body.style.display = "none";
    arrow.textContent = "▸";

    toggle.onclick = () => {
      opened = !opened;
      body.style.display = opened ? "block" : "none";
      arrow.textContent = opened ? "▾" : "▸";
    };
  }
}
  
// ===== BIND UI =====
function bindPlannerUI() {
  document.querySelectorAll(".preset").forEach(b => {
    cssButtonBase(b);
    b.addEventListener("click", () => {
      if (el("date-start")) el("date-start").value = b.dataset.start;
      if (el("date-end")) el("date-end").value = b.dataset.end;
    });
  });

  document.querySelectorAll('input[name="budget_mode"]').forEach(r => {
    r.addEventListener("change", () => {
      const mode = getBudgetMode();
      const wrap = el("budget-input-wrap");
      if (wrap) wrap.style.display = mode === "fixed" ? "block" : "none";
    });
  });

  document.querySelectorAll('input[name="schedule"]').forEach(r => {
    r.addEventListener("change", () => {
      const v = getScheduleType();
      const wrap = el("custom-time-wrap");
      if (wrap) wrap.style.display = (v === "custom") ? "flex" : "none";
    });
  });

  const grpEnabled = el("grp-enabled");
  if (grpEnabled) {
    grpEnabled.addEventListener("change", (e) => {
      const wrap = el("grp-wrap");
      if (wrap) wrap.style.display = e.target.checked ? "block" : "none";
    });
  }

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

  const selectionMode = el("selection-mode");
  if (selectionMode) selectionMode.addEventListener("change", renderSelectionExtra);

  const citySearch = el("city-search");
  if (citySearch) citySearch.addEventListener("input", (e) => renderRegionSuggestions(e.target.value));
  
  const downloadBtn = el("download-csv");
  if (downloadBtn) downloadBtn.addEventListener("click", () => downloadXLSX(state.lastChosen));

  const poiCsvBtn = el("download-poi-csv");
  if (poiCsvBtn) {
    poiCsvBtn.disabled = true;
    poiCsvBtn.addEventListener("click", () => downloadPOIsCSV(window.PLANNER.lastPOIs || []));
  }

  const poiXlsxBtn = el("download-poi-xlsx");
  if (poiXlsxBtn) {
    poiXlsxBtn.disabled = true;
    poiXlsxBtn.addEventListener("click", () => downloadPOIsXLSX(window.PLANNER.lastPOIs || []));
  }

  const calcBtn = el("calc-btn");
  if (calcBtn) calcBtn.addEventListener("click", () => onCalcClick());
}
async function loadRegions(){
  try {
    const res = await fetch(CITY_REGIONS_URL, { cache: "no-store" });
    if(!res.ok) throw new Error("regions json http " + res.status);

    const json = await res.json();

    // поддержим 2 формата:
    // 1) { "Москва": "Москва", "Химки": "Московская область" }
    // 2) { "map": {...} }
    const map = (json && typeof json === "object" && !Array.isArray(json))
      ? (json.map && typeof json.map === "object" ? json.map : json)
      : null;

    if(!map || typeof map !== "object") throw new Error("regions json has no object map");

    state.regionsByCity = map;

    // список уникальных регионов
    state.regionsAll = [...new Set(Object.values(map).filter(Boolean))]
      .sort((a,b)=>String(a).localeCompare(String(b), "ru"));

    console.log("[regions] loaded:", Object.keys(map).length, "cities;", "regions:", state.regionsAll.length);
    return true;
  } catch(e){
    console.warn("[regions] load failed:", e);
    state.regionsByCity = {};
    state.regionsAll = [];
    return false;
  }
}


// ===== START =====
async function startPlanner() {
  renderSelectionExtra();
  bindPlannerUI();
  window.PLANNER.ui.photosAllowed = false;
  clearPhotosCarousel();
  await loadTiers();
  await loadCityRegions(); clearPhotosCarousel();
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
  bootPlanner();
}

// ===== EXPORTS =====
Object.assign(window.PLANNER, {
  state,
  loadScreens,
  startPlanner,
  loadRegions,
  loadCityRegions,
  bootPlanner,
  fetchPOIsOverpassInCity,
  fetchPOIsOverpassInRegion,
  pickScreensNearPOIs,
  cityCenterFromScreens,
  downloadPOIsCSV,
  downloadPOIsXLSX,
  renderPOIList,
  _fetchOverpass,
  _runOverpassWithFailover
});
});   
