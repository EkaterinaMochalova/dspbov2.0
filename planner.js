console.log("planner.js loaded");

/**
 * FIXES in this version:
 * 1) ✅ Weekly schedule (“рваное / по дням”) now works end-to-end:
 *    - added computeScheduleHoursForPeriod()
 *    - fixed validation + avg hours/day calc for weekly schedule
 *
 * 2) ✅ formatsMode is not defined:
 *    - formatsMode/manualFormats are now derived from brief.formats at the start of onCalcClick()
 *
 * 3) ✅ Calc button enablement bug:
 *    - progress previously counted 5 checks but compared to 4 → fixed requiredCount=5
 *
 * 4) ✅ summaryText referenced selectedFormatsText but it was not defined → fixed.
 */

// ========== GLOBAL ==========
window.PLANNER = window.PLANNER || {};

const REF = "planner";
const SCREENS_CSV_URL =
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@8ee9a99e0c35ce605d736b69e049edd975e1528f/inventories_sync.csv?v=" +
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
const BID_MULTIPLIER = 1.8;
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
  lastChosen: [],

  // Owners (optional)
  ownersAll: [],          // ✅ список операторов
  selectedOwners: new Set()
};

window.PLANNER.state = state;

function getReachModeFromUI() {
  return document.querySelector('input[name="reach_mode"]:checked')?.value || "balanced";
}

function targetPlaysPerHourPerScreen(mode) {
  if (mode === "max_reach") return 10;
  if (mode === "max_freq") return 60;
  return 30; // balanced
}

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
  // ожидаемые значения: all_day | peak | custom | weekly
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

function areRegionsReady() {
  return Array.isArray(state.regionsAll) && state.regionsAll.length > 0;
}

function setRegionsUIReady(isReady) {
  const input = el("city-search");
  const spinner = el("region-spinner");
  const overlay = el("region-overlay");

  if (input) {
    input.disabled = !isReady;
    input.placeholder = isReady ? "Введите регион…" : "Загружаю список регионов…";
  }
  if (spinner) spinner.style.display = isReady ? "none" : "block";
  if (overlay) overlay.style.display = isReady ? "none" : "flex";

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
  if (schedule?.type === "all_day") return 15;
  if (schedule?.type === "peak") return 7;

  if (schedule?.type === "custom") {
    const a = _timeToMin(schedule.from || "07:00");
    const b = _timeToMin(schedule.to || "22:00");
    if (a == null || b == null) return 0;

    // allow overnight
    const minutes = (b >= a) ? (b - a) : ((1440 - a) + b);
    return Math.max(0, minutes / 60);
  }

  // weekly handled elsewhere
  return 15;
}

// mon..sun
function _weekdayKeyFromDate(dt) {
  // JS: 0=Sun..6=Sat
  const d = dt.getDay();
  return (d === 0) ? "sun" :
    (d === 1) ? "mon" :
      (d === 2) ? "tue" :
        (d === 3) ? "wed" :
          (d === 4) ? "thu" :
            (d === 5) ? "fri" : "sat";
}

// "HH:MM" -> minutes 0..1440
function _timeToMin(t) {
  const s = String(t || "").trim();
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

function _hoursForWeekdayIntervals(intervals) {
  if (!Array.isArray(intervals) || !intervals.length) return 0;

  let minutes = 0;
  for (const it of intervals) {
    const a = _timeToMin(it?.from);
    const b = _timeToMin(it?.to);
    if (a == null || b == null) continue;
    // allow overnight
    if (b >= a) minutes += (b - a);
    else minutes += (1440 - a) + b;
  }
  return Math.max(0, minutes / 60);
}

// ✅ NEW: compute schedule hours for a period (supports weekly + legacy)
function computeScheduleHoursForPeriod(schedule, startStr, endStr) {
  const days = daysInclusive(startStr, endStr);

  if (schedule?.type === "weekly") {
  const mode = schedule.mode || "by_dow";
  const weekly = schedule.weekly || {};
  const globalIntervals = Array.isArray(schedule.globalIntervals) ? schedule.globalIntervals : [];

  let totalHours = 0;

  const start = new Date(startStr + "T00:00:00");
  for (let i = 0; i < days; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);

    if (mode === "global") {
      totalHours += _hoursForWeekdayIntervals(globalIntervals);
    } else {
      const key = _weekdayKeyFromDate(dt);
      totalHours += _hoursForWeekdayIntervals(weekly[key]);
    }
  }

  const avgHpd = days ? (totalHours / days) : 0;
  return { days, totalHours, avgHpd };
}

  const hpd = hoursPerDay(schedule || { type: "all_day" });
  return { days, totalHours: hpd * days, avgHpd: hpd };
}

