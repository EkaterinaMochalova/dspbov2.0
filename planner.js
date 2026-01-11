console.log("planner.js loaded");

// ========== GLOBAL ==========
window.PLANNER = window.PLANNER || {};

const REF = "planner";
const SCREENS_CSV_URL =
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@24ada9ff4b42b7426b4c954e8b7bebc97efed72c/inventories_sync.csv?v=" +
  Date.now();

const TIERS_JSON_URL =
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@8684fb51e3081987ae494eaaf5bacbd7b5e47160/tiers_v1.json?v=" +
  Date.now();

// ===== CITY -> REGION =====
const CITY_REGIONS_URL =
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@f6f96a16980cda4d7165e692526ef08f2cd0c22e/city_regions.json?v=" +
  Date.now();

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

// ===== POI =====
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
const RECO_HOURS_PER_DAY = 12; // для режима "нужна рекомендация"

// ===== State =====
const state = {
  screens: [],
  citiesAll: [],
  formatsAll: [],

  // ===== Regions =====
  regionsAll: [],
  regionsByCity: {},

  // ===== Diagnostics =====
  unknownCities: [],
  unknownCitiesTop: [],

  // ===== UI =====
  selectedCity: null,
  selectedFormats: new Set(),
  selectedRegions: [], // ✅ мультивыбор регионов
  selectedRegion: null, // ✅ обратная совместимость
  lastChosen: []
};

window.PLANNER.state = state;

// ===== Utils =====
function el(id) { return document.getElementById(id); }

function setStatus(msg) {
  const s = el("status");
  if (s) s.textContent = msg || "";
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[m]));
}