function _getByAnyId(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

window.getWeeklyScheduleFromUI = function getWeeklyScheduleFromUI() {
  const keys = ["mon","tue","wed","thu","fri","sat","sun"];
  const out = { mon:[], tue:[], wed:[], thu:[], fri:[], sat:[], sun:[] };

  for (const k of keys) {
    const wrap = document.getElementById(`${k}-rows`);
    if (!wrap) continue;

    const rows = [...wrap.querySelectorAll(".row")];
    for (const row of rows) {
      const from = String(row.querySelector(".w-from")?.value || "").trim();
      const to   = String(row.querySelector(".w-to")?.value || "").trim();
      if (!from || !to) continue;
      out[k].push({ from, to });
    }
  }
  return out;
};

function getWeeklyModeFromUI() {
  // radio name="weekly_mode" values: "global" | "by_dow"
  return document.querySelector('input[name="weekly_mode"]:checked')?.value || "by_dow";
}

window.getGlobalScheduleFromUI = function getGlobalScheduleFromUI() {
  // reads rows from #global-rows, same row markup but classes g-from / g-to
  const out = [];

  const wrap = document.getElementById("global-rows");
  if (!wrap) return out;

  const rows = [...wrap.querySelectorAll(".row")];
  for (const row of rows) {
    const from = String(row.querySelector(".g-from")?.value || "").trim();
    const to   = String(row.querySelector(".g-to")?.value || "").trim();
    if (!from || !to) continue;
    out.push({ from, to });
  }
  return out;
};

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
      if (typeof v === "string") {
        const key = normalizeKey(k);
        if (key) {
          cityToRegion[key] = String(v).trim();
          citiesCount++;
        }
        continue;
      }

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

// ===== Regions UI (мультивыбор) =====
function renderSelectedRegions() {
  const wrap = el("region-selected");
  if (!wrap) return;

  const clearBtn = el("regions-clear");

  const regions = Array.isArray(state.selectedRegions)
    ? state.selectedRegions.map(r => String(r || "").trim()).filter(Boolean)
    : [];

  wrap.innerHTML = "";

  if (clearBtn) clearBtn.style.display = regions.length ? "inline-block" : "none";

  regions.forEach((r) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.gap = "8px";
    chip.style.padding = "6px 10px";
    chip.style.border = "1px solid #ddd";
    chip.style.borderRadius = "999px";
    chip.style.background = "#fff";

    const label = document.createElement("span");
    label.textContent = r;

    const x = document.createElement("button");
    x.type = "button";
    x.textContent = "×";
    x.setAttribute("aria-label", `Удалить ${r}`);
    x.style.border = "0";
    x.style.background = "transparent";
    x.style.cursor = "pointer";
    x.style.fontSize = "18px";
    x.style.lineHeight = "1";
    x.style.padding = "0 2px";

    x.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      state.selectedRegions = (state.selectedRegions || []).filter(xx => String(xx).trim() !== r);
      state.selectedRegion = (state.selectedRegions[0] || null);

      renderSelectedRegions();
      renderProgress();
    });

    chip.appendChild(label);
    chip.appendChild(x);
    wrap.appendChild(chip);
  });
}

function renderRegionSuggestions(q) {
  const sug = el("city-suggestions");
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
      renderProgress();
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

  state.regionsByCity = {};
  state.regionsAll = [];

  for (const c of state.citiesAll) {
    const reg = getRegionForCity(c);
    state.regionsByCity[c] = reg;
    if (!state.regionsAll.includes(reg)) state.regionsAll.push(reg);
  }

  state.ownersAll = [...new Set(
  state.screens
    .map(s => String(s.owner ?? s.Owner ?? "").trim())
    .filter(Boolean)
)].sort((a,b) => a.localeCompare(b, "ru"));
  state.regionsAll.sort((a, b) => a.localeCompare(b, "ru"));

  // ✅ регионы готовы — снимаем блокировку
  setRegionsUIReady(true);

  // проставляем region каждому экрану
  for (const s of state.screens) {
    s.region = state.regionsByCity[s.city] || "Не назначено";
  }

  renderFormats();
  renderSelectedRegions();
  renderOwners();

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

function renderOwners() {
  const wrap = el("owner-wrap");
  if (!wrap) return;
  wrap.innerHTML = "";

  const owners = Array.isArray(state.ownersAll) ? state.ownersAll : [];
  owners.forEach(owner => {
    const b = document.createElement("button");
    cssButtonBase(b);
    b.textContent = owner;

    const sync = () => {
      b.style.borderColor = state.selectedOwners.has(owner) ? "#111" : "#ddd";
    };
    sync();

    b.addEventListener("click", () => {
      if (state.selectedOwners.has(owner)) state.selectedOwners.delete(owner);
      else state.selectedOwners.add(owner);
      sync();
      renderProgress();
      // если у тебя UI где-то показывает "Выбрано: N"
      const cnt = el("owners-count");
      if (cnt) cnt.textContent = String(state.selectedOwners.size || 0);
    });

    wrap.appendChild(b);
  });
}

function getScreensFilteredByOwner(pool) {
  const sel = state.selectedOwners;
  if (!sel || sel.size === 0) return pool;
  return (pool || []).filter(s => sel.has(String(s.owner ?? "").trim()));
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
      renderProgress();
    });

    wrap.appendChild(b);
  });
}

// ===== Brief =====
function buildBrief() {
  const root = document.getElementById("planner-widget") || document;

  const budgetMode = getBudgetMode();

  const budgetVal = Number(el("budget-input")?.value || 0);
  const goalOtsVal = Number(el("goal-ots")?.value || 0);

  const budgetOk =
    (budgetMode === "recommendation") ||
    (budgetMode === "fixed" && budgetVal > 0) ||
    (budgetMode === "goal_ots" && goalOtsVal > 0);

  const scheduleType = getScheduleType(); // all_day | peak | custom | weekly
  const timeFrom = el("time-from")?.value;
  const timeTo = el("time-to")?.value;

  const weeklyMode = (scheduleType === "weekly") ? getWeeklyModeFromUI() : null;

const weekly = (scheduleType === "weekly" && typeof getWeeklyScheduleFromUI === "function")
  ? getWeeklyScheduleFromUI()
  : null;

const globalIntervals = (scheduleType === "weekly" && typeof getGlobalScheduleFromUI === "function")
  ? getGlobalScheduleFromUI()
  : [];

  const selectionMode = el("selection-mode")?.value || "city_even";

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
    schedule: (() => {
      if (scheduleType === "weekly") {
  return {
    type: "weekly",
    mode: weeklyMode || "by_dow",                 // ✅ NEW
    globalIntervals: globalIntervals || [],       // ✅ NEW (рваный "общее")
    weekly: weekly || { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] } // existing
  };
}
      return {
        type: scheduleType,
        from: scheduleType === "custom" ? (timeFrom || null) : null,
        to: scheduleType === "custom" ? (timeTo || null) : null
      };
    })(),
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
    },
    reachMode: getReachModeFromUI(),
    goal: {
      ots: (() => {
        const v = el("goal-ots")?.value;
        const n = toNumber(v);
        return Number.isFinite(n) && n > 0 ? n : null;
      })()
    },
    _ui: { budgetOk }
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
    brief.selection.route_from = pickAnyVal("#route-from");
    brief.selection.route_to = pickAnyVal("#route-to");
    brief.selection.radius_m = pickAnyNum(300, "#planner-radius", "#radius");
  }

  if (!Number.isFinite(brief.grp.min)) brief.grp.min = 0;
  if (!Number.isFinite(brief.grp.max)) brief.grp.max = 9.98;
  brief.grp.min = Math.max(0, Math.min(9.98, brief.grp.min));
  brief.grp.max = Math.max(0, Math.min(9.98, brief.grp.max));
  if (brief.grp.max < brief.grp.min) [brief.grp.min, brief.grp.max] = [brief.grp.max, brief.grp.min];

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
async function fetchRouteOSRM(A, B) {
  const url =
    "https://router.project-osrm.org/route/v1/driving/" +
    `${A.lon},${A.lat};${B.lon},${B.lat}` +
    "?overview=full&geometries=geojson";

  const r = await fetch(url, { method: "GET" });
  if (!r.ok) throw new Error("OSRM HTTP " + r.status);
  const j = await r.json();

  const coords = j?.routes?.[0]?.geometry?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return null;

  return coords; // [ [lon,lat], ... ]
}

function getLatLon(s) {
  const lat = Number(
    s?.lat ?? s?.LAT ?? s?.latitude ?? s?.Latitude ?? s?.y ?? s?.Y
  );
  const lon = Number(
    s?.lon ?? s?.LON ?? s?.lng ?? s?.longitude ?? s?.Longitude ?? s?.x ?? s?.X
  );
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { lat, lon };
}

function distancePointToPolylineMeters(P, line) {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const A = { lon: line[i][0], lat: line[i][1] };
    const B = { lon: line[i + 1][0], lat: line[i + 1][1] };
    const d = distancePointToSegmentMeters(P, A, B);
    if (d < best) best = d;
  }
  return best;
}