function normalizeKey(s) {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

function cssButtonBase(btn) {
  if (!btn) return;
  btn.classList.add("ux-btn");
  btn.style.padding = "8px 10px";
  btn.style.borderRadius = "999px";
  btn.style.border = "1px solid #ddd";
  btn.style.background = "#fff";
  btn.style.cursor = "pointer";
  btn.style.fontSize = "13px";
}

function getBudgetMode() {
  return document.querySelector('input[name="budget_mode"]:checked')?.value || "fixed";
}

// ✅ ВАЖНО: значения должны совпадать с тем, что ждёт hoursPerDay()
function getScheduleType() {
  // ожидаемые значения: all_day | peak | custom
  return document.querySelector('input[name="schedule"]:checked')?.value || "all_day";
}

function parseCSV(text) {
  const res = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
  if (res.errors && res.errors.length) console.warn("CSV parse errors:", res.errors.slice(0, 8));
  return res.data || [];
}

function toNumber(x) {
  if (x == null) return NaN;
  const s = String(x).trim().replace(/\s+/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function avgNumber(arr) {
  let sum = 0, cnt = 0;
  for (const v of arr) {
    if (Number.isFinite(v)) { sum += v; cnt++; }
  }
  return cnt ? (sum / cnt) : null;
}
function areRegionsReady(){
  return Array.isArray(state.regionsAll) && state.regionsAll.length > 0;
}

function setRegionsUIReady(isReady){
  const input = el("city-search");
  const spinner = el("region-spinner");
  const overlay = el("region-overlay");

  if (input) {
    input.disabled = !isReady;
    input.placeholder = isReady ? "Введите регион…" : "Загружаю список регионов…";
  }

  // маленький спиннер в инпуте
  if (spinner) spinner.style.display = isReady ? "none" : "block";

  // серый overlay
  if (overlay) overlay.style.display = isReady ? "none" : "flex";

  // если не готово — убираем подсказки, чтобы не выглядело как “ничего не найдено”
  if (!isReady) {
    const sug = el("city-suggestions");
    if (sug) sug.innerHTML = "";
  }
}


function daysInclusive(startStr, endStr) {
  const s = new Date(startStr + "T00:00:00");
  const e = new Date(endStr + "T00:00:00");
  return Math.floor((e - s) / (24 * 3600 * 1000)) + 1;
}

function hoursPerDay(schedule) {
  if (schedule.type === "all_day") return 15;
  if (schedule.type === "peak") return 7;
  if (schedule.type === "custom") {
    const [fh, fm] = (schedule.from || "07:00").split(":").map(Number);
    const [th, tm] = (schedule.to || "22:00").split(":").map(Number);
    return Math.max(0, (th + tm / 60) - (fh + fm / 60));
  }
  return 15;
}

function formatMeta(fmt) {
  return FORMAT_LABELS[fmt] || {
    label: fmt,
    desc: "Описание формата пока не задано (можно добавить в словарь FORMAT_LABELS)."
  };
}

// ===== UI: selection extra =====
function renderSelectionExtra() {
  const mode = el("selection-mode")?.value || "city_even";
  const extra = el("selection-extra");
  if (!extra) return;
  extra.innerHTML = "";

  if (mode === "near_address") {
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

  if (mode === "poi") {
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

  if (mode === "route") {
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

// ===== City -> Region loader =====
async function loadCityRegions() {
  try {
    const res = await fetch(CITY_REGIONS_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("city_regions http " + res.status);

    const json = await res.json();
    const regionsRaw = (json?.regions && typeof json.regions === "object") ? json.regions : null;
    if (!regionsRaw) throw new Error("city_regions has no 'regions' object");

    const cityToRegion = {};
    let citiesCount = 0;
    let regionsCount = 0;

    for (const [k, v] of Object.entries(regionsRaw)) {
      // A) "Москва": "Москва"
      if (typeof v === "string") {
        const key = normalizeKey(k);
        if (key) {
          cityToRegion[key] = String(v).trim();
          citiesCount++;
        }
        continue;
      }

      // B) "Московская область": ["Химки", ...]
      if (Array.isArray(v)) {
        const region = String(k).trim();
        regionsCount++;
        for (const city of v) {
          const key = normalizeKey(city);
          if (!key) continue;
          cityToRegion[key] = region;
          citiesCount++;
        }
        continue;
      }
    }

    window.PLANNER.cityRegions = cityToRegion;
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

function getRegionForCity(city) {
  const key = normalizeKey(city);
  const r = window.PLANNER?.cityRegions?.[key];
  return (typeof r === "string" && r.trim()) ? r.trim() : "Не назначено";
}

// ===== (Optional) City chip UI (если нужен одиночный город) =====
function renderSelectedCity() {
  const box = el("city-selected");
  if (!box) return;

  const city = state.selectedCity || "";
  if (!city) { box.innerHTML = ""; return; }

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
      // ⚠️ намеренно НЕ зовём несуществующий renderCitySuggestions()
    };
  }
}

// ===== Regions UI (мультивыбор) =====
function renderSelectedRegions() {
  const wrap = el("region-selected"); // ✅ отдельный контейнер
  if (!wrap) return;

  if (!Array.isArray(state.selectedRegions)) state.selectedRegions = [];
  wrap.innerHTML = "";

  if (state.selectedRegions.length === 0) {
    state.selectedRegion = null;
    wrap.innerHTML = `<div style="font-size:12px; color:#666;">Регион не выбран</div>`;
    return;
  }

  state.selectedRegions.forEach((region, idx) => {
    const chip = document.createElement("button");
    cssButtonBase(chip);
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = "6px";
    chip.textContent = "✕ " + region;
    if (idx === 0) chip.style.fontWeight = "600";

    chip.addEventListener("click", () => {
      state.selectedRegions = state.selectedRegions.filter(r => r !== region);
      state.selectedRegion = state.selectedRegions[0] || null;
      renderSelectedRegions();
      renderProgress(); // ✅
    });

    wrap.appendChild(chip);
  });

  state.selectedRegion = state.selectedRegions[0] || null;
}

function renderRegionSuggestions(q) {
  const sug = el("city-suggestions"); // suggestions dropdown
  if (!sug) return;
  sug.innerHTML = "";
  if (!q) return;

  if (!Array.isArray(state.selectedRegions)) state.selectedRegions = [];

  const qq = q.toLowerCase();
  const matches = state.regionsAll
    .filter(r => r.toLowerCase().includes(qq))
    .slice(0, 12);

  matches.forEach(r => {
    const b = document.createElement("button");
    cssButtonBase(b);
    b.textContent = "+ " + r;

    b.addEventListener("click", () => {
      if (!state.selectedRegions.includes(r)) state.selectedRegions.push(r);

      state.selectedRegion = state.selectedRegions[0] || null;

      if (el("city-search")) el("city-search").value = "";
      sug.innerHTML = "";

      renderSelectedRegions();
      renderProgress(); // ✅
    });

    sug.appendChild(b);
  });
}

// ===== Data load =====
async function loadScreens() {
  setStatus("Загружаю список экранов…");
  console.log("[screens] url:", SCREENS_CSV_URL);

  const res = await fetch(SCREENS_CSV_URL, { cache: "no-store" });
  console.log("[screens] status:", res.status, res.statusText);
  if (!res.ok) throw new Error("Не удалось загрузить CSV: " + res.status);

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
      minBid: toNumber(r.minBid ?? r.min_bid ?? r.MINBID ?? r.minbid),
      ots: toNumber(r.ots ?? r.OTS),
      grp: toNumber(r.grp ?? r.GRP),
      lat: toNumber(r.lat ?? r.Lat ?? r.LAT),
      lon: toNumber(r.lon ?? r.Lon ?? r.LON ?? r.lng ?? r.Lng ?? r.LNG)
    };
  });

  state.citiesAll = [...new Set(state.screens.map(s => s.city).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "ru"));

  state.formatsAll = [...new Set(state.screens.map(s => s.format).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  // regionsByCity + regionsAll (один проход)
  state.regionsByCity = {};
  state.regionsAll = [];

  for (const c of state.citiesAll) {
    const reg = getRegionForCity(c);
    state.regionsByCity[c] = reg;
    if (!state.regionsAll.includes(reg)) state.regionsAll.push(reg);
  }
  state.regionsAll.sort((a, b) => a.localeCompare(b, "ru"));

// ✅ регионы готовы — снимаем блокировку
  setRegionsUIReady(true);

  // проставляем region каждому экрану
  for (const s of state.screens) {
    s.region = state.regionsByCity[s.city] || "Не назначено";
  }

  renderFormats();
  renderSelectedCity();
  renderSelectedRegions();

  // ✅ РЕГИОНЫ ГОТОВЫ — РАЗРЕШАЕМ ВВОД
  try {
    if (typeof setRegionsUIReady === "function") {
      setRegionsUIReady(true);
    } else {
      const regionInput = document.getElementById("city-search");
      if (regionInput) {
        regionInput.disabled = false;
        regionInput.placeholder = "Введите регион…";
      }
    }
  } catch (e) {
    console.warn("[regions] ui ready hook failed:", e);
  }

  setStatus(
    `Всего доступно: ` +
    `Экранов: ${state.screens.length}. ` +
    `Городов: ${state.citiesAll.length}. ` +
    `Форматов: ${state.formatsAll.length}. ` +
    `Регионов: ${state.regionsAll.length}.`
  );

  window.PLANNER.ready = true;
  window.dispatchEvent(
    new CustomEvent("planner:screens-ready", {
      detail: { count: state.screens.length }
    })
  );
}
// ===== UI: formats =====
function renderFormats() {
  const wrap = el("formats-wrap");
  if (!wrap) return;
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
      <div style="font-weight:700;">${escapeHtml(meta.label)}</div>
      <div style="font-size:12px; color:#666;">${escapeHtml(meta.desc)}</div>
      <div style="font-size:11px; color:#999; margin-top:4px;">Код: ${escapeHtml(fmt)}</div>
    `;

    const sync = () => { b.style.borderColor = state.selectedFormats.has(fmt) ? "#111" : "#ddd"; };
    sync();

    b.addEventListener("click", () => {
      if (el("formats-auto")?.checked) return;
      if (state.selectedFormats.has(fmt)) state.selectedFormats.delete(fmt);
      else state.selectedFormats.add(fmt);
      sync();
      renderProgress(); // ✅ ВАЖНО
});

    wrap.appendChild(b);
  });
}

// ===== Brief =====
function buildBrief() {
  const root = document.getElementById("planner-widget") || document;

  const budgetMode = getBudgetMode();

const budgetVal = Number(el("budget-input")?.value || 0);
const goalOtsVal = toNumber(el("goal-ots")?.value); // важно: input id="goal-ots"

const budgetOk =
  (budgetMode === "recommendation") ||
  (budgetMode === "fixed" && budgetVal > 0) ||
  (budgetMode === "goal_ots" && Number.isFinite(goalOtsVal) && goalOtsVal > 0);

  const scheduleType = getScheduleType(); // all_day | peak | custom
  const timeFrom = el("time-from")?.value;
  const timeTo = el("time-to")?.value;

  const selectionMode = el("selection-mode")?.value || "city_even";

  // ✅ регионы: поддержим и старое (selectedRegion), и новое (selectedRegions[])
  const regions = Array.isArray(state.selectedRegions)
    ? state.selectedRegions.map(r => String(r || "").trim()).filter(Boolean)
    : [];

  const singleRegionFallback = String(state.selectedRegion || "").trim();
  const regionOne = regions.length ? regions[0] : (singleRegionFallback || null);

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
    geo: {
      region: regionOne,
      regions: regions.length ? regions : (regionOne ? [regionOne] : [])
    },
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

  if (selectionMode === "near_address") {
    brief.selection.address = pickAnyVal("#planner-addr", "#addr");
    brief.selection.radius_m = pickAnyNum(500, "#planner-radius", "#radius");
  }
  if (selectionMode === "poi") {
    brief.selection.poi_type = String(qsVal("#poi-type") || "pet_store").trim();
    brief.selection.radius_m = pickAnyNum(500, "#planner-radius", "#radius");
  }
  if (selectionMode === "route") {
    brief.selection.from = pickAnyVal("#route-from");
    brief.selection.to = pickAnyVal("#route-to");
    brief.selection.radius_m = pickAnyNum(300, "#planner-radius", "#radius");
  }

  if (!Number.isFinite(brief.grp.min)) brief.grp.min = 0;
  if (!Number.isFinite(brief.grp.max)) brief.grp.max = 9.98;
  brief.grp.min = Math.max(0, Math.min(9.98, brief.grp.min));
  brief.grp.max = Math.max(0, Math.min(9.98, brief.grp.max));
  if (brief.grp.max < brief.grp.min) [brief.grp.min, brief.grp.max] = [brief.grp.max, brief.grp.min];


  // ✅ goal (для режима "от обратного")
  brief.goal = {
    ots: (() => {
      const v = el("goal-ots")?.value;
      const n = toNumber(v);
      return Number.isFinite(n) && n > 0 ? n : null;
    })()
  };

  return brief;
}

// ===== Tiers =====
async function loadTiers() {
  try {
    const res = await fetch(TIERS_JSON_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("tiers json http " + res.status);
    const json = await res.json();

    const tiers = json?.tiers && typeof json.tiers === "object" ? json.tiers : null;
    if (!tiers) throw new Error("tiers json has no 'tiers' object");

    window.PLANNER.tiers = tiers;
    window.PLANNER.tiersMeta = {
      version: json?.version || "unknown",
      generated_at: json?.generated_at || null
    };

    console.log("[tiers] loaded:", Object.keys(tiers).length, "regions", window.PLANNER.tiersMeta);
    return true;
  } catch (e) {
    console.warn("[tiers] load failed:", e);
    window.PLANNER.tiers = {};
    window.PLANNER.tiersMeta = { version: "missing", generated_at: null };
    return false;
  }
}

// now name = REGION
function getTierForGeo(name) {
  const key = String(name || "").trim();
  const t = window.PLANNER?.tiers?.[key];
  return (t === "M" || t === "SP" || t === "A" || t === "B" || t === "C" || t === "D") ? t : "C";
}

// ===== Helpers =====
function pickScreensByMinBid(screens, n) {
  const sorted = [...screens].sort((a, b) => {
    const aa = Number.isFinite(a.minBid) ? a.minBid : 1e18;
    const bb = Number.isFinite(b.minBid) ? b.minBid : 1e18;
    if (aa !== bb) return aa - bb;
    return String(a.screen_id || "").localeCompare(String(b.screen_id || ""));
  });
  return sorted.slice(0, n);
}

function gridKey(lat, lon, stepKm = 2) {
  const kmLat = 111;
  const kmLon = 111 * Math.cos(lat * Math.PI / 180);
  const gx = Math.floor(lat * kmLat / stepKm);
  const gy = Math.floor(lon * kmLon / stepKm);
  return `${gx}:${gy}`;
}

function groupByGrid(screens, stepKm = 2) {
  const map = new Map();
  for (const s of screens) {
    const lat = Number(s.lat ?? s.latitude);
    const lon = Number(s.lon ?? s.lng ?? s.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const key = gridKey(lat, lon, stepKm);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(s);
  }
  return [...map.values()];
}

/**
 * Равномерный отбор по сетке.
 * Внутри ячейки выбираем самый дешёвый экран (minBid),
 * чтобы не получалось «рандомно дорогие».
 */
function pickScreensUniformByGrid(pool, count, stepKm = 2) {
  const cells = groupByGrid(pool, stepKm);

  // внутри каждой ячейки сортируем по цене (minBid)
  for (const cell of cells) {
    cell.sort((a, b) => (a.minBid ?? 1e18) - (b.minBid ?? 1e18));
  }

  // перемешиваем ячейки
  cells.sort(() => Math.random() - 0.5);

  const result = [];
  let i = 0;
  while (result.length < count && cells.length) {
    const cell = cells[i % cells.length];
    if (cell.length) result.push(cell.shift()); // ✅ cheapest in cell
    i++;
  }

  // добивка если не хватило (например, много ячеек без geo)
  if (result.length < count) {
    const picked = new Set(result);
    const rest = pool.filter(s => !picked.has(s));
    result.push(...pickScreensByMinBid(rest, count - result.length));
  }

  return result.slice(0, count);
}

function downloadXLSX(rows) {
  if (!rows || !rows.length) return;

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
    header: ["GID", "format", "placement", "installation", "owner_id", "owner", "city", "address", "lat", "lon"]
  });

  ws["!cols"] = [
    { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 },
    { wch: 18 }, { wch: 16 }, { wch: 40 }, { wch: 12 }, { wch: 12 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Screens");
  XLSX.writeFile(wb, "screens_selected.xlsx");
}

function downloadPOIsCSV(pois) {
  if (!pois || !pois.length) return;
  const regions = Array.isArray(state.selectedRegions) ? state.selectedRegions : [];
  const rows = pois.map(p => ({
    id: p.id || "",
    name: p.name || "",
    lat: p.lat,
    lon: p.lon,
    regions: regions.join("; ")
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

function downloadPOIsXLSX(pois) {
  if (!pois || !pois.length) return;

  const regions = Array.isArray(state.selectedRegions) ? state.selectedRegions : [];
  const rows = pois.map(p => ({
    id: p.id || "",
    name: p.name || "",
    lat: p.lat,
    lon: p.lon,
    regions: regions.join("; ")
  }));

  const ws = XLSX.utils.json_to_sheet(rows, { header: ["id", "name", "lat", "lon", "regions"] });
  ws["!cols"] = [{ wch: 22 }, { wch: 40 }, { wch: 12 }, { wch: 12 }, { wch: 40 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "POIs");
  XLSX.writeFile(wb, "pois.xlsx");
}

function clearPhotosCarousel() {
  const box = document.getElementById("screens-photos");
  const row = document.getElementById("screens-photos-row");
  if (row) row.innerHTML = "";
  if (box) box.style.display = "none";
}

function renderPhotosCarousel(chosen) {
  if (!window.PLANNER?.ui?.photosAllowed) return;

  const box = document.getElementById("screens-photos");
  const row = document.getElementById("screens-photos-row");
  if (!box || !row) return;

  row.innerHTML = "";
  const items = Array.isArray(chosen) ? chosen : [];
  const withImg = items.filter(s => String(s.image_url || "").trim());

  if (!withImg.length) {
    box.style.display = "none";
    return;
  }

  const MAX = 25;
  for (const s of withImg.slice(0, MAX)) {
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

    card.addEventListener("click", () => {
      try { window.open(img, "_blank"); } catch (e) { }
    });

    row.appendChild(card);
  }

  box.style.display = "block";
}

function renderPOIList(pois) {
  const wrap = document.getElementById("poi-results");
  if (!wrap) return;

  if (!pois || !pois.length) {
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
    pois.slice(0, 20).map(p => (
      `<tr>` +
      `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${escapeHtml(p.name || "—")}</td>` +
      `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number(p.lat).toFixed(6)}</td>` +
      `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number(p.lon).toFixed(6)}</td>` +
      `<td style="padding:10px; border-bottom:1px solid #f3f3f3;">${escapeHtml(p.id || "")}</td>` +
      `</tr>`
    )).join("") +
    `</tbody></table></div>`;
}

function cityCenterFromScreens(screens) {
  const pts = (screens || [])
    .map(s => ({ lat: Number(s.lat), lon: Number(s.lon) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));
  if (!pts.length) return null;
  const lat = pts.reduce((a, p) => a + p.lat, 0) / pts.length;
  const lon = pts.reduce((a, p) => a + p.lon, 0) / pts.length;
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

      if (!res.ok) throw new Error(`Overpass ${res.status} @ ${url} :: ${txt.slice(0, 180)}`);

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

function _escapeOverpassString(s) {
  return String(s || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').trim();
}

function _normalizePOIs(json) {
  const els = Array.isArray(json?.elements) ? json.elements : [];
  return els.map(el => {
    const name = el.tags?.name || "";
    const lat0 = Number(el.lat ?? el.center?.lat);
    const lon0 = Number(el.lon ?? el.center?.lon);
    if (!Number.isFinite(lat0) || !Number.isFinite(lon0)) return null;
    return { id: `${el.type}/${el.id}`, name, lat: lat0, lon: lon0, raw: el };
  }).filter(Boolean);
}

function pickScreensNearPOIs(screens, pois, radiusMeters) {
  const r = Number(radiusMeters || 0);
  if (!r || !Array.isArray(pois) || !pois.length) return [];

  const dist = window.GeoUtils?.haversineMeters;
  if (!dist) throw new Error("GeoUtils.haversineMeters is missing");

  const picked = [];
  for (const s of (screens || [])) {
    const slat = Number(s.lat), slon = Number(s.lon);
    if (!Number.isFinite(slat) || !Number.isFinite(slon)) continue;

    let ok = false;
    for (const p of pois) {
      if (dist(slat, slon, p.lat, p.lon) <= r) { ok = true; break; }
    }
    if (ok) picked.push(s);
  }
  return picked;
}

function _poiQueryWithScope(poiType, scopeExpr) {
  const raw = POI_QUERIES[poiType];
  if (!raw) throw new Error("Unknown poi_type: " + poiType);
  return String(raw).replace(/nwr\s*\(\s*area\.a\s*\)/g, `nwr(${scopeExpr})`);
}

function _bboxFromScreens(screens) {
  const pts = (screens || [])
    .map(s => ({ lat: Number(s.lat), lon: Number(s.lon) }))
    .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon));

  if (!pts.length) return null;

  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lon < minLon) minLon = p.lon;
    if (p.lon > maxLon) maxLon = p.lon;
  }

  const padLat = 0.05;
  const padLon = 0.08;

  return {
    minLat: minLat - padLat,
    minLon: minLon - padLon,
    maxLat: maxLat + padLat,
    maxLon: maxLon + padLon
  };
}

function _centerFromBbox(bb) {
  if (!bb) return null;
  return { lat: (bb.minLat + bb.maxLat) / 2, lon: (bb.minLon + bb.maxLon) / 2 };
}

function _estimateRadiusFromBbox(bb) {
  if (!bb) return 25000;
  const latSpan = Math.abs(bb.maxLat - bb.minLat);
  const lonSpan = Math.abs(bb.maxLon - bb.minLon);
  const latKm = latSpan * 111;
  const midLat = (bb.minLat + bb.maxLat) / 2;
  const lonKm = lonSpan * 111 * Math.cos((midLat * Math.PI) / 180);
  const diagKm = Math.sqrt(latKm * latKm + lonKm * lonKm);
  const r = Math.max(8000, Math.min(120000, (diagKm * 0.6) * 1000));
  return Math.round(r);
}

/**
 * POI in REGION administrative area
 */
async function fetchPOIsOverpassInRegion(poiType, regionName, screensInRegion, limit = 50) {
  const t = String(poiType || "").trim();
  if (!t || !POI_QUERIES[t]) throw new Error("Unknown poi_type: " + t);

  const region = _escapeOverpassString(regionName);
  if (!region) throw new Error("Region is empty");

  const safeLimit = Math.max(1, Math.min(50, Number(limit || 50)));

  // Attempt 1: admin area by name
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
  } catch (e) {
    console.warn("[poi] area attempt failed:", String(e));
  }

  // Attempt 2: bbox from screens
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
    } catch (e) {
      console.warn("[poi] bbox attempt failed:", String(e));
    }
  }

  // Attempt 3: around center
  const c = _centerFromBbox(bb);
  if (c) {
    try {
      const r = _estimateRadiusFromBbox(bb);
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
    } catch (e) {
      console.warn("[poi] around attempt failed:", String(e));
    }
  }

  throw new Error(`POI не найдены: «${POI_LABELS?.[t] || t}» в регионе «${regionName}». Попробуй другой тип или поменяй регион.`);
}

// ===== MULTI-REGION BUDGET ALLOCATION =====
function _tierWeight(t) {
  switch (String(t || "").toUpperCase()) {
    case "M": return 6;
    case "SP": return 5;
    case "A": return 4;
    case "B": return 3;
    case "C": return 2;
    case "D": return 1;
    default: return 2;
  }
}

function allocateBudgetAcrossRegions(totalBudget, regions, opts) {
  const cfg = Object.assign({ minShare: 0.10, maxShare: 0.70 }, (opts || {}));
  const n = (regions || []).length;
  if (!Number.isFinite(totalBudget) || totalBudget <= 0 || n === 0) return [];
  if (n === 1) return [{ region: regions[0].key, budget: Math.floor(totalBudget) }];

  let minShare = cfg.minShare;
  if (n >= 5) minShare = Math.min(minShare, 0.05);
  if (n * minShare > 1) minShare = 1 / n;
  const maxShare = Math.max(minShare, cfg.maxShare);

  const items = regions.map(r => {
    const w = _tierWeight(r.tier);
    return { region: r.key, tier: r.tier, w, share: 0, locked: false };
  });

  const sumW = items.reduce((a, b) => a + (Number.isFinite(b.w) ? b.w : 0), 0) || 1;
  items.forEach(it => it.share = it.w / sumW);

  // cap maxShare
  let lockedSum = 0;
  let freeW = 0;
  items.forEach(it => {
    if (it.share > maxShare) {
      it.share = maxShare;
      it.locked = true;
      lockedSum += it.share;
    } else {
      freeW += it.w;
    }
  });

  let remaining = 1 - lockedSum;
  if (remaining < 0) remaining = 0;

  if (freeW > 0) {
    items.forEach(it => {
      if (!it.locked) it.share = remaining * (it.w / freeW);
    });
  }

  // raise minShare
  let need = 0;
  items.forEach(it => {
    if (it.share < minShare) {
      need += (minShare - it.share);
      it.share = minShare;
      it.locked = true; // locked by min
    }
  });

  if (need > 0) {
    const donors = items.filter(it => !it.locked && it.share > minShare);
    const donorSum = donors.reduce((a, b) => a + (b.share - minShare), 0);

    if (donorSum > 0) {
      donors.forEach(d => {
        const giveCap = d.share - minShare;
        const give = need * (giveCap / donorSum);
        d.share -= give;
      });
    } else {
      const equal = 1 / n;
      items.forEach(it => it.share = equal);
    }
  }

  const raw = items.map(it => ({
    region: it.region,
    share: it.share,
    budget: Math.floor(totalBudget * it.share)
  }));

  let sum = raw.reduce((a, b) => a + b.budget, 0);
  let diff = Math.floor(totalBudget) - sum;

  if (diff !== 0) {
    const order = raw
      .map((r, idx) => ({ idx, share: r.share }))
      .sort((a, b) => b.share - a.share)
      .map(x => x.idx);

    let k = 0;
    while (diff !== 0 && k < 1000000) {
      const i = order[k % order.length];
      if (diff > 0) { raw[i].budget += 1; diff -= 1; }
      else {
        if (raw[i].budget > 0) { raw[i].budget -= 1; diff += 1; }
      }
      k++;
    }
  }

  return raw.map(r => ({ region: r.region, budget: r.budget }));
}

// ================== MULTI-REGION TARGET (OTS) ==================
function allocateTargetOtsAcrossRegions(totalOts, regions, opts = {}) {
  if (!regions || !regions.length) return [];
  const minShare = opts.minShare ?? 0.10;
  const maxShare = opts.maxShare ?? 0.70;

  const items = regions.map(r => ({
    region: r.key,
    tier: r.tier,
    w: tierWeight(r.tier),
    share: 0
  }));

  const sumW = items.reduce((a, b) => a + b.w, 0) || 1;
  items.forEach(i => i.share = i.w / sumW);

  // caps
  items.forEach(i => {
    if (i.share < minShare) i.share = minShare;
    if (i.share > maxShare) i.share = maxShare;
  });

  // normalize
  const sumShares = items.reduce((a, b) => a + b.share, 0) || 1;
  items.forEach(i => i.share /= sumShares);

  // target ots per region
  let out = items.map(i => ({
    region: i.region,
    ots: Math.floor(Number(totalOts) * i.share)
  }));

  // fix rounding
  let diff = Math.floor(Number(totalOts)) - out.reduce((a, b) => a + b.ots, 0);
  let k = 0;
  while (diff !== 0 && k < 100000) {
    const idx = k % out.length;
    out[idx].ots += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    k++;
  }
  return out;
}

// Распределяем OTS-цель с учётом капов/отсутствия OTS и перераспределяем "хвост"
function computeGoalOtsPlan(prepared, totalOtsGoal, opts = {}) {
  const minShare = opts.minShare ?? 0.10;
  const maxShare = opts.maxShare ?? 0.70;

  const regions = prepared.map(r => ({ key: r.region, tier: r.tier }));
  const baseAlloc = allocateTargetOtsAcrossRegions(totalOtsGoal, regions, { minShare, maxShare });

  // init plan per region
  const plan = {};
  for (const r of prepared) {
    const goal = baseAlloc.find(x => x.region === r.region)?.ots || 0;

    plan[r.region] = {
      goalOts: goal,
      // если avgOts нет — в этом регионе ничего не соберём
      avgOts: (r.avgOts == null || !Number.isFinite(r.avgOts) || r.avgOts <= 0) ? null : Number(r.avgOts),
      capOtsAbs: (r.capOtsAbs == null || !Number.isFinite(r.capOtsAbs) || r.capOtsAbs <= 0) ? 0 : Number(r.capOtsAbs),
      bidPlus20: Number(r.bidPlus20),
      capPlaysAbs: Number(r.capPlaysAbs),
      capBudgetAbs: Number(r.capBudgetAbs),

      playsPlanned: 0,
      budgetPlanned: 0,
      otsPlanned: 0
    };
  }

  // helper: apply goal to region (bounded by cap + avgOts)
  function applyGoal(regionKey, addOts) {
    const p = plan[regionKey];
    if (!p) return 0;
    if (!p.avgOts) return addOts; // всё неосуществимо

    const newGoal = p.goalOts + addOts;

    // сколько OTS вообще можем в регионе (cap)
    const maxOtsHere = Math.max(0, p.capOtsAbs);
    const targetOtsHere = Math.min(newGoal, maxOtsHere);

    // перевод в plays (ceil чтобы не недобрать OTS)
    const playsNeed = Math.min(
      p.capPlaysAbs,
      Math.ceil(targetOtsHere / p.avgOts)
    );

    // пересчёт "по факту" (plays -> ots, plays -> budget)
    const otsHere = playsNeed * p.avgOts;
    const budgetHere = Math.ceil(playsNeed * p.bidPlus20);

    p.goalOts = targetOtsHere;
    p.playsPlanned = playsNeed;
    p.otsPlanned = otsHere;
    p.budgetPlanned = Math.min(budgetHere, p.capBudgetAbs);

    // сколько OTS осталось невыполнимым в этом регионе
    const unmet = Math.max(0, newGoal - targetOtsHere);
    return unmet;
  }

  // 1) первично применяем базовые цели
  let unmetTotal = 0;
  for (const r of prepared) {
    const unmet = applyGoal(r.region, 0);
    unmetTotal += unmet;
  }

  // 2) перераспределяем unmet по регионам с оставшейся ёмкостью OTS
  let guard = 0;
  while (unmetTotal > 0 && guard < 10000) {
    guard++;

    // найдём регионы, куда ещё можно долить OTS
    const receivers = prepared
      .map(r => r.region)
      .filter(key => {
        const p = plan[key];
        if (!p || !p.avgOts) return false;
        return p.goalOts < p.capOtsAbs; // есть запас
      });

    if (!receivers.length) break;

    // общий запас OTS по всем принимающим
    const headroomSum = receivers.reduce((a, key) => {
      const p = plan[key];
      return a + Math.max(0, p.capOtsAbs - p.goalOts);
    }, 0);

    if (headroomSum <= 0) break;

    // раздаём unmet пропорционально headroom
    let distributed = 0;
    for (const key of receivers) {
      const p = plan[key];
      const hr = Math.max(0, p.capOtsAbs - p.goalOts);
      if (hr <= 0) continue;

      const add = Math.min(
        unmetTotal,
        Math.max(1, Math.floor(unmetTotal * (hr / headroomSum)))
      );

      const before = unmetTotal;
      const unmetAfterApply = applyGoal(key, add);
      const actuallyTaken = add - unmetAfterApply;

      unmetTotal = before - actuallyTaken;
      distributed += actuallyTaken;

      if (unmetTotal <= 0) break;
    }

    // если на итерации ничего не смогли распределить — стоп
    if (distributed <= 0) break;
  }

  // итог: budgets/plays/ots по регионам + сколько цель невыполнима вообще
  const finalUnmet = Math.max(0, unmetTotal);
  return { plan, finalUnmet };
}


// ===== MAIN =====
async function onCalcClick() {
  const brief = buildBrief();

  if (!brief.dates.start || !brief.dates.end) {
    alert("Выберите даты начала и окончания.");
    return;
  }

  const regions = Array.isArray(brief?.geo?.regions) && brief.geo.regions.length
    ? brief.geo.regions.map(x => String(x || "").trim()).filter(Boolean)
    : (brief?.geo?.region ? [String(brief.geo.region).trim()] : []);

  if (!regions.length) {
    alert("Выберите регион(ы).");
    return;
  }

  // ✅ budget validation: fixed / recommendation / goal_ots
  if (brief.budget.mode === "fixed") {
    if (!brief.budget.amount || brief.budget.amount <= 0) {
      alert("Введите бюджет или выберите «нужна рекомендация» / «цель по OTS».");
      return;
    }
  }

  if (brief.budget.mode === "goal_ots") {
    if (!brief.goal?.ots || brief.goal.ots <= 0) {
      alert("Введите целевой OTS.");
      return;
    }
  }

  const days = daysInclusive(brief.dates.start, brief.dates.end);
  if (!Number.isFinite(days) || days <= 0) {
    alert("Выберите корректные даты начала и окончания.");
    return;
  }

  let selectedFormatsText = "—";
  const formatsMode = brief?.formats?.mode || "auto";
  const manualFormats = Array.isArray(brief?.formats?.selected) ? brief.formats.selected : [];

  if (formatsMode === "manual" && manualFormats.length > 0) selectedFormatsText = manualFormats.join(", ");
  else if (formatsMode === "auto") selectedFormatsText = "рекомендация";
  else selectedFormatsText = "не выбраны";

  const hpdFixed = hoursPerDay(brief.schedule);
  if (!Number.isFinite(hpdFixed) || hpdFixed <= 0) {
    alert("Проверь расписание.");
    return;
  }
  const hpd = (brief.budget.mode !== "fixed") ? RECO_HOURS_PER_DAY : hpdFixed;

  // aggregates
  let chosenAll = [];
  let totalBudgetFinal = 0;
  let totalPlaysEffectiveAll = 0;

  let otsTotalAll = 0;
  let hasOts = true;

  let warnings = [];
  let anyPOIs = [];
  let perRegionRows = [];

  const isPOI = (brief.selection?.mode === "poi");

  if (isPOI && !window.GeoUtils?.haversineMeters) {
    alert("GeoUtils не найден. Проверь подключение geo.js");
    return;
  }

  // =========================
  // 1) PREPARE POOLS PER REGION (POI/GRP/owner/formats applied)
  // =========================
  const prepared = []; // only regions that have pool and avgBid, used for allocation

  for (const region of regions) {
    const tier = getTierForGeo(region);

    let pool = state.screens.filter(s => String(s.region || "").trim() === region);

    if (formatsMode === "manual" && manualFormats.length > 0) {
      const fset = new Set(manualFormats);
      pool = pool.filter(s => fset.has(s.format));
    }

    if (window.PLANNER?.getScreensFilteredByOwner) {
      pool = window.PLANNER.getScreensFilteredByOwner(pool);
    }

    if (pool.length === 0) {
      perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет экранов" });
      continue;
    }

    // POI mode per region
    let pois = [];
    if (isPOI) {
      const poiType = String(brief.selection.poi_type || "").trim();
      const screenRadius = Number(brief.selection.radius_m || 500);

      setStatus(`Ищу POI в регионе «${region}»: ${POI_LABELS?.[poiType] || poiType}…`);

      try {
        pois = await fetchPOIsOverpassInRegion(poiType, region, pool, 50);
      } catch (e) {
        console.error("[poi] error:", e);
        alert(e?.message || `Ошибка Overpass (OSM) для региона «${region}».`);
        setStatus("");
        return;
      }

      anyPOIs = anyPOIs.concat(pois);
      window.PLANNER.lastPOIs = anyPOIs; // ✅ чтобы download-кнопки работали

      renderPOIList(anyPOIs);

      const before = pool.length;
      pool = pickScreensNearPOIs(pool, pois, screenRadius);

      if (!pool.length) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет экранов у POI" });
        continue;
      }

      setStatus(`Экраны у POI: ${pool.length} из ${before} (регион: ${region}, POI: ${pois.length})`);
    }

    // GRP filter
    let grpDroppedNoValue = 0;
    if (brief.grp?.enabled) {
      grpDroppedNoValue = pool.filter(s => !Number.isFinite(s.grp)).length;

      pool = pool.filter(s =>
        Number.isFinite(s.grp) &&
        s.grp >= brief.grp.min &&
        s.grp <= brief.grp.max
      );

      if (pool.length === 0) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "GRP выкинул всё" });
        warnings.push(`⚠️ Регион «${region}»: GRP-фильтр исключил все экраны (без GRP было: ${grpDroppedNoValue}).`);
        continue;
      }

      warnings.push(`⚠️ Регион «${region}»: GRP-фильтр включён, без GRP исключены (без GRP: ${grpDroppedNoValue}).`);
    }

    const avgBid = avgNumber(pool.map(s => s.minBid));
if (avgBid == null) {
  perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет minBid" });
  continue;
}
const bidPlus20 = avgBid * BID_MULTIPLIER;

// ✅ нужно для режима goal_ots
const avgOts = avgNumber(pool.map(s => s.ots)); // может быть null — это ок

// абсолютная ёмкость региона, если использовать ВСЕ доступные экраны (после фильтров)
const capPlaysAbs = Math.floor(SC_MAX * pool.length * days * hpd);
const capBudgetAbs = Math.floor(capPlaysAbs * bidPlus20);

// ✅ ёмкость региона по OTS (если OTS есть)
const capOtsAbs = (avgOts == null) ? null : (capPlaysAbs * avgOts);

prepared.push({
  region,
  tier,
  pool,
  avgBid,
  bidPlus20,
  avgOts,
  capPlaysAbs,
  capBudgetAbs,
  capOtsAbs
});
  }

  if (!prepared.length) {
    alert("Не удалось подобрать экраны: по выбранным условиям не осталось доступных экранов.");
    setStatus("");
    return;
  }

    // =========================
  // 2) INITIAL BUDGETS (fixed / recommendation / goal_ots)
  // =========================
  const budgets = {}; // region -> planned budget (RUB)
  let goalPlan = null;         // { [region]: {playsPlanned, budgetPlanned, otsPlanned, ...} }
  let goalPlanUnmet = 0;

  if (brief.budget.mode === "fixed") {
    const totalBudget = Number(brief.budget.amount);
    const fixedAllocation = allocateBudgetAcrossRegions(
      totalBudget,
      prepared.map(r => ({ key: r.region, tier: getTierForGeo(r.region) })),
      { minShare: 0.10, maxShare: 0.70 }
    );

    for (const r of prepared) {
      const found = fixedAllocation?.find(x => x.region === r.region);
      budgets[r.region] = found ? Number(found.budget) : 0;
    }

  } else if (brief.budget.mode === "goal_ots") {
    const totalOtsGoal = Number(brief.goal?.ots || 0);
    if (!Number.isFinite(totalOtsGoal) || totalOtsGoal <= 0) {
      alert("Введите корректную цель OTS.");
      setStatus("");
      return;
    }

    // планируем plays/budget из цели OTS + перераспределяем хвост
    const res = computeGoalOtsPlan(prepared, totalOtsGoal, { minShare: 0.10, maxShare: 0.70 });
    goalPlan = res.plan || null;
    goalPlanUnmet = Number(res.finalUnmet || 0);

    for (const r of prepared) {
      const p = goalPlan?.[r.region];
      budgets[r.region] = p ? Math.floor(p.budgetPlanned || 0) : 0;
    }

    if (goalPlanUnmet > 0) {
      warnings.push(
        `⚠️ Цель OTS недостижима полностью при выбранных фильтрах/датах/времени. Недостаёт примерно: ` +
        `${Math.round(goalPlanUnmet).toLocaleString("ru-RU")} OTS.`
      );
    }

  } else {
    // recommendation
    for (const r of prepared) {
      const BASE_MONTHLY_BY_TIER = { M: 2000000, SP: 1500000, A: 1000000, B: 500000, C: 300000, D: 100000 };
      const baseMonthly = BASE_MONTHLY_BY_TIER[r.tier] ?? BASE_MONTHLY_BY_TIER.C;
      const baseBudgetForPeriod = Math.floor(baseMonthly * (days / 30));

      const maxPlays = Math.floor(SC_MAX * RECO_HOURS_PER_DAY * r.pool.length * days);
      const maxBudget = maxPlays * r.bidPlus20;

      budgets[r.region] = Math.floor(Math.min(baseBudgetForPeriod, maxBudget));
    }
  }

  // =========================
  // 3) REDISTRIBUTION BY CAPACITY (только для fixed/reco)
  // goal_ots уже распределён по ёмкости в computeGoalOtsPlan()
  // =========================
  function redistributeByCapacity(preparedRegions, budgetsMap) {
    let leftover = 0;

    for (const r of preparedRegions) {
      const planned = Number(budgetsMap[r.region] || 0);
      if (!Number.isFinite(planned) || planned <= 0) {
        budgetsMap[r.region] = 0;
        continue;
      }
      const spendable = Math.min(planned, r.capBudgetAbs);
      budgetsMap[r.region] = spendable;
      leftover += (planned - spendable);
    }

    let guard = 0;
    while (leftover > 0 && guard < 50) {
      guard++;

      const headrooms = preparedRegions
        .map(r => {
          const cur = Number(budgetsMap[r.region] || 0);
          const head = Math.max(0, r.capBudgetAbs - cur);
          return { r, head };
        })
        .filter(x => x.head > 0);

      if (!headrooms.length) break;

      const sumHead = headrooms.reduce((a, b) => a + b.head, 0) || 1;

      let movedThisRound = 0;

      for (const h of headrooms) {
        if (leftover <= 0) break;

        const add = Math.min(h.head, Math.floor(leftover * (h.head / sumHead)));
        if (add > 0) {
          budgetsMap[h.r.region] = Number(budgetsMap[h.r.region] || 0) + add;
          leftover -= add;
          movedThisRound += add;
        }
      }

      if (leftover > 0 && movedThisRound === 0) {
        for (const h of headrooms) {
          if (leftover <= 0) break;
          const cur = Number(budgetsMap[h.r.region] || 0);
          const head = Math.max(0, h.r.capBudgetAbs - cur);
          if (head > 0) {
            budgetsMap[h.r.region] = cur + 1;
            leftover -= 1;
          }
        }
      }
    }

    return leftover;
  }

  let leftoverUnspent = 0;
  if (brief.budget.mode !== "goal_ots") {
    leftoverUnspent = redistributeByCapacity(prepared, budgets);
    if (leftoverUnspent > 0) {
      warnings.push(
        `⚠️ Общая ёмкость выбранных регионов ограничена: не удалось распределить ` +
        `${Math.floor(leftoverUnspent).toLocaleString("ru-RU")} ₽ (нет инвентаря).`
      );
    }
  }
  
  // 4) MAIN CALC PER REGION (почти как было, но budget берём из budgets[region])
  // =========================
  for (const pr of prepared) {
    const region = pr.region;
    const tier = pr.tier;
    const pool = pr.pool;
    const bidPlus20 = pr.bidPlus20;

    let budget = Number(budgets[region] || 0);
    

    if (!Number.isFinite(budget) || budget <= 0) {
      perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "budget=0" });
      continue;
    }

    // бюджет уже "осваиваемый" по capBudgetAbs, но на всякий случай:
    budget = Math.min(budget, pr.capBudgetAbs);

    totalBudgetFinal += budget;
let plannedPlaysFromGoal = null;
if (brief.budget.mode === "goal_ots" && typeof __goalPlan === "object" && __goalPlan && __goalPlan[region]) {
  plannedPlaysFromGoal = Number(__goalPlan[region].playsPlanned || 0);
  if (!Number.isFinite(plannedPlaysFromGoal) || plannedPlaysFromGoal <= 0) plannedPlaysFromGoal = null;
}


// goal_ots: plays считаем от плана (ceil, чтобы цель добрать)
if (brief.budget.mode === "goal_ots" && goalPlan && goalPlan[region]) {
  totalPlaysTheory = Math.ceil(Number(goalPlan[region].playsPlanned || 0));
  if (!Number.isFinite(totalPlaysTheory) || totalPlaysTheory < 0) totalPlaysTheory = 0;
} else {
  // fixed/reco как было
  totalPlaysTheory = Math.floor(budget / bidPlus20);
  if (!Number.isFinite(totalPlaysTheory) || totalPlaysTheory < 0) totalPlaysTheory = 0;
}

// если вдруг 0 — пропускаем
if (!Number.isFinite(totalPlaysTheory) || totalPlaysTheory <= 0) {
  perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "цель=0" });
  continue;
}

// Сколько экранов нужно МИНИМУМ, чтобы не превысить SC_MAX по ёмкости
const maxPlaysPerScreenForPeriod = Math.floor(SC_MAX * days * hpd);
let screensNeededByCapacity = Math.ceil(totalPlaysTheory / Math.max(1, maxPlaysPerScreenForPeriod));
screensNeededByCapacity = Math.max(1, screensNeededByCapacity);

// Для fixed/reco сохраняем твою старую “оптимизацию”, но всё равно уважаем ёмкость
let screensNeeded = screensNeededByCapacity;

if (brief.budget.mode !== "goal_ots") {
  const playsPerHourTotalTheory = totalPlaysTheory / days / hpd;
  const byOpt =
    (brief.budget.mode !== "fixed")
      ? Math.max(1, Math.ceil((playsPerHourTotalTheory) / SC_MAX))
      : Math.max(1, Math.ceil((playsPerHourTotalTheory) / SC_OPT));

  screensNeeded = Math.max(screensNeededByCapacity, byOpt);
}

// ограничиваем доступным пулом
const screensChosenCount = Math.min(pool.length, screensNeeded);

// выбор (равномерный по сетке, внутри ячейки — дешевле)
const chosen = pickScreensUniformByGrid(pool, screensChosenCount, 2);

// ===== plays effective (respect capacity) =====
const capPlaysByChosen = Math.floor(SC_MAX * chosen.length * days * hpd);
let totalPlaysEffective = Math.min(totalPlaysTheory, capPlaysByChosen);

if (brief.budget.mode === "goal_ots" && goalPlan && goalPlan[region]) {
  // в goal_ots нам важнее добрать plays, поэтому если не хватает — предупреждаем
  if (totalPlaysEffective < totalPlaysTheory) {
    warnings.push(`⚠️ Регион «${region}»: не хватает ёмкости даже при ${chosen.length} экранах (SC_MAX).`);
  }
} else {
  // твои старые предупреждения можно оставить, но они теперь не нужны как раньше
  const playsPerHourPerScreen = (totalPlaysTheory / days / hpd) / Math.max(1, chosen.length);
  if (playsPerHourPerScreen > SC_OPT && playsPerHourPerScreen <= SC_MAX) {
    warnings.push(`⚠️ Регион «${region}»: в среднем ${playsPerHourPerScreen.toFixed(1)} выходов/час на экран (выше оптимальных ${SC_OPT}).`);
  }
}

    const avgOts = avgNumber(pool.map(s => s.ots));
    const otsTotal = (avgOts == null) ? null : totalPlaysEffective * avgOts;
    if (avgOts == null) hasOts = false;
    if (otsTotal != null) otsTotalAll += otsTotal;

    chosenAll = chosenAll.concat(chosen);

    perRegionRows.push({
      region,
      tier,
      budget,
      screens: chosen.length,
      plays: totalPlaysEffective,
      ots: otsTotal,
      note: ""
    });
  }

  // плюс те регионы, которые попали в perRegionRows на ранних стадиях (нет экранов / GRP выкинул / etc)
  // (они уже добавлены выше)

  if (!chosenAll.length) {
    alert("Не удалось подобрать экраны: по выбранным условиям не осталось доступных экранов.");
    setStatus("");
    return;
  }

  const b1 = el("download-poi-csv");
  const b2 = el("download-poi-xlsx");
  if (b1) b1.disabled = !(window.PLANNER.lastPOIs || []).length;
  if (b2) b2.disabled = !(window.PLANNER.lastPOIs || []).length;

  state.lastChosen = chosenAll;

  window.dispatchEvent(new CustomEvent("planner:calc-done", {
    detail: { chosen: chosenAll, perRegion: perRegionRows }
  }));

  window.PLANNER.ui.photosAllowed = true;
  try { renderPhotosCarousel(chosenAll); } catch (e) { console.error("[photos] renderPhotosCarousel failed:", e); }

  const nf = (n) => Math.floor(n).toLocaleString("ru-RU");
  const of = (n) => Math.round(n).toLocaleString("ru-RU");

  const playsPerDayAll = totalPlaysEffectiveAll / days;
  const playsPerHourAll = totalPlaysEffectiveAll / days / hpd;

  // ===== Per-region breakdown (same numbers as in calc) =====
  const perRegionText = (perRegionRows || [])
    .slice()
    .sort((a, b) => (Number(b.budget || 0) - Number(a.budget || 0)))
    .map(r => {
      const b = Number.isFinite(r.budget) ? Math.floor(r.budget).toLocaleString("ru-RU") + " ₽" : "—";
      const p = Number.isFinite(r.plays) ? Math.floor(r.plays).toLocaleString("ru-RU") : "—";
      const o = (r.ots == null || !Number.isFinite(r.ots)) ? "—" : Math.round(r.ots).toLocaleString("ru-RU");
      const sc = Number.isFinite(r.screens) ? Math.floor(r.screens).toLocaleString("ru-RU") : "—";
      const note = String(r.note || "").trim();
      return `— ${r.region}: бюджет ${b}, выходов ${p}, OTS ${o}, экранов ${sc}${note ? ` (${note})` : ""}`;
    })
    .join("\n");

  const summaryText =
`Бриф:
— Бюджет: ${totalBudgetFinal.toLocaleString("ru-RU")} ₽ ${
  brief.budget.mode === "fixed"
    ? "(распределён по регионам)"
    : (brief.budget.mode === "goal_ots" ? "(под цель OTS)" : "(сумма рекомендаций)")
}
— Даты: ${brief.dates.start} → ${brief.dates.end} (дней: ${days})
— Расписание: ${brief.schedule.type} (часов/день: ${hpd})
— Регион(ы): ${regions.join(", ")}
— Форматы: ${selectedFormatsText}
— Подбор: ${brief.selection.mode}
— GRP: ${brief.grp.enabled ? `${brief.grp.min.toFixed(2)}–${brief.grp.max.toFixed(2)}` : "не учитываем"}

Итог (по всем регионам):
— Выходов всего: ${nf(totalPlaysEffectiveAll)}
— Выходов/день: ${nf(playsPerDayAll)}
— Выходов/час (в сумме): ${nf(playsPerHourAll)}
— Экранов выбрано: ${chosenAll.length}
— OTS всего: ${hasOts ? of(otsTotalAll) : "—"}

По регионам:
${perRegionText}`
    + (warnings.length ? `\n\n${warnings.slice(0, 6).join("\n")}${warnings.length > 6 ? "\n…" : ""}` : "");

  if (el("summary")) el("summary").textContent = summaryText;
  if (el("download-csv")) el("download-csv").disabled = chosenAll.length === 0;

  if (el("results")) {
    el("results").innerHTML = `
      <div id="results-toggle"
           style="font-size:13px; color:#555; cursor:pointer; display:flex; align-items:center; gap:6px; user-select:none;">
        <span id="results-arrow">▸</span>
        <span>Показаны первые 10 выбранных экранов</span>
      </div>

      <div id="results-body"
           style="display:none; margin-top:8px; border:1px solid #eee; border-radius:12px; overflow:hidden;">
        <table style="width:100%; border-collapse:collapse; font-size:13px;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">screen_id</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">region</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">format</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">minBid</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">ots</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">grp</th>
              <th style="text-align:left; padding:10px; border-bottom:1px solid #eee;">address</th>
            </tr>
          </thead>
          <tbody>
            ${(chosenAll || []).slice(0, 10).map(r => `
              <tr>
                <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${escapeHtml(r.screen_id || "")}</td>
                <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${escapeHtml(r.region || "")}</td>
                <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${escapeHtml(r.format || "")}</td>
                <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number.isFinite(r.minBid) ? r.minBid.toFixed(2) : ""}</td>
                <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number.isFinite(r.ots) ? r.ots : ""}</td>
                <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${Number.isFinite(r.grp) ? r.grp.toFixed(2) : ""}</td>
                <td style="padding:10px; border-bottom:1px solid #f3f3f3;">${escapeHtml(r.address || "")}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;

    const toggle = document.getElementById("results-toggle");
    const body = document.getElementById("results-body");
    const arrow = document.getElementById("results-arrow");

    if (toggle && body && arrow) {
      let opened = false;
      toggle.onclick = () => {
        opened = !opened;
        body.style.display = opened ? "block" : "none";
        arrow.textContent = opened ? "▾" : "▸";
      };
    }
  }

  setStatus("");
}

// ===== Progress / Calc button state (based on buildBrief, supports fixed/reco/goal_ots) =====
function calcCompletion() {
  const brief = buildBrief();

  // step 1: regions
  const regions = Array.isArray(brief?.geo?.regions)
    ? brief.geo.regions.map(x => String(x || "").trim()).filter(Boolean)
    : [];
  const step1 = regions.length > 0;

  // step 2: dates
  const step2 = !!(brief?.dates?.start && brief?.dates?.end);

  // step 3: budget OR goal
  const mode = brief?.budget?.mode || "recommendation";
  const budgetVal = Number(brief?.budget?.amount || 0);
  const goalOtsVal = Number(brief?.goal?.ots || 0);

  const step3 =
    (mode === "recommendation") ||
    (mode === "fixed" && Number.isFinite(budgetVal) && budgetVal > 0) ||
    (mode === "goal_ots" && Number.isFinite(goalOtsVal) && goalOtsVal > 0);

  // step 4: formats
  const formatsMode = brief?.formats?.mode || "auto";
  const selected = Array.isArray(brief?.formats?.selected) ? brief.formats.selected : [];
  const step4 = (formatsMode === "auto") || (selected.length > 0);

  const done = [step1, step2, step3, step4].filter(Boolean).length;
  return { done, step1, step2, step3, step4, mode };
}

function renderProgress() {
  const p = calcCompletion();

  const calcBtn = el("calc-btn");
  if (calcBtn) {
    const ok = (p.done === 4);
    calcBtn.disabled = !ok;
    calcBtn.style.opacity = ok ? "1" : ".55";
  }

  // если хочешь — можно подсказку в статус:
  // if (!ok) setStatus("Заполните: регион, даты, бюджет/OTS и форматы.");
}


// ===== BIND UI =====
function bindPlannerUI() {
  document.querySelectorAll(".preset").forEach(b => {
    cssButtonBase(b);
    b.addEventListener("click", () => {
      if (el("date-start")) el("date-start").value = b.dataset.start;
      if (el("date-end")) el("date-end").value = b.dataset.end;
      renderProgress(); // ✅
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
      if (e.target.checked) {
        state.selectedFormats.clear();
        if (wrap) [...wrap.querySelectorAll("button")].forEach(btn => btn.style.borderColor = "#ddd");
      }
    });
  }

  const selectionMode = el("selection-mode");
  if (selectionMode) selectionMode.addEventListener("change", renderSelectionExtra);

// ===== goal_ots input should re-check calc button =====
const goalOtsInput = el("goal-ots");
if (goalOtsInput) {
  goalOtsInput.addEventListener("input", renderProgress);
  goalOtsInput.addEventListener("change", renderProgress);
}
  
  // ===== Regions input (READY-GUARD + LOADING UI) =====
const regionSearch = el("city-search");
const sug = el("city-suggestions");
const overlay = el("region-overlay");
const spinner = el("region-spinner");
const field = el("region-field");


// обновляем кнопку при любом изменении формы
[
  "date-start","date-end","budget-input","goal-ots",
  "formats-auto","selection-mode","grp-enabled","grp-min","grp-max",
  "time-from","time-to"
].forEach(id => {
  const n = el(id);
  if (n) {
    n.addEventListener("input", renderProgress);
    n.addEventListener("change", renderProgress);
  }
});

// радиокнопки режима бюджета/расписания тоже должны обновлять кнопку
document.querySelectorAll('input[name="budget_mode"]').forEach(x => x.addEventListener("change", renderProgress));
document.querySelectorAll('input[name="schedule"]').forEach(x => x.addEventListener("change", renderProgress));

// ВАЖНО: первый пересчёт
renderProgress();
  
function regionsReadyNow() {
  if (typeof areRegionsReady === "function") return !!areRegionsReady();
  return Array.isArray(state?.regionsAll) && state.regionsAll.length > 0;
}

function setRegionsReadyUI(isReady) {
  if (!regionSearch) return;

  if (isReady) {
    regionSearch.disabled = false;
    regionSearch.placeholder = "Начните вводить регион…";
    if (overlay) overlay.style.display = "none";
    if (spinner) spinner.style.display = "none";
    if (field) field.classList.remove("is-loading");
  } else {
    regionSearch.disabled = true;
    regionSearch.placeholder = "Загружаю список регионов…";
    if (overlay) overlay.style.display = "block";
    if (spinner) spinner.style.display = "inline-block";
    if (field) field.classList.add("is-loading");
    if (sug) sug.innerHTML = "";
  }
}

function showRegionsLoadingHint() {
  if (!sug) return;
  sug.innerHTML = `
    <div style="font-size:12px; color:#667085; padding:8px 0;">
      ⏳ Список регионов загружается… попробуйте через пару секунд.
    </div>
  `;
}

// 1) стартовое состояние
setRegionsReadyUI(regionsReadyNow());

// 2) когда экраны/регионы загрузились — включаем поле
window.addEventListener("planner:screens-ready", () => {
  setRegionsReadyUI(true);
});

// 3) если юзер фокусится / печатает слишком рано
if (regionSearch) {
  regionSearch.addEventListener("focus", () => {
    if (!regionsReadyNow()) {
      setRegionsReadyUI(false);
      showRegionsLoadingHint();
    }
  });

  regionSearch.addEventListener("input", (e) => {
    if (!regionsReadyNow()) {
      setRegionsReadyUI(false);
      showRegionsLoadingHint();
      return;
    }
    renderRegionSuggestions(e.target.value);
  });

  // 4) блокируем Enter пока не готовы регионы
  regionSearch.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;

    if (!regionsReadyNow()) {
      e.preventDefault();
      setRegionsReadyUI(false);
      showRegionsLoadingHint();
      return;
    }
    // ⚠️ ВАЖНО: тут НЕ делаем add по Enter,
    // чтобы не задублировать твою существующую логику Enter ниже.
  });
}

  // ===== Downloads =====
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

  // ===== Calc =====
  const calcBtn = el("calc-btn");
  if (calcBtn) calcBtn.addEventListener("click", () => onCalcClick());
}

// ===== Enable calc button when goal OTS changes (no renderProgress dependency) =====
const goalOtsInput = el("goal-ots");

function syncCalcBtnState() {
  const p = calcCompletion(); // использует новую логику budgetOk, включая goal_ots
  const calcBtn = el("calc-btn");
  if (calcBtn) {
    calcBtn.disabled = (p.done !== 4);
    calcBtn.style.opacity = (p.done !== 4) ? ".55" : "1";
  }
}

if (goalOtsInput) {
  goalOtsInput.addEventListener("input", syncCalcBtnState);
  goalOtsInput.addEventListener("change", syncCalcBtnState);
}

// ===== START =====
async function startPlanner() {
  renderSelectionExtra();
  bindPlannerUI();
  window.PLANNER.ui.photosAllowed = false;
  clearPhotosCarousel();

  await loadTiers();
  await loadCityRegions();

  clearPhotosCarousel();
  await loadScreens();
}

function bootPlanner() {
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
  loadCityRegions,
  bootPlanner,
  fetchPOIsOverpassInRegion,
  pickScreensNearPOIs,
  cityCenterFromScreens,
  downloadPOIsCSV,
  downloadPOIsXLSX,
  renderPOIList,
  _fetchOverpass,
  _runOverpassWithFailover
});