function distancePointToSegmentMeters(P, A, B) {
  const R = 6371000;
  const lat0 = (A.lat + B.lat) * 0.5 * Math.PI / 180;

  const ax = A.lon * Math.PI / 180 * Math.cos(lat0) * R;
  const ay = A.lat * Math.PI / 180 * R;
  const bx = B.lon * Math.PI / 180 * Math.cos(lat0) * R;
  const by = B.lat * Math.PI / 180 * R;
  const px = P.lon * Math.PI / 180 * Math.cos(lat0) * R;
  const py = P.lat * Math.PI / 180 * R;

  const abx = bx - ax, aby = by - ay;
  const apx = px - ax, apy = py - ay;
  const ab2 = abx * abx + aby * aby;

  let t = (ab2 === 0) ? 0 : (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * abx;
  const cy = ay + t * aby;

  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function pickScreensNearPolyline(screens, lineLonLat, radiusM) {
  const out = [];
  for (const s of screens) {
    const p = getLatLon(s);
    if (!p) continue;

    const d = distancePointToPolylineMeters({ lon: p.lon, lat: p.lat }, lineLonLat);
    if (d <= radiusM) out.push(s);
  }
  return out;
}

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
  const R = 6371;
  const latRad = lat * Math.PI / 180;
  const lonRad = lon * Math.PI / 180;

  const xKm = R * lonRad * Math.cos(latRad);
  const yKm = R * latRad;

  const gx = Math.floor(yKm / stepKm);
  const gy = Math.floor(xKm / stepKm);
  return `${gx}:${gy}`;
}

function gridStepKmForCount(n) {
  if (n <= 10) return 6;
  if (n <= 25) return 4;
  if (n <= 60) return 2.5;
  return 2;
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

function pickScreensUniformByGrid(pool, count, stepKm = 2, perCellMax = 2) {
  const cells = groupByGrid(pool, stepKm);
  for (const cell of cells) {
    cell.sort((a, b) => (a.minBid ?? 1e18) - (b.minBid ?? 1e18));
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  const result = [];
  const takenPerCell = new Map();

  let i = 0;
  while (result.length < count && cells.length) {
    const cell = cells[i % cells.length];
    const taken = takenPerCell.get(cell) || 0;

    if (taken >= perCellMax) {
      i++;
      if (takenPerCell.size >= cells.length) break;
      continue;
    }

    if (cell.length) {
      result.push(cell.shift());
      takenPerCell.set(cell, taken + 1);
    }
    i++;
  }

  if (result.length < count) {
    const picked = new Set(result);
    const rest = pool.filter(s => !picked.has(s));
    result.push(...pickScreensByMinBid(rest, count - result.length));
  }

  return result.slice(0, count);
}

// ===== XLSX (screens export simple) =====
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

// ===== Nominatim (geocoding) =====
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

async function geocodeAddressNominatim(query, regionHint) {
  const q0 = String(query || "").trim();
  if (!q0) return null;

  const q = regionHint ? `${q0}, ${String(regionHint).trim()}` : q0;

  const url =
    `${NOMINATIM_URL}?format=jsonv2&limit=1&addressdetails=0&accept-language=ru&q=` +
    encodeURIComponent(q);

  const res = await fetch(url, { method: "GET" });
  const txt = await res.text();
  if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}: ${txt.slice(0, 200)}`);

  const json = JSON.parse(txt);
  const hit = Array.isArray(json) && json.length ? json[0] : null;
  if (!hit) return null;

  const lat = Number(hit.lat);
  const lon = Number(hit.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return { lat, lon };
}

function pickScreensNearPoint(screens, center, radiusMeters) {
  const r = Number(radiusMeters || 0);
  if (!center || !Number.isFinite(center.lat) || !Number.isFinite(center.lon) || !r) return [];

  const dist = window.GeoUtils?.haversineMeters;
  if (!dist) throw new Error("GeoUtils.haversineMeters is missing (need geo.js)");

  return (screens || []).filter(s => {
    const slat = Number(s.lat), slon = Number(s.lon);
    if (!Number.isFinite(slat) || !Number.isFinite(slon)) return false;
    return dist(slat, slon, center.lat, center.lon) <= r;
  });
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

async function fetchPOIsOverpassInRegion(poiType, regionName, screensInRegion, limit = 50) {
  const t = String(poiType || "").trim();
  if (!t || !POI_QUERIES[t]) throw new Error("Unknown poi_type: " + t);

  const region = _escapeOverpassString(regionName);
  if (!region) throw new Error("Region is empty");

  const safeLimit = Math.max(1, Math.min(50, Number(limit || 50)));

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

  let need = 0;
  items.forEach(it => {
    if (it.share < minShare) {
      need += (minShare - it.share);
      it.share = minShare;
      it.locked = true;
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

// --- Tier weights (for OTS allocation) ---
function tierWeight(tier) {
  const t = String(tier ?? "").toUpperCase().trim();
  if (t === "A" || t === "1") return 1.00;
  if (t === "B" || t === "2") return 0.80;
  if (t === "C" || t === "3") return 0.60;
  return 0.70;
}

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

  items.forEach(i => {
    if (i.share < minShare) i.share = minShare;
    if (i.share > maxShare) i.share = maxShare;
  });

  const sumShares = items.reduce((a, b) => a + b.share, 0) || 1;
  items.forEach(i => i.share /= sumShares);

  let out = items.map(i => ({
    region: i.region,
    ots: Math.floor(Number(totalOts) * i.share)
  }));

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

function computeGoalOtsPlan(prepared, totalOtsGoal, opts = {}) {
  const minShare = opts.minShare ?? 0.10;
  const maxShare = opts.maxShare ?? 0.70;

  const regions = prepared.map(r => ({ key: r.region, tier: r.tier }));
  const baseAlloc = allocateTargetOtsAcrossRegions(totalOtsGoal, regions, { minShare, maxShare });

  const plan = {};
  for (const r of prepared) {
    const goal = baseAlloc.find(x => x.region === r.region)?.ots || 0;

    plan[r.region] = {
      goalOts: goal,
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

  function applyGoal(regionKey, addOts) {
    const p = plan[regionKey];
    if (!p) return 0;
    if (!p.avgOts) return addOts;

    const newGoal = p.goalOts + addOts;
    const maxOtsHere = Math.max(0, p.capOtsAbs);
    const targetOtsHere = Math.min(newGoal, maxOtsHere);

    const playsNeed = Math.min(
      p.capPlaysAbs,
      Math.ceil(targetOtsHere / p.avgOts)
    );

    const otsHere = playsNeed * p.avgOts;
    const budgetHere = Math.ceil(playsNeed * p.bidPlus20);

    p.goalOts = targetOtsHere;
    p.playsPlanned = playsNeed;
    p.otsPlanned = otsHere;
    p.budgetPlanned = Math.min(budgetHere, p.capBudgetAbs);

    const unmet = Math.max(0, newGoal - targetOtsHere);
    return unmet;
  }

  let unmetTotal = 0;
  for (const r of prepared) {
    const unmet = applyGoal(r.region, 0);
    unmetTotal += unmet;
  }

  let guard = 0;
  while (unmetTotal > 0 && guard < 10000) {
    guard++;

    const receivers = prepared
      .map(r => r.region)
      .filter(key => {
        const p = plan[key];
        if (!p || !p.avgOts) return false;
        return p.goalOts < p.capOtsAbs;
      });

    if (!receivers.length) break;

    const headroomSum = receivers.reduce((a, key) => {
      const p = plan[key];
      return a + Math.max(0, p.capOtsAbs - p.goalOts);
    }, 0);

    if (headroomSum <= 0) break;

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

    if (distributed <= 0) break;
  }

  const finalUnmet = Math.max(0, unmetTotal);
  return { plan, finalUnmet };
}

// ===== MAIN =====
async function onCalcClick() {
  const brief = buildBrief();
  const pphTarget = targetPlaysPerHourPerScreen(brief.reachMode);

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

  // ✅ formats variables (fixes ReferenceError formatsMode is not defined)
  const formatsMode = brief?.formats?.mode || "auto";
  const manualFormats = Array.isArray(brief?.formats?.selected) ? brief.formats.selected : [];
  const selectedFormatsText =
    (formatsMode === "auto")
      ? "Рекомендация"
      : (manualFormats.length ? manualFormats.join(", ") : "—");

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

  // ✅ schedule hours/day
  let hpdFixed = hoursPerDay(brief.schedule);

  if (brief.schedule?.type === "weekly") {
    const meta = computeScheduleHoursForPeriod(brief.schedule, brief.dates.start, brief.dates.end);
    hpdFixed = meta.avgHpd;

    if (!Number.isFinite(hpdFixed) || hpdFixed <= 0) {
      alert("В weekly-графике не задано время вещания (0 часов).");
      return;
    }
  }

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
  const isNearAddress = (brief.selection?.mode === "near_address");

  if (isPOI && !window.GeoUtils?.haversineMeters) {
    alert("GeoUtils не найден. Проверь подключение geo.js");
    return;
  }

  // =========================
  // 1) PREPARE POOLS PER REGION
  // =========================
  const prepared = [];

  for (const region of regions) {
    const tier = getTierForGeo(region);

    let pool = state.screens.filter(s => String(s.region || "").trim() === region);

    // ✅ uses formatsMode/manualFormats derived above
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

    // POI mode
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
      window.PLANNER.lastPOIs = anyPOIs;

      try { renderPOIList(anyPOIs); } catch(e) { console.warn("[poi] renderPOIList not implemented:", e.message); }

      const before = pool.length;
      pool = pickScreensNearPOIs(pool, pois, screenRadius);

      if (!pool.length) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет экранов у POI" });
        continue;
      }

      setStatus(`Экраны у POI: ${pool.length} из ${before} (регион: ${region}, POI: ${pois.length})`);
    }

    // Near address mode
    if (isNearAddress) {
      const addr = String(brief.selection.address || "").trim();
      const screenRadius = Number(brief.selection.radius_m || 500);

      if (!addr) {
        alert("Введите адрес.");
        setStatus("");
        return;
      }
      if (!window.GeoUtils?.haversineMeters) {
        alert("GeoUtils не найден. Проверь подключение geo.js");
        setStatus("");
        return;
      }

      setStatus(`Геокодирую адрес: «${addr}»…`);

      let pt = null;
      try {
        pt = await geocodeAddressNominatim(addr);
      } catch (e) {
        console.error("[geo] nominatim error:", e);
        alert(e?.message || "Ошибка геокодинга (Nominatim).");
        setStatus("");
        return;
      }

      if (!pt) {
        alert("Адрес не найден. Попробуй уточнить (город, улица, дом).");
        setStatus("");
        return;
      }

      const before = pool.length;
      pool = pickScreensNearPoint(pool, pt, screenRadius);

      if (!pool.length) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет экранов у адреса" });
        continue;
      }

      setStatus(`Экраны у адреса: ${pool.length} из ${before} (радиус: ${screenRadius} м)`);
    }

    // ROUTE mode
    if (brief.selection?.mode === "route") {
      const fromTxt = String(brief.selection.route_from || "").trim();
      const toTxt = String(brief.selection.route_to || "").trim();
      const screenRadius = Number(brief.selection.radius_m || 300);

      if (!fromTxt || !toTxt) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "не задан маршрут" });
        continue;
      }

      setStatus(`Маршрут для региона «${region}»: ${fromTxt} → ${toTxt}…`);

      let A = null, B = null, routeLine = null;
      try {
        A = await geocodeAddressNominatim(fromTxt, region);
        B = await geocodeAddressNominatim(toTxt, region);
      } catch (e) {
        console.error("[route] geocode error:", e);
      }

      if (!A || !B || !Number.isFinite(A.lat) || !Number.isFinite(A.lon) || !Number.isFinite(B.lat) || !Number.isFinite(B.lon)) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "точки маршрута не найдены" });
        warnings.push(`⚠️ Регион «${region}»: не удалось геокодировать маршрут (${fromTxt} → ${toTxt}).`);
        continue;
      }

      try {
        routeLine = await fetchRouteOSRM(A, B);
      } catch (e) {
        console.error("[route] osrm error:", e);
      }

      if (!Array.isArray(routeLine) || routeLine.length < 2) {
        routeLine = [[A.lon, A.lat], [B.lon, B.lat]];
        warnings.push(`⚠️ Регион «${region}»: OSRM недоступен, использую прямую линию A–B.`);
      }

      const before = pool.length;
      pool = pickScreensNearPolyline(pool, routeLine, screenRadius);

      if (!pool.length) {
        perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет экранов у маршрута" });
        continue;
      }

      setStatus(`Экраны у маршрута: ${pool.length} из ${before} (радиус: ${screenRadius}м)`);
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

    const avgOts = avgNumber(pool.map(s => s.ots));

    const capPlaysAbs = Math.floor(SC_MAX * pool.length * days * hpd);
    const capBudgetAbs = Math.floor(capPlaysAbs * bidPlus20);
    const capOtsAbs = (avgOts == null) ? null : (capPlaysAbs * avgOts);

    prepared.push({
      region, tier, pool,
      avgBid, bidPlus20,
      avgOts,
      capPlaysAbs, capBudgetAbs, capOtsAbs
    });
  }

  if (!prepared.length) {
    alert("Не удалось подобрать экраны: по выбранным условиям не осталось доступных экранов.");
    setStatus("");
    return;
  }

  // =========================
  // 2) INITIAL BUDGETS
  // =========================
  const budgets = {};
  let goalPlan = null;
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
  // 3) REDISTRIBUTION BY CAPACITY (for fixed/reco)
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

  // =========================
  // 4) MAIN CALC PER REGION
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

    budget = Math.min(budget, pr.capBudgetAbs);
    totalBudgetFinal += budget;

    let totalPlaysTheory = 0;
    if (brief.budget.mode === "goal_ots" && goalPlan && goalPlan[region]) {
      totalPlaysTheory = Math.ceil(Number(goalPlan[region].playsPlanned || 0));
      if (!Number.isFinite(totalPlaysTheory) || totalPlaysTheory < 0) totalPlaysTheory = 0;
    } else {
      totalPlaysTheory = Math.floor(budget / bidPlus20);
      if (!Number.isFinite(totalPlaysTheory) || totalPlaysTheory < 0) totalPlaysTheory = 0;
    }

    if (!Number.isFinite(totalPlaysTheory) || totalPlaysTheory <= 0) {
      perRegionRows.push({ region, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "цель=0" });
      continue;
    }

    const maxPlaysPerScreenForPeriod = Math.floor(SC_MAX * days * hpd);
    let screensNeededByCapacity = Math.ceil(totalPlaysTheory / Math.max(1, maxPlaysPerScreenForPeriod));
    screensNeededByCapacity = Math.max(1, screensNeededByCapacity);

    let screensNeeded = screensNeededByCapacity;

    if (brief.budget.mode !== "goal_ots") {
      const playsPerHourTotalTheory = totalPlaysTheory / days / hpd;
      const byStrategy = Math.max(1, Math.ceil(playsPerHourTotalTheory / Math.max(1, pphTarget)));
      const byHardCap = Math.max(1, Math.ceil(playsPerHourTotalTheory / Math.max(1, SC_MAX)));
      screensNeeded = Math.max(screensNeededByCapacity, byStrategy, byHardCap);
    }

    const screensChosenCount = Math.min(pool.length, screensNeeded);

    const stepKm = gridStepKmForCount(screensChosenCount);
    const perCellMax = (screensChosenCount <= 15) ? 1 : 2;

    const chosen = pickScreensUniformByGrid(
      pool,
      screensChosenCount,
      stepKm,
      perCellMax
    );

    const capPlaysByChosen = Math.floor(SC_MAX * chosen.length * days * hpd);
    let totalPlaysEffective = Math.min(totalPlaysTheory, capPlaysByChosen);
    totalPlaysEffectiveAll += totalPlaysEffective;

    if (brief.budget.mode === "goal_ots" && goalPlan && goalPlan[region]) {
      if (totalPlaysEffective < totalPlaysTheory) {
        warnings.push(`⚠️ Регион «${region}»: не хватает ёмкости даже при ${chosen.length} экранах (SC_MAX).`);
      }
    } else {
      const playsPerHourPerScreen = (totalPlaysTheory / days / hpd) / Math.max(1, chosen.length);
      if (playsPerHourPerScreen > pphTarget && playsPerHourPerScreen <= SC_MAX) {
        warnings.push(`⚠️ Регион «${region}»: в среднем ${playsPerHourPerScreen.toFixed(1)} выходов/час на экран (выше выбранной стратегии ${pphTarget}).`);
      }
    }

    const avgChosenOts = avgNumber(chosen.map(s => s.ots));
    const otsTotal = (avgChosenOts == null) ? null : totalPlaysEffective * avgChosenOts;
    if (avgChosenOts == null) hasOts = false;
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

  if (!chosenAll.length) {
    alert("Не удалось подобрать экраны: по выбранным условиям не осталось доступных экранов.");
    setStatus("");
    return;
  }

  state.lastChosen = chosenAll;

  window.PLANNER = window.PLANNER || {};
  window.PLANNER.lastCalc = {
    brief,
    chosen: chosenAll,
    perRegion: perRegionRows,
    warnings: warnings || [],
    meta: {
      days,
      hpd,
      totalBudget: totalBudgetFinal,
      totalPlays: totalPlaysEffectiveAll,
      totalOts: (Number.isFinite(otsTotalAll) ? otsTotalAll : null)
    }
  };

  window.dispatchEvent(new CustomEvent("planner:calc-done", {
    detail: { chosen: chosenAll, perRegion: perRegionRows }
  }));

  const nf = (n) => Math.floor(n).toLocaleString("ru-RU");
  const of = (n) => Math.round(n).toLocaleString("ru-RU");

  const playsPerDayAll = totalPlaysEffectiveAll / days;
  const playsPerHourAll = totalPlaysEffectiveAll / days / hpd;

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
— Расписание: ${brief.schedule.type} (часов/день: ${hpd.toFixed(2)})
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

  setStatus("");
}

// ===== Progress / Calc button state =====
function calcCompletion() {
  const brief = buildBrief();

  const regions = Array.isArray(brief?.geo?.regions)
    ? brief.geo.regions.map(x => String(x || "").trim()).filter(Boolean)
    : [];
  const step1 = regions.length > 0;

  const step2 = !!(brief?.dates?.start && brief?.dates?.end);

 let scheduleOk = true;

if (brief.schedule?.type === "weekly") {
  if (!(brief?.dates?.start && brief?.dates?.end)) {
    scheduleOk = false;
  } else {
    const mode = brief.schedule.mode || "by_dow";
    if (mode === "global") {
      scheduleOk = Array.isArray(brief.schedule.globalIntervals) && brief.schedule.globalIntervals.length > 0;
    } else {
      const w = brief.schedule.weekly || {};
      scheduleOk = ["mon","tue","wed","thu","fri","sat","sun"].some(k => Array.isArray(w[k]) && w[k].length > 0);
    }

    if (scheduleOk) {
      const meta = computeScheduleHoursForPeriod(brief.schedule, brief.dates.start, brief.dates.end);
      scheduleOk = Number.isFinite(meta.avgHpd) && meta.avgHpd > 0;
    }
  }
}

  const mode = brief?.budget?.mode || "recommendation";
  const budgetVal = Number(brief?.budget?.amount || 0);
  const goalOtsVal = Number(brief?.goal?.ots || 0);

  const step3 =
    (mode === "recommendation") ||
    (mode === "fixed" && Number.isFinite(budgetVal) && budgetVal > 0) ||
    (mode === "goal_ots" && Number.isFinite(goalOtsVal) && goalOtsVal > 0);

  const formatsMode = brief?.formats?.mode || "auto";
  const selected = Array.isArray(brief?.formats?.selected) ? brief.formats.selected : [];
  const step4 = (formatsMode === "auto") || (selected.length > 0);

  const done = [step1, step2, step3, step4, scheduleOk].filter(Boolean).length;
  return { done, step1, step2, step3, step4, scheduleOk, mode };
}

function renderProgress() {
  const p = calcCompletion();

  const requiredCount = 5; // ✅ FIX: we validate 5 checkpoints now
  const ok = (p.done === requiredCount);

  const calcBtn = el("calc-btn");
  if (calcBtn) {
    calcBtn.disabled = !ok;
    calcBtn.style.opacity = ok ? "1" : ".55";
  }
}

function renderBudgetHints() {
  const hint = el("budget-reco-hint");
  if (!hint) return;

  const mode = getBudgetMode();
  hint.style.display = (mode === "recommendation") ? "block" : "none";
}

// ===== BIND UI =====
function bindPlannerUI() {
  document.querySelectorAll(".preset").forEach(b => {
    cssButtonBase(b);
    b.addEventListener("click", () => {
      if (el("date-start")) el("date-start").value = b.dataset.start;
      if (el("date-end")) el("date-end").value = b.dataset.end;
      renderProgress();
    });
  });

  document.querySelectorAll('input[name="budget_mode"]').forEach(r => {
    r.addEventListener("change", () => {
      const mode = getBudgetMode();
      const wrap = el("budget-input-wrap");
      if (wrap) wrap.style.display = mode === "fixed" ? "block" : "none";
      renderBudgetHints();
      renderProgress();
    });
  });

  document.querySelectorAll('input[name="reach_mode"]').forEach(x =>
    x.addEventListener("change", renderProgress)
  );

  document.querySelectorAll(".w-add").forEach(btn => {
  btn.addEventListener("click", () => {
    const day = btn.dataset.day; // mon/tue...
    const wrap = document.getElementById(`${day}-rows`);
    if (!wrap) return;

    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `
      <input type="time" class="w-from" value="07:00">
      <input type="time" class="w-to" value="10:00">
      <button type="button" class="w-del">×</button>
    `;
    wrap.appendChild(div);

    div.querySelector(".w-del").addEventListener("click", () => {
      div.remove();
      renderProgress();
    });

    div.querySelectorAll("input").forEach(i => {
      i.addEventListener("input", renderProgress);
      i.addEventListener("change", renderProgress);
    });

    renderProgress();
  });
});

document.querySelectorAll(".g-add").forEach(btn => {
  btn.addEventListener("click", () => {
    const wrap = document.getElementById("global-rows");
    if (!wrap) return;

    const div = document.createElement("div");
    div.className = "row";
    div.innerHTML = `
      <input type="time" class="g-from" value="07:00">
      <input type="time" class="g-to" value="10:00">
      <button type="button" class="g-del">×</button>
    `;
    wrap.appendChild(div);

    div.querySelector(".g-del").addEventListener("click", () => {
      div.remove();
      renderProgress();
    });

    div.querySelectorAll("input").forEach(i => {
      i.addEventListener("input", renderProgress);
      i.addEventListener("change", renderProgress);
    });

    renderProgress();
  });
});

// delete for global rows
document.addEventListener("click", (e) => {
  const del = e.target?.closest?.(".g-del");
  if (!del) return;
  const row = del.closest(".row");
  if (row) row.remove();
  renderProgress();
});
  
document.addEventListener("click", (e) => {
  const del = e.target?.closest?.(".w-del");
  if (!del) return;
  const row = del.closest(".row");
  if (row) row.remove();
  renderProgress();
});

  document.querySelectorAll('input[name="schedule"]').forEach(r => {
    r.addEventListener("change", () => {
      const v = getScheduleType();
      const customWrap = el("custom-time-wrap");
      const weeklyWrap = el("weekly-wrap");

      if (customWrap) customWrap.style.display = (v === "custom") ? "flex" : "none";
      if (weeklyWrap) weeklyWrap.style.display = (v === "weekly") ? "block" : "none";

      renderProgress();
    });
  });

  // ===== Weekly mode toggle: global / by_dow =====
document.querySelectorAll('input[name="weekly_mode"]').forEach(r => {
  r.addEventListener("change", () => {
    const m = getWeeklyModeFromUI();
    const globalWrap = el("weekly-global-wrap"); // container for global rows
    const byDowWrap  = el("weekly-by-dow-wrap"); // container for mon..sun rows

    if (globalWrap) globalWrap.style.display = (m === "global") ? "block" : "none";
    if (byDowWrap)  byDowWrap.style.display  = (m === "by_dow") ? "block" : "none";

    renderProgress();
  });
});

  const grpEnabled = el("grp-enabled");
  if (grpEnabled) {
    grpEnabled.addEventListener("change", (e) => {
      const wrap = el("grp-wrap");
      if (wrap) wrap.style.display = e.target.checked ? "block" : "none";
      renderProgress();
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
      renderProgress();
    });
  }

  const selectionMode = el("selection-mode");
  if (selectionMode) selectionMode.addEventListener("change", () => { renderSelectionExtra(); renderProgress(); });

  const clearRegionsBtn = el("regions-clear");
  if (clearRegionsBtn) {
    clearRegionsBtn.addEventListener("click", () => {
      state.selectedRegions = [];
      state.selectedRegion = null;
      renderSelectedRegions();
      renderProgress();
    });
  }

  // watchers for inputs
  [
    "date-start", "date-end", "budget-input", "goal-ots",
    "formats-auto", "selection-mode", "grp-enabled", "grp-min", "grp-max",
    "time-from", "time-to",
    // weekly fields: if present, update progress on change
    "mon-from", "mon-to", "tue-from", "tue-to", "wed-from", "wed-to",
    "thu-from", "thu-to", "fri-from", "fri-to", "sat-from", "sat-to", "sun-from", "sun-to"
  ].forEach(id => {
    const n = el(id);
    if (n) {
      n.addEventListener("input", renderProgress);
      n.addEventListener("change", renderProgress);
    }
  });

  // ===== Regions search =====
  const regionSearch = el("city-search");
  const sug = el("city-suggestions");

  function regionsReadyNow() {
    if (typeof areRegionsReady === "function") return !!areRegionsReady();
    return Array.isArray(state?.regionsAll) && state.regionsAll.length > 0;
  }

  function showRegionsLoadingHint() {
    if (!sug) return;
    sug.innerHTML = `
      <div style="font-size:12px; color:#667085; padding:8px 0;">
        ⏳ Список регионов загружается… попробуйте через пару секунд.
      </div>
    `;
  }

  if (regionSearch) {
    regionSearch.addEventListener("focus", () => {
      if (!regionsReadyNow()) {
        setRegionsUIReady(false);
        showRegionsLoadingHint();
      }
    });

    regionSearch.addEventListener("input", (e) => {
      if (!regionsReadyNow()) {
        setRegionsUIReady(false);
        showRegionsLoadingHint();
        return;
      }
      renderRegionSuggestions(e.target.value);
    });
  }

  // ===== Downloads =====
  const downloadBtn = el("download-csv");
  if (downloadBtn) downloadBtn.addEventListener("click", () => downloadXLSX(state.lastChosen));

  // ===== Calc =====
  const calcBtn = el("calc-btn");
  if (calcBtn) calcBtn.addEventListener("click", () => onCalcClick());

  // Initial
  renderProgress();
  renderBudgetHints();
  renderSelectionExtra();
}

// ===== START =====
async function startPlanner() {
  bindPlannerUI();
  window.PLANNER.ui.photosAllowed = false;

  await loadTiers();
  await loadCityRegions();
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
  downloadXLSX,
  geocodeAddressNominatim,
  pickScreensNearPoint,
  _fetchOverpass,
  _runOverpassWithFailover,
  computeScheduleHoursForPeriod,
  getScreensFilteredByOwner,
  renderOwners,
});
