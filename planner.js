const PLANNER_CDN_BASE = (() => {
  try {
    const src = document.currentScript?.src || '';
    return src.replace(/\/planner\.js.*$/, '/');
  } catch(e) { return ''; }
})();

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
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@8ee9a99e0c35ce605d736b69e049edd975e1528f/inventories_sync.csv";

const TIERS_JSON_URL =
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@8684fb51e3081987ae494eaaf5bacbd7b5e47160/tiers_v1.json";

// ===== CITY -> REGION =====
const CITY_REGIONS_URL =
  "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@f6f96a16980cda4d7165e692526ef08f2cd0c22e/city_regions.json";

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

// ===== Model =====
const BID_MULTIPLIER = 1.8;
const SC_OPT = 20;
const SC_MAX = 60;

// Выходов/час на экран для режима «подскажите бюджет» в разрезе выбранного тира.
// «Максимум» = плановая ёмкость формата (30 вых/ч, у медиафасадов 8) — выше неё
// рекомендовать нельзя, инвентарь столько не отдаст. «Оптимальный» = SC_OPT (20),
// «Минимум» = 0.35 от оптимума, тот же коэффициент, что в computeRecoBudgetTiers.
// Это ограничение только для РЕКОМЕНДАЦИИ: вручную (слайдер выходов в час) частоту
// по-прежнему можно поднять выше 30 — там потолком остаётся физический SC_MAX.
// Без тира выбранное на шаге «Цели» молча игнорировалось, как только задано
// количество конструкций: бюджет всегда считался по оптимуму (жалоба «выбрал
// минимум → после кнопки конструкций посчитало на огромный бюджет»).
function recoPphForTier(recoTier, capacityPph = CAPACITY_PPH_DEFAULT) {
  if (recoTier === "min") return SC_OPT * 0.35;
  if (recoTier === "max") return capacityPph;
  return SC_OPT;
}
// Ручная надбавка к ставке: поверх выбранного режима (мин/реко) клиент может
// поднять ставку на X %, чтобы чаще выигрывать аукцион. Множитель, а не третий
// взаимоисключающий режим — надбавка должна работать и с мин, и с реко.
function bidUpliftFactor(brief) {
  const pct = Number(brief?.bidUpliftPct || 0);
  return (Number.isFinite(pct) && pct > 0) ? 1 + pct / 100 : 1;
}

// Ставка одного экрана с учётом режима и надбавки.
function screenBid(s, brief) {
  const base = brief?.bidMode === "min" ? s?.minBid : (s?.recoBid || s?.minBid);
  return Number.isFinite(base) ? base * bidUpliftFactor(brief) : base;
}

const MF_MAX_PPH = 12; // MediaFacade physical cap: max 12 plays/hour

// Per-screen plays-per-hour cap based on format
function getScreenPphCap(s) {
  const fmt = String(s?.format || "").toUpperCase();
  if (fmt === "MEDIAFACADE" || fmt === "MF") return MF_MAX_PPH;
  return SC_MAX;
}
const RECO_HOURS_PER_DAY = 12; // для режима "нужна рекомендация"

// ===== Сомнительные экраны =====
// Единственный признак — аномально низкая ставка: она почти всегда означает, что
// экран не открутится или в инвентаре мусорные данные. Сравниваем с медианой по
// своему формату в своём городе (не со средним: одна копеечная ставка утягивает
// среднее и «прячет» саму себя). Группы меньше MIN_GROUP статистически бессмысленны,
// поэтому для них берём медиану по формату целиком, а если и её нет — по всему набору.
const SUSPICIOUS_BID_RATIO = 0.4; // ниже 40 % медианы группы
const SUSPICIOUS_MIN_GROUP = 5;

function _median(nums) {
  const a = nums.filter(v => Number.isFinite(v) && v > 0).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

// Проставляет s._suspiciousBid / s._suspiciousMedian. Возвращает список сомнительных.
function markSuspiciousScreens(screens, brief) {
  const list = Array.isArray(screens) ? screens : [];
  list.forEach(s => { s._suspiciousBid = false; s._suspiciousMedian = null; });
  if (list.length < SUSPICIOUS_MIN_GROUP) return [];

  const bidOf = s => screenBid(s, brief);
  const byFmtCity = new Map();
  const byFmt = new Map();
  for (const s of list) {
    const fmt = String(s.format || "").trim();
    const city = String(s.city || s.region || "").trim();
    const k1 = fmt + "\u0000" + city;
    if (!byFmtCity.has(k1)) byFmtCity.set(k1, []);
    if (!byFmt.has(fmt)) byFmt.set(fmt, []);
    byFmtCity.get(k1).push(bidOf(s));
    byFmt.get(fmt).push(bidOf(s));
  }

  const medAll = _median(list.map(bidOf));
  const suspicious = [];
  for (const s of list) {
    const bid = bidOf(s);
    if (!Number.isFinite(bid) || bid <= 0) continue;
    const fmt = String(s.format || "").trim();
    const city = String(s.city || s.region || "").trim();
    const group = byFmtCity.get(fmt + "\u0000" + city) || [];
    const med = (group.length >= SUSPICIOUS_MIN_GROUP)
      ? _median(group)
      : ((byFmt.get(fmt) || []).length >= SUSPICIOUS_MIN_GROUP ? _median(byFmt.get(fmt)) : medAll);
    if (!Number.isFinite(med) || med <= 0) continue;
    if (bid < med * SUSPICIOUS_BID_RATIO) {
      s._suspiciousBid = true;
      s._suspiciousMedian = med;
      suspicious.push(s);
    }
  }
  return suspicious;
}

// ===== Плановая ёмкость =====
// Ёмкость по показам = часы размещения за период × Σ коэффициента формата.
// Коэффициенты заданы бизнесом: 8 выходов/час для медиафасадов, 30 для остальных
// форматов. Это НЕ физический потолок экрана (getScreenPphCap — 12/60), а плановая
// планка: выше неё нельзя ни рекомендовать «максимальный» бюджет, ни молча принять
// цель клиента по бюджету/показам/OTS.
const CAPACITY_PPH_MF = 8;
const CAPACITY_PPH_DEFAULT = 30;

function capacityPphForScreen(s) {
  const fmt = String(s?.format || "").toUpperCase();
  return (fmt === "MEDIAFACADE" || fmt === "MF") ? CAPACITY_PPH_MF : CAPACITY_PPH_DEFAULT;
}

// hoursTotal — суммарные часы размещения за период (дней × часов/день).
// Возвращает null, если считать не из чего: вызывающий код тогда просто не проверяет.
function computeCapacity(screens, hoursTotal, bidMode, uplift = 1) {
  const list = Array.isArray(screens) ? screens : [];
  if (!list.length || !Number.isFinite(hoursTotal) || hoursTotal <= 0) return null;

  const pphSum = list.reduce((sum, s) => sum + capacityPphForScreen(s), 0);
  const plays  = Math.floor(hoursTotal * pphSum);
  const avgBid = avgEffectiveBid(list, bidMode, 1, uplift);
  const avgOts = avgNumberNonZero(list.map(s => s.ots));

  return {
    screens: list.length,
    hours:   hoursTotal,
    avgPph:  pphSum / list.length,
    plays,
    budget:  (Number.isFinite(avgBid) && avgBid > 0) ? Math.floor(plays * avgBid) : null,
    ots:     (avgOts != null && avgOts > 0) ? Math.round(plays * avgOts) : null,
  };
}

// "Активный" экран = есть валидная ставка И на нём реально идут запросы.
// requestHourlyAvg («Запросы/час» в интерфейсе DSP) — тот самый параметр, по которому
// экран считается живым: 0 запросов в час = крутить нечего. slotCountPerDay оставлен
// как дополнительная проверка там, где API его отдаёт.
// Поля может не быть в старом ответе/кэше — тогда NaN трактуем как "неизвестно" и
// экран не выбрасываем, иначе "только активные" вычистит весь пул на источниках без
// этого поля (например, при загрузке из CSV).
function hasActiveInventory(s) {
  if (!Number.isFinite(s?.minBid) || s.minBid <= 0) return false;
  if (Number.isFinite(s?.requestHourlyAvg) && s.requestHourlyAvg <= 0) return false;
  if (Number.isFinite(s?.slotCountPerDay) && s.slotCountPerDay <= 0) return false;
  return true;
}

// ===== State =====
const state = {
  screens: [],
  screensAll: [],
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
  manuallyExcluded: new Set(), // screens manually removed from map — persists across recalcs

  // Owners (optional)
  ownersAll: [],          // ✅ список операторов
  selectedOwners: new Set(),

  // Polygon zone filter: null | [[lat,lon], ...]
  polygonFilter: null,

  // DSP warmup
  dspInventoryCache: null,
  dspInventoryWarmupPromise: null,
  dspInventoryWarmupDone: false,
  dspInventoryCachedAt: null,   // когда инвентарь реально приехал из API
  dspRegionToCities: {},

  // VK Affinity data: Map<GID, {segmentName: affinityValue}>
  affinityMap: null,
  affinityStats: null,
};

window.PLANNER.state = state;

// ===== VK AFFINITY =====
const AFFINITY_SKIP_COLS = new Set([
  'GID','source_file',
  'Возраст','Занятость','Индивидуальный доход','Наличие детей',
  'Наличие образования','Пол','Премиум','Семейное положение','Черты характера'
]);

const AFFINITY_GROUPS = {
  "Пол":         ["Женщины", "Мужчины"],
  "Возраст":     ["<17", "18-24", "25-34", "35-44", "45-54", ">55"],
  "Доход":       ["Низкий", "Средний", "Выше ср.", "Высокий", "Премиум базовый", "Премиум средний", "Премиум высокий"],
  "Семья":       ["Есть дети", "Нет детей", "Женат/Замужем", "Не женат/Не замужем"],
  "Образование": ["Есть высшее", "Нет высшего", "Среднее образование"],
  "Занятость":   ["Работает", "Не работает"],
  "Черты":       ["Импульсивность", "Интроверсия", "Любознательность", "Практичность", "Самоконтроль", "Сдержанность", "Творчество", "Экстраверсия", "Эмоциональность"],
};

// Segments where PVZ screens and low-quality vendors are excluded from scoring
const PREMIUM_INCOME_SEGS = new Set(["Премиум базовый", "Премиум средний", "Премиум высокий", "Высокий", "Выше ср."]);
const AUDIENCE_EXCL_VENDORS = ["spectrum", "трансмедиа", "магнит", "эфир", "новый альянс"];
function _isExcludedForPremium(s) {
  if (s.format === "PVZ_SCREEN") return true;
  const o = String(s.owner ?? "").toLowerCase();
  return AUDIENCE_EXCL_VENDORS.some(v => o.includes(v));
}
window.PLANNER.AFFINITY_GROUPS = AFFINITY_GROUPS;

async function loadAffinityJSON(urlOverride) {
  const url = urlOverride || (PLANNER_CDN_BASE ? PLANNER_CDN_BASE + 'affinity_data.json' : null);
  if (!url) throw new Error("CDN base URL not detected");
  const resp = await fetch(url);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const json = await resp.json();
  // json = { h: [colName, ...], d: { GID: [v0, v1, ...], ... } }
  const headers = json.h;
  const rawData = json.d;
  const map = new Map();
  for (const [gid, vals] of Object.entries(rawData)) {
    const rec = {};
    for (let i = 0; i < headers.length; i++) {
      const v = vals[i];
      if (v !== null && v !== undefined && v !== 0) rec[headers[i]] = v;
    }
    map.set(gid, rec);
  }
  state.affinityMap = map;

  // Precompute per-segment stats: coverage at thresholds 1.0, 1.3, 1.5, 2.0
  const stats = {};
  const total = map.size;
  for (const seg of headers) {
    if (AFFINITY_SKIP_COLS.has(seg)) continue;
    let sum = 0, n = 0, c10 = 0, c11 = 0, c12 = 0, c13 = 0, c15 = 0, c20 = 0;
    for (const rec of map.values()) {
      const v = rec[seg] ?? 0;
      if (v > 0) { sum += v; n++; }
      if (v >= 1.0) c10++;
      if (v >= 1.1) c11++;
      if (v >= 1.2) c12++;
      if (v >= 1.3) c13++;
      if (v >= 1.5) c15++;
      if (v >= 2.0) c20++;
    }
    stats[seg] = { mean: n > 0 ? Math.round(sum / n * 100) / 100 : 0, total, c10, c11, c12, c13, c15, c20 };
  }
  state.affinityStats = stats;

  window.dispatchEvent(new CustomEvent("planner:affinity-loaded", { detail: { count: map.size } }));
  return map.size;
}
window.PLANNER.loadAffinityJSON = loadAffinityJSON;

function getReachModeFromUI() {
  return document.querySelector('input[name="reach_mode"]:checked')?.value || "balanced";
}

// ===== Приоритет операторов при подборе экранов =====
// Экраны preferred-операторов идут первыми внутри каждой географической ячейки.
// Порядок важен: чем меньше индекс, тем выше приоритет.
const PREFERRED_OWNER_KEYWORDS = [
  "рим",           // 1
  "рц",            // 2  (РЦ / Рекламный центр)
  "расверо",       // 3
  "хэт-трик",      // 4
  "мособлреклама", // 5
  "инсайт медиа",  // 6
  "аффикс",        // 7
  "санлайт",       // 8  (СанЛайт / Sunlight)
  "sunlight",      // 8  alias
  "илан",          // 9
  "аляска",        // 10
  "rgb",           // 11
  "postex",        // 12
  "lume",          // 13
];

function ownerPriority(screen) {
  const owner = String(screen.owner ?? screen.Owner ?? "").toLowerCase();
  for (let i = 0; i < PREFERRED_OWNER_KEYWORDS.length; i++) {
    if (owner.includes(PREFERRED_OWNER_KEYWORDS[i])) return i + 1;
  }
  return PREFERRED_OWNER_KEYWORDS.length + 1; // все остальные — ниже
}

// Russ Outdoor screens use OTS-based (CPM) pricing instead of per-play
const isRussScreen = s => String(s.owner ?? s.Owner ?? "").toLowerCase().includes("russ");

function targetPlaysPerHourPerScreen(mode) {
  // max_reach = больше всего экранов (низкий pph → нужно больше экранов)
  // balanced   = средне
  // max_freq   = меньше всего экранов (высокий pph → концентрируем показы)
  if (mode === "max_reach") return 5;
  if (mode === "max_freq")  return 50;
  return 25; // balanced
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

// ===== Event Logging (Google Sheets webhook) =====
const LOG_WEBHOOK_URL = window.LOG_WEBHOOK_URL ||
  "https://script.google.com/macros/s/AKfycbzRDpqKB9DupqXeBaiMrWkQTakHZxb7Nr-75afBl6481KXxFI3cFUEiXDxNzj9iP9pN/exec";

function logEvent(eventName) {
  try {
    const calc  = window.PLANNER?.lastCalc;
    const brief = calc?.brief || {};
    const meta  = calc?.meta  || {};
    const email = getDspUserEmail?.() || window.sessionStorage?.getItem("dsp_user_email") || "—";

    const regions = (brief.geo?.regions || []).join(", ");
    const formats = brief.formats?.mode === "auto"
      ? "Все"
      : (brief.formats?.selected || []).join(", ");
    const budget  = meta.totalBudget || brief.budget?.amount || "";
    const dates   = brief.dates?.start && brief.dates?.end
      ? `${brief.dates.start} — ${brief.dates.end}` : "";
    const strategy = brief.reachMode || "";
    const screens  = calc?.chosen?.length ?? "";
    const plays    = meta.totalPlays ?? "";
    const ots      = meta.totalOts ?? "";

    const payload = { event: eventName, email, regions, formats, budget, dates, strategy, screens, plays, ots };

    if (navigator.sendBeacon) {
      navigator.sendBeacon(LOG_WEBHOOK_URL, JSON.stringify(payload));
    } else {
      fetch(LOG_WEBHOOK_URL, {
        method: "POST", body: JSON.stringify(payload),
        headers: { "Content-Type": "text/plain" }, // text/plain avoids CORS preflight
        keepalive: true
      }).catch(() => {});
    }
    console.log("[log]", eventName, payload);
  } catch (e) {
    console.warn("[log] error:", e);
  }
}

/**
 * Ray-casting point-in-polygon.
 * polygon: [[lat, lon], ...]  (closed or open — doesn't matter)
 */
function pointInPolygon(lat, lon, polygon) {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [yi, xi] = polygon[i];
    const [yj, xj] = polygon[j];
    const intersect = ((xi > lon) !== (xj > lon)) &&
      (lat < (yj - yi) * (lon - xi) / (xj - xi) + yi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Count screensAll inside current polygon filter */
function countScreensInPolygon(polygon, screens) {
  if (!polygon || polygon.length < 3) return 0;
  return (screens || state.screensAll).filter(
    s => Number.isFinite(s.lat) && Number.isFinite(s.lon) && pointInPolygon(s.lat, s.lon, polygon)
  ).length;
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

// Like avgNumber but treats 0 as missing data (useful for OTS where 0 = no data)
function avgNumberNonZero(arr) {
  let sum = 0, cnt = 0;
  for (const v of arr) {
    if (Number.isFinite(v) && v > 0) { sum += v; cnt++; }
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

  // weekly: compute average hours/day over the 7-day week from declared intervals
  if (schedule?.type === "weekly") {
    const DOW_KEYS = ["mon","tue","wed","thu","fri","sat","sun"];
    const mode = schedule.mode || "by_dow";
    const weekly = schedule.weekly || {};
    const globalIntervals = Array.isArray(schedule.globalIntervals) ? schedule.globalIntervals : [];
    let totalWeeklyHours = 0;
    for (const key of DOW_KEYS) {
      if (mode === "global") {
        totalWeeklyHours += _hoursForWeekdayIntervals(globalIntervals);
      } else {
        totalWeeklyHours += _hoursForWeekdayIntervals(weekly[key]);
      }
    }
    return totalWeeklyHours / 7;
  }

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
  // Разброс часов по дням: в медиаплане нужен диапазон («5–10»), а не среднее
  // арифметическое за период. Дни без вещания в диапазон не входят, иначе любой
  // график с выходным превращался бы в «0–10».
  let minHpd = null, maxHpd = null;

  const start = new Date(startStr + "T00:00:00");
  for (let i = 0; i < days; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);

    const dayHours = (mode === "global")
      ? _hoursForWeekdayIntervals(globalIntervals)
      : _hoursForWeekdayIntervals(weekly[_weekdayKeyFromDate(dt)]);

    totalHours += dayHours;
    if (dayHours > 0) {
      minHpd = (minHpd == null) ? dayHours : Math.min(minHpd, dayHours);
      maxHpd = (maxHpd == null) ? dayHours : Math.max(maxHpd, dayHours);
    }
  }

  const avgHpd = days ? (totalHours / days) : 0;
  return { days, totalHours, avgHpd, minHpd: minHpd ?? 0, maxHpd: maxHpd ?? 0 };
}

  const hpd = hoursPerDay(schedule || { type: "all_day" });
  return { days, totalHours: hpd * days, avgHpd: hpd, minHpd: hpd, maxHpd: hpd };
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

  // Новая модель: блоки [{days, times:[{from,to}]}]
  const groups = window.PLANNER?.state?.weeklyGroups;
  if (Array.isArray(groups) && groups.length) {
    for (const grp of groups) {
      for (const t of (grp.times || [])) {
        if (!t.from || !t.to) continue;
        for (const k of keys) {
          if (grp.days?.[k]) out[k].push({ from: t.from, to: t.to });
        }
      }
    }
    return out;
  }

  // Fallback: старая модель weeklyIntervals
  const intervals = window.PLANNER?.state?.weeklyIntervals;
  if (Array.isArray(intervals)) {
    for (const intv of intervals) {
      if (!intv.from || !intv.to) continue;
      for (const k of keys) {
        if (intv.days?.[k]) out[k].push({ from: intv.from, to: intv.to });
      }
    }
    return out;
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

function getScreensFilteredByOwner(pool) {
  const sel = state.selectedOwners;
  if (!sel || sel.size === 0) return pool;
  return (pool || []).filter(s => sel.has(String(s.owner ?? "").trim()));
}

// ===== UI: selection extra =====
function renderSelectionExtra() {
  const mode = el("selection-mode")?.value || "city_even";
  const extra = el("selection-extra");
  if (!extra) return;
  extra.innerHTML = "";

  if (mode === "near_address") {
    extra.innerHTML = `
      <!-- Список адресов (сворачивается) -->
      <div id="addr-list-wrap" style="margin-bottom:8px;">
        <div id="addr-list" style="display:flex; flex-direction:column; gap:6px;"></div>
        <button type="button" id="addr-list-toggle" style="display:none; margin-top:6px; width:100%;
          padding:7px; border:1px solid #e0d9ff; border-radius:10px; background:#faf8ff;
          color:#5B3EF5; font-size:12px; cursor:pointer; font-weight:500;">
          Показать все адреса
        </button>
      </div>

      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:8px;">
        <button type="button" id="addr-add-btn" style="
          flex:1; min-width:110px; padding:8px; border:1.5px dashed #c4b5fd; border-radius:10px;
          background:#faf8ff; color:#5B3EF5; font-size:13px; cursor:pointer;">
          + Добавить адрес
        </button>
        <button type="button" id="addr-import-btn" style="
          flex:1; min-width:110px; padding:8px; border:1.5px dashed #c4b5fd; border-radius:10px;
          background:#faf8ff; color:#5B3EF5; font-size:13px; cursor:pointer;">
          ↓ Импортировать список
        </button>
        <button type="button" id="addr-2gis-btn" style="
          flex:1; min-width:110px; padding:8px; border:1.5px dashed #1DB244; border-radius:10px;
          background:#f4fdf7; color:#1DB244; font-size:13px; cursor:pointer;">
          2ГИС: подобрать
        </button>
      </div>

      <!-- Панель импорта (скрыта по умолчанию) -->
      <div id="addr-import-panel" style="display:none; background:#f8f7ff; border:1px solid #c4b5fd;
           border-radius:12px; padding:12px; margin-bottom:8px;">
        <div style="font-size:12px; font-weight:600; color:#5B3EF5; margin-bottom:8px;">
          Вставьте адреса (по одному на строку) или загрузите файл (.xlsx, .csv, .txt):
        </div>
        <textarea id="addr-paste-area" rows="6" placeholder="ул. Ленина 1, Москва&#10;пр. Мира 10, Москва&#10;…"
          style="width:100%; box-sizing:border-box; padding:8px; border:1px solid #ddd;
                 border-radius:8px; font-size:13px; resize:vertical; font-family:inherit;"></textarea>
        <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
          <label style="display:inline-flex; align-items:center; gap:6px; padding:8px 14px;
                 border:1px solid #c4b5fd; border-radius:8px; background:#fff;
                 color:#5B3EF5; font-size:13px; cursor:pointer;">
            📂 Загрузить файл
            <input type="file" id="addr-file-input" accept=".xlsx,.csv,.txt" style="display:none;">
          </label>
          <button type="button" id="addr-import-apply" style="
            padding:8px 18px; background:#5B3EF5; color:#fff; border:none;
            border-radius:8px; font-size:13px; font-weight:600; cursor:pointer;">
            Добавить адреса
          </button>
          <button type="button" id="addr-import-cancel" style="
            padding:8px 14px; background:#fff; color:#888; border:1px solid #ddd;
            border-radius:8px; font-size:13px; cursor:pointer;">
            Отмена
          </button>
          <span id="addr-import-status" style="font-size:12px; color:#667085;"></span>
        </div>
      </div>

      <!-- Панель 2ГИС: подбор адресов по бренду -->
      <div id="addr-2gis-panel" style="display:none; background:#f4fdf7; border:1px solid #1DB244;
           border-radius:12px; padding:12px; margin-bottom:8px;">
        <div style="font-size:12px; font-weight:600; color:#1DB244; margin-bottom:8px;">
          Нет готового списка? Найдём адреса объектов в выбранных регионах и подставим их сюда.
        </div>
        <input type="text" id="addr-2gis-brand" placeholder="Напр.: Пятёрочка, Магнит, McDonald's"
          style="width:100%; box-sizing:border-box; padding:9px 12px; border:1px solid #b7e3c6;
                 border-radius:8px; font-size:13px; outline:none;">
        <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
          <button type="button" id="addr-2gis-apply" style="
            padding:8px 18px; background:#1DB244; color:#fff; border:none;
            border-radius:8px; font-size:13px; font-weight:600; cursor:pointer;">
            Найти адреса
          </button>
          <button type="button" id="addr-2gis-cancel" style="
            padding:8px 14px; background:#fff; color:#888; border:1px solid #ddd;
            border-radius:8px; font-size:13px; cursor:pointer;">
            Отмена
          </button>
          <span id="addr-2gis-status" style="font-size:12px; color:#667085;"></span>
        </div>
      </div>

      <input id="planner-radius" type="number" min="50" value="500" placeholder="Радиус, м"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-top:4px;">
      <div style="font-size:12px; color:#666; margin-top:6px;">
        Геокодируем каждый адрес и берём экраны в радиусе от любого из них.
        Число справа от адреса — сколько экранов попадает в радиус.
      </div>
    `;

    // Кэш координат: адрес → точка. Живёт в state, поэтому onCalcClick не геокодирует
    // повторно то, что уже посчитано здесь.
    state.addressPoints = state.addressPoints || new Map();

    const currentRadius = () => Math.max(1, Number(el("planner-radius")?.value || 500));

    // Подсказку региона добавляем ТОЛЬКО если города ещё нет в самом адресе:
    // геокодер получает запрос вида «регион, адрес», и на «Москва, Тверская 7,
    // Москва» ничего не находит, хотя без подсказки находит сразу.
    function regionHintFor(addr) {
      const region = (Array.isArray(state.selectedRegions) && state.selectedRegions[0]) || "";
      if (!region) return "";
      const a = normalizeGeoName(addr);
      const r = normalizeGeoName(region);
      return (r && a.includes(r)) ? "" : region;
    }

    // Пул для подсчёта: экраны выбранных регионов. Если регион не выбран или ничего
    // не совпало — считаем по всему инвентарю, иначе счётчик молча показывал бы 0.
    function addrPool() {
      const all = (Array.isArray(state.screensAll) && state.screensAll.length)
        ? state.screensAll
        : (Array.isArray(state.screens) ? state.screens : []);
      const regions = Array.isArray(state.selectedRegions) ? state.selectedRegions : [];
      if (!regions.length) return all;
      const inRegion = all.filter(s => regions.some(r => screenMatchesGeoChoice(s, r)));
      return inRegion.length ? inRegion : all;
    }

    function setRowStatus(row, text, color, title) {
      const st = row.querySelector(".addr-status");
      if (!st) return;
      st.textContent = text;
      st.style.color = color || "#667085";
      st.title = title || "";
    }

    // Геокодирует (если координат ещё нет) и считает экраны в радиусе.
    // countOnly — пересчёт после смены радиуса, без повторного геокодирования.
    async function resolveRow(row, countOnly) {
      const inp = row.querySelector(".planner-addr-input");
      if (!inp) return;
      const addr = String(inp.value || "").trim();
      if (!addr) { setRowStatus(row, "", "#667085"); return; }

      const key = normalizeKey(addr);
      let pt = state.addressPoints.get(key);

      if (!pt && !countOnly) {
        setRowStatus(row, "⏳", "#8b83c5", "Ищу адрес на карте…");
        const token = ++row._resolveToken;
        try {
          pt = await geocodeAddressNominatim(addr, regionHintFor(addr));
        } catch (e) {
          console.warn("[addr] geocode failed:", e.message);
          pt = null;
        }
        // Пока шёл запрос, адрес могли переписать — тогда результат уже не про эту строку.
        if (token !== row._resolveToken) return;
        if (pt) state.addressPoints.set(key, pt);
      }

      if (!pt) { setRowStatus(row, "не найден", "#dc2626", "Уточните город, улицу и дом"); return; }

      const n = pickScreensNearPoint(addrPool(), pt, currentRadius()).length;
      setRowStatus(row, n ? `${n} экр.` : "0 экр.",
        n ? "#5b3ef5" : "#dc2626",
        n ? `Экранов в радиусе ${currentRadius()} м` : "В этом радиусе экранов нет — увеличьте радиус");
    }

    function scheduleResolve(row) {
      clearTimeout(row._resolveTimer);
      row._resolveTimer = setTimeout(() => resolveRow(row, false), 700);
    }

    function recountAll(countOnly) {
      document.querySelectorAll("#addr-list .addr-row").forEach(row => resolveRow(row, countOnly));
    }

    function addAddressRow(value, point) {
      const list = el("addr-list");
      if (!list) return;
      const row = document.createElement("div");
      row.className = "addr-row";
      row.style.cssText = "display:flex; gap:6px; align-items:center;";
      row._resolveToken = 0;

      const inp = document.createElement("input");
      inp.type = "text"; inp.placeholder = "Адрес";
      inp.value = value || "";
      inp.style.cssText = "flex:1; padding:10px; border:1px solid #ddd; border-radius:10px; font-size:14px; min-width:0;";
      inp.className = "planner-addr-input";

      // Счётчик экранов рядом с адресом: без него непонятно, что даст этот адрес,
      // пока не нажмёшь «Рассчитать».
      const status = document.createElement("span");
      status.className = "addr-status";
      status.style.cssText = "min-width:62px; text-align:right; font-size:12px; font-weight:600; color:#667085; white-space:nowrap;";

      const del = document.createElement("button");
      del.type = "button"; del.textContent = "×";
      del.style.cssText = "background:none; border:none; font-size:20px; color:#aaa; cursor:pointer; line-height:1; padding:0 4px;";
      del.addEventListener("click", () => { row.remove(); });

      row.appendChild(inp); row.appendChild(status); row.appendChild(del);
      list.appendChild(row);
      attachAddressSuggest(inp);

      inp.addEventListener("input", () => scheduleResolve(row));
      inp.addEventListener("change", () => scheduleResolve(row));

      // Координаты из 2ГИС известны сразу — геокодировать нечего, только считаем.
      if (point && Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
        state.addressPoints.set(normalizeKey(value || ""), { lat: point.lat, lon: point.lon });
      }
      if (value) resolveRow(row, false);
      return inp;
    }

    const ADDR_COLLAPSE_LIMIT = 5;
    let addrCollapsed = false;

    function updateAddrToggle() {
      const list    = el("addr-list");
      const toggle  = el("addr-list-toggle");
      if (!list || !toggle) return;
      const rows = list.querySelectorAll(".addr-row");
      if (rows.length <= ADDR_COLLAPSE_LIMIT) {
        rows.forEach(r => r.style.display = "flex");
        toggle.style.display = "none";
        addrCollapsed = false;
        return;
      }
      toggle.style.display = "block";
      rows.forEach((r, i) => { r.style.display = (addrCollapsed && i >= ADDR_COLLAPSE_LIMIT) ? "none" : "flex"; });
      const hidden = addrCollapsed ? rows.length - ADDR_COLLAPSE_LIMIT : 0;
      toggle.textContent = addrCollapsed
        ? `Показать все адреса (ещё ${hidden})`
        : `Свернуть список (${rows.length} адресов)`;
    }

    // items: строки или { address, lat, lon } — второе приходит из 2ГИС вместе с точкой.
    function bulkAddAddresses(items) {
      const clean = (Array.isArray(items) ? items : [])
        .map(it => (typeof it === "string") ? { address: it } : it)
        .filter(it => it && String(it.address || "").trim())
        .map(it => ({ address: String(it.address).trim(), lat: it.lat, lon: it.lon }));
      if (!clean.length) return 0;
      // Убираем пустые строки, чтобы список не начинался с болтающегося поля
      document.querySelectorAll(".planner-addr-input").forEach(i => {
        if (!i.value.trim()) i.closest(".addr-row")?.remove();
      });
      clean.forEach(it => addAddressRow(it.address,
        (Number.isFinite(it.lat) && Number.isFinite(it.lon)) ? { lat: it.lat, lon: it.lon } : null));
      if (clean.length > ADDR_COLLAPSE_LIMIT) addrCollapsed = true;
      updateAddrToggle();
      return clean.length;
    }

    el("addr-list-toggle")?.addEventListener("click", () => {
      addrCollapsed = !addrCollapsed;
      updateAddrToggle();
    });

    addAddressRow(); // первый адрес

    // Список адресов пересобирается этой функцией с нуля, поэтому снаружи
    // (restoreBriefToUI) его не заполнить — отдаём точку входа.
    window.PLANNER = window.PLANNER || {};
    window.PLANNER.setAddresses = (list) => bulkAddAddresses(Array.isArray(list) ? list : []);

    // Смена радиуса не требует повторного геокодирования — только пересчёта.
    el("planner-radius")?.addEventListener("input", () => recountAll(true));
    // Инвентарь или регионы поменялись — счётчики устарели.
    window.addEventListener("planner:screens-ready", () => recountAll(true));
    window.addEventListener("planner:pool-updated", () => recountAll(true));

    el("addr-add-btn")?.addEventListener("click", () => {
      const inp = addAddressRow();
      inp?.focus();
    });

    // Кнопка открытия панели импорта
    el("addr-import-btn")?.addEventListener("click", () => {
      const panel = el("addr-import-panel");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
    });

    el("addr-import-cancel")?.addEventListener("click", () => {
      const panel = el("addr-import-panel");
      if (panel) panel.style.display = "none";
    });

    // ---- 2ГИС: подбор адресов по бренду ----
    el("addr-2gis-btn")?.addEventListener("click", () => {
      const panel = el("addr-2gis-panel");
      if (panel) panel.style.display = panel.style.display === "none" ? "block" : "none";
      el("addr-2gis-brand")?.focus();
    });
    el("addr-2gis-cancel")?.addEventListener("click", () => {
      const panel = el("addr-2gis-panel");
      if (panel) panel.style.display = "none";
    });

    el("addr-2gis-apply")?.addEventListener("click", async () => {
      const btn    = el("addr-2gis-apply");
      const status = el("addr-2gis-status");
      const brand  = String(el("addr-2gis-brand")?.value || "").trim();
      if (!brand) { if (status) { status.textContent = "Введите название бренда."; status.style.color = "#dc2626"; } return; }

      const pool = addrPool();
      const withCoords = pool.filter(s => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon)));
      if (!withCoords.length) {
        if (status) { status.textContent = "Инвентарь ещё загружается."; status.style.color = "#dc2626"; }
        return;
      }
      // Центр поиска — центроид инвентаря выбранных регионов.
      const cLat = withCoords.reduce((a, s) => a + Number(s.lat), 0) / withCoords.length;
      const cLon = withCoords.reduce((a, s) => a + Number(s.lon), 0) / withCoords.length;

      btn.disabled = true;
      const btnText = btn.textContent;
      btn.textContent = "Ищу…";
      if (status) { status.style.color = "#667085"; status.textContent = "Загружаю объекты 2ГИС…"; }

      try {
        const found = await fetch2gisAddresses(brand, cLat, cLon, (n, total) => {
          if (status) status.textContent = `Загружаю объекты 2ГИС: ${n}` + (total ? ` из ${total}` : "");
        });
        if (!found.length) {
          if (status) { status.textContent = `2ГИС не нашёл «${brand}» в этих регионах.`; status.style.color = "#dc2626"; }
        } else {
          const added = bulkAddAddresses(found);
          if (status) { status.textContent = `Добавлено адресов: ${added}`; status.style.color = "#1DB244"; }
          const panel = el("addr-2gis-panel");
          if (panel) panel.style.display = "none";
        }
      } catch (err) {
        console.error("[2gis]", err);
        if (status) { status.textContent = "Ошибка: " + err.message; status.style.color = "#dc2626"; }
      } finally {
        btn.disabled = false;
        btn.textContent = btnText;
      }
    });

    // Загрузка файла — авто-добавление без нажатия кнопки
    el("addr-file-input")?.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const status = el("addr-import-status");
      if (status) status.textContent = "Читаю файл…";
      const name = file.name.toLowerCase();
      try {
        let lines = [];

        if (name.endsWith(".txt")) {
          const text = await file.text();
          lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        } else if (name.endsWith(".csv")) {
          const text = await file.text();
          // Detect header row
          const result = window.Papa?.parse(text, { header: true, skipEmptyLines: true });
          if (result?.data?.length) {
            lines = _extractAddrLines(result.data);
          } else {
            // No header — use first column
            const r2 = window.Papa?.parse(text, { skipEmptyLines: true });
            lines = (r2?.data || []).map(row => String(row[0] || "").trim()).filter(Boolean);
          }

        } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
          const buf = await file.arrayBuffer();
          const wb  = window.XLSX?.read(buf, { type: "array" });
          const ws  = wb?.Sheets?.[wb.SheetNames[0]];
          const rows = window.XLSX?.utils?.sheet_to_json(ws, { defval: "" }) || [];
          if (rows.length) {
            lines = _extractAddrLines(rows);
          } else {
            // Fallback: raw array
            const raw = window.XLSX?.utils?.sheet_to_json(ws, { header: 1 }) || [];
            lines = raw.slice(1).map(row => String(row[0] || "").trim()).filter(Boolean);
          }
        }

        // Auto-add immediately
        const added = bulkAddAddresses(lines);
        if (status) status.textContent = added ? `Добавлено: ${added} адресов` : "Нет адресов в файле";
        // Close import panel
        const panel = el("addr-import-panel");
        if (panel && added) panel.style.display = "none";
        // Also update textarea for reference
        const textarea = el("addr-paste-area");
        if (textarea) textarea.value = lines.join("\n");

      } catch(err) {
        if (status) status.textContent = "Ошибка чтения файла";
        console.error("[addr-import]", err);
      }
      e.target.value = "";
    });

    // Применить импорт из textarea (ручная вставка)
    el("addr-import-apply")?.addEventListener("click", () => {
      const text = el("addr-paste-area")?.value || "";
      const lines = text.split(/\r?\n/);
      const added = bulkAddAddresses(lines);
      const status = el("addr-import-status");
      if (status) status.textContent = added ? `Добавлено: ${added}` : "Нет адресов";
      if (added) {
        const panel = el("addr-import-panel");
        if (panel) panel.style.display = "none";
        if (el("addr-paste-area")) el("addr-paste-area").value = "";
      }
    });

    return;
  }

  if (mode === "manual_screens") {
    // GID textarea lives in step 1 (geo-gids-block) — don't re-render
    if (el("manual-gids")) { extra.innerHTML = ""; return; }
    // Fallback: render inline (legacy / direct embed)
    extra.innerHTML = `
      <textarea id="manual-gids"
        placeholder="Вставьте GID-ы экранов — по одному на строку или через запятую/пробел/таб.&#10;&#10;Пример:&#10;GID-12345&#10;GID-67890, GID-11111"
        style="width:100%; height:130px; padding:10px; border:1px solid #ddd; border-radius:10px;
               font-size:13px; resize:vertical; box-sizing:border-box; font-family:monospace;"></textarea>
      <div id="manual-gids-status" style="font-size:12px; color:#666; margin-top:6px;">
        Введите GID-ы — после расчёта будут использованы только эти экраны.
      </div>
      <button id="manual-gids-download-unmatched" type="button" style="display:none; margin-top:8px;
        padding:6px 14px; background:#fff3cd; border:1px solid #ffc107; border-radius:8px;
        font-size:12px; color:#856404; cursor:pointer; font-weight:600;">
        ↓ Скачать не найденные GID-ы
      </button>
    `;

    // Живой счётчик совпадений при вводе
    const ta = el("manual-gids");
    const statusEl = el("manual-gids-status");
    if (ta && statusEl) {
      ta.addEventListener("input", () => {
        const ids = _parseManualGids(ta.value);
        if (!ids.size) {
          statusEl.textContent = "Введите GID-ы — после расчёта будут использованы только эти экраны.";
          statusEl.style.color = "#666";
          return;
        }
        const allScreens = state.screens || [];
        const matched = allScreens.filter(s => ids.has(_screenIdOf(s)));
        statusEl.textContent = `Найдено в инвентаре: ${matched.length} из ${ids.size} указанных GID-ов`;
        statusEl.style.color = matched.length > 0 ? "#5b3ef5" : "#dc2626";
      });
    }
    return;
  }
}

// Парсит текст с GID-ами → Set строк
function _parseManualGids(text) {
  const raw = String(text || "");
  // Split only on newlines/commas/semicolons/tabs — NOT spaces, since GIDs can contain spaces
  const tokens = raw.split(/[\n,;\r\t]+/).map(t => t.trim()).filter(Boolean);
  return new Set(tokens);
}

// ===== City -> Region loader =====
async function loadCityRegions() {
  try {
    const res = await fetch(CITY_REGIONS_URL, { cache: "force-cache" });
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

const _MUNICIPAL_PREFIXES = /^(городской\s+округ|муниципальный\s+округ|муниципальный\s+район|г\.\s*о\.\s*|г\.\s*|город\s+)/i;

function normalizeGeoName(s) {
  return normalizeKey(String(s || "").replace(_MUNICIPAL_PREFIXES, ""));
}

function screenMatchesGeoChoice(screen, choice) {
  const pick = normalizeGeoName(choice);
  if (!pick) return false;
  const r = normalizeGeoName(screen?.region || "");
  const c = normalizeGeoName(screen?.city || "");
  return (
    r === pick || c === pick ||
    (r && (r.includes(pick) || pick.includes(r))) ||
    (c && (c.includes(pick) || pick.includes(c)))
  );
}

function getRegionForCity(city) {
  const map = window.PLANNER?.cityRegions;
  if (!map) return "Не назначено";
  const r = map[normalizeKey(city)] ?? map[normalizeGeoName(city)];
  return (typeof r === "string" && r.trim()) ? r.trim() : "Не назначено";
}

function isLikelyAddressLikeName(value) {
  const s = normalizeKey(value);
  if (!s) return false;
  if (/\d/.test(s)) return true;
  if (/[«»"']/u.test(String(value || ""))) return true;
  if (/\s-\s/.test(String(value || ""))) return true;
  return /(ул|улица|проспект|пр-т|шоссе|проезд|пер|переулок|наб|набережная|бульвар|пл|площадь|ост\.|остановк|дом|д\.)/.test(s);
}

function getRegionForDspCity(city) {
  const raw = String(city || "").trim();
  if (!raw) return "Не назначено";

  const mapped = getRegionForCity(raw);
  if (mapped !== "Не назначено") return mapped;

  if (isLikelyAddressLikeName(raw)) return "Не назначено";
  return raw;
}

// ===== Regions UI (мультивыбор) =====
const REGIONS_COLLAPSE_LIMIT = 10;
if (typeof state._regionsCollapsed === "undefined") state._regionsCollapsed = false;

function renderSelectedRegions() {
  const wrap = el("region-selected");
  if (!wrap) return;

  const clearBtn = el("regions-clear");

  const regions = Array.isArray(state.selectedRegions)
    ? state.selectedRegions.map(r => String(r || "").trim()).filter(Boolean)
    : [];

  wrap.innerHTML = "";

  if (clearBtn) clearBtn.style.display = regions.length ? "inline-block" : "none";

  const visible = state._regionsCollapsed ? regions.slice(0, REGIONS_COLLAPSE_LIMIT) : regions;

  visible.forEach((r) => {
    const chip = document.createElement("div");
    chip.className = "chip";
    chip.style.cssText = "display:inline-flex; align-items:center; gap:8px; padding:6px 10px; border:1px solid #ddd; border-radius:999px; background:#fff;";

    const label = document.createElement("span");
    label.textContent = r;

    const x = document.createElement("button");
    x.type = "button"; x.textContent = "×";
    x.setAttribute("aria-label", `Удалить ${r}`);
    x.style.cssText = "border:0; background:transparent; cursor:pointer; font-size:18px; line-height:1; padding:0 2px;";

    x.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      state.selectedRegions = (state.selectedRegions || []).filter(xx => String(xx).trim() !== r);
      state.selectedRegion = (state.selectedRegions[0] || null);
      if (state.selectedRegions.length <= REGIONS_COLLAPSE_LIMIT) state._regionsCollapsed = false;
      renderSelectedRegions();
      renderFormats();
      renderProgress();
      window.dispatchEvent(new CustomEvent("planner:pool-updated"));
    });

    chip.appendChild(label); chip.appendChild(x);
    wrap.appendChild(chip);
  });

  // Toggle button
  if (regions.length > REGIONS_COLLAPSE_LIMIT) {
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.style.cssText = "margin-top:6px; width:100%; padding:6px; border:1px solid #e0d9ff; border-radius:10px; background:#faf8ff; color:#5B3EF5; font-size:12px; cursor:pointer; font-weight:500;";
    const hidden = regions.length - REGIONS_COLLAPSE_LIMIT;
    toggle.textContent = state._regionsCollapsed
      ? `Показать все регионы (ещё ${hidden})`
      : `Свернуть (${regions.length} регионов)`;
    toggle.addEventListener("click", () => {
      state._regionsCollapsed = !state._regionsCollapsed;
      renderSelectedRegions();
    });
    wrap.appendChild(toggle);
  }
}

function renderRegionSuggestions(q) {
  const sug = el("city-suggestions");
  if (!sug) return;
  sug.innerHTML = "";
  if (!q) return;

  if (!Array.isArray(state.selectedRegions)) state.selectedRegions = [];

  const qq = q.toLowerCase();
  // Search regions first, then fall back to cities not covered by a region name
  const regionMatches = state.regionsAll.filter(r => r.toLowerCase().includes(qq));
  const cityMatches = (state.citiesAll || [])
    .filter(c => c.toLowerCase().includes(qq) && !state.regionsAll.includes(c))
    .slice(0, 6);
  const matches = [...new Set([...regionMatches, ...cityMatches])].slice(0, 12);

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
      renderFormats();
      renderProgress();
      window.dispatchEvent(new CustomEvent("planner:pool-updated"));
    });

    sug.appendChild(b);
  });
}

// ===== Data load =====
async function loadScreens() {
  setStatus("Загружаю список экранов…");
  console.log("[screens] url:", SCREENS_CSV_URL);

  const res = await fetch(SCREENS_CSV_URL, { cache: "force-cache" });
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
      otsBid: toNumber(r.otsBid ?? r.ots_bid ?? r.cpm ?? r.CPM ?? r.ots_cpm),
      ots: toNumber(r.ots ?? r.OTS),
      grp: toNumber(r.grp ?? r.GRP),
      lat: toNumber(r.lat ?? r.Lat ?? r.LAT),
      lon: toNumber(r.lon ?? r.Lon ?? r.LON ?? r.lng ?? r.Lng ?? r.LNG)
    };
  });

  // Interpolate missing OTS (ots=0 or NaN) using average OTS of screens
  // with the same format. This prevents zero-OTS screens from dragging
  // down the pool average when some screens simply lack measurement data.
  // Exception: Магнит screens always keep OTS=0 (their data is unreliable).
  const isMagnitScreen = s => {
    const o = String(s.owner ?? "").toLowerCase();
    return o.includes("магнит") || _ZERO_OTS_OWNERS.some(k => o.includes(k));
  };
  const otsByFormat = {};
  for (const s of state.screens) {
    if (isMagnitScreen(s)) continue; // exclude from average computation
    if (Number.isFinite(s.ots) && s.ots > 0 && s.format) {
      if (!otsByFormat[s.format]) otsByFormat[s.format] = { sum: 0, cnt: 0 };
      otsByFormat[s.format].sum += s.ots;
      otsByFormat[s.format].cnt++;
    }
  }
  for (const s of state.screens) {
    if (isMagnitScreen(s)) { s.ots = 0; s._otsInterpolated = false; continue; } // Магнит: OTS = 0, no interpolation
    if (!(Number.isFinite(s.ots) && s.ots > 0) && s.format && otsByFormat[s.format]) {
      s.ots = otsByFormat[s.format].sum / otsByFormat[s.format].cnt;
      s._otsInterpolated = true; // mark: real measurement may arrive later from forecast API
    } else {
      s._otsInterpolated = false; // has real OTS — don't overwrite
    }
  }

  // ── OTS cap: убираем аномально высокие значения ──────────────────────────
  // Данные по выбросам на основе анализа инвентаря (percentile 99 + запас):
  // BILLBOARD  p99=125  → cap 150   (Russ Outdoor ЮВХ выбросы до 6061)
  // SUPERSITE  p99=196  → cap 200
  // OTHER               → cap 100
  // MEDIAFACADE p99≈1645 → cap 2000  (фасады — высокий OTS норм, но 2224+ лишнее)
  const OTS_CAPS = {
    BILLBOARD:   150,
    SUPERSITE:   200,
    OTHER:       100,
    MEDIAFACADE: 2000,
  };
  for (const s of state.screens) {
    const cap = OTS_CAPS[s.format];
    if (cap && Number.isFinite(s.ots) && s.ots > cap) {
      s.ots = cap;
    }
  }

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
  // Карточки операторов рендерит widget.html (own-card).
  // Здесь только уведомляем его об изменении данных через событие.
  window.dispatchEvent(new CustomEvent("planner:filters-changed"));
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

    const selRegions = Array.isArray(state.selectedRegions) && state.selectedRegions.length > 0
      ? state.selectedRegions : null;
    const poolForCount = selRegions
      ? state.screensAll.filter(s => selRegions.includes(s.region))
      : state.screensAll;
    const fmtCount = poolForCount.filter(s => s.format === fmt).length;
    const fmtCountTxt = fmtCount > 0 ? `${fmtCount} экр.` : "";
    b.innerHTML = `
      <div style="font-weight:700;">${escapeHtml(meta.label)}</div>
      <div style="font-size:12px; color:#666;">${escapeHtml(meta.desc)}</div>
      ${fmtCountTxt ? `<div style="font-size:11px; color:#999; margin-top:4px;">${fmtCountTxt}</div>` : ""}
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
  const goalPlaysVal = Number(el("goal-plays")?.value || 0);

  const commEnabled = !!el("commission-enabled")?.checked;
  const commRate    = commEnabled ? Math.max(0, Number(el("commission-rate")?.value || 0)) : 0;
  const budgetNet   = (budgetMode === "fixed" && commRate > 0)
    ? budgetVal / (1 + commRate / 100)
    : budgetVal;

  const budgetOk =
    (budgetMode === "recommendation") ||
    (budgetMode === "fixed" && budgetVal > 0) ||
    (budgetMode === "goal_ots" && goalOtsVal > 0) ||
    (budgetMode === "goal_plays" && goalPlaysVal > 0);

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
      amount: budgetMode === "fixed" ? Number(budgetNet || 0) : null,
      // amount — за вычетом комиссии (в расчёт идёт именно он), amountGross — то,
      // что реально введено в поле. Без gross восстановление из истории подставляло
      // бы в поле сумму без комиссии, и бюджет «худел» на каждый заход.
      amountGross: budgetMode === "fixed" ? Number(budgetVal || 0) : null,
      currency: "RUB",
      perCity: (() => {
        if (budgetMode !== "fixed" || !document.getElementById("per-city-enabled")?.checked) return null;
        const isPct = window._perCityMode === "pct";
        const totalBudget = Number(document.getElementById("budget-input")?.value || 0);
        const map = {};
        document.querySelectorAll("#per-city-rows .per-city-row").forEach(row => {
          const region = row.dataset.region;
          const val = Number(row.querySelector("input")?.value || 0);
          if (!region || val <= 0) return;
          map[region] = isPct ? Math.floor(totalBudget * val / 100) : val;
        });
        return Object.keys(map).length > 0 ? map : null;
      })()
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
    constructions: {
      enabled:      !!el("constructions-enabled")?.checked,
      count:        toNumber(el("constructions-count")?.value ?? 0),
      // In GID mode: use gid-ppm slider.
      // In city mode: only use constructions-ppm when constructions chip is actually ON.
      playsPerHour: (() => {
        const selMode = el("selection-mode")?.value || "";
        const isGidMode = selMode === "manual_screens" || selMode === "yandex_geo";
        if (isGidMode) return toNumber(el("gid-ppm")?.value ?? 0) || 0;
        if (!el("constructions-enabled")?.checked) return 0; // chip off → no manual ppm
        return toNumber(el("constructions-ppm")?.value ?? 0) || 0;
      })(),
      perRegionCount: (() => {
        const map = {};
        document.querySelectorAll(".cns-region-count-input").forEach(inp => {
          const r = inp.dataset.region; const v = toNumber(inp.value);
          if (r && Number.isFinite(v) && v > 0) map[r] = v;
        });
        return Object.keys(map).length ? map : null;
      })(),
      perRegionPpm: (() => {
        const map = {};
        document.querySelectorAll(".cns-region-ppm-input").forEach(inp => {
          const r = inp.dataset.region; const v = toNumber(inp.value);
          if (r && Number.isFinite(v) && v > 0) map[r] = v;
        });
        return Object.keys(map).length ? map : null;
      })(),
      perFormatCount: (() => {
        const map = {};
        document.querySelectorAll(".cns-format-count-input").forEach(inp => {
          const f = inp.dataset.format; const v = toNumber(inp.value);
          if (f && Number.isFinite(v) && v > 0) map[f] = v;
        });
        return Object.keys(map).length ? map : null;
      })(),
    },
    audience: {
      enabled: !!el("audience-enabled")?.checked,
      segments: (() => {
        const segs = [];
        document.querySelectorAll('#audience-segment-wrap input[type="checkbox"]:checked')
          .forEach(cb => segs.push(cb.value));
        return segs;
      })(),
      topPct: parseInt(el("audience-top-pct")?.value || "10", 10) / 100,
    },
    onlyActiveBids: !!el("only-active-bids")?.checked,
    recoTier: document.querySelector('input[name="reco_tier"]:checked')?.value || "optimal",
    bidMode: el("bid-mode-min")?.checked ? "min" : "recommended",
    bidUpliftPct: (el("bid-uplift-enabled")?.checked)
      ? Math.max(0, Number(el("bid-uplift-pct")?.value || 0))
      : 0,
    duration: { ms: Number.isFinite(state.selectedDurationMs) ? state.selectedDurationMs : null },
    reachMode: getReachModeFromUI(),
    goal: {
      ots: (() => {
        const v = el("goal-ots")?.value;
        const n = toNumber(v);
        return Number.isFinite(n) && n > 0 ? n : null;
      })(),
      plays: (() => {
        const v = el("goal-plays")?.value;
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
    // Collect all address inputs (new multi-address UI)
    const addrInputs = [...document.querySelectorAll(".planner-addr-input")];
    const addresses = addrInputs.map(i => String(i.value || "").trim()).filter(Boolean);
    // Fallback: old single input
    if (!addresses.length) {
      const single = pickAnyVal("#planner-addr", "#addr");
      if (single) addresses.push(single);
    }
    brief.selection.addresses = addresses;
    brief.selection.address   = addresses[0] || ""; // backward compat
    brief.selection.radius_m  = pickAnyNum(500, "#planner-radius", "#radius");
  }
  if (selectionMode === "manual_screens") {
    brief.selection.manual_gids = _parseManualGids(el("manual-gids")?.value || "");
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
    const res = await fetch(TIERS_JSON_URL, { cache: "force-cache" });
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

function _screenIdOf(s) {
  return (s?.screen_id ?? s?.gid ?? s?.GID ?? s?.id ?? "").toString().trim();
}

// Replace a chosen screen with nearest similar one from the pool
function replaceScreen(screenId) {
  const chosen = state.lastChosen;
  if (!chosen || !chosen.length) return null;

  const idx = chosen.findIndex(s => _screenIdOf(s) === String(screenId));
  if (idx < 0) return null;

  const old = chosen[idx];
  const oldLoc = getLatLon(old);
  const dist = window.GeoUtils?.haversineMeters;

  const allScreens = state.screensAll || [];
  const chosenIds = new Set(chosen.map(s => _screenIdOf(s)));

  // Candidates: same format, same region, not chosen, has coordinates
  let candidates = allScreens.filter(s => {
    const sid = _screenIdOf(s);
    if (!sid || chosenIds.has(sid)) return false;
    if (s.format !== old.format) return false;
    if (s.region && old.region && s.region !== old.region) return false;
    const loc = getLatLon(s);
    if (!loc) return false;
    return true;
  });

  // Fallback: any format, same region
  if (!candidates.length) {
    candidates = allScreens.filter(s => {
      const sid = _screenIdOf(s);
      if (!sid || chosenIds.has(sid)) return false;
      if (s.region && old.region && s.region !== old.region) return false;
      return !!getLatLon(s);
    });
  }

  if (!candidates.length) return null;

  // Sort by distance to old screen (if we have old coords and haversine)
  if (oldLoc && dist) {
    candidates.sort((a, b) => {
      const la = getLatLon(a), lb = getLatLon(b);
      const da = dist(oldLoc.lat, oldLoc.lon, la.lat, la.lon);
      const db = dist(oldLoc.lat, oldLoc.lon, lb.lat, lb.lon);
      return da - db;
    });
  }

  const replacement = candidates[0];
  chosen.splice(idx, 1, replacement);

  window.dispatchEvent(new CustomEvent("planner:screen-replaced", {
    detail: { removed: old, added: replacement }
  }));

  return replacement;
}

// ── Manual exclusions: persisted in sessionStorage for the tab lifetime ──
const _EXCL_KEY = "planner_excluded_screens";

function _loadExcluded() {
  try {
    const raw = sessionStorage.getItem(_EXCL_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { return new Set(); }
}

function _saveExcluded(set) {
  try { sessionStorage.setItem(_EXCL_KEY, JSON.stringify([...set])); } catch {}
}

// Restore on load so recalc after page refresh still respects exclusions
if (!state.manuallyExcluded || !state.manuallyExcluded.size) {
  state.manuallyExcluded = _loadExcluded();
}

// Remove a chosen screen (no replacement)
function removeScreen(screenId) {
  const chosen = state.lastChosen;
  if (!chosen || !chosen.length) return false;
  const idx = chosen.findIndex(s => _screenIdOf(s) === String(screenId));
  if (idx < 0) return false;
  const removed = chosen.splice(idx, 1)[0];
  // Remember this exclusion so recalc doesn't add it back
  if (!state.manuallyExcluded) state.manuallyExcluded = new Set();
  state.manuallyExcluded.add(String(screenId));
  _saveExcluded(state.manuallyExcluded);
  window.dispatchEvent(new CustomEvent("planner:screen-removed", {
    detail: { removed }
  }));
  return true;
}

function clearManualExclusions() {
  state.manuallyExcluded = new Set();
  _saveExcluded(state.manuallyExcluded);
  window.dispatchEvent(new CustomEvent("planner:exclusions-cleared"));
}

function pickScreensByMinBid(screens, n) {
  const sorted = [...screens].sort((a, b) => {
    const pa = ownerPriority(a), pb = ownerPriority(b);
    if (pa !== pb) return pa - pb;
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

function computeScreensNeededForPlays(totalPlaysTheory, days, hpd, pphTarget, budgetMode) {
  const maxPlaysPerScreenForPeriod = Math.floor(SC_MAX * days * hpd);
  let screensNeeded = Math.ceil(totalPlaysTheory / Math.max(1, maxPlaysPerScreenForPeriod));
  screensNeeded = Math.max(1, screensNeeded);

  if (budgetMode !== "goal_ots") {
    const playsPerHourTotalTheory = totalPlaysTheory / days / hpd;
    const byStrategy = Math.max(1, Math.ceil(playsPerHourTotalTheory / Math.max(1, pphTarget)));
    const byHardCap = Math.max(1, Math.ceil(playsPerHourTotalTheory / Math.max(1, SC_MAX)));
    screensNeeded = Math.max(screensNeeded, byStrategy, byHardCap);
  }

  return screensNeeded;
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

function pickScreensUniformByGrid(pool, count, stepKm = 2, perCellMax = 2, fmtOrder = null) {
  const cells = groupByGrid(pool, stepKm);
  for (const cell of cells) {
    if (fmtOrder && fmtOrder.length > 0) {
      // Round-robin по форматам внутри ячейки: CF1, MF1, BB1, CF2, CF3, …
      // Это гарантирует, что каждый формат попадёт в первые perCellMax слотов ячейки.
      const byFmt = {};
      for (const s of cell) {
        const f = String(s.format || "").trim();
        if (!byFmt[f]) byFmt[f] = [];
        byFmt[f].push(s);
      }
      const bidSort = (a, b) => {
        const pa = ownerPriority(a), pb = ownerPriority(b);
        if (pa !== pb) return pa - pb;
        return (a.minBid ?? 1e18) - (b.minBid ?? 1e18);
      };
      for (const arr of Object.values(byFmt)) arr.sort(bidSort);
      // Порядок форматов: сначала selected (fmtOrder), потом остальные
      const keys = [...new Set([...fmtOrder, ...Object.keys(byFmt)])].filter(f => byFmt[f]?.length);
      cell.length = 0;
      let anyLeft = true;
      while (anyLeft) {
        anyLeft = false;
        for (const f of keys) {
          if (byFmt[f] && byFmt[f].length) { cell.push(byFmt[f].shift()); anyLeft = true; }
        }
      }
    } else {
      // Сначала приоритетные операторы, внутри приоритета — по minBid (дешевле → выше)
      cell.sort((a, b) => {
        const pa = ownerPriority(a), pb = ownerPriority(b);
        if (pa !== pb) return pa - pb;
        return (a.minBid ?? 1e18) - (b.minBid ?? 1e18);
      });
    }
  }
  cells.sort(() => Math.random() - 0.5);

  const result = [];
  const takenPerCell = new Map();

  let i = 0;
  let consecutiveNoProgress = 0;
  while (result.length < count && cells.length) {
    const cell = cells[i % cells.length];
    const taken = takenPerCell.get(cell) || 0;

    if (taken < perCellMax && cell.length > 0) {
      result.push(cell.shift());
      takenPerCell.set(cell, taken + 1);
      consecutiveNoProgress = 0;
    } else {
      // Cell is maxed out or empty — no progress
      consecutiveNoProgress++;
      if (consecutiveNoProgress >= cells.length) break; // all cells exhausted/maxed
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

// ===== Медиаплан (красивый XLSX через ExcelJS) =====
async function buildMediaPlanBlob() {
  const calc = window.PLANNER?.lastCalc;
  if (!calc) { alert("Сначала нажмите «Рассчитать»."); return null; }

  const ExcelJS = window.ExcelJS;
  if (!ExcelJS) { alert("ExcelJS не загружен — обновите страницу."); return null; }

  const wb = new ExcelJS.Workbook();
  wb.creator = "DSP Planner";

  const brief   = calc.brief   || {};
  const meta    = calc.meta    || {};
  const perReg  = calc.perRegion || [];
  const screens = calc.chosen  || [];

  // ── Download settings ──────────────────────────────────────────
  const showCommDetail  = !!el("dl-show-commission")?.checked;
  const showVatDetail   = !!el("dl-show-vat")?.checked;
  const splitByOperator = !!el("dl-split-operator")?.checked;

  const commOn       = !!el("commission-enabled")?.checked;
  const commRatePct  = commOn ? Math.max(0, Number(el("commission-rate")?.value || 0)) : 0;
  const commRate     = commRatePct / 100;
  const vatEnabledUI = !!el("vat-enabled")?.checked;
  const vatRatePct   = Math.max(0, Number(el("vat-rate")?.value || 20));
  const vatRate      = vatRatePct / 100;
  const vatOn        = (vatEnabledUI || showVatDetail) && vatRate > 0;

  const netBudget = brief.budget?.amount || meta.totalBudget || 0;
  const days = meta.days || 31;
  // Always compute actual schedule hours from brief (meta.hpd uses RECO_HOURS_PER_DAY=12 constant
  // in recommendation mode which is wrong for display — use real schedule instead)
  const _schedHours = (brief.schedule && brief.dates?.start && brief.dates?.end)
    ? computeScheduleHoursForPeriod(brief.schedule, brief.dates.start, brief.dates.end)
    : null;
  const hpdActual = (_schedHours && _schedHours.avgHpd > 0) ? _schedHours.avgHpd : (meta.hpd || 12);
  const hpd = +hpdActual.toFixed(2);

  // «График, ч/сутки»: при разном расписании по дням недели среднее за период
  // (напр. 8.57 при «будни 10 ч, выходные 5 ч») ничего не говорит клиенту —
  // выводим диапазон 5–10. Когда часы одинаковы во все дни, остаётся число.
  const _round2 = v => Math.round(v * 100) / 100;
  const hpdMin = _schedHours && _schedHours.minHpd > 0 ? _round2(_schedHours.minHpd) : hpd;
  const hpdMax = _schedHours && _schedHours.maxHpd > 0 ? _round2(_schedHours.maxHpd) : hpd;
  const hpdIsRange = hpdMax - hpdMin > 0.01;
  // Диапазон — строка, поэтому числовой формат к нему неприменим.
  const hpdValue = hpdIsRange ? `${hpdMin}–${hpdMax}` : hpd;

  const dateStr   = s => s ? String(s).split("-").reverse().join(".") : "—";
  const periodStr = `${dateStr(brief.dates?.start)} — ${dateStr(brief.dates?.end)}`;

  // ── Colors ──────────────────────────────────────────────────────
  const C_HDR   = "FFA4C2F4";   // Blue header
  const C_LIGHT = "FFCFE2F3";   // Blue light
  const C_GREEN = "FF4CAF50";   // Green (suppressed per Python "Правка 1")

  const THIN_S   = { style: "thin", color: { argb: "FF000000" } };
  const THIN_B   = { top: THIN_S, left: THIN_S, bottom: THIN_S, right: THIN_S };
  const TOPBOT   = { top: THIN_S, bottom: THIN_S };
  const TOPBOT_R = { top: THIN_S, bottom: THIN_S, right: THIN_S };
  const NO_B     = { top: { style: "none" }, left: { style: "none" }, bottom: { style: "none" }, right: { style: "none" } };

  // Helper: set cell value + style
  function sc(ws, row, col, value, opts) {
    opts = opts || {};
    const cell = ws.getCell(row, col);
    cell.value = (value === undefined) ? null : value;
    const fontObj = { bold: !!opts.bold, size: opts.size || 11, name: "Calibri" };
    cell.font = fontObj;
    // Green fill is suppressed (Python "Правка 1": зелёный цвет убран)
    if (opts.fill && opts.fill !== C_GREEN) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: opts.fill } };
    }
    const alignObj = {};
    if (opts.h)    alignObj.horizontal = opts.h;
    if (opts.v)    alignObj.vertical   = opts.v;
    if (opts.wrap) alignObj.wrapText   = true;
    if (Object.keys(alignObj).length) cell.alignment = alignObj;
    if (opts.numFmt) cell.numFmt = opts.numFmt;
    if (opts.border !== false) cell.border = THIN_B;
    return cell;
  }

  // Round rate: frac ≥ 0.8 → floor + 1.5; frac > 0 → ceil; else x
  function roundRate(x) {
    if (!x || !isFinite(x)) return x;
    const frac = x - Math.floor(x);
    if (frac >= 0.8 - 1e-9) return Math.floor(x) + 1.5;
    if (frac > 0) return Math.ceil(x);
    return x;
  }

  // ── Group screens by region → format ───────────────────────────
  const _perRegKeys = perReg.map(r => r.region);
  const _isGidMode  = _perRegKeys.length === 1 && _perRegKeys[0] === "По GID-списку";

  function _matchScreenRegion(s) {
    if (_isGidMode) {
      // In GID mode group by actual city so МП shows real city breakdown
      return String(s.city || s.region || "—").trim() || "—";
    }
    const sReg  = String(s.region || "").trim();
    const sCity = String(s.city   || "").trim();
    for (const r of _perRegKeys) {
      if (sReg === r || sCity === r) return r;
      const rn = normalizeGeoName(r);
      if (!rn) continue;
      const srn = normalizeGeoName(sReg);
      const scn = normalizeGeoName(sCity);
      if (srn === rn || scn === rn) return r;
      if ((srn && (srn.includes(rn) || rn.includes(srn))) ||
          (scn && (scn.includes(rn) || rn.includes(scn)))) return r;
    }
    return sReg || sCity || "—";
  }

  const rfMap = {};
  for (const s of screens) {
    const reg  = _matchScreenRegion(s);
    const fmt_ = String(s.format || "—").trim();
    if (!rfMap[reg]) rfMap[reg] = {};
    if (!rfMap[reg][fmt_]) rfMap[reg][fmt_] = [];
    rfMap[reg][fmt_].push(s);
  }

  // In GID mode build a synthetic perReg from per-city screen groups
  // (distribute total plays/OTS/budget proportionally by bid-weighted screen count)
  let effectivePerReg = perReg;
  if (_isGidMode && screens.length > 0) {
    const totalPlaysAll  = meta.totalPlays  || 0;
    const totalBudgetAll = meta.totalBudget || 0;
    const playsPerScreen = totalPlaysAll  / screens.length;
    const cityKeys = Object.keys(rfMap).sort();
    const cityRaw = cityKeys.map(city => {
      const cityScreens = Object.values(rfMap[city] || {}).flat();
      const n = cityScreens.length;
      const cityPlays  = Math.round(playsPerScreen * n);
      const cityBidSum = cityScreens.reduce((sum, s) => {
        const eBid = Number(s.recoBid || 0) > 0
          ? s.recoBid
          : (Number(s.minBid || 0) * BID_MULTIPLIER);
        return sum + eBid;
      }, 0);
      const otsVals = cityScreens.map(s => s.ots).filter(v => Number.isFinite(v) && v > 0);
      const avgOts  = otsVals.length ? otsVals.reduce((a, b) => a + b, 0) / otsVals.length : null;
      const cityOts = avgOts != null ? Math.round(cityPlays * avgOts) : null;
      return { region: city, plays: cityPlays, _bidSum: cityBidSum, ots: cityOts, screens: n };
    });
    // Distribute actual system budget proportionally by bid-weighted screen count
    const totalBidSum = cityRaw.reduce((s, r) => s + r._bidSum, 0);
    effectivePerReg = cityRaw.map(r => ({
      ...r,
      budget: totalBidSum > 0
        ? Math.round(totalBudgetAll * r._bidSum / totalBidSum)
        : Math.round(totalBudgetAll * r.screens / screens.length)
    }));
  }

  // Cities in perRegion order (only those present in rfMap)
  const cities = effectivePerReg.map(r => r.region).filter(c => rfMap[c]);
  const allFmts  = [...new Set(cities.flatMap(c => Object.keys(rfMap[c] || {})))];

  // Max formats across all cities (to pre-set column widths)
  const maxFmts = Math.max(1, ...cities.map(c => Object.keys(rfMap[c] || {}).length));

  // Format label for block headers — abbreviate known types, otherwise use as-is
  function fmtLabel(fmt_) {
    const u = fmt_.toUpperCase();
    if (u === "MEDIAFACADE" || u === "MF")                                return "MF";
    if (u === "BILLBOARD"   || u === "BB")                                return "BB";
    if (u === "SUPERSITE"   || u === "SS")                                return "SS";
    if (u === "CITY_BOARD"  || u === "CITYBOARD" || u === "CB")           return "CB";
    if (u === "PVZ_SCREEN"  || u === "PVZ")                               return "PVZ";
    return fmt_; // keep original name for everything else
  }

  // Schedule time-range text for col C
  function scheduleText(sch) {
    if (!sch) return "";
    if (sch.type === "all_day") return "07:00 – 22:00";
    if (sch.type === "peak")    return "07:00–10:00 / 17:00–21:00";
    if (sch.type === "custom")  return `${sch.from || "00:00"} – ${sch.to || "24:00"}`;
    if (sch.type === "weekly") {
      if (sch.mode === "global") {
        return (sch.globalIntervals || []).map(iv => `${iv.from}–${iv.to}`).join(" / ");
      }
      // by_dow: show per-day slots for days that have intervals
      const DOW_LABEL = { mon:"пн", tue:"вт", wed:"ср", thu:"чт", fri:"пт", sat:"сб", sun:"вс" };
      const weekly = sch.weekly || {};
      const parts = Object.entries(DOW_LABEL)
        .filter(([k]) => Array.isArray(weekly[k]) && weekly[k].length > 0)
        .map(([k, lbl]) =>
          `${lbl} ${weekly[k].map(iv => `${iv.from}–${iv.to}`).join(",")}`
        );
      return parts.join(" / ");
    }
    return "";
  }
  const schedTxt = scheduleText(brief.schedule);

  // ── Sheet 1: МП ─────────────────────────────────────────────────
  const ws = wb.addWorksheet("МП");
  ws.getColumn(1).width = 22;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 22;
  // E onwards: per-format sub-columns
  for (let i = 0; i < Math.max(maxFmts, 2); i++) ws.getColumn(5 + i).width = 18;

  // ── Rows 1-5: meta header ────────────────────────────────────────
  // Длительность дописываем к строке "Формат" (а не отдельной строкой), чтобы не
  // сдвигать нумерацию строк ниже — она жёстко привязана к текущему количеству
  // metaRows (см. hdr7 на строке 7, SUMMARY_START=8 и т.д.).
  const durationMs = Number(brief.duration?.ms);
  const fmtLabelWithDuration = (allFmts.join(", ") || "—") +
    (Number.isFinite(durationMs) && durationMs > 0 ? ` (длительность: ${Math.round(durationMs / 1000)} сек)` : "");
  const metaRows = [
    ["Период размещения",  periodStr],
    ["Город",              cities.join(", ") || "—"],
    ["Адресная программа", screens.length],
    ["Формат",             fmtLabelWithDuration],
    ["Количество дней",    days],
  ];
  for (let i = 0; i < metaRows.length; i++) {
    const r = i + 1;
    const [label, value] = metaRows[i];
    sc(ws, r, 1, label, { bold: true, fill: C_HDR });
    const bCell = ws.getCell(r, 2);
    bCell.value = value;
    bCell.alignment = { horizontal: "right" };
    bCell.border = THIN_B;
    // Cols C onwards: no border by default
    for (let c = 3; c <= 4 + maxFmts; c++) ws.getCell(r, c).border = NO_B;
  }
  // Row 2 extra: campaign / map links in cols E and F
  sc(ws, 2, 5, "Ссылка на РК",    { fill: C_HDR, h: "center", v: "center" });
  sc(ws, 2, 6, "Ссылка на Карту", { fill: C_HDR, h: "center", v: "center" });

  // ── Row 7: table column headers ─────────────────────────────────
  ws.getRow(7).height = 30;
  let hdrE = "", hdrF = "";
  if (commOn && commRate > 0 && vatOn) {
    hdrE = `Прогноз бюджета + комиссия ${commRatePct}%`;
    hdrF = `Прогноз бюджета + комиссия + НДС ${vatRatePct}%`;
  } else if (commOn && commRate > 0) {
    hdrE = `Прогноз бюджета + комиссия ${commRatePct}%`;
  } else if (vatOn) {
    hdrE = `Прогноз бюджета + НДС ${vatRatePct}%`;
  }
  const hdr7 = ["Город", "Прогноз кол-ва выходов", "Прогноз кол-ва OTS", "Прогноз бюджета", hdrE, hdrF];
  hdr7.forEach((h, i) => sc(ws, 7, i + 1, h,
    { bold: true, fill: C_HDR, h: "center", v: "center", wrap: true }));

  // ── Layout: block positions (one block per city) ────────────────
  const SUMMARY_START = 8;
  const nCities  = cities.length;
  const totalRow = SUMMARY_START + nCities;
  const BLOCK_ROWS = 8, BLOCK_GAP = 2;

  // One block per city (format sub-columns within each block)
  const blockStarts = {};
  let curRow = totalRow + 2;
  for (const city of cities) {
    blockStarts[city] = curRow;
    curRow += BLOCK_ROWS + 1 + BLOCK_GAP; // +1 for OTS footnote row
  }
  const citySumRow = {};
  cities.forEach((c, i) => { citySumRow[c] = SUMMARY_START + i; });

  // ── Per-(city, format) aggregated stats ─────────────────────────
  const cfStats = {};
  for (const city of cities) {
    const rd = effectivePerReg.find(r => r.region === city) || {};
    const regBudget  = rd.budget  || 0;
    const regPlays   = rd.plays   || 0;
    const regOts     = rd.ots     || 0;
    // rfMap holds the actual per-format chosen screens (ground truth after any
    // per-format limits) — prefer its sum over rd.screens, which can be stale
    // if a per-format cap reduced the set after rd.screens was first computed.
    const rfSum      = Object.values(rfMap[city] || {}).reduce((a, v) => a + v.length, 0);
    const regCnt     = rfSum > 0 ? rfSum : (rd.screens || 0);
    cfStats[city] = {};

    // First pass: compute per-format avg bids and screen-count weights
    for (const [fmt_, fmtScr] of Object.entries(rfMap[city] || {})) {
      const w = regCnt > 0 ? fmtScr.length / regCnt : (1 / Object.keys(rfMap[city]).length);
      const bids = fmtScr.map(s => {
        const b = screenBid(s, brief);
        return Number.isFinite(b) && b > 0 ? b : null;
      }).filter(Boolean);
      const avgBid = bids.length ? bids.reduce((a, b) => a + b, 0) / bids.length : 0;
      const otsArr = fmtScr.map(s => Number.isFinite(s.ots) && s.ots > 0 ? s.ots : null).filter(Boolean);
      const avgOts = otsArr.length ? otsArr.reduce((a, b) => a + b, 0) / otsArr.length : 0;
      cfStats[city][fmt_] = {
        cnt: fmtScr.length, avgBid, avgOts, _w: w,
        plays: regPlays * w,
        ots:   regOts   * w,
        budget: 0,  // filled in second pass
      };
    }

    // Second pass: split budget proportionally to (screenCount × avgBid) — bid-weighted
    // This correctly accounts for formats with very different rates (e.g. MF 120 vs SS 15)
    const fmtKeys = Object.keys(cfStats[city]);
    const bidWeightSum = fmtKeys.reduce((s, f) => {
      const st = cfStats[city][f];
      return s + st.cnt * st.avgBid;
    }, 0);
    for (const f of fmtKeys) {
      const st = cfStats[city][f];
      if (bidWeightSum > 0) {
        st.budget = regBudget * (st.cnt * st.avgBid) / bidWeightSum;
      } else {
        // All formats have no bid data — fall back to screen-count split
        st.budget = regBudget * st._w;
      }
    }
  }

  const r2 = v => Math.round((v || 0) * 100) / 100;

  // ── City summary rows (rows 8..8+n-1) ───────────────────────────
  for (const city of cities) {
    const r  = citySumRow[city];
    const rd = effectivePerReg.find(x => x.region === city) || {};
    const b  = r2(rd.budget || 0), p = rd.plays || 0, o = rd.ots || 0;
    sc(ws, r, 1, city, { bold: true, fill: C_LIGHT });
    sc(ws, r, 2, p, { fill: C_LIGHT, numFmt: "#,##0" });
    sc(ws, r, 3, o, { fill: C_LIGHT, numFmt: "#,##0" });
    sc(ws, r, 4, b, { fill: C_LIGHT, numFmt: '#,##0.00 "₽"' });
    if (commOn && commRate > 0) {
      const wc = r2(b * (1 + commRate));
      sc(ws, r, 5, wc, { fill: C_LIGHT, numFmt: '#,##0.00 "₽"' });
      if (vatOn) sc(ws, r, 6, r2(wc * (1 + vatRate)), { fill: C_LIGHT, numFmt: '#,##0.00 "₽"' });
      else ws.getCell(r, 6).border = NO_B;
    } else if (vatOn) {
      sc(ws, r, 5, r2(b * (1 + vatRate)), { fill: C_LIGHT, numFmt: '#,##0.00 "₽"' });
      ws.getCell(r, 6).border = NO_B;
    } else {
      ws.getCell(r, 5).border = NO_B;
      ws.getCell(r, 6).border = NO_B;
    }
  }

  // ── Итого row ────────────────────────────────────────────────────
  // Sum only the cities that are displayed (those present in rfMap).
  // perReg may contain duplicate region aliases (e.g. "Сочи" + "городской округ Сочи")
  // that map to the same screens — only one of them survives the rfMap filter in `cities`.
  const citySet = new Set(cities);
  const totB = r2(effectivePerReg.filter(r => citySet.has(r.region)).reduce((a, r) => a + (r.budget || 0), 0));
  const totP = effectivePerReg.filter(r => citySet.has(r.region)).reduce((a, r) => a + (r.plays  || 0), 0);
  const totO = effectivePerReg.filter(r => citySet.has(r.region)).reduce((a, r) => a + (r.ots    || 0), 0);
  sc(ws, totalRow, 1, "итого", { bold: true, fill: C_HDR, h: "right" });
  sc(ws, totalRow, 2, totP, { bold: true, fill: C_HDR, numFmt: "#,##0" });
  sc(ws, totalRow, 3, totO, { bold: true, fill: C_HDR, numFmt: "#,##0" });
  sc(ws, totalRow, 4, totB, { bold: true, fill: C_HDR, numFmt: '#,##0.00 "₽"' });
  if (commOn && commRate > 0) {
    const twc = r2(totB * (1 + commRate));
    sc(ws, totalRow, 5, twc, { bold: true, fill: C_HDR, numFmt: '#,##0.00 "₽"' });
    if (vatOn) sc(ws, totalRow, 6, r2(twc * (1 + vatRate)), { bold: true, fill: C_HDR, numFmt: '#,##0.00 "₽"' });
    else ws.getCell(totalRow, 6).border = NO_B;
  } else if (vatOn) {
    sc(ws, totalRow, 5, r2(totB * (1 + vatRate)), { bold: true, fill: C_HDR, numFmt: '#,##0.00 "₽"' });
    ws.getCell(totalRow, 6).border = NO_B;
  } else {
    ws.getCell(totalRow, 5).border = NO_B;
    ws.getCell(totalRow, 6).border = NO_B;
  }

  // ── Detail blocks — one per city, format sub-columns at E, F, G… ─
  for (const city of cities) {
    const base     = blockStarts[city];
    const rd       = effectivePerReg.find(r => r.region === city) || {};
    const regBudget = rd.budget  || 0;
    const regPlays  = rd.plays   || 0;
    const regOts    = rd.ots     || 0;
    // Same fix as cfStats computation above: cfStats[city][fmt].cnt is ground truth
    // (actual chosen screens per format), rd.screens can be stale after per-format caps.
    const cfSum     = cfStats[city] ? Object.values(cfStats[city]).reduce((a, v) => a + v.cnt, 0) : 0;
    const regCnt    = cfSum > 0 ? cfSum : (rd.screens || 0);
    const fmts      = Object.keys(rfMap[city] || {});     // format keys for this city

    // Weighted averages for col B (aggregate column)
    const wtAvgBid = regCnt > 0
      ? fmts.reduce((a, f) => a + (cfStats[city][f]?.avgBid || 0) * (cfStats[city][f]?.cnt || 0), 0) / regCnt
      : 0;
    const wtAvgOts = regCnt > 0
      ? fmts.reduce((a, f) => a + (cfStats[city][f]?.avgOts || 0) * (cfStats[city][f]?.cnt || 0), 0) / regCnt
      : 0;

    // ── Header row: merge A:C = city, D = spacer, E+= format labels ──
    ws.mergeCells(base, 1, base, 3);
    sc(ws, base, 1, city, { bold: true, fill: C_HDR, h: "center", v: "center" });
    ws.getCell(base, 2).border = TOPBOT;
    ws.getCell(base, 3).border = TOPBOT_R;
    ws.getCell(base, 4).border = NO_B;
    fmts.forEach((fmt_, fi) => {
      sc(ws, base, 5 + fi, fmtLabel(fmt_), { bold: true, fill: C_HDR, h: "center", v: "center" });
    });

    // ── base+1: Кол-во экранов ────────────────────────────────────
    sc(ws, base + 1, 1, "Кол-во экранов",   { bold: true, fill: C_LIGHT });
    sc(ws, base + 1, 2, regCnt,             { fill: C_GREEN, numFmt: "#,##0" });
    fmts.forEach((fmt_, fi) => {
      sc(ws, base + 1, 5 + fi, cfStats[city][fmt_]?.cnt ?? null, { fill: C_GREEN, numFmt: "#,##0" });
    });

    // ── base+2: Средняя ставка за показ (or CPM for all-Russ cities) ──
    const isRussCity = rd.russOts === true;
    const rateLabel = isRussCity ? "Ставка за 1000 OTS" : "Средняя ставка за показ";
    const wtRateD = isRussCity
      ? (rd.avgCpm != null ? +rd.avgCpm.toFixed(2) : null)
      : (wtAvgBid > 0 ? +wtAvgBid.toFixed(2) : null);
    sc(ws, base + 2, 1, rateLabel, { bold: true, fill: C_LIGHT });
    sc(ws, base + 2, 2, wtRateD,            { fill: C_GREEN, numFmt: "0.00" });
    fmts.forEach((fmt_, fi) => {
      const r = isRussCity
        ? (rd.avgCpm != null ? +rd.avgCpm.toFixed(2) : null)
        : (cfStats[city][fmt_]?.avgBid > 0 ? +(cfStats[city][fmt_].avgBid).toFixed(2) : null);
      sc(ws, base + 2, 5 + fi, r, { fill: C_GREEN, numFmt: "0.00" });
    });

    // ── base+3: Средний OTS* ─────────────────────────────────────
    const wtOtsD = wtAvgOts > 0 ? +wtAvgOts.toFixed(2) : null;
    sc(ws, base + 3, 1, "Средний OTS*",     { bold: true, fill: C_LIGHT });
    sc(ws, base + 3, 2, wtOtsD,             { fill: C_GREEN, numFmt: "0.##" });
    fmts.forEach((fmt_, fi) => {
      const st = cfStats[city][fmt_];
      // Prefer the proportionally-distributed city total (st.ots/st.cnt) over
      // the raw per-screen average (st.avgOts) — a format whose screens simply
      // lack per-screen OTS data (common for small formats) would otherwise
      // always show 0 here even though the city clearly has real OTS.
      const o = st?.cnt > 0 ? st.ots / st.cnt : (st?.avgOts > 0 ? st.avgOts : null);
      sc(ws, base + 3, 5 + fi, o, { fill: C_GREEN, numFmt: "0.##" });
    });

    // ── base+4: График ч/сутки ────────────────────────────────────
    const hpdFmt = hpdIsRange ? undefined : (Number.isInteger(hpd) ? "0" : "0.##");
    sc(ws, base + 4, 1, "График, ч/сутки", { bold: true, fill: C_LIGHT, v: "center" });
    sc(ws, base + 4, 2, hpdValue,          { fill: C_GREEN, numFmt: hpdFmt, h: "right", v: "center" });
    if (schedTxt) sc(ws, base + 4, 3, schedTxt,
      { fill: C_GREEN, size: 9, h: "center", v: "center", wrap: true });
    else ws.getCell(base + 4, 3).border = THIN_B;
    fmts.forEach((_, fi) => {
      sc(ws, base + 4, 5 + fi, hpdValue, { fill: C_GREEN, numFmt: hpdFmt, h: "right", v: "center" });
    });

    // ── base+5: Прогноз кол-ва выходов ───────────────────────────
    sc(ws, base + 5, 1, "Прогноз кол-ва выходов", { bold: true, fill: C_LIGHT });
    sc(ws, base + 5, 2, regPlays, { fill: C_GREEN, numFmt: "#,##0" });
    fmts.forEach((fmt_, fi) => {
      sc(ws, base + 5, 5 + fi, cfStats[city][fmt_]?.plays || 0, { fill: C_GREEN, numFmt: "#,##0" });
    });

    // ── base+6: Прогноз кол-ва OTS* ──────────────────────────────
    ws.getRow(base + 6).height = 24.75;
    sc(ws, base + 6, 1, "Прогноз кол-ва OTS*", { bold: true, fill: C_LIGHT });
    // numFmt shows zero as "–" instead of a bare "0" — a format with no OTS data
    // otherwise reads as "0 OTS" (looks like real, verified zero) rather than
    // "no data for this format", which is what it actually means here.
    const OTS_NUMFMT = '#,##0;-#,##0;"–"';
    sc(ws, base + 6, 2, regOts || null, { fill: C_GREEN, numFmt: OTS_NUMFMT });
    fmts.forEach((fmt_, fi) => {
      const st = cfStats[city][fmt_];
      // st.ots (regOts * weight) is already the correct proportional split of
      // the city's real total OTS — using it directly instead of recomputing
      // from st.avgOts (which is 0 whenever a format's screens lack raw
      // per-screen OTS data) matches the pattern already used in the Свод
      // sheet's own per-format OTS column.
      const o = st?.ots || 0;
      sc(ws, base + 6, 5 + fi, o, { fill: C_GREEN, numFmt: OTS_NUMFMT });
    });

    // ── base+7: Прогноз бюджета ───────────────────────────────────
    sc(ws, base + 7, 1, "Прогноз бюджета",  { bold: true, fill: C_LIGHT });
    sc(ws, base + 7, 2, r2(regBudget), { bold: true, fill: C_GREEN, numFmt: '#,##0.00 "₽"' });
    fmts.forEach((fmt_, fi) => {
      sc(ws, base + 7, 5 + fi, r2(cfStats[city][fmt_]?.budget || 0),
        { bold: true, fill: C_GREEN, numFmt: '#,##0.00 "₽"' });
    });

    // ── OTS footnote (base+BLOCK_ROWS) — merged across all format sub-columns ──
    const noteRow = base + BLOCK_ROWS;
    const noteLastCol = fmts.length > 1 ? 5 + fmts.length - 1 : 5;
    if (noteLastCol > 5) ws.mergeCells(noteRow, 5, noteRow, noteLastCol);
    const noteCell = ws.getCell(noteRow, 5);
    noteCell.value = "*не все экраны передают OTS";
    noteCell.font  = { italic: true, size: 9, name: "Calibri", color: { argb: "FF555555" } };

    // Col C (base+1..base+7): full border
    for (let dr = base + 1; dr < base + BLOCK_ROWS; dr++) {
      ws.getCell(dr, 3).border = THIN_B;
    }
    // Col D (entire block + footnote): no border
    for (let dr = base; dr <= base + BLOCK_ROWS + 1; dr++) {
      ws.getCell(dr, 4).border = NO_B;
    }
  }

  // ── Sheet 2: АП ─────────────────────────────────────────────────
  const ws2 = wb.addWorksheet("АП");
  const AP_COLS = [
    { h: "GID",                w: 25, fn: s => s.gid ?? s.screen_id ?? "" },
    { h: "Город",              w: 22, fn: s => s.city       ?? "" },
    { h: "Оператор",           w: 22, fn: s => s.owner      ?? "" },
    { h: "Адрес",              w: 50, fn: s => s.address    ?? "" },
    { h: "Сторона",            w: 10, fn: s => s.side       ?? "" },
    { h: "Формат экрана",      w: 18, fn: s => s.format     ?? "" },
    { h: "Длительность, сек",  w: 14, fn: s => (Array.isArray(s.durationBidInfo) && s.durationBidInfo.length && Number.isFinite(durationMs) && durationMs > 0)
                                        ? Math.round(durationMs / 1000)
                                        : "" },
    { h: "Вид. разрешение",    w: 20, fn: s => s.resolution ?? "" },
    { h: "Соотношение сторон", w: 20, fn: s => s.aspectRatio ?? "" },
    { h: "Широта",             w: 14, fn: s => Number.isFinite(s.lat) ? s.lat : "" },
    { h: "Долгота",            w: 14, fn: s => Number.isFinite(s.lon) ? s.lon : "" },
    { h: "Фото",               w: 40, fn: s => s.image_url  ?? "" },
  ];
  AP_COLS.forEach((col, i) => {
    ws2.getColumn(i + 1).width = col.w;
    const cell = ws2.getCell(1, i + 1);
    cell.value = col.h;
    cell.font  = { bold: true, size: 11, name: "Calibri" };
  });
  const PHOTO_COL_IDX = AP_COLS.findIndex(c => c.h === "Фото");
  screens.forEach((s, si) => {
    AP_COLS.forEach((col, ci) => {
      const cell = ws2.getCell(si + 2, ci + 1);
      const v = col.fn(s);
      if (ci === PHOTO_COL_IDX && v) {
        cell.value = { text: "Фото", hyperlink: String(v) };
        cell.font  = { size: 11, name: "Calibri", color: { argb: "FF2563EB" }, underline: true };
      } else {
        cell.value = v;
      }
    });
  });

  // ── Export ──────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const dateFile = s => s ? String(s).split("-").reverse().join(".") : "plan";
  const baseName = `mediaplan_${(brief.geo?.regions || brief.selectedRegions || []).join("-") || "plan"}_${dateFile(brief.dates?.start)}`;

  // HTML map of all screens (only if user opted in via settings checkbox)
  const mapScreensList = screens.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  let mapBlob = null, mapFilename = null;
  const downloadMapEnabled = el("dl-download-map") ? !!el("dl-download-map").checked : true;
  if (downloadMapEnabled && mapScreensList.length > 0) {
    const regionLabel = (brief.geo?.regions || brief.selectedRegions || []).join(", ") || "план";
    const mapHtml = buildMapHtml(screens, regionLabel);
    if (mapHtml) {
      mapBlob = new Blob([mapHtml], { type: "text/html;charset=utf-8" });
      mapFilename = baseName + "_map.html";
    }
  }

  return { blob, filename: baseName + ".xlsx", mapBlob, mapFilename };
}

// ===== Sber custom media plan (sbermarketing@omni360.io) =====

function buildSberScheduleGrid(sch) {
  const grid = Array.from({length: 24}, () => new Array(7).fill(false));
  const DOW_ORDER = ["mon","tue","wed","thu","fri","sat","sun"];
  function markHours(from, to, days) {
    const fh = parseInt((from || "00:00").split(":")[0], 10) || 0;
    const th = parseInt((to   || "24:00").split(":")[0], 10) || 24;
    for (const d of days) for (let h = fh; h < Math.min(th, 24); h++) grid[h][d] = true;
  }
  if (!sch || sch.type === "all_day") {
    for (let h = 0; h < 24; h++) for (let d = 0; d < 7; d++) grid[h][d] = true;
  } else if (sch.type === "peak") {
    for (let d = 0; d < 7; d++) { markHours("07:00", "10:00", [d]); markHours("17:00", "21:00", [d]); }
  } else if (sch.type === "custom") {
    for (let d = 0; d < 7; d++) markHours(sch.from, sch.to, [d]);
  } else if (sch.type === "weekly") {
    if (sch.mode === "global") {
      const activeDow = (sch.activeDow || DOW_ORDER).map(dk => DOW_ORDER.indexOf(dk)).filter(i => i >= 0);
      for (const iv of (sch.globalIntervals || [])) markHours(iv.from, iv.to, activeDow);
    } else {
      const weekly = sch.weekly || {};
      DOW_ORDER.forEach((dk, di) => { for (const iv of (weekly[dk] || [])) markHours(iv.from, iv.to, [di]); });
    }
  }
  return grid;
}

async function buildSberMediaPlanBlob() {
  const calc = window.PLANNER?.lastCalc;
  if (!calc) { alert("Сначала нажмите «Рассчитать»."); return null; }
  const ExcelJS = window.ExcelJS;
  if (!ExcelJS) { alert("ExcelJS не загружен — обновите страницу."); return null; }

  const wb = new ExcelJS.Workbook();
  wb.creator = "DSP Planner";

  const brief   = calc.brief    || {};
  const meta    = calc.meta     || {};
  const perReg  = calc.perRegion || [];
  const screens = calc.chosen   || [];

  const C_GREEN  = "FFE2EFD9";
  const C_GREY   = "FFF0F0F0";
  const SBER_PCT = 0.20;

  const dateStr   = s => s ? String(s).split("-").reverse().join(".") : "—";
  const periodStr = `${dateStr(brief.dates?.start)} — ${dateStr(brief.dates?.end)}`;

  // ── Region-grouping logic (mirrors buildMediaPlanBlob) ────────────
  const _perRegKeys = perReg.map(r => r.region);
  const _isGidMode  = _perRegKeys.length === 1 && _perRegKeys[0] === "По GID-списку";

  function _matchReg(s) {
    if (_isGidMode) return String(s.city || s.region || "—").trim() || "—";
    const sReg = String(s.region || "").trim();
    const sCity = String(s.city  || "").trim();
    for (const r of _perRegKeys) {
      if (sReg === r || sCity === r) return r;
      const rn = normalizeGeoName(r); if (!rn) continue;
      const srn = normalizeGeoName(sReg), scn = normalizeGeoName(sCity);
      if (srn === rn || scn === rn) return r;
      if ((srn && (srn.includes(rn) || rn.includes(srn))) ||
          (scn && (scn.includes(rn) || rn.includes(scn)))) return r;
    }
    return sReg || sCity || "—";
  }

  const rfMap = {};
  for (const s of screens) {
    const reg = _matchReg(s), fmt_ = String(s.format || "—").trim();
    if (!rfMap[reg]) rfMap[reg] = {};
    if (!rfMap[reg][fmt_]) rfMap[reg][fmt_] = [];
    rfMap[reg][fmt_].push(s);
  }

  let effectivePerReg = perReg;
  if (_isGidMode && screens.length > 0) {
    const totalPlaysAll = meta.totalPlays || 0, totalBudgetAll = meta.totalBudget || 0;
    const playsPerScreen = totalPlaysAll / screens.length;
    const cityRaw = Object.keys(rfMap).sort().map(city => {
      const cityScr = Object.values(rfMap[city] || {}).flat();
      const n = cityScr.length;
      const cityPlays = Math.round(playsPerScreen * n);
      const cityBidSum = cityScr.reduce((sum, s) => {
        const eBid = Number(s.recoBid || 0) > 0 ? s.recoBid : (Number(s.minBid || 0) * BID_MULTIPLIER);
        return sum + eBid;
      }, 0);
      const otsVals = cityScr.map(s => s.ots).filter(v => Number.isFinite(v) && v > 0);
      const avgOts  = otsVals.length ? otsVals.reduce((a,b) => a+b, 0) / otsVals.length : null;
      return { region: city, plays: cityPlays, _bidSum: cityBidSum,
               ots: avgOts != null ? Math.round(cityPlays * avgOts) : null, screens: n };
    });
    const totalBidSum = cityRaw.reduce((s,r) => s + r._bidSum, 0);
    effectivePerReg = cityRaw.map(r => ({
      ...r,
      budget: totalBidSum > 0
        ? Math.round(totalBudgetAll * r._bidSum / totalBidSum)
        : Math.round(totalBudgetAll * r.screens / screens.length)
    }));
  }

  const cities = effectivePerReg.map(r => r.region).filter(c => rfMap[c]);

  // ── cfStats: per-city per-format stats ───────────────────────────
  const cfStats = {};
  for (const city of cities) {
    const rd = effectivePerReg.find(r => r.region === city) || {};
    const regBudget = rd.budget || 0, regPlays = rd.plays || 0, regOts = rd.ots || 0;
    const regCnt = rd.screens || Object.values(rfMap[city] || {}).reduce((a,v) => a + v.length, 0);
    cfStats[city] = {};
    for (const [fmt_, fmtScr] of Object.entries(rfMap[city] || {})) {
      const w = regCnt > 0 ? fmtScr.length / regCnt : (1 / Object.keys(rfMap[city]).length);
      const bids = fmtScr.map(s => {
        const b = screenBid(s, brief);
        return Number.isFinite(b) && b > 0 ? b : null;
      }).filter(Boolean);
      const avgBid = bids.length ? bids.reduce((a,b) => a+b, 0) / bids.length : 0;
      const otsArr = fmtScr.map(s => Number.isFinite(s.ots) && s.ots > 0 ? s.ots : null).filter(Boolean);
      const avgOts = otsArr.length ? otsArr.reduce((a,b) => a+b, 0) / otsArr.length : 0;
      cfStats[city][fmt_] = { cnt: fmtScr.length, avgBid, avgOts, _w: w,
        plays: regPlays * w, ots: regOts * w, budget: 0 };
    }
    const fmtKeys = Object.keys(cfStats[city]);
    const bidWtSum = fmtKeys.reduce((s,f) => { const st = cfStats[city][f]; return s + st.cnt * st.avgBid; }, 0);
    for (const f of fmtKeys) {
      const st = cfStats[city][f];
      st.budget = bidWtSum > 0 ? regBudget * (st.cnt * st.avgBid) / bidWtSum : regBudget * st._w;
    }
  }

  const citySet   = new Set(cities);
  const totBudget = effectivePerReg.filter(r => citySet.has(r.region)).reduce((a,r) => a + (r.budget || 0), 0);
  const totPlays  = effectivePerReg.filter(r => citySet.has(r.region)).reduce((a,r) => a + (r.plays  || 0), 0);
  const totOts    = effectivePerReg.filter(r => citySet.has(r.region)).reduce((a,r) => a + (r.ots    || 0), 0);
  const allFmts   = [...new Set(cities.flatMap(c => Object.keys(rfMap[c] || {})))];

  // ── Cell helpers ─────────────────────────────────────────────────
  function ssc(ws, row, col, value, fill, bold, numFmt, hAlign) {
    const cell = ws.getCell(row, col);
    cell.value = (value === undefined || value === null) ? null : value;
    cell.font  = { bold: !!bold, name: "Calibri", size: 11 };
    if (fill) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    if (numFmt) cell.numFmt = numFmt;
    if (hAlign) cell.alignment = { horizontal: hAlign };
    return cell;
  }
  function sberHlink(ws, row, col, text, href) {
    const cell = ws.getCell(row, col);
    cell.value = { text: text || "Ссылка", hyperlink: href };
    cell.font  = { name: "Calibri", size: 11, color: { argb: "FF2563EB" }, underline: true };
    return cell;
  }
  function greenHeader(ws, row, col, value) {
    const cell = ws.getCell(row, col);
    cell.value = value;
    cell.font  = { bold: true, name: "Calibri", size: 11 };
    cell.fill  = { type: "pattern", pattern: "solid", fgColor: { argb: C_GREEN } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    return cell;
  }

  // ════════════════ Sheet 1: Свод ════════════════════════════════
  const wsSvod = wb.addWorksheet("Свод");
  [26, 22, 22, 18, 14, 22, 14, 22, 18].forEach((w, i) => wsSvod.getColumn(i + 1).width = w);

  const r2 = v => Math.round((v || 0) * 100) / 100;

  // Rows 1-7: KV block
  [
    ["Даты кампании",  periodStr],
    ["Всего экранов",  screens.length],
    ["Города",         cities.join(", ") || "—"],
    ["Бюджет без НДС", r2(totBudget)],
    ["Всего выходов",  totPlays],
    ["Всего OTS",      totOts],
    ["Карта",          ""],
  ].forEach(([label, value], i) => {
    ssc(wsSvod, i + 1, 1, label, C_GREEN, true);
    const vc = ssc(wsSvod, i + 1, 2, value, null, false);
    if (i === 3) vc.numFmt = "#,##0.00";
    else if (i === 4 || i === 5) vc.numFmt = "#,##0";
  });

  // Row 9: group headers ("Инвентарь" A9:C9, "Прогноз" D9:I9)
  wsSvod.mergeCells(9, 1, 9, 3);
  greenHeader(wsSvod, 9, 1, "Инвентарь");
  wsSvod.mergeCells(9, 4, 9, 9);
  greenHeader(wsSvod, 9, 4, "Прогноз");

  // Row 10: column headers
  ["Город","Формат","Всего конструкций","Бюджет","Выходов",
   "Средний OTS на выход","OTS","Средняя цена 1 показа","СК Сбер 20%"]
    .forEach((h, i) => greenHeader(wsSvod, 10, i + 1, h));

  // Shared numFmt array for table columns D-I
  const COL_FMT = [null, null, "#,##0", "#,##0.00", "#,##0", "0.00", "#,##0", "0.00", "#,##0.00"];

  // Row 11: totals
  const totAvgOts   = totPlays > 0 ? totOts    / totPlays : null;
  const totAvgPrice = totPlays > 0 ? r2(totBudget / totPlays) : null;
  [cities.length, allFmts.length, screens.length, r2(totBudget), totPlays,
   totAvgOts, totOts, totAvgPrice, r2(totBudget * SBER_PCT)]
    .forEach((v, i) => ssc(wsSvod, 11, i + 1, v, C_GREY, true, COL_FMT[i]));

  // Rows 12+: per city-format data rows
  let dataRow = 12;
  for (const city of cities) {
    for (const [fmt_, st] of Object.entries(cfStats[city] || {})) {
      const avgOtsRow   = st.plays > 0 ? st.ots / st.plays : (st.avgOts > 0 ? st.avgOts : null);
      const avgPriceRow = st.plays > 0 ? r2(st.budget / st.plays) : null;
      const bgt = r2(st.budget);
      [city, fmt_, st.cnt, bgt, st.plays, avgOtsRow, st.ots || null, avgPriceRow, r2(bgt * SBER_PCT)]
        .forEach((v, i) => ssc(wsSvod, dataRow, i + 1, v, null, false, COL_FMT[i]));
      dataRow++;
    }
  }

  // ════════════════ City sheets ══════════════════════════════════
  const SCHED_SHEET = "График вещания #1";
  const CITY_HDRS  = ["ИД","GID","Город","Оператор","Адрес","Сторона",
                       "Формат экрана","Видимое разрешение","Соотношение сторон",
                       "Ставка (без НДС)","График вещания","Фото","Технические требования"];
  const CITY_WIDTHS = [12, 26, 16, 20, 50, 10, 16, 22, 20, 18, 20, 10, 24];

  for (const city of cities) {
    const sheetName = city.replace(/[\[\]\*\?\/\\:]/g, "_").slice(0, 31);
    const wsCity = wb.addWorksheet(sheetName);
    CITY_HDRS.forEach((_, i) => wsCity.getColumn(i + 1).width = CITY_WIDTHS[i]);

    // Row 1: city title
    wsCity.getCell(1, 1).value = city;
    wsCity.getCell(1, 1).font  = { bold: true, name: "Calibri", size: 12 };

    // Rows 2-3: merged column headers
    CITY_HDRS.forEach((h, i) => {
      wsCity.mergeCells(2, i + 1, 3, i + 1);
      greenHeader(wsCity, 2, i + 1, h);
    });

    // Data from row 4
    const cityScr = Object.values(rfMap[city] || {}).flat();
    cityScr.forEach((s, si) => {
      const r = si + 4;
      wsCity.getCell(r, 1).value  = s.id ?? null;
      wsCity.getCell(r, 2).value  = s.gid ?? s.screen_id ?? "";
      wsCity.getCell(r, 3).value  = s.city ?? "";
      wsCity.getCell(r, 4).value  = s.owner ?? "";
      wsCity.getCell(r, 5).value  = s.address ?? "";
      wsCity.getCell(r, 6).value  = s.side ?? "";
      wsCity.getCell(r, 7).value  = s.format ?? "";
      wsCity.getCell(r, 8).value  = s.resolution ?? "";
      wsCity.getCell(r, 9).value  = s.aspectRatio ?? "";
      const bid = screenBid(s, brief);
      wsCity.getCell(r, 10).value  = Number.isFinite(bid) ? bid : null;
      wsCity.getCell(r, 10).numFmt = "0.00";
      sberHlink(wsCity, r, 11, "Ссылка", `#'${SCHED_SHEET}'!A1`);
      if (s.image_url) sberHlink(wsCity, r, 12, "Фото", String(s.image_url));
      const techUrl = s.tech_url || s.tech_requirements_url;
      if (techUrl) sberHlink(wsCity, r, 13, "Ссылка", String(techUrl));
    });
  }

  // ════════════════ Schedule sheet ══════════════════════════════
  const wsSched = wb.addWorksheet(SCHED_SHEET);
  wsSched.getColumn(1).width = 22;
  for (let c = 2; c <= 8; c++) wsSched.getColumn(c).width = 8;

  // Row 1: "День недели" merged B1:H1
  wsSched.mergeCells(1, 2, 1, 8);
  greenHeader(wsSched, 1, 2, "День недели");

  // Row 2: "Часы" + day labels
  greenHeader(wsSched, 2, 1, "Часы");
  ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].forEach((lbl, i) => greenHeader(wsSched, 2, i + 2, lbl));

  // Rows 3-26: hourly slots
  const grid = buildSberScheduleGrid(brief.schedule);
  for (let h = 0; h < 24; h++) {
    const r = h + 3;
    wsSched.getCell(r, 1).value = `${String(h).padStart(2,"0")}:00 — ${String(h+1).padStart(2,"0")}:00`;
    wsSched.getCell(r, 1).font  = { name: "Calibri", size: 11 };
    for (let d = 0; d < 7; d++) {
      if (grid[h][d]) {
        const cell = wsSched.getCell(r, d + 2);
        cell.value = "+";
        cell.font  = { bold: true, name: "Calibri", size: 11 };
        cell.alignment = { horizontal: "center" };
      }
    }
  }

  // ── Export ────────────────────────────────────────────────────
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const dateFile = s => s ? String(s).split("-").reverse().join(".") : "plan";
  const baseName = `mediaplan_sber_${(brief.geo?.regions || brief.selectedRegions || []).join("-") || "plan"}_${dateFile(brief.dates?.start)}`;
  return { blob, filename: baseName + ".xlsx" };
}

async function downloadMediaPlan() {
  const userEmail = (getDspUserEmail?.() || sessionStorage?.getItem("dsp_user_email") || "").toLowerCase().trim();
  const result = userEmail === "sbermarketing@omni360.io"
    ? await buildSberMediaPlanBlob()
    : await buildMediaPlanBlob();
  if (!result) return;
  const { blob, filename, mapBlob, mapFilename } = result;

  function triggerDownload(b, name) {
    const url = URL.createObjectURL(b);
    const a   = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  triggerDownload(blob, filename);
  if (mapBlob && mapFilename) {
    setTimeout(() => triggerDownload(mapBlob, mapFilename), 300);
  }
}

// ===== File import helpers =====

/**
 * Auto-detects columns in parsed rows (objects with headers) and returns
 * a list of strings suitable for bulkAddAddresses().
 * Supports:
 *  - Dedicated address column: "Адрес", "address", "адрес"
 *  - Dedicated city column: "Город", "city"
 *  - Lat/Lon columns → converted to "@lat,lon" (skip geocoding)
 * Falls back to first text column if nothing detected.
 */
function _extractAddrLines(rows) {
  if (!rows || !rows.length) return [];
  const keys = Object.keys(rows[0]);

  // Normalised header matching
  const findKey = (...patterns) =>
    keys.find(k => patterns.some(p => k.trim().toLowerCase() === p.toLowerCase())) || null;

  const addrKey = findKey("адрес", "address", "Адрес", "Address");
  const cityKey = findKey("город", "city", "Город", "City");
  const latKey  = findKey("lat", "latitude", "широта", "Широта");
  const lonKey  = findKey("lon", "lng", "longitude", "долгота", "Долгота");

  const lines = [];
  for (const row of rows) {
    // If we have lat + lon columns → coordinate point (no geocoding needed)
    if (latKey && lonKey) {
      const lat = Number(String(row[latKey] || "").replace(",", "."));
      const lon = Number(String(row[lonKey] || "").replace(",", "."));
      if (Number.isFinite(lat) && Number.isFinite(lon) && (lat !== 0 || lon !== 0)) {
        // Prepend address hint if available (shown in UI input)
        const hint = addrKey ? String(row[addrKey] || "").trim() : "";
        lines.push(hint ? `@${lat},${lon} (${hint})` : `@${lat},${lon}`);
        continue;
      }
    }
    // Address column
    if (addrKey) {
      const v = String(row[addrKey] || "").trim();
      if (v) { lines.push(v); continue; }
    }
    // City column
    if (cityKey) {
      const v = String(row[cityKey] || "").trim();
      if (v) { lines.push(v); continue; }
    }
    // Fallback: first non-empty string value
    const first = Object.values(row).map(v => String(v || "").trim()).find(v => v);
    if (first) lines.push(first);
  }
  return lines.filter(Boolean);
}

/**
 * Auto-detects city/region names from parsed rows and matches them
 * against state.regionsAll. Returns { matched: string[], unmatched: string[] }.
 */
// Сокращения городов, которые не ловятся ни точным, ни префиксным сравнением.
// Ключ — уже нормализованное (normalizeGeoName) написание.
const CITY_ALIASES = {
  // Москва и Петербург
  "мск": "Москва",
  "msk": "Москва",
  "moscow": "Москва",
  "спб": "Санкт-Петербург",
  "питер": "Санкт-Петербург",
  "санкт петербург": "Санкт-Петербург",
  "petersburg": "Санкт-Петербург",
  "spb": "Санкт-Петербург",
  // Города-миллионники и крупные центры
  "нн": "Нижний Новгород",
  "нижний": "Нижний Новгород",
  "нижний новгород": "Нижний Новгород",
  "екб": "Екатеринбург",
  "ебург": "Екатеринбург",
  "екат": "Екатеринбург",
  "нск": "Новосибирск",
  "новосиб": "Новосибирск",
  "ростов": "Ростов-на-Дону",
  "ростов на дону": "Ростов-на-Дону",
  "ростов-на-дону": "Ростов-на-Дону",
  "нч": "Набережные Челны",
  "челны": "Набережные Челны",
  "чел": "Челябинск",
  "кзн": "Казань",
  "казань": "Казань",
  "нвс": "Новосибирск",
  "влг": "Волгоград",
  "волга": "Волгоград",
  "крд": "Краснодар",
  "краснодар": "Краснодар",
  "уфа": "Уфа",
  "самара": "Самара",
  "омск": "Омск",
  "пермь": "Пермь",
  "воронеж": "Воронеж",
  "калининград": "Калининград",
  "кёниг": "Калининград",
  "мин воды": "Минеральные Воды",
  "минводы": "Минеральные Воды",
  "улан удэ": "Улан-Удэ",
  "йошкар ола": "Йошкар-Ола",
  "комсомольск на амуре": "Комсомольск-на-Амуре",
  "петропавловск камчатский": "Петропавловск-Камчатский",
};

// «Н.Новгород», «С.-Петербург», «Н.Челны» — обычная запись в клиентских файлах.
// Разбиваем имя на слова по точкам/дефисам/пробелам и считаем совпадением случай,
// когда каждое слово исходника является префиксом соответствующего слова известного
// города: «н|новгород» → «нижний|новгород», «с|петербург» → «санкт|петербург».
function _cityWords(s) {
  return normalizeGeoName(s).split(/[\s.\-‐-―]+/).filter(Boolean);
}

function _resolveCityAbbrev(raw, allKnown) {
  const rawWords = _cityWords(raw);
  // Однословные названия уже покрыты точным/префиксным сравнением — трогать их
  // здесь опасно (слишком много ложных совпадений).
  if (rawWords.length < 2) return null;

  const hits = [];
  for (const known of allKnown) {
    const kw = _cityWords(known);
    if (kw.length !== rawWords.length) continue;
    if (rawWords.every((w, i) => kw[i].startsWith(w))) hits.push(known);
  }
  // Неоднозначное сокращение оставляем ненайденным, чтобы не подставить чужой город.
  return hits.length === 1 ? hits[0] : null;
}

function _extractAndMatchCities(rows) {
  if (!rows || !rows.length) return { matched: [], unmatched: [] };
  const keys = Object.keys(rows[0]);

  const findKey = (...patterns) =>
    keys.find(k => patterns.some(p => k.trim().toLowerCase() === p.toLowerCase())) || null;

  const cityKey   = findKey("город", "city", "Город", "City", "регион", "region");
  const addrKey   = findKey("адрес", "address", "Адрес", "Address");

  const regionsAll = Array.isArray(state?.regionsAll) ? state.regionsAll : [];
  const dspCities  = Array.isArray(state?.dspCities)  ? state.dspCities  : [];
  const allKnown   = [...new Set([...regionsAll, ...dspCities])];
  const allKnownLC = allKnown.map(r => r.toLowerCase());

  const rawCities = [];
  for (const row of rows) {
    let val = "";
    if (cityKey) {
      val = String(row[cityKey] || "").trim();
    } else if (addrKey) {
      // Extract first comma-segment as city
      val = String(row[addrKey] || "").split(",")[0].trim();
    } else {
      val = String(Object.values(row)[0] || "").split(",")[0].trim();
    }
    if (val) rawCities.push(val);
  }

  // Deduplicate raw city names
  const uniqueRaw = [...new Set(rawCities)];
  const matched = [], unmatched = [];
  for (const raw of uniqueRaw) {
    const rawLC = raw.toLowerCase();
    // Exact match first
    const exactIdx = allKnownLC.indexOf(rawLC);
    if (exactIdx !== -1) { matched.push(allKnown[exactIdx]); continue; }
    // Нормализованное сравнение: снимает «г. »/«город », ё/е и лишние пробелы.
    const rawNorm = normalizeGeoName(raw);
    const normIdx = allKnown.findIndex(r => normalizeGeoName(r) === rawNorm);
    if (normIdx !== -1) { matched.push(allKnown[normIdx]); continue; }
    // Явный алиас («мск», «спб», …) — сверяем, что такой город вообще есть в пуле.
    // ВАЖНО: до префиксного сравнения. Иначе «Нижний» уйдёт в первый попавшийся
    // город на «Нижний» (в инвентаре есть и Тагил, и Новгород), а не туда, куда
    // мы явно решили.
    const alias = CITY_ALIASES[rawNorm];
    if (alias) {
      const aliasIdx = allKnownLC.indexOf(alias.toLowerCase());
      if (aliasIdx !== -1) { matched.push(allKnown[aliasIdx]); continue; }
    }
    // Partial: known region starts with raw or raw starts with known region
    const partial = allKnown.find((r, i) =>
      allKnownLC[i].startsWith(rawLC) || rawLC.startsWith(allKnownLC[i])
    );
    if (partial) { matched.push(partial); continue; }
    // Сокращения вида «Н.Новгород» / «С.-Петербург».
    const abbrev = _resolveCityAbbrev(raw, allKnown);
    if (abbrev) { matched.push(abbrev); continue; }
    unmatched.push(raw);
  }
  return { matched: [...new Set(matched)], unmatched };
}

// ===== Yandex Geocoding + Suggest =====
// Ключ задаётся в HTML-блоке Tilda: <script>window.YANDEX_MAPS_KEY = "ваш_ключ";</script>

async function geocodeAddressYandex(query, regionHint) {
  const key = window.YANDEX_MAPS_KEY || "";
  const q0 = String(query || "").trim();
  if (!q0) return null;

  // Геокодер Яндекса лучше работает с городом в начале запроса
  const q = regionHint ? `${String(regionHint).trim()}, ${q0}` : q0;

  const url =
    `https://geocode-maps.yandex.ru/1.x/?apikey=${encodeURIComponent(key)}` +
    `&geocode=${encodeURIComponent(q)}&format=json&results=1&lang=ru_RU`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Yandex Geocoder HTTP ${res.status}`);

  const json = await res.json();
  const members = json?.response?.GeoObjectCollection?.featureMember;
  if (!Array.isArray(members) || !members.length) return null;

  const pos = members[0]?.GeoObject?.Point?.pos; // "lon lat" — внимание: lon первый!
  if (!pos) return null;

  const [lonStr, latStr] = String(pos).split(" ");
  const lon = Number(lonStr), lat = Number(latStr);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  return { lat, lon };
}

/**
 * Геокодинг через Nominatim (OpenStreetMap) — бесплатно, без ключа.
 * Если не находит — пробует Yandex (если задан YANDEX_MAPS_KEY).
 */
async function geocodeAddressNominatim(query, regionHint) {
  const q0 = String(query || "").trim();
  if (!q0) return null;

  // Direct coordinates: "@lat,lon" or "@lat,lon (hint)" format (from coordinate import)
  if (q0.startsWith("@")) {
    const m = q0.match(/^@(-?[\d.]+),(-?[\d.]+)/);
    if (m) {
      const lat = Number(m[1]), lon = Number(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  }

  // Yandex — primary if key available (better quality for Russian addresses)
  if (window.YANDEX_MAPS_KEY) {
    try {
      const pt = await geocodeAddressYandex(query, regionHint);
      if (pt) return pt;
    } catch(e) {
      console.warn("[geo] Yandex failed, falling back to Nominatim:", e.message);
    }
  }

  // Fallback: Nominatim (OpenStreetMap)
  const q = regionHint ? `${String(regionHint).trim()}, ${q0}` : q0;
  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=0`;
    const res = await fetch(url, {
      headers: { "Accept-Language": "ru", "User-Agent": "DSP-Planner/1.0" }
    });
    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
    const json = await res.json();
    if (Array.isArray(json) && json.length) {
      const lat = Number(json[0].lat);
      const lon = Number(json[0].lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    }
  } catch (e) {
    console.warn("[geo] Nominatim failed:", e.message);
  }

  return null;
}

// Suggest: возвращает [{title, subtitle}] для выпадающего списка
async function suggestYandex(text) {
  const key = window.YANDEX_MAPS_KEY || "";
  if (!key || !String(text || "").trim()) return [];
  try {
    const url =
      `https://suggest-maps.yandex.ru/suggest-geo?v=9&lang=ru_RU&search_type=all` +
      `&results=7&highlight=0&text=${encodeURIComponent(text)}&apikey=${encodeURIComponent(key)}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json?.results || []).map(r => ({
      title:    r.title?.text    || "",
      subtitle: r.subtitle?.text || "",
    }));
  } catch {
    return [];
  }
}

// Привязывает suggest-дропдаун к инпуту
function attachAddressSuggest(inputEl) {
  if (!inputEl || inputEl._suggestAttached) return;
  inputEl._suggestAttached = true;

  let timer = null;
  let dropdown = null;

  function closeDropdown() {
    dropdown?.remove();
    dropdown = null;
  }

  function openDropdown(items) {
    closeDropdown();
    if (!items.length) return;

    dropdown = document.createElement("div");
    dropdown.style.cssText =
      "position:absolute;z-index:9999;background:#fff;border:1px solid #ddd;" +
      "border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);width:100%;max-height:220px;" +
      "overflow-y:auto;margin-top:2px;";

    items.forEach(item => {
      const row = document.createElement("div");
      row.style.cssText = "padding:8px 12px;cursor:pointer;font-size:13px;line-height:1.4;";
      row.innerHTML =
        `<div style="font-weight:500;">${escapeHtml(item.title)}</div>` +
        (item.subtitle ? `<div style="color:#888;font-size:11px;">${escapeHtml(item.subtitle)}</div>` : "");
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        inputEl.value = item.title + (item.subtitle ? `, ${item.subtitle}` : "");
        closeDropdown();
      });
      dropdown.appendChild(row);
    });

    // позиционируем относительно враппера
    const wrap = inputEl.parentElement;
    if (wrap && getComputedStyle(wrap).position === "static") wrap.style.position = "relative";
    inputEl.insertAdjacentElement("afterend", dropdown);
  }

  inputEl.addEventListener("input", () => {
    clearTimeout(timer);
    const val = inputEl.value.trim();
    if (!val) { closeDropdown(); return; }
    timer = setTimeout(async () => {
      const items = await suggestYandex(val);
      openDropdown(items);
    }, 300);
  });

  inputEl.addEventListener("blur", () => setTimeout(closeDropdown, 150));
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDropdown(); });
}

// Адреса объектов бренда из 2ГИС. Отдаём адрес ВМЕСТЕ с точкой: координата уже
// известна, и повторно геокодировать её незачем.
// Ключ и воркер-прокси те же, что использовал прежний блок «Рядом с объектами».
const GEO2GIS_KEY = "ba3c806e-746b-40b7-a1c8-4fc79c1a9667";
const GEO2GIS_PROXY = "https://silent-surf-cd5e.mochalova-kathrine-v.workers.dev/2gis";

async function fetch2gisAddresses(query, centerLat, centerLon, onProgress) {
  const PAGE_SIZE = 50;
  const CITY_RADIUS = 50000;   // поиск по городу целиком
  const MAX_PAGES = 40;        // предохранитель: 40 × 50 = 2000 объектов
  const out = [];
  const seen = new Set();

  let page = 1, totalPages = 1, total = 0;
  while (page <= totalPages && page <= MAX_PAGES) {
    const url = GEO2GIS_PROXY +
      "?q=" + encodeURIComponent(query) +
      "&location=" + centerLon + "," + centerLat +
      "&radius=" + CITY_RADIUS +
      "&page=" + page +
      "&page_size=" + PAGE_SIZE +
      "&fields=" + encodeURIComponent("items.point,items.address_name,items.full_address_name") +
      "&key=" + GEO2GIS_KEY;

    const data = await fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
    if (!data?.result) break;

    const items = data.result.items || [];
    for (const item of items) {
      const pt = item.point;
      if (!pt || !Number.isFinite(Number(pt.lat)) || !Number.isFinite(Number(pt.lon))) continue;
      const address = String(item.full_address_name || item.address_name || item.name || "").trim();
      if (!address) continue;
      const key = normalizeKey(address);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ address, lat: Number(pt.lat), lon: Number(pt.lon) });
    }

    total = data.result.total || 0;
    totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (typeof onProgress === "function") onProgress(out.length, total);
    page++;
    if (!items.length) break;
  }
  return out;
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
  // DSP mode: подгружаем инвентарь для выбранных регионов перед расчётом
  if (window.DSP_AUTH_ENABLED && state.dspCities) {
    const brief0 = buildBrief();
    const regions0 = Array.isArray(brief0?.geo?.regions) ? brief0.geo.regions : [];
    if (regions0.length) {
      await dspEnsureInventoryForRegions(regions0);
      // Defensive re-apply: dspEnsureInventoryForRegions builds state.screens from
      // raw (base-duration) cached inventory and normally relies on the
      // "planner:screens-ready" listener in widget-init.js to resolve per-duration
      // bids. Don't depend on that cross-file wiring being bound in time — resolve here too.
      if (state.selectedDurationMs) applySelectedDuration(state.selectedDurationMs);
    }
  }

  const brief = buildBrief();
  const pphTarget = targetPlaysPerHourPerScreen(brief.reachMode);

  if (!brief.dates.start || !brief.dates.end) {
    alert("Выберите даты начала и окончания.");
    return;
  }

  const _selModeForRegions = brief?.selection?.mode;
  let regions = Array.isArray(brief?.geo?.regions) && brief.geo.regions.length
    ? brief.geo.regions.map(x => String(x || "").trim()).filter(Boolean)
    : (brief?.geo?.region ? [String(brief.geo.region).trim()] : []);

  if (!regions.length) {
    if (_selModeForRegions === "manual_screens") {
      // GID mode without regions: treat all screens as one pool
      regions = ["__gid_mode__"];
    } else {
      alert("Выберите регион(ы).");
      return;
    }
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

  if (brief.budget.mode === "goal_plays") {
    if (!brief.goal?.plays || brief.goal.plays <= 0) {
      alert("Введите целевое количество показов.");
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

  const hpd = hpdFixed; // always use actual schedule hours; RECO_HOURS_PER_DAY was causing 12h vs real hours mismatch

  // aggregates
  let chosenAll = [];
  let totalBudgetFinal = 0;
  let totalPlaysEffectiveAll = 0;

  let otsTotalAll = 0;
  let hasOts = true;

  let warnings = [];
  let anyPOIs = [];
  let perRegionRows = [];

  // Трекинг ненайденных GID (для кнопки «скачать не найденные»)
  const _isManualMode = brief.selection?.mode === "manual_screens";
  const _manualGidSet = _isManualMode ? (brief.selection.manual_gids || new Set()) : new Set();
  const _foundGids    = new Set(); // GID-ы, которые реально попали в расчёт

  const isNearAddress = (brief.selection?.mode === "near_address");

  // ===== Pre-geocode addresses (once, before region loop) =====
  let _geocodedPoints = null;
  if (isNearAddress) {
    const addresses = (brief.selection.addresses && brief.selection.addresses.length)
      ? brief.selection.addresses
      : (brief.selection.address ? [brief.selection.address] : []);

    if (!addresses.length) {
      alert("Введите хотя бы один адрес.");
      setStatus(""); return;
    }

    _geocodedPoints = [];
    const GEOCODE_DELAY_MS = 350; // Nominatim rate limit: 1 req/sec
    for (let i = 0; i < addresses.length; i++) {
      const addr = addresses[i];
      // Список адресов уже геокодировал каждую строку, когда считал экраны рядом —
      // берём готовую точку и не ходим в геокодер второй раз.
      const cached = state.addressPoints?.get(normalizeKey(addr));
      if (cached) { _geocodedPoints.push(cached); continue; }

      setStatus(`Геокодирую ${i + 1}/${addresses.length}: «${addr}»…`);
      try {
        const pt = await geocodeAddressNominatim(addr);
        if (pt) {
          _geocodedPoints.push(pt);
          state.addressPoints?.set(normalizeKey(addr), pt);
        } else console.warn("[geo] not found:", addr);
      } catch (e) {
        console.error("[geo] geocode error:", e);
      }
      // Rate-limit delay for Nominatim (skip if coord or Yandex key set)
      if (!addr.startsWith("@") && !window.YANDEX_MAPS_KEY && i < addresses.length - 1) {
        await new Promise(r => setTimeout(r, GEOCODE_DELAY_MS));
      }
    }

    if (!_geocodedPoints.length) {
      alert("Ни один адрес не найден. Попробуй уточнить (город, улица, дом).");
      setStatus(""); return;
    }
    setStatus(`Геокодировано: ${_geocodedPoints.length} из ${addresses.length} адресов`);
    // Сохраняем для возможной выгрузки (как POI)
    window.PLANNER.lastGeocodedPoints = _geocodedPoints.map((pt, i) => ({
      lat: pt.lat, lon: pt.lon,
      name: addresses[i] || `Адрес ${i + 1}`,
      id: `addr_${i}`
    }));
    window.dispatchEvent(new CustomEvent("planner:geocoded-ready", {
      detail: { count: _geocodedPoints.length }
    }));
  }

  // =========================
  // 1) PREPARE POOLS PER REGION
  // =========================
  const prepared = [];
  const sourceScreens = (Array.isArray(state.screens) && state.screens.length)
    ? state.screens
    : (Array.isArray(state.screensAll) ? state.screensAll : []);

  for (const region of regions) {
    const regionDisplay = region === "__gid_mode__" ? "По GID-списку" : region;
    const tier = getTierForGeo(region);
    const selectedNorm = normalizeGeoName(region);
    // __gid_mode__: no region filter — GIDs act as the sole selector.
    // Always use screensAll (full inventory) to avoid stale state.screens from a prior session.
    let pool = region === "__gid_mode__"
      ? [...(Array.isArray(state.screensAll) && state.screensAll.length ? state.screensAll : sourceScreens)]
      : sourceScreens.filter(s => {
          const r = String(s.region || "").trim();
          const c = String(s.city || "").trim();
          if (r === region || c === region) return true;
          if (!selectedNorm) return false;
          const rn = normalizeGeoName(r);
          const cn = normalizeGeoName(c);
          if (rn === selectedNorm || cn === selectedNorm) return true;
          // Fuzzy fallback for suffix/prefix variants in API city labels.
          return (
            (rn && (rn.includes(selectedNorm) || selectedNorm.includes(rn))) ||
            (cn && (cn.includes(selectedNorm) || selectedNorm.includes(cn)))
          );
        });

    if (!pool.length) {
      console.warn("[DSP] empty pool at region step", {
        selected: region,
        selectedNorm,
        screensTotal: sourceScreens.length,
        source: (Array.isArray(state.screens) && state.screens.length) ? "state.screens" : "state.screensAll",
        sampleRegions: [...new Set(sourceScreens.map(s => String(s.region || "").trim()).filter(Boolean))].slice(0, 10),
        sampleCities: [...new Set(sourceScreens.map(s => String(s.city || "").trim()).filter(Boolean))].slice(0, 10)
      });
    }

    // Format / owner / polygon filters — skipped in GID mode (user's list is the selection)
    if (!_isManualMode) {
      // ✅ per-city override takes priority over global format selection
      const _cityFmtOverride = state.cityFormats?.[region];
      const _activeFmtSet = (_cityFmtOverride && _cityFmtOverride.size > 0)
        ? _cityFmtOverride
        : (formatsMode === "manual" && manualFormats.length > 0 ? new Set(manualFormats) : null);
      if (_activeFmtSet) {
        pool = pool.filter(s => _activeFmtSet.has(String(s.format || "").trim()));
      }

      if (window.PLANNER?.getScreensFilteredByOwner) {
        pool = window.PLANNER.getScreensFilteredByOwner(pool);
      }

      // Фильтр по стороне экрана (A/Б), выбирается на шаге 4
      if (state.selectedSides && state.selectedSides.size > 0) {
        pool = pool.filter(s => state.selectedSides.has(String(s.side || "").trim()));
      }

      // Фильтр по нарисованным полигонам (массив полигонов или один полигон — обратная совместимость)
      const poly = state.polygonFilter;
      if (poly && poly.length > 0) {
        const isMulti = Array.isArray(poly[0]) && Array.isArray(poly[0][0]);
        if (isMulti) {
          pool = pool.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon) &&
            poly.some(p => pointInPolygon(s.lat, s.lon, p)));
        } else if (poly.length >= 3) {
          pool = pool.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon) &&
            pointInPolygon(s.lat, s.lon, poly));
        }
      }
    }

    if (pool.length === 0) {
      perRegionRows.push({ region: regionDisplay, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет экранов" });
      continue;
    }

    // Near address mode — поддержка нескольких адресов
    if (isNearAddress) {
      const screenRadius = Number(brief.selection.radius_m || 500);

      if (!window.GeoUtils?.haversineMeters) {
        alert("GeoUtils не найден. Проверь подключение geo.js");
        setStatus(""); return;
      }

      // Use pre-geocoded points (computed once before the region loop)
      const points = _geocodedPoints || [];

      if (!points.length) {
        alert("Ни один адрес не найден. Попробуй уточнить (город, улица, дом).");
        setStatus(""); return;
      }

      // Берём экраны в радиусе от ЛЮБОГО из найденных точек
      const before = pool.length;
      const screenSet = new Set();
      for (const pt of points) {
        for (const s of pickScreensNearPoint(pool, pt, screenRadius)) {
          screenSet.add(s);
        }
      }
      pool = [...screenSet];

      if (!pool.length) {
        perRegionRows.push({ region: regionDisplay, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет экранов у адресов" });
        continue;
      }

      setStatus(`Экраны у ${points.length} адресов: ${pool.length} из ${before} (радиус: ${screenRadius} м)`);
    }

    // Manual GID filter — базовый набор = указанные GID-ы (сохраняются ВСЕГДА).
    // Дополнительно: экраны внутри нарисованной на карте зоны, суженные выбранными
    // форматами/операторами, ДОБАВЛЯЮТСЯ к GID-набору. На сами GID-экраны фильтры
    // форматов/операторов НЕ влияют. Зона не нарисована → ничего не добавляется
    // (поведение 1-в-1 как раньше — обратная совместимость).
    if (brief.selection?.mode === "manual_screens") {
      const gidSet = brief.selection.manual_gids || new Set();

      // --- Дополнительная зона на карте (аддитивно) ---
      const _addPolyRaw  = state.polygonFilter;
      const _addPolyList = (_addPolyRaw && _addPolyRaw.length)
        ? (Array.isArray(_addPolyRaw[0]) && Array.isArray(_addPolyRaw[0][0])
            ? _addPolyRaw
            : (_addPolyRaw.length >= 3 ? [_addPolyRaw] : []))
        : [];
      const _addFmt  = (state.gidExtraFormats && state.gidExtraFormats.size > 0) ? state.gidExtraFormats : null;
      const _addOwn  = (state.gidExtraOwners  && state.gidExtraOwners.size  > 0) ? state.gidExtraOwners  : null;
      const _ownerOf = (s) => String(s.owner ?? s.OWNER ?? s.operator ?? s.vendor ?? s.network ?? "").trim();
      const _isAddedScreen = (s) => {
        if (!_addPolyList.length) return false;
        if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return false;
        if (!_addPolyList.some(p => pointInPolygon(s.lat, s.lon, p))) return false;
        if (_addFmt && !_addFmt.has(String(s.format || "").trim())) return false;
        if (_addOwn && !_addOwn.has(_ownerOf(s))) return false;
        return true;
      };

      if (gidSet.size > 0 || _addPolyList.length) {
        const before = pool.length;
        const seenGids = new Set();
        let addedFromZone = 0;
        pool = pool.filter(s => {
          const sid = _screenIdOf(s);
          // 1) типизированный GID-список — сохраняем всегда
          if (gidSet.has(sid) && !seenGids.has(sid)) {
            seenGids.add(sid);
            _foundGids.add(sid);
            return true;
          }
          // 2) добавленные с карты (в зоне + подходят по формату/оператору),
          //    исключая уже учтённые GID-экраны
          if (!gidSet.has(sid) && _isAddedScreen(s)) {
            addedFromZone++;
            return true;
          }
          return false;
        });
        // GID-ы из списка, не найденные в инвентаре (для кнопки «скачать не найденные»)
        const notFound = [];
        gidSet.forEach(g => { if (!seenGids.has(g)) notFound.push(g); });
        console.log("[GID-filter] gidSet.size=" + gidSet.size + " matched=" + seenGids.size + " added-from-zone=" + addedFromZone + " pool.before=" + before + " pool.after=" + pool.length + " notFound=" + JSON.stringify(notFound.slice(0,10)));
        if (!pool.length) {
          perRegionRows.push({ region: regionDisplay, tier, budget: 0, screens: 0, plays: 0, ots: null,
            note: `ни один из ${gidSet.size} GID-ов не найден, и зона пуста` });
          continue;
        }
        setStatus(`Отобрано: ${pool.length} (GID: ${seenGids.size}${addedFromZone ? `, +${addedFromZone} с карты` : ""}) в регионе «${region}»`);
      }
    }

    // In GID mode the user explicitly specified which screens to use —
    // skip GRP and bid-filter so the count stays fixed.
    // VK Affinity filter — top-X% by avg affinity score across selected segments.
    // Работает и в городском, и в GID-режиме: в GID-режиме базой служит сам
    // GID-список (+ экраны, добавленные с карты), поэтому фильтр сужает именно
    // пользовательский набор. Тумблер «Аудитория VK» выключен по умолчанию →
    // без него количество экранов в GID-режиме по-прежнему не меняется.
    if (brief.audience?.enabled && brief.audience.segments?.length > 0) {
      if (state.affinityMap?.size > 0) {
        const segs = brief.audience.segments;
        const topPct = brief.audience.topPct ?? 0.10;
        const before = pool.length;
        // Score each screen in pool
        const hasPremiumSeg = segs.some(seg => PREMIUM_INCOME_SEGS.has(seg));
        let noVkData = 0;
        const withScore = pool.map(s => {
          const aff = state.affinityMap.get(_screenIdOf(s));
          if (!aff) noVkData++;
          const excl = hasPremiumSeg && _isExcludedForPremium(s);
          const score = aff ? segs.reduce((sum, seg) => {
            if (excl && PREMIUM_INCOME_SEGS.has(seg)) return sum;
            return sum + (aff[seg] ?? 0);
          }, 0) / segs.length : 0;
          return { s, score };
        });
        withScore.sort((a, b) => b.score - a.score);
        const keepN = Math.max(1, Math.ceil(before * topPct));
        pool = withScore.slice(0, keepN).map(x => x.s);
        setStatus(`Аудитория: топ ${Math.round(topPct * 100)}% → ${pool.length} из ${before}`);
        // В GID-режиме предупреждаем отдельно: экраны без данных ВК получают
        // score = 0 и отбрасываются первыми, т.е. фильтр может выкинуть часть
        // введённого списка — пользователь должен это видеть.
        if (_isManualMode) {
          const _where = region === "__gid_mode__" ? "" : ` в «${regionDisplay}»`;
          warnings.push(
            `ℹ️ Фильтр ВК${_where}: из ${before} экранов GID-списка оставлено ${pool.length} ` +
            `(топ ${Math.round(topPct * 100)}% по [${segs.join(", ")}])` +
            (noVkData > 0 ? `; у ${noVkData} экр. нет данных ВК — они отбираются последними.` : ".")
          );
        }
        if (!pool.length) {
          perRegionRows.push({ region: regionDisplay, tier, budget: 0, screens: 0, plays: 0, ots: null,
            note: `аффинити-фильтр: нет экранов в топ ${Math.round(topPct * 100)}% по [${segs.join(", ")}]` });
          continue;
        }
      }
    }

    // In constructions mode or GID mode keep all screens — estimate bid for no-bid screens.
    // onlyActiveBids=true → filter out no-bid screens (default-safe for city mode).
    // onlyActiveBids=false or GID mode → estimate bid for no-bid screens from same-format avg.
    const _skipBidFilter = (brief.constructions?.enabled && brief.constructions.count > 0) || _isManualMode;
    if (!_skipBidFilter) {
      const bidScreens = pool.filter(hasActiveInventory);
      if (bidScreens.length > 0) {
        if (brief.onlyActiveBids !== false) {
          pool = bidScreens;
        } else {
          const fmtAvg = {};
          for (const s of bidScreens) {
            if (!fmtAvg[s.format]) fmtAvg[s.format] = { sum: 0, n: 0 };
            fmtAvg[s.format].sum += s.minBid; fmtAvg[s.format].n++;
          }
          const regionAvg = bidScreens.reduce((a, s) => a + s.minBid, 0) / bidScreens.length;
          pool = pool.map(s => {
            if (Number.isFinite(s.minBid) && s.minBid > 0) return s;
            const f = fmtAvg[s.format];
            return { ...s, minBid: f ? f.sum / f.n : regionAvg, _bidEstimated: true };
          });
        }
      }
    } else {
      // GID mode or constructions mode: estimate bids for screens that don't have one
      const bidScreens = pool.filter(hasActiveInventory);
      if (bidScreens.length > 0 && bidScreens.length < pool.length) {
        const fmtAvg = {};
        for (const s of bidScreens) {
          if (!fmtAvg[s.format]) fmtAvg[s.format] = { sum: 0, n: 0 };
          fmtAvg[s.format].sum += s.minBid; fmtAvg[s.format].n++;
        }
        const regionAvg = bidScreens.reduce((a, s) => a + s.minBid, 0) / bidScreens.length;
        pool = pool.map(s => {
          if (Number.isFinite(s.minBid) && s.minBid > 0) return s;
          const f = fmtAvg[s.format];
          return { ...s, minBid: f ? f.sum / f.n : regionAvg, _bidEstimated: true };
        });
      }
    }

    // GRP filter (skipped in GID mode)
    let grpDroppedNoValue = 0;
    if (!_isManualMode && brief.grp?.enabled) {
      grpDroppedNoValue = pool.filter(s => !Number.isFinite(s.grp)).length;

      pool = pool.filter(s =>
        Number.isFinite(s.grp) &&
        s.grp >= brief.grp.min &&
        s.grp <= brief.grp.max
      );

      if (pool.length === 0) {
        perRegionRows.push({ region: regionDisplay, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "GRP выкинул всё" });
        warnings.push(`⚠️ Регион «${regionDisplay}»: GRP-фильтр исключил все экраны (без GRP было: ${grpDroppedNoValue}).`);
        continue;
      }

      warnings.push(`⚠️ Регион «${regionDisplay}»: GRP-фильтр включён, без GRP исключены (без GRP: ${grpDroppedNoValue}).`);
    }

    // Надбавка входит и в avgBid/bidPlus20: они кормят потолки ёмкости и распределение
    // бюджета, иначе «+X %» поднял бы фактическую ставку, но не плановые суммы.
    const avgMinBid = avgNumber(pool.map(s => s.minBid));
    if (avgMinBid == null) {
      perRegionRows.push({ region: regionDisplay, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "нет minBid" });
      continue;
    }
    const avgBid = avgMinBid * bidUpliftFactor(brief);
    const bidPlus20 = avgBid * BID_MULTIPLIER;

    // ots = viewers per single play. Use avgNumberNonZero to exclude
    // screens with ots=0 (no data) so they don't pull the average down.
    const avgOts = avgNumberNonZero(pool.map(s => s.ots));

    const capPlaysAbs = Math.floor(pool.reduce((sum, s) => sum + getScreenPphCap(s), 0) * days * hpd);
    const capBudgetAbs = Math.floor(capPlaysAbs * bidPlus20);
    const capBudgetAbsMin = Math.floor(capPlaysAbs * avgBid);
    const capOtsAbs = (avgOts == null) ? null : (capPlaysAbs * avgOts);

    prepared.push({
      region: regionDisplay, regionKey: region, tier, pool,
      avgBid, bidPlus20,
      avgOts,
      capPlaysAbs, capBudgetAbs, capBudgetAbsMin, capOtsAbs
    });
  }

  if (!prepared.length) {
    alert("Не удалось подобрать экраны: по выбранным условиям не осталось доступных экранов.");
    setStatus("");
    return;
  }

  // =========================
  // 1b) ПЛАНОВАЯ ЁМКОСТЬ
  // =========================
  // Считаем потолок по показам для всего собранного пула и сверяем с тем, что
  // запросил клиент. Если запрошенное больше — говорим прямо, что именно упирается
  // в лимит и какой лимит, а не молча урезаем результат в середине расчёта.
  const capacityAll = computeCapacity(prepared.flatMap(r => r.pool), days * hpdFixed, brief.bidMode, bidUpliftFactor(brief));
  if (capacityAll) {
    const capTxt =
      `лимит ${capacityAll.plays.toLocaleString("ru-RU")} показов ` +
      `(${capacityAll.screens.toLocaleString("ru-RU")} поверхностей × ` +
      `${Math.round(capacityAll.hours).toLocaleString("ru-RU")} ч размещения)`;

    if (brief.budget.mode === "fixed" && capacityAll.budget != null) {
      const asked = Number(brief.budget.amount || 0);
      if (asked > capacityAll.budget) {
        warnings.push(
          `⚠️ Бюджет ${Math.round(asked).toLocaleString("ru-RU")} ₽ превышает ёмкость инвентаря: ` +
          `освоить получится не больше ${capacityAll.budget.toLocaleString("ru-RU")} ₽ — ${capTxt}.`
        );
      }
    } else if (brief.budget.mode === "goal_plays") {
      const asked = Number(brief.goal?.plays || 0);
      if (asked > capacityAll.plays) {
        warnings.push(
          `⚠️ Цель ${Math.round(asked).toLocaleString("ru-RU")} показов превышает ёмкость инвентаря — ${capTxt}.`
        );
      }
    } else if (brief.budget.mode === "goal_ots" && capacityAll.ots != null) {
      const asked = Number(brief.goal?.ots || 0);
      if (asked > capacityAll.ots) {
        warnings.push(
          `⚠️ Цель ${Math.round(asked).toLocaleString("ru-RU")} OTS превышает ёмкость инвентаря: ` +
          `максимум ${capacityAll.ots.toLocaleString("ru-RU")} OTS — ${capTxt}.`
        );
      }
    }
  }

  // =========================
  // 2) INITIAL BUDGETS
  // =========================
  const budgets = {};
  let goalPlan = null;
  let goalPlanUnmet = 0;

  if (brief.budget.mode === "fixed") {
    if (brief.budget.perCity && Object.keys(brief.budget.perCity).length > 0) {
      // User specified per-city budgets — use directly
      for (const r of prepared) {
        budgets[r.region] = Number(brief.budget.perCity[r.region] || 0);
      }
    } else {
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

  } else if (brief.budget.mode === "goal_plays") {
    const totalPlaysGoal = Number(brief.goal?.plays || 0);
    if (!Number.isFinite(totalPlaysGoal) || totalPlaysGoal <= 0) {
      alert("Введите корректное количество показов.");
      setStatus("");
      return;
    }
    // Distribute plays across regions proportionally to pool capacity
    const totalCapPlays = prepared.reduce((s, r) => s + Math.floor(SC_MAX * RECO_HOURS_PER_DAY * r.pool.length * days), 0);
    for (const r of prepared) {
      const capPlays = Math.floor(SC_MAX * RECO_HOURS_PER_DAY * r.pool.length * days);
      const share = totalCapPlays > 0 ? capPlays / totalCapPlays : 1 / prepared.length;
      const regionPlays = Math.floor(totalPlaysGoal * share);
      const avgBid = avgEffectiveBid(r.pool, brief.bidMode, 1, bidUpliftFactor(brief));
      budgets[r.region] = Math.ceil(regionPlays * avgBid);
      // Store planned plays for use in region loop
      if (!goalPlan) goalPlan = {};
      goalPlan[r.region] = { playsPlanned: regionPlays, budgetPlanned: budgets[r.region] };
    }

  } else {
    // Recommendation mode
    if (brief.constructions?.enabled && brief.constructions.count > 0) {
      // Бюджет = N конструкций × выходов/ч по выбранному тиру × реальных часов
      // кампании × avg рекомендованная ставка. Берём ёмкость (recoPphForTier), а не
      // pphTarget (стратегия охвата/частоты): pphTarget определяет кол-во экранов,
      // ёмкость — реальный объём планирования.
      const N = brief.constructions.count;
      const allPoolScreens0 = prepared.flatMap(r => r.pool);
      // Используем уже загруженный recoBid (если DSP-режим) или minBid×BID_MULTIPLIER
      const recoBid = avgEffectiveBid(allPoolScreens0, brief.bidMode, 1, bidUpliftFactor(brief));
      // Частота ограничена плановой ёмкостью формата: «максимум» не должен просить
      // больше показов, чем инвентарь физически способен отдать.
      const _capPph = capacityAll ? capacityAll.avgPph : CAPACITY_PPH_DEFAULT;
      const _pph = Math.min(recoPphForTier(brief.recoTier, _capPph), _capPph);
      const totalBudget = Math.round(N * _pph * days * hpdFixed * recoBid);

      const alloc = allocateBudgetAcrossRegions(
        totalBudget,
        prepared.map(r => ({ key: r.region, tier: getTierForGeo(r.region) })),
        { minShare: 0.10, maxShare: 0.70 }
      );
      for (const r of prepared) {
        const found = alloc?.find(x => x.region === r.region);
        budgets[r.region] = found ? Number(found.budget) : 0;
      }
    } else {
      // In GID mode with explicit ppm set — calculate budget directly from N × ppm × hpd × days × bid
      const _gidPpmGlobal = Number(brief.constructions?.playsPerHour || 0);
      const _isGidRecoWithPpm = _isManualMode && _gidPpmGlobal > 0;

      if (_isGidRecoWithPpm) {
        const allGidScreens = prepared.flatMap(r => r.pool);
        const recoBid = avgEffectiveBid(allGidScreens, brief.bidMode, 1, bidUpliftFactor(brief));
        const totalBudget = Math.round(allGidScreens.length * _gidPpmGlobal * hpdFixed * days * recoBid);
        const alloc = allocateBudgetAcrossRegions(
          totalBudget,
          prepared.map(r => ({ key: r.region, tier: getTierForGeo(r.region) })),
          { minShare: 0.10, maxShare: 0.70 }
        );
        for (const r of prepared) {
          const found = alloc?.find(x => x.region === r.region);
          budgets[r.region] = found ? Number(found.budget) : Math.round(totalBudget / prepared.length);
        }
      } else {
      // Use computeRecoBudgetTiers if available to respect recoTier selection
      const recoTier = brief.recoTier || "optimal"; // "min" | "optimal" | "max"
      const BASE_MONTHLY_BY_TIER = { M: 2_000_000, SP: 1_500_000, A: 1_000_000, B: 500_000, C: 300_000, D: 100_000 };
      const MAX_MONTHLY_BY_TIER  = { M: 30_000_000, SP: 15_000_000, A: 5_000_000, B: 2_000_000, C: 1_000_000, D: 300_000 };

      for (const r of prepared) {
        // Потолок — плановая ёмкость на реальных часах расписания (раньше здесь был
        // SC_MAX × RECO_HOURS_PER_DAY, т.е. 60 вых/ч × условные 12 ч/день, что давало
        // потолок заметно выше реально осваиваемого объёма).
        const cap = computeCapacity(r.pool, days * hpdFixed, brief.bidMode, bidUpliftFactor(brief));
        const capBudget = cap?.budget ?? Infinity;

        const optRaw = Math.floor((BASE_MONTHLY_BY_TIER[r.tier] ?? BASE_MONTHLY_BY_TIER.C) * (days / 30));
        const maxRaw = Math.floor((MAX_MONTHLY_BY_TIER[r.tier]  ?? MAX_MONTHLY_BY_TIER.C)  * (days / 30));
        const optimal = Math.min(optRaw, capBudget);
        const max     = Math.min(maxRaw, capBudget);
        const min     = Math.round(optimal * 0.35);

        budgets[r.region] = Math.floor(
          recoTier === "min" ? min : recoTier === "max" ? max : optimal
        );
      }
      }
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
  if (brief.budget.mode !== "goal_ots" && brief.budget.mode !== "goal_plays") {
    leftoverUnspent = redistributeByCapacity(prepared, budgets);
    if (leftoverUnspent > 0) {
      warnings.push(
        `⚠️ Общая ёмкость выбранных регионов ограничена: не удалось распределить ` +
        `${Math.floor(leftoverUnspent).toLocaleString("ru-RU")} ₽ (нет инвентаря).`
      );
    }
  }

  // =========================
  // 3.5) FETCH REAL RECO BIDS (DSP only)
  // =========================
  if (window.DSP_AUTH_ENABLED && getDspToken()) {
    try {
      setStatus("Загружаю прогноз ставок…");
      const allPoolScreens = prepared.flatMap(r => r.pool);
      await dspFetchForecastBids(allPoolScreens, brief);

      // Пересчитываем bidPlus20 по реальным recoBid для каждого региона
      for (const pr of prepared) {
        const recos = pr.pool.map(s => s.recoBid).filter(v => Number.isFinite(v) && v > 0);
        if (recos.length > 0) {
          pr.bidPlus20 = (recos.reduce((a, b) => a + b, 0) / recos.length) * bidUpliftFactor(brief);
          pr.capBudgetAbs = Math.floor(pr.capPlaysAbs * pr.bidPlus20);
        }
      }

      // Fixed budget: capBudgetAbs was computed from minBid before API call; now that we have
      // real recoBids, re-distribute the user's original budget with the correct caps.
      // Without this, a screen with minBid=27₽ but recoBid=128₽ would cause capBudgetAbs=65k,
      // silently capping 100k budget to 65k and leaving 34k "unspendable" even though the
      // screens CAN absorb it at higher frequency.
      if (brief.budget.mode === "fixed" && !(brief.budget.perCity && Object.keys(brief.budget.perCity).length > 0)) {
        const totalBudget = Number(brief.budget.amount);
        const newAlloc = allocateBudgetAcrossRegions(
          totalBudget,
          prepared.map(r => ({ key: r.region, tier: getTierForGeo(r.region) })),
          { minShare: 0.10, maxShare: 0.70 }
        );
        for (const r of prepared) {
          const found = newAlloc?.find(x => x.region === r.region);
          budgets[r.region] = found ? Number(found.budget) : 0;
        }
        const newLeftover = redistributeByCapacity(prepared, budgets);
        // Replace the stale capacity warning with the updated value
        const warnIdx = warnings.findIndex(w => w.includes("Общая ёмкость выбранных регионов ограничена"));
        if (warnIdx >= 0) warnings.splice(warnIdx, 1);
        if (newLeftover > 0) {
          warnings.push(
            `⚠️ Общая ёмкость выбранных регионов ограничена: не удалось распределить ` +
            `${Math.floor(newLeftover).toLocaleString("ru-RU")} ₽ (нет инвентаря).`
          );
        }
        leftoverUnspent = newLeftover;
      }

      // Если режим constructions (только recommendation) — пересчитываем бюджет с реальными recoBid
      if (brief.budget.mode === "recommendation" && brief.constructions?.enabled && brief.constructions.count > 0) {
        const allRecos = prepared.flatMap(r => r.pool.map(s => s.recoBid))
          .filter(v => Number.isFinite(v) && v > 0);
        if (allRecos.length > 0) {
          const N = brief.constructions.count;
          const overallAvgReco = allRecos.reduce((a, b) => a + b, 0) / allRecos.length;
          const _capPph2 = capacityAll ? capacityAll.avgPph : CAPACITY_PPH_DEFAULT;
          const _pph2 = Math.min(recoPphForTier(brief.recoTier, _capPph2), _capPph2);
          const totalBudget = Math.round(N * _pph2 * days * hpdFixed * overallAvgReco);
          const alloc = allocateBudgetAcrossRegions(
            totalBudget,
            prepared.map(r => ({ key: r.region, tier: getTierForGeo(r.region) })),
            { minShare: 0.10, maxShare: 0.70 }
          );
          for (const r of prepared) {
            const found = alloc?.find(x => x.region === r.region);
            budgets[r.region] = found ? Number(found.budget) : 0;
          }
        }
      }
      setStatus("");
    } catch (e) {
      console.warn("[DSP] forecast-price fetch failed, using minBid×1.8 fallback", e);
      setStatus("");
    }
  }

  // =========================
  // 4) MAIN CALC PER REGION
  // =========================

  // Distribute constructions count across regions (per-region override takes precedence)
  const _perRegionConstructionsTarget = {};
  if (brief.constructions?.enabled && brief.constructions.count > 0) {
    const N = brief.constructions.count;
    const overrides = brief.constructions.perRegionCount || {};
    const withOverride    = prepared.filter(r => overrides[r.region] != null);
    const withoutOverride = prepared.filter(r => overrides[r.region] == null);
    const explicitSum = withOverride.reduce((s, r) => s + Math.min(r.pool.length, overrides[r.region]), 0);
    const remaining   = Math.max(0, N - explicitSum);
    const totalPoolWithout = withoutOverride.reduce((s, r) => s + r.pool.length, 0);
    let distRemaining = remaining;
    for (let i = 0; i < prepared.length; i++) {
      const r = prepared[i];
      if (overrides[r.region] != null) {
        _perRegionConstructionsTarget[r.region] = Math.min(r.pool.length, overrides[r.region]);
      } else if (withoutOverride.length === 0) {
        _perRegionConstructionsTarget[r.region] = 0;
      } else {
        const isLast = withoutOverride[withoutOverride.length - 1].region === r.region;
        if (isLast) {
          _perRegionConstructionsTarget[r.region] = Math.min(r.pool.length, Math.max(0, distRemaining));
        } else {
          const share = Math.round(remaining * r.pool.length / Math.max(1, totalPoolWithout));
          const alloc = Math.min(r.pool.length, share);
          _perRegionConstructionsTarget[r.region] = alloc;
          distRemaining -= alloc;
        }
      }
    }
  }

  for (const pr of prepared) {
    const region = pr.region;          // display name, e.g. "По GID-списку"
    const regionKey = pr.regionKey || region; // original key, e.g. "__gid_mode__"
    const _isGidRegion = regionKey === "__gid_mode__";
    const regionDisplay = _isGidRegion ? "По GID-списку" : region;
    const tier = pr.tier;
    const pool = pr.pool;
    const effectiveBid = brief.bidMode === "min" ? pr.avgBid : pr.bidPlus20;
    const effectiveCapBudget = brief.bidMode === "min" ? pr.capBudgetAbsMin : pr.capBudgetAbs;

    let budget = Number(budgets[region] || 0);

    if (!Number.isFinite(budget) || budget <= 0) {
      perRegionRows.push({ region: regionDisplay, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "budget=0" });
      continue;
    }

    budget = Math.min(budget, effectiveCapBudget);

    let totalPlaysTheory = 0;
    if ((brief.budget.mode === "goal_ots" || brief.budget.mode === "goal_plays") && goalPlan && goalPlan[region]) {
      totalPlaysTheory = Math.ceil(Number(goalPlan[region].playsPlanned || 0));
      if (!Number.isFinite(totalPlaysTheory) || totalPlaysTheory < 0) totalPlaysTheory = 0;
    } else {
      totalPlaysTheory = Math.floor(budget / effectiveBid);
      if (!Number.isFinite(totalPlaysTheory) || totalPlaysTheory < 0) totalPlaysTheory = 0;
    }

    if (!Number.isFinite(totalPlaysTheory) || totalPlaysTheory <= 0) {
      perRegionRows.push({ region: regionDisplay, tier, budget: 0, screens: 0, plays: 0, ots: null, note: "цель=0" });
      continue;
    }

    let screensNeeded = computeScreensNeededForPlays(
      totalPlaysTheory,
      days,
      hpd,
      pphTarget,
      brief.budget.mode
    );

    // Если пользователь задал кол-во конструкций — распределяем пропорционально по регионам.
    // In GID mode all screens are pre-selected by the user — use the entire pool.
    const constructionsTarget = _isGidRegion
      ? pool.length
      : (brief.constructions?.enabled && brief.constructions.count > 0)
        ? (_perRegionConstructionsTarget[region] ?? brief.constructions.count)
        : null;
    let screensChosenCount = constructionsTarget !== null
      ? Math.min(pool.length, constructionsTarget)
      : Math.min(pool.length, screensNeeded);

    let chosen = [];
    let avgChosenBid = pr.avgBid;
    let effectiveChosenBid = effectiveBid;

    // В GID-режиме берём весь пул как есть — без grid-фильтрации (она выбрасывает экраны без координат).
    if (_isGidRegion) {
      chosen = [...pool];
      avgChosenBid = avgNumber(chosen.map(s => s.minBid)) ?? pr.avgBid;
      effectiveChosenBid = avgEffectiveBid(chosen, brief.bidMode, avgChosenBid * BID_MULTIPLIER, bidUpliftFactor(brief));
    }

    for (let attempt = 0; attempt < (_isGidRegion ? 0 : 2); attempt++) {
      const stepKm = gridStepKmForCount(screensChosenCount);
      // При ручном выборе форматов: perCellMax = число уникальных форматов в пуле,
      // чтобы каждый формат мог попасть в выборку из одной ячейки.
      const _fmtOrder = (formatsMode === "manual" && manualFormats.length > 0) ? manualFormats : null;
      const _fmtCount = _fmtOrder ? new Set(pool.map(s => String(s.format || "").trim()).filter(Boolean)).size : 0;
      const perCellMax = _fmtOrder
        ? Math.max(2, _fmtCount)
        : (screensChosenCount <= 15 ? 1 : 2);

      chosen = pickScreensUniformByGrid(
        pool,
        screensChosenCount,
        stepKm,
        perCellMax,
        _fmtOrder
      );

      avgChosenBid = avgNumber(chosen.map(s => s.minBid)) ?? pr.avgBid;
      effectiveChosenBid = avgEffectiveBid(chosen, brief.bidMode, avgChosenBid * BID_MULTIPLIER, bidUpliftFactor(brief));

      if (constructionsTarget !== null || !(Number.isFinite(effectiveChosenBid) && effectiveChosenBid > 0)) {
        break;
      }

      const totalPlaysTheoryByChosen = Math.floor(budget / effectiveChosenBid);
      const adjustedTotalPlaysTheory = Math.max(totalPlaysTheory, totalPlaysTheoryByChosen);
      const adjustedScreensNeeded = Math.min(
        pool.length,
        computeScreensNeededForPlays(
          adjustedTotalPlaysTheory,
          days,
          hpd,
          pphTarget,
          brief.budget.mode
        )
      );

      if (adjustedScreensNeeded <= screensChosenCount) {
        totalPlaysTheory = adjustedTotalPlaysTheory;
        break;
      }

      screensChosenCount = adjustedScreensNeeded;
      totalPlaysTheory = adjustedTotalPlaysTheory;
    }

    // Apply per-format screen count caps: trim chosen list so each format doesn't exceed its cap.
    // Cap of 0 means "exclude this format entirely". Screens not covered by any cap are kept as-is.
    const perFormatCap = brief.constructions?.perFormatCount || null;
    if (perFormatCap && Object.keys(perFormatCap).length > 0) {
      const fmtCounts = {};
      chosen = chosen.filter(s => {
        const fmt = String(s.format || "").trim();
        if (!(fmt in perFormatCap)) return true; // no cap for this format
        fmtCounts[fmt] = (fmtCounts[fmt] || 0) + 1;
        return fmtCounts[fmt] <= perFormatCap[fmt];
      });
      avgChosenBid = avgNumber(chosen.map(s => s.minBid)) ?? pr.avgBid;
      effectiveChosenBid = avgEffectiveBid(chosen, brief.bidMode, avgChosenBid * BID_MULTIPLIER, bidUpliftFactor(brief));
    }

    // В режиме конструкций:
    // - Если задан ручной ppm — кэпим по нему.
    // - Если задан только бюджет (без ручного ppm) — максимум это физический SC_MAX (60 вых/ч);
    //   фактические выходы ограничиваются бюджетом через budgetMaxPlays ниже.
    //   SC_OPT используется только в режиме рекомендации бюджета (budget=0).
    // perRegionPpm — явный per-city override (редкий), playsPerHour — слайдер UI (дефолт 10).
    // Слайдер применяется только в режиме рекомендации (budget=0): там он задаёт целевую частоту.
    // ppmOverride — верхняя планка частоты на экран в час.
    // GID + бюджет: частота = бюджет ÷ ставка, слайдер НЕ является целью → null.
    // Конструкции + бюджет: частота авто-увеличивается до SC_MAX, чтобы освоить весь бюджет → null.
    //   Исключение: явный per-region PPM override (perRegionPpm) остаётся жёстким капом.
    // Конструкции без бюджета / рекомендация: слайдер или стратегия.
    const ppmRegionOverride = Number(brief.constructions?.perRegionPpm?.[region] || 0);
    const ppmManual = ppmRegionOverride > 0 ? ppmRegionOverride : Number(brief.constructions?.playsPerHour || 0);
    const hasBudget = Number.isFinite(budget) && budget > 0;
    const ppmOverride = (constructionsTarget !== null)
      ? (hasBudget
          ? (ppmRegionOverride > 0 ? ppmRegionOverride : null)
          : (ppmManual > 0 ? ppmManual : pphTarget))
      : (_isManualMode && ppmManual > 0 ? ppmManual : null);
    const _poolPphCap = pool.length > 0
      ? Math.round(pool.reduce((sum, s) => sum + getScreenPphCap(s), 0) / pool.length)
      : SC_MAX;
    const effectivePPH = ppmOverride !== null ? Math.min(ppmOverride, _poolPphCap) : _poolPphCap;

    // Реальный расход = фактические выходы × ставка ВЫБРАННЫХ экранов (не среднее по пулу).
    // Пересчитываем totalPlaysTheory по фактической ставке выбранных экранов — это убирает
    // раздутие, которое возникает в attempt-loop когда выбираются самые дешёвые экраны:
    // дешёвые → низкий effectiveChosenBid → большой totalPlaysTheoryByChosen → while-loop
    // добирает весь пул. Теперь после финального выбора пересчитываем строго по chosen-ставке.
    if (brief.budget.mode !== "goal_ots" && brief.budget.mode !== "goal_plays" && Number.isFinite(effectiveChosenBid) && effectiveChosenBid > 0) {
      totalPlaysTheory = Math.floor(budget / effectiveChosenBid);
    }

    // Per-screen-format cap: sum individual caps (e.g. MF=12, others=60)
    const capPlaysByChosen = Math.floor(
      chosen.reduce((sum, s) => sum + Math.min(effectivePPH, getScreenPphCap(s)), 0) * days * hpd
    );
    // Если ppmOverride — теоретический максимум определяется частотой, а не бюджетом.
    // Но всё равно кэпим по бюджету, чтобы не выходить за введённую сумму.
    if (ppmOverride !== null) {
      totalPlaysTheory = capPlaysByChosen;
    }
    let totalPlaysEffective = Math.min(totalPlaysTheory, capPlaysByChosen);

    // Кэп по бюджету: сколько выходов можно купить на указанный бюджет.
    // ppm-слайдер — верхний предел частоты, но бюджет всегда ограничивает фактический расход.
    if (Number.isFinite(effectiveChosenBid) && effectiveChosenBid > 0 && Number.isFinite(budget) && budget > 0) {
      const budgetMaxPlays = Math.floor(budget / effectiveChosenBid);
      if (budgetMaxPlays < totalPlaysEffective) {
        // In GID budget mode: frequency is OUTPUT (budget ÷ bid), not a target — no warning.
        // In constructions mode with budget: warn if desired pph can't be met.
        if (_isManualMode && !_isGidRegion && chosen.length > 0 && hpd > 0 && days > 0) {
          const desiredPph = ppmOverride !== null ? ppmOverride : effectivePPH;
          const actualPph  = budgetMaxPlays / (chosen.length * hpd * days);
          if (actualPph < desiredPph - 0.5) {
            warnings.push(
              "ℹ️ Бюджет позволяет " +
              Math.round(actualPph * 10) / 10 +
              " вых/час на экран (запрошено " +
              Math.round(desiredPph * 10) / 10 +
              "). Увеличьте бюджет для полной частоты."
            );
          }
        }
        totalPlaysEffective = budgetMaxPlays;
      }
    }

    // Если выбранных экранов не хватает по ЁМКОСТИ (capPlays < theory) — добираем из пула.
    // Проверяем именно capPlaysByChosen, а не totalPlaysEffective: budget-cap не должен
    // триггерить добор экранов (иначе при дешёвых выбранных экранах добираются все 19).
    if (constructionsTarget === null && ppmOverride === null && chosen.length < pool.length) {
      const pickedSet = new Set(chosen);
      const extraPool = pool.filter(s => !pickedSet.has(s));
      // Sort so preferred operators are added first during capacity expansion
      extraPool.sort((a, b) => {
        const pa = ownerPriority(a), pb = ownerPriority(b);
        if (pa !== pb) return pa - pb;
        return (a.minBid ?? 1e18) - (b.minBid ?? 1e18);
      });
      let guardCount = 0;
      while (capPlaysByChosen < totalPlaysTheory && extraPool.length > 0 && guardCount++ < 20) {
        const shortfall = totalPlaysTheory - capPlaysByChosen;
        // Используем pphTarget, а не SC_MAX — это сохраняет порядок стратегий:
        // max_reach (pphTarget=10) добирает больше экранов, max_freq (pphTarget=60) — меньше
        const playsPerExtraScreen = Math.max(1, Math.floor(pphTarget * days * hpd));
        const extraNeeded = Math.ceil(shortfall / playsPerExtraScreen);
        const toAdd = extraPool.splice(0, Math.min(extraNeeded, extraPool.length));
        chosen = [...chosen, ...toAdd];

        avgChosenBid = avgNumber(chosen.map(s => s.minBid)) ?? pr.avgBid;
        effectiveChosenBid = avgEffectiveBid(chosen, brief.bidMode, avgChosenBid * BID_MULTIPLIER, bidUpliftFactor(brief));

        capPlaysByChosen = Math.floor(chosen.reduce((sum, s) => sum + getScreenPphCap(s), 0) * days * hpd);
        const budgetCap = (effectiveChosenBid > 0) ? Math.floor(budget / effectiveChosenBid) : Infinity;
        totalPlaysEffective = Math.min(totalPlaysTheory, capPlaysByChosen, budgetCap);
      }
    }

    // Russ Outdoor: when ALL chosen screens are Russ and have CPM (otsBid),
    // pricing is per 1000 OTS: OTS = budget / cpm × 1000; plays = OTS / avgOts
    let russOtsBased = false;
    let avgChosenCpm = null;
    if (chosen.length > 0 && chosen.every(s => isRussScreen(s))) {
      const cpms = chosen.map(s => s.otsBid).filter(v => Number.isFinite(v) && v > 0);
      if (cpms.length > 0) {
        avgChosenCpm = cpms.reduce((a, b) => a + b, 0) / cpms.length;
        const avgOtsForRuss = avgNumberNonZero(chosen.map(s => s.ots));
        if (avgOtsForRuss != null && avgOtsForRuss > 0 && budget > 0) {
          const otsByBudget = Math.floor(budget / avgChosenCpm * 1000);
          totalPlaysEffective = Math.round(otsByBudget / avgOtsForRuss);
          russOtsBased = true;
        }
      }
    }

    totalPlaysEffectiveAll += totalPlaysEffective;

    const actualBudget = russOtsBased
      ? budget
      : Math.ceil(totalPlaysEffective * effectiveChosenBid);
    totalBudgetFinal += actualBudget;

    if (brief.budget.mode !== "goal_ots" && brief.budget.mode !== "goal_plays") {
      const playsPerHourPerScreen = (totalPlaysEffective / days / hpd) / Math.max(1, chosen.length);
      // Частоту сравниваем ТОЛЬКО с явно запрошенной: ppm-слайдер конструкций или
      // per-region override. «Стратегия подбора» задаёт количество экранов, а не
      // частоту, и её дефолт (max_reach → 5 вых/ч) почти всегда ниже фактической —
      // из-за этого предупреждения «выше/ниже выбранной стратегии» вылезали
      // практически на каждом расчёте, хотя стратегию пользователь не выбирал.
      // В GID-режиме с бюджетом частота — результат (бюджет ÷ ставка), не цель.
      const desiredPph = (_isGidRegion && hasBudget) ? null : (ppmManual > 0 ? ppmManual : null);
      if (desiredPph != null && playsPerHourPerScreen < desiredPph - 0.4) {
        warnings.push(`⚠️ Регион «${regionDisplay}»: бюджет позволяет ${playsPerHourPerScreen.toFixed(1)} вых/час на экран (запрошено ${desiredPph}). Увеличьте бюджет для полной частоты.`);
      }
    }

    // OTS = avg(s.ots per play) × totalPlays  — s.ots уже OTS за один выход
    const avgChosenOts = avgNumberNonZero(chosen.map(s => s.ots));
    const otsTotal = avgChosenOts != null
      ? Math.round(totalPlaysEffective * avgChosenOts) : null;
    if (avgChosenOts == null) hasOts = false;
    if (otsTotal != null) otsTotalAll += otsTotal;

    chosenAll = chosenAll.concat(chosen);

    perRegionRows.push({
      region,
      tier,
      budget: actualBudget,
      screens: chosen.length,
      poolSize: pool.length,
      plays: totalPlaysEffective,
      ots: otsTotal,
      avgCpm: avgChosenCpm,
      russOts: russOtsBased,
      note: ""
    });
  }

  // Global deduplication: same screen_id/GID may appear in multiple region pools
  // (e.g. when a screen's city matches several selected regions via fuzzy logic).
  {
    const seenIds = new Set();
    chosenAll = chosenAll.filter(s => {
      const sid = _screenIdOf(s);
      if (!sid || seenIds.has(sid)) return false;
      seenIds.add(sid);
      return true;
    });
  }

  if (!chosenAll.length) {
    alert("Не удалось подобрать экраны: по выбранным условиям не осталось доступных экранов.");
    setStatus("");
    return;
  }

  // Предупреждение если в режиме конструкций выбрано меньше, чем запрошено
  if (brief.constructions?.enabled && brief.constructions.count > 0) {
    const totalChosen = chosenAll.length;
    const totalRequested = brief.constructions.count;
    if (totalChosen < totalRequested) {
      warnings.unshift(
        `⚠️ Запрошено ${totalRequested} конструкций, доступно ${totalChosen} с учётом выбранных фильтров (операторы, форматы, регион).`
      );
    }
  }

  // Предупреждение если реальный расход значительно меньше заданного бюджета
  if (brief.budget.mode === "fixed" && brief.budget.amount > 0) {
    const inputBudget = Number(brief.budget.amount);
    if (Number.isFinite(totalBudgetFinal) && totalBudgetFinal < inputBudget * 0.9) {
      const gap = inputBudget - totalBudgetFinal;
      warnings.unshift(
        `⚠️ Инвентарь не позволяет освоить весь бюджет. ` +
        `Реальный расход: ${Math.floor(totalBudgetFinal).toLocaleString("ru-RU")} ₽ ` +
        `из ${inputBudget.toLocaleString("ru-RU")} ₽ ` +
        `(не освоено: ${Math.floor(gap).toLocaleString("ru-RU")} ₽).`
      );
    }
  }

  // Apply manual exclusions — screens the user removed from the map.
  // Skip in GID mode: the user explicitly specified which screens they want.
  if (!_isManualMode && state.manuallyExcluded && state.manuallyExcluded.size) {
    const before = chosenAll.length;
    chosenAll = chosenAll.filter(s => !state.manuallyExcluded.has(_screenIdOf(s)));
    if (chosenAll.length < before) {
      warnings.push(`ℹ️ ${before - chosenAll.length} экр. исключено вручную (кнопка "Вернуть все" внизу).`);
    }
  }

  // Сомнительные экраны: помечаем перед отдачей в UI, чтобы карусель могла их
  // подсветить и вынести вперёд. В выгрузку это намеренно не идёт.
  const suspicious = markSuspiciousScreens(chosenAll, brief);
  if (suspicious.length) {
    const shown = suspicious.slice(0, 3).map(s => _screenIdOf(s)).filter(Boolean).join(", ");
    warnings.push(
      `⚠️ Подозрительно низкая ставка у ${suspicious.length} экр. ` +
      `(ниже ${Math.round(SUSPICIOUS_BID_RATIO * 100)}% медианы по своему формату и городу` +
      `${shown ? `: ${shown}${suspicious.length > 3 ? " и др." : ""}` : ""}). ` +
      `Подсвечены красным в списке экранов — проверьте или замените.`
    );
  }

  state.lastChosen = chosenAll;

  // Per-format breakdown
  // playsPerScreen: равномерное распределение выходов по экранам
  const playsPerScreen = chosenAll.length > 0 ? totalPlaysEffectiveAll / chosenAll.length : 0;

  const formatStats = {};
  for (const s of chosenAll) {
    const fmt = s.format || "—";
    if (!formatStats[fmt]) {
      formatStats[fmt] = {
        screens: 0,
        otsSum: 0, otsCnt: 0,  // для avg(s.ots per play)
        playsEst: 0,            // оценка выходов по формату (равномерно)
        bidSum: 0, bidCnt: 0,  // для средней ставки по формату
      };
    }
    formatStats[fmt].screens++;
    formatStats[fmt].playsEst += playsPerScreen;
    if (Number.isFinite(s.ots) && s.ots > 0) {
      formatStats[fmt].otsSum += s.ots;
      formatStats[fmt].otsCnt++;
    }
    const _bidRaw = screenBid(s, brief);
    const bidForStat = (Number.isFinite(_bidRaw) && _bidRaw > 0) ? _bidRaw : null;
    if (bidForStat != null) { formatStats[fmt].bidSum += bidForStat; formatStats[fmt].bidCnt++; }
  }

  // otsPerPlay = avg(s.ots) — s.ots уже OTS за один выход
  // costPerPlay = средняя ставка по формату (ставка = стоимость одного выхода)
  for (const fd of Object.values(formatStats)) {
    fd.otsPerPlay  = fd.otsCnt > 0 ? Math.round(fd.otsSum / fd.otsCnt) : null;
    fd.avgBid      = fd.bidCnt > 0 ? +(fd.bidSum / fd.bidCnt).toFixed(2) : null;
    fd.costPerPlay = fd.avgBid;   // стоимость выхода = средняя ставка по формату
  }

  window.PLANNER = window.PLANNER || {};
  window.PLANNER.lastCalc = {
    brief,
    chosen: chosenAll,
    perRegion: perRegionRows,
    warnings: warnings || [],
    formatStats,
    meta: {
      days,
      hpd,
      totalBudget: totalBudgetFinal,
      totalPlays: totalPlaysEffectiveAll,
      totalOts: (Number.isFinite(otsTotalAll) ? otsTotalAll : null)
    }
  };

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
      const ps = Number.isFinite(r.poolSize) ? `пул: ${Math.floor(r.poolSize).toLocaleString("ru-RU")}` : null;
      const note = String(r.note || "").trim();
      const extra = [ps, note].filter(Boolean).join(", ");
      return `— ${r.region}: бюджет ${b}, выходов ${p}, OTS ${o}, экранов ${sc}${extra ? ` (${extra})` : ""}`;
    })
    .join("\n");

  // Если клиент задал бюджет ниже рекомендованного — показываем, сколько нужно,
  // прямо в сводке, а не оставляем догадываться, почему экранов мало.
  let budgetAdviceLine = "";
  if (brief.budget.mode === "fixed") {
    const _tiers = computeRecoBudgetTiers();
    const _asked = Number(brief.budget.amount || 0);
    if (_tiers && _asked > 0 && _asked < _tiers.optimal) {
      const _m = v => Math.round(v).toLocaleString("ru-RU");
      budgetAdviceLine =
        `
— Рекомендуемый бюджет: минимальный ${_m(_tiers.min)} ₽, оптимальный ${_m(_tiers.optimal)} ₽`;
      warnings.push(
        _asked < _tiers.min
          ? `⚠️ Заданный бюджет ${_m(_asked)} ₽ ниже минимального рекомендованного ` +
            `${_m(_tiers.min)} ₽ (оптимальный — ${_m(_tiers.optimal)} ₽).`
          : `ℹ️ Заданный бюджет ${_m(_asked)} ₽ ниже оптимального ${_m(_tiers.optimal)} ₽ ` +
            `(минимальный — ${_m(_tiers.min)} ₽).`
      );
    }
  }

  const summaryText =
    `Бриф:
— Бюджет: ${totalBudgetFinal.toLocaleString("ru-RU")} ₽ ${
      brief.budget.mode === "fixed"
        ? "(распределён по регионам)"
        : (brief.budget.mode === "goal_ots" ? "(под цель OTS)" : brief.budget.mode === "goal_plays" ? "(под цель показов)" : "(сумма рекомендаций)")
    }${budgetAdviceLine}
— Даты: ${brief.dates.start} → ${brief.dates.end} (дней: ${days})
— Расписание: ${brief.schedule.type} (часов/день: ${hpd.toFixed(2)})
— Регион(ы): ${regions.join(", ")}
— Форматы: ${selectedFormatsText}
— Подбор: ${brief.selection.mode}
— Режим ставки: ${brief.bidMode === "min" ? "Минимальная (minBid)" : "Рекомендованная"}${brief.bidUpliftPct > 0 ? ` +${brief.bidUpliftPct}%` : ""}
— GRP: ${brief.grp.enabled ? `${brief.grp.min.toFixed(2)}–${brief.grp.max.toFixed(2)}` : "не учитываем"}
— Аудитория: ${brief.audience?.enabled && brief.audience.segments?.length > 0
    ? `${brief.audience.segments.join(", ")} (топ ${Math.round((brief.audience.topPct ?? 0.10) * 100)}%)`
    : "—"}
— Конструкций (лимит): ${brief.constructions?.enabled && brief.constructions.count > 0 ? brief.constructions.count : "—"}

Итог (по всем регионам):
— Выходов всего: ${nf(totalPlaysEffectiveAll)}
— Выходов/день: ${nf(playsPerDayAll)}
— Выходов/час (в сумме): ${nf(playsPerHourAll)}${chosenAll.length > 0 && hpd > 0
    ? ` / на экран: ${(playsPerHourAll / chosenAll.length).toFixed(1)}`
    : ""}
— Экранов выбрано: ${chosenAll.length}
— OTS всего: ${hasOts ? of(otsTotalAll) : "—"}

По регионам:
${perRegionText}`
    + (warnings.length ? `\n\n${warnings.slice(0, 6).join("\n")}${warnings.length > 6 ? "\n…" : ""}` : "");

  // ВАЖНО: записываем summary ДО dispatchEvent — иначе render-функции (daysFromRaw, hoursPerDayFromRaw)
  // читают el("summary").textContent и получают пустую строку
  if (el("summary")) el("summary").textContent = summaryText;
  if (el("download-csv")) el("download-csv").disabled = chosenAll.length === 0;
  if (el("download-plan-xlsx")) el("download-plan-xlsx").disabled = chosenAll.length === 0;

  // Кнопки выгрузки адресов: включаем, когда есть геокодированные точки
  const hasGeoAddr = Array.isArray(window.PLANNER?.lastGeocodedPoints) && window.PLANNER.lastGeocodedPoints.length > 0;
  if (el("download-poi-csv"))  el("download-poi-csv").disabled  = !hasGeoAddr;
  if (el("download-poi-xlsx")) el("download-poi-xlsx").disabled = !hasGeoAddr;

  // Ненайденные GID (для кнопки скачать)
  const unmatchedGids = _isManualMode
    ? [..._manualGidSet].filter(g => !_foundGids.has(g))
    : [];
  window.PLANNER.lastUnmatchedGids = unmatchedGids;

  saveCalcToHistory();

  window.dispatchEvent(new CustomEvent("planner:calc-done", {
    detail: { chosen: chosenAll, perRegion: perRegionRows, warnings, inputBudget: brief.budget.amount,
              formatStats, meta: window.PLANNER.lastCalc.meta, unmatchedGids }
  }));

  setStatus("");
  logEvent("calc");
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
  const goalPlaysVal2 = Number(brief?.goal?.plays || 0);

  const step3 =
    (mode === "recommendation") ||
    (mode === "fixed" && Number.isFinite(budgetVal) && budgetVal > 0) ||
    (mode === "goal_ots" && Number.isFinite(goalOtsVal) && goalOtsVal > 0) ||
    (mode === "goal_plays" && Number.isFinite(goalPlaysVal2) && goalPlaysVal2 > 0);

  // Форматы опциональны: если ничего не выбрано — берём все
  const step4 = true;

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
  window.dispatchEvent(new CustomEvent("planner:pool-updated"));
}

function renderBudgetHints() {
  const hint = el("budget-reco-hint");
  if (!hint) return;

  const mode = getBudgetMode();
  hint.style.display = (mode === "recommendation") ? "block" : "none";
}

// ===== POOL PREVIEW =====
function computePoolPreview() {
  // Приоритет — screensAll (весь инвентарь DSP), чтобы совпадать с форматными
  // карточками и не показывать стейл с прошлого Calculate. В CSV-режиме
  // screensAll не заполняется → фолбэк на state.screens.
  const sourceScreens = (Array.isArray(state.screensAll) && state.screensAll.length)
    ? state.screensAll
    : (Array.isArray(state.screens) ? state.screens : []);
  if (!sourceScreens.length) return null;
  const brief = buildBrief();
  const regions = Array.isArray(brief?.geo?.regions) ? brief.geo.regions : [];
  if (!regions.length) return null;

  // 1. По регионам
  let pool = sourceScreens.filter(s => regions.some(r => screenMatchesGeoChoice(s, r)));

  // 2. По форматам (если ручной выбор) — те же что в onCalcClick
  const formatsMode = brief.formats?.mode || "auto";
  const manualFormats = Array.isArray(brief.formats?.selected) ? brief.formats.selected : [];
  if (formatsMode === "manual" && manualFormats.length > 0) {
    const fset = new Set(manualFormats);
    pool = pool.filter(s => fset.has(s.format));
  }

  // onlyActiveBids: when toggled on, filter no-bid screens from the preview counts too.
  if (brief.onlyActiveBids) {
    pool = pool.filter(hasActiveInventory);
  }

  // Фильтр по стороне экрана (A/Б) — та же логика, что в onCalcClick
  if (state.selectedSides && state.selectedSides.size > 0) {
    pool = pool.filter(s => state.selectedSides.has(String(s.side || "").trim()));
  }

  // 3. Polygon zone filter (same logic as onCalcClick)
  const poly = state.polygonFilter;
  if (poly && poly.length > 0) {
    const isMulti = Array.isArray(poly[0]) && Array.isArray(poly[0][0]);
    if (isMulti) {
      pool = pool.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon) &&
        poly.some(p => pointInPolygon(s.lat, s.lon, p)));
    } else if (poly.length >= 3) {
      pool = pool.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon) &&
        pointInPolygon(s.lat, s.lon, poly));
    }
  }

  const countBase = pool.length;

  // 4. GRP-фильтр
  let countAfterGrp = null;
  if (brief.grp?.enabled) {
    pool = pool.filter(s => {
      if (!Number.isFinite(s.grp) || s.grp <= 0) return false;
      return s.grp >= (brief.grp.min ?? 0) && s.grp <= (brief.grp.max ?? 9.98);
    });
    countAfterGrp = pool.length;
  }

  // 5. Фильтр по операторам
  const selectedOwners = state.selectedOwners ? [...state.selectedOwners] : [];
  let countAfterOwners = null;
  if (selectedOwners.length > 0) {
    pool = pool.filter(s => selectedOwners.includes(s.owner));
    countAfterOwners = pool.length;
  }

  // 6. Affinity-фильтр (топ-N% от текущего пула)
  let countAfterAffinity = null;
  if (brief.audience?.enabled && brief.audience.segments?.length > 0 && state.affinityMap?.size > 0) {
    const topPct = brief.audience.topPct ?? 0.10;
    countAfterAffinity = Math.max(1, Math.ceil(pool.length * topPct));
  }

  const countFinal = countAfterAffinity !== null
    ? countAfterAffinity
    : (countAfterOwners !== null ? countAfterOwners : (countAfterGrp !== null ? countAfterGrp : countBase));

  return { countBase, countAfterGrp, countAfterOwners, countAfterAffinity, countFinal,
           hasGrpFilter: !!brief.grp?.enabled, hasOwnerFilter: selectedOwners.length > 0,
           hasAffinityFilter: !!(brief.audience?.enabled && brief.audience.segments?.length > 0) };
}

window.PLANNER = window.PLANNER || {};
window.PLANNER.computePoolPreview = computePoolPreview;
window.PLANNER.removeScreen = removeScreen;
window.PLANNER.clearManualExclusions = clearManualExclusions;

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
      if (el("constructions-enabled")?.checked) applyConstructionsState(true);
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

  const constructionsEnabled = el("constructions-enabled");

  function getPphTargetForUI() {
    const mode = document.querySelector('input[name="reach_mode"]:checked')?.value || "max_reach";
    return targetPlaysPerHourPerScreen(mode);
  }

  function applyConstructionsState(checked) {
    const wrap = el("constructions-count-wrap");
    if (wrap) wrap.style.display = checked ? "block" : "none";

    // Constructions:
    // - recommendation: ppm задаётся вручную (слайдер активен)
    // - fixed/goal_ots: ppm задаётся стратегией (слайдер неактивен)
    const ppmRow = el("constructions-ppm")?.closest("div[style]");
    const ppmRange = el("constructions-ppm");
    const ppmVal = el("constructions-ppm-val");
    const ppmNote = el("constructions-ppm-note");
    const budgetMode = getBudgetMode();
    const manualPpmAllowed = checked && budgetMode === "recommendation";

    if (checked && !manualPpmAllowed) {
      if (ppmRange) ppmRange.disabled = true;
      if (ppmRow) ppmRow.style.opacity = "0.4";
      const pph = getPphTargetForUI();
      if (ppmVal) ppmVal.textContent = pph + " (авто)";
      if (ppmNote) ppmNote.style.display = "block";
    } else {
      if (ppmRange) ppmRange.disabled = false;
      if (ppmRow) ppmRow.style.opacity = "";
      if (ppmVal) ppmVal.textContent = ppmRange?.value || "10";
      if (ppmNote) ppmNote.style.display = "none";
    }
  }

  if (constructionsEnabled) {
    constructionsEnabled.addEventListener("change", (e) => {
      applyConstructionsState(e.target.checked);
    });
    // При смене стратегии — обновить отображение частоты
    document.querySelectorAll('input[name="reach_mode"]').forEach(r => {
      r.addEventListener("change", () => {
        if (el("constructions-enabled")?.checked) applyConstructionsState(true);
      });
    });
    // apply initial state on load
    applyConstructionsState(constructionsEnabled.checked);
  }

  document.querySelectorAll('input[name="bid_mode"]').forEach(r => {
    r.addEventListener("change", renderProgress);
  });

  // ppm range slider label sync (only when not disabled by constructions)
  const ppmRange = el("constructions-ppm");
  if (ppmRange) {
    ppmRange.addEventListener("input", (e) => {
      if (e.target.disabled) return;
      const lbl = el("constructions-ppm-val");
      if (lbl) lbl.textContent = e.target.value;
    });
  }

  // "max" кнопка для кол-ва конструкций.
  // Используем computePoolPreview() — тот же полный набор фильтров (гео, форматы,
  // only-active-bids, полигон, GRP, операторы, affinity), что даёт цифру в блоке
  // «Доступный инвентарь». Раньше здесь был дублирующий укороченный расчёт без
  // GRP/полигон/affinity-фильтров — из-за этого «max» подставлял завышенное число.
  el("constructions-max-btn")?.addEventListener("click", () => {
    const preview = computePoolPreview();
    const maxCount = preview ? preview.countFinal : 0;
    const inp = el("constructions-count");
    if (inp) { inp.value = maxCount; inp.dispatchEvent(new Event("input")); }
    renderProgress();
  });

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
      renderFormats();
      renderProgress();
      window.dispatchEvent(new CustomEvent("planner:pool-updated"));
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

  // ===== Выбрать все регионы =====
  el("regions-select-all")?.addEventListener("click", () => {
    const all = Array.isArray(state.regionsAll) ? state.regionsAll : [];
    if (!all.length) return;
    if (!Array.isArray(state.selectedRegions)) state.selectedRegions = [];
    let added = 0;
    for (const r of all) {
      if (!state.selectedRegions.includes(r)) { state.selectedRegions.push(r); added++; }
    }
    state.selectedRegion = state.selectedRegions[0] || null;
    if (state.selectedRegions.length > REGIONS_COLLAPSE_LIMIT) state._regionsCollapsed = true;
    renderSelectedRegions();
    renderFormats();
    renderProgress();
    window.dispatchEvent(new CustomEvent("planner:pool-updated"));
  });

  // ===== City import from file =====
  const regionFileInput = el("region-file-input");
  if (regionFileInput) {
    regionFileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const statusEl = el("region-import-status");
      if (statusEl) { statusEl.style.display = "block"; statusEl.textContent = "Читаю файл…"; }
      const name = file.name.toLowerCase();
      try {
        let rows = [];
        let rawLines = [];

        if (name.endsWith(".txt")) {
          const text = await file.text();
          rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          rows = rawLines.map(l => ({ _val: l }));

        } else if (name.endsWith(".csv")) {
          const text = await file.text();
          const parsed = window.Papa?.parse(text, { header: true, skipEmptyLines: true });
          if (parsed?.data?.length) {
            rows = parsed.data;
          } else {
            const p2 = window.Papa?.parse(text, { skipEmptyLines: true });
            rawLines = (p2?.data || []).map(r => String(r[0] || "").trim()).filter(Boolean);
            rows = rawLines.map(l => ({ _val: l }));
          }

        } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
          const buf = await file.arrayBuffer();
          const wb  = window.XLSX?.read(buf, { type: "array" });
          const ws  = wb?.Sheets?.[wb.SheetNames[0]];
          rows = window.XLSX?.utils?.sheet_to_json(ws, { defval: "" }) || [];
          if (!rows.length) {
            const raw = window.XLSX?.utils?.sheet_to_json(ws, { header: 1 }) || [];
            rawLines = raw.slice(1).map(r => String(r[0] || "").trim()).filter(Boolean);
            rows = rawLines.map(l => ({ _val: l }));
          }
        }

        if (!rows.length) {
          if (statusEl) statusEl.textContent = "Файл пустой";
          e.target.value = ""; return;
        }

        // Match cities
        const { matched, unmatched } = _extractAndMatchCities(rows);

        // Add matched regions
        if (!Array.isArray(state.selectedRegions)) state.selectedRegions = [];
        let added = 0;
        for (const r of matched) {
          if (!state.selectedRegions.includes(r)) {
            state.selectedRegions.push(r);
            added++;
          }
        }
        if (matched.length) {
          state.selectedRegion = state.selectedRegions[0] || null;
          if (state.selectedRegions.length > REGIONS_COLLAPSE_LIMIT) state._regionsCollapsed = true;
          renderSelectedRegions();
          renderFormats();
          renderProgress();
          window.dispatchEvent(new CustomEvent("planner:pool-updated"));
        }

        // Status message
        let msg = "";
        if (added > 0) msg += `Добавлено городов: ${added}`;
        else if (matched.length > 0) msg += `Все ${matched.length} городов уже выбраны`;
        else msg += "Не удалось распознать города";
        if (unmatched.length) msg += `. Не найдены: ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? ` и ещё ${unmatched.length - 5}` : ""}`;
        if (statusEl) statusEl.textContent = msg;

      } catch(err) {
        if (statusEl) statusEl.textContent = "Ошибка чтения файла";
        console.error("[region-import]", err);
      }
      e.target.value = "";
    });
  }

  // ===== Downloads =====
  const downloadBtn = el("download-csv");
  if (downloadBtn) downloadBtn.addEventListener("click", () => { downloadXLSX(state.lastChosen); logEvent("download_gids"); });

  const planBtn = el("download-plan-xlsx");
  if (planBtn) {
    planBtn.disabled = true;
    planBtn.addEventListener("click", () => { downloadMediaPlan(); logEvent("download_plan"); });
  }

  // POI / адреса — скачать CSV/XLSX
  function getPoisForExport() {
    if (Array.isArray(window.PLANNER?.lastGeocodedPoints) && window.PLANNER.lastGeocodedPoints.length) {
      return window.PLANNER.lastGeocodedPoints;
    }
    return [];
  }

  const poiCsvBtn = el("download-poi-csv");
  if (poiCsvBtn) {
    poiCsvBtn.disabled = true;
    poiCsvBtn.addEventListener("click", () => {
      const pois = getPoisForExport();
      if (!pois.length) return;
      const header = "Название,Широта,Долгота";
      const rows = pois.map(p => [`"${String(p.name||"").replace(/"/g,'""')}"`, p.lat, p.lon].join(","));
      const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "poi_addresses.csv"; a.click();
      logEvent("download_poi");
    });
  }

  const poiXlsxBtn = el("download-poi-xlsx");
  if (poiXlsxBtn) {
    poiXlsxBtn.disabled = true;
    poiXlsxBtn.addEventListener("click", async () => {
      const pois = getPoisForExport();
      if (!pois.length) return;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("POI");
      ws.columns = [
        { header: "Название", key: "name", width: 44 },
        { header: "Широта",   key: "lat",  width: 16 },
        { header: "Долгота",  key: "lon",  width: 16 },
      ];
      pois.forEach(p => ws.addRow({ name: p.name, lat: p.lat, lon: p.lon }));
      ws.getRow(1).font = { bold: true };
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
      a.download = "poi_addresses.xlsx"; a.click();
      logEvent("download_poi");
    });
  }

  // ===== Вставить список регионов =====
  const pasteBtn    = el("regions-paste-btn");
  const pasteWrap   = el("regions-paste-wrap");
  const pasteArea   = el("regions-paste-area");
  const pasteGo     = el("regions-paste-go");
  const pasteCancel = el("regions-paste-cancel");

  if (pasteBtn && pasteWrap) {
    pasteBtn.addEventListener("click", () => {
      pasteWrap.style.display = pasteWrap.style.display === "none" ? "block" : "none";
      if (pasteWrap.style.display === "block" && pasteArea) pasteArea.focus();
    });

    if (pasteCancel) pasteCancel.addEventListener("click", () => {
      pasteWrap.style.display = "none";
      if (pasteArea) pasteArea.value = "";
    });

    if (pasteGo && pasteArea) {
      const doImport = () => {
        const text = pasteArea.value.trim();
        if (!text) return;
        // Разбиваем по переносам строк и запятым
        const rawLines = text.split(/[\n,;]+/).map(l => l.trim()).filter(Boolean);
        const rows = rawLines.map(l => ({ _val: l }));
        const { matched, unmatched } = _extractAndMatchCities(rows);

        if (!Array.isArray(state.selectedRegions)) state.selectedRegions = [];
        let added = 0;
        for (const r of matched) {
          if (!state.selectedRegions.includes(r)) { state.selectedRegions.push(r); added++; }
        }
        if (matched.length) {
          state.selectedRegion = state.selectedRegions[0] || null;
          if (state.selectedRegions.length > REGIONS_COLLAPSE_LIMIT) state._regionsCollapsed = true;
          renderSelectedRegions();
          renderFormats();
          renderProgress();
          window.dispatchEvent(new CustomEvent("planner:pool-updated"));
        }

        const statusEl = el("region-import-status");
        if (statusEl) {
          let msg = added > 0 ? `Добавлено: ${added}` : (matched.length ? `Уже выбраны все (${matched.length})` : "Не удалось распознать города");
          if (unmatched.length) msg += `. Не найдены: ${unmatched.slice(0, 5).join(", ")}${unmatched.length > 5 ? ` и ещё ${unmatched.length - 5}` : ""}`;
          statusEl.style.display = "block";
          statusEl.textContent = msg;
        }

        pasteWrap.style.display = "none";
        pasteArea.value = "";
      };

      pasteGo.addEventListener("click", doImport);
      // Ctrl+Enter тоже запускает
      pasteArea.addEventListener("keydown", e => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doImport(); }
      });
    }
  }

  // ===== Ненайденные GID: кнопка скачать =====
  window.addEventListener("planner:calc-done", (e) => {
    const unmatched = e?.detail?.unmatchedGids || [];
    const btn = el("manual-gids-download-unmatched");
    if (!btn) return;
    if (unmatched.length > 0) {
      btn.style.display = "inline-block";
      btn.textContent = `↓ Скачать не найденные GID-ы (${unmatched.length})`;
      btn.onclick = () => {
        const blob = new Blob([unmatched.join("\n")], { type: "text/plain;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "gids_not_found.txt";
        a.click();
      };
    } else {
      btn.style.display = "none";
    }
  });

  // ===== Calc =====
  if (!state._calcClickDelegatedBound) {
    state._calcClickDelegatedBound = true;
    document.addEventListener("click", (e) => {
      const calcBtn = e.target?.closest?.("#calc-btn");
      if (!calcBtn) return;
      e.preventDefault();
      if (calcBtn.disabled) return;
      Promise.resolve(onCalcClick()).catch((err) => {
        console.error("[calc] failed", err);
        alert("Не удалось выполнить расчёт. Проверьте консоль и попробуйте ещё раз.");
        setStatus("");
      });
    });
  }

  // Initial
  renderProgress();
  renderBudgetHints();
  renderSelectionExtra();
}

// ===== DSP FORECAST BIDS =====

// In-memory cache: Map<dspId (number), { recoBid, ts }>
const _recoBidCache = new Map();
const RECO_BID_CACHE_TTL = 60 * 60 * 1000; // 1 час

/**
 * Конвертирует brief.schedule в формат timeSettings для API прогноза ставки.
 * dayOfWeek: 1=Пн … 7=Вс (ISO).  relativeStartTime/End — секунды от начала дня.
 */
function scheduleToTimeSettings(schedule) {
  const DOW = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 7 };
  const toSec = (timeStr) => {
    const m = _timeToMin(timeStr);
    return m == null ? null : m * 60;
  };

  if (schedule?.type === "weekly") {
    const weekly = schedule.weekly || {};
    const result = [];
    for (const [key, intervals] of Object.entries(weekly)) {
      const dow = DOW[key];
      if (!dow || !Array.isArray(intervals)) continue;
      for (const iv of intervals) {
        const s = toSec(iv?.from), e = toSec(iv?.to);
        if (s == null || e == null) continue;
        result.push({ dayOfWeek: dow, relativeStartTime: s, relativeEndTime: e });
      }
    }
    return result;
  }

  // all_day / peak / custom — одно расписание на все дни
  let fromSec, toSec2;
  if (schedule?.type === "all_day") {
    fromSec = 7 * 3600; toSec2 = 22 * 3600;
  } else if (schedule?.type === "peak") {
    fromSec = 7 * 3600; toSec2 = 14 * 3600;
  } else if (schedule?.type === "custom") {
    fromSec = toSec(schedule.from || "07:00") ?? 7 * 3600;
    toSec2  = toSec(schedule.to   || "22:00") ?? 22 * 3600;
  } else {
    fromSec = 7 * 3600; toSec2 = 22 * 3600;
  }

  const result = [];
  for (let dow = 1; dow <= 7; dow++) {
    result.push({ dayOfWeek: dow, relativeStartTime: fromSec, relativeEndTime: toSec2 });
  }
  return result;
}

/**
 * Загружает реальные рекомендованные ставки из API прогноза.
 * Патчит s.recoBid на каждом экране из массива screens.
 * Кэшируется на 1 час в памяти.
 */
async function dspFetchForecastBids(screens, brief) {
  if (!window.DSP_AUTH_ENABLED || !getDspToken()) return;

  const token = getDspToken();
  const now = Date.now();

  // Применяем кэш, отбираем экраны которые нужно дозапросить
  const toFetch = [];
  for (const s of screens) {
    if (!Number.isFinite(s._dspId)) continue;
    const cached = _recoBidCache.get(s._dspId);
    if (cached && (now - cached.ts) < RECO_BID_CACHE_TTL) {
      // cached.recoBid is the raw, duration-agnostic forecast price — scale it by the
      // currently selected duration the same way a fresh fetch would (see below).
      s._baseRecoBid = cached.recoBid;
      s.recoBid = cached.recoBid * _durationRatioForScreen(s, state.selectedDurationMs);
    } else {
      toFetch.push(s);
    }
  }
  if (!toFetch.length) return;

  const timeSettings = scheduleToTimeSettings(brief.schedule);
  if (!timeSettings.length) return;

  // Используем последние 90 дней (исторические данные) — на будущих датах API возвращает MIN_BID
  const _today = new Date();
  const _d90 = new Date(_today); _d90.setDate(_today.getDate() - 90);
  const _fmtDate = d => d.toISOString().slice(0, 10);
  const dateStart = _fmtDate(_d90) + "T00:00:00";
  const dateEnd   = _fmtDate(new Date(_today.getTime() - 86400000)) + "T23:59:59";

  const markup = getDspAgencyMarkup();
  const additionalCharge = markup.additionalCharge ?? 0;

  const BATCH = 50;
  const batches = [];
  for (let i = 0; i < toFetch.length; i += BATCH) batches.push(toFetch.slice(i, i + BATCH));

  const results = await Promise.allSettled(batches.map(async batch => {
    const body = {
      inventoryList: batch.map(s => ({ inventory: s._dspId, timeSettings })),
      statisticPeriod: { start: dateStart, end: dateEnd },
      additionalCharge,
    };
    const r = await fetch(`${DSP_API}/api/v1.0/clients/analytics/forecast-price-by-inventory`, {
      method: "POST",
      headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`forecast-price HTTP ${r.status}`);
    return r.json();
  }));

  // Записываем в кэш и на экраны
  const idToScreen = new Map(toFetch.map(s => [s._dspId, s]));
  for (const res of results) {
    if (res.status !== "fulfilled" || !res.value?.elements) continue;
    for (const [idStr, elem] of Object.entries(res.value.elements)) {
      const dspId = Number(idStr);
      let price = elem?.statistic?.averagePrice;
      if (!Number.isFinite(price) || price <= 0) continue;
      // MIN_BID — нет реальных аукционов, это просто minBid → применяем коэффициент
      // INVENTORY и FORMAT_CITY — реальные/статистические данные, берём как есть
      const method = elem?.referenceData?.method;
      if (method === "MIN_BID") price = price * BID_MULTIPLIER;
      _recoBidCache.set(dspId, { recoBid: price, ts: now, method });
      const s = idToScreen.get(dspId);
      if (s) {
        // price is duration-agnostic (this forecast endpoint has no duration concept) —
        // scale it by the currently selected duration's ratio, same as the cache-hit path.
        s._baseRecoBid = price;
        s.recoBid = price * _durationRatioForScreen(s, state.selectedDurationMs);
        // Forecast API OTS is always preferred — period-specific traffic data
        // beats both the inventory's static value and format-average interpolation.
        const avgOts = elem?.statistic?.averageOts;
        if (Number.isFinite(avgOts) && avgOts > 0) {
          s.ots = avgOts;
          s._otsEstimated = true;
          s._otsInterpolated = false;
        }
      }
    }
  }
}

/**
 * Средняя эффективная ставка для набора экранов:
 * - bidMode "min"  → avg(minBid)
 * - bidMode "recommended" → avg(recoBid) если есть, иначе avg(minBid) × BID_MULTIPLIER
 */
function avgEffectiveBid(screens, bidMode, fallback, uplift = 1) {
  if (bidMode === "min") {
    return (avgNumber(screens.map(s => s.minBid)) ?? fallback) * uplift;
  }
  const recos = screens.map(s => s.recoBid).filter(v => Number.isFinite(v) && v > 0);
  if (recos.length > 0) return (recos.reduce((a, b) => a + b, 0) / recos.length) * uplift;
  const mins = screens.map(s => s.minBid).filter(v => Number.isFinite(v) && v > 0);
  return (mins.length > 0 ? (mins.reduce((a, b) => a + b, 0) / mins.length) * BID_MULTIPLIER : fallback) * uplift;
}

// ===== DSP API AUTH + INVENTORY =====
// Включается через: window.DSP_AUTH_ENABLED = true; в HTML Tilda перед виджетом

const DSP_API = "https://proddsp.omniboard360.io";
const DSP_PAGE_SIZE = 200; // reduced from 500 to avoid ERR_INCOMPLETE_CHUNKED_ENCODING
const DSP_PAGE_BATCH = 2; // параллельных запросов за раз (меньше = меньше 500-ок от сервера)
const DSP_BATCH_DELAY_MS = 300; // пауза между батчами

function getDspToken() { return sessionStorage.getItem("dsp_token") || ""; }
function setDspToken(t) { t ? sessionStorage.setItem("dsp_token", t) : sessionStorage.removeItem("dsp_token"); }
function getDspUserEmail() { return sessionStorage.getItem("dsp_user_email") || ""; }
function setDspUserEmail(e) { e ? sessionStorage.setItem("dsp_user_email", e) : sessionStorage.removeItem("dsp_user_email"); }

function _calcHistoryKey() {
  const email = getDspUserEmail();
  if (!email) return null;
  const safe = normalizeKey(email).replace(/[^a-z0-9._@-]/gi, "_");
  return `planner_history_${safe}`;
}

function saveCalcToHistory() {
  const key = _calcHistoryKey();
  if (!key) return;
  const calc = window.PLANNER?.lastCalc;
  if (!calc?.brief) return;
  let history = [];
  try { history = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) {}
  if (!Array.isArray(history)) history = [];
  history.unshift({
    id: Date.now(),
    ts: new Date().toISOString(),
    brief: calc.brief,
    summary: {
      screens: calc.chosen?.length ?? 0,
      totalBudget: calc.meta?.totalBudget ?? 0,
      totalPlays: calc.meta?.totalPlays ?? 0,
      totalOts: calc.meta?.totalOts ?? null,
      regions: calc.brief?.geo?.regions ?? [],
      dateStart: calc.brief?.dates?.start,
      dateEnd: calc.brief?.dates?.end
    }
  });
  history.splice(10);
  try { localStorage.setItem(key, JSON.stringify(history)); } catch (e) {}
  window.dispatchEvent(new CustomEvent("planner:history-updated"));
}

function restoreBriefToUI(brief) {
  if (!brief) return;

  // Программная установка .value не рождает событий, а вся живая логика виджета
  // (превью НДС, пересчёт пула, показ/скрытие блоков) висит именно на них —
  // поэтому каждое поле выставляем через _set/_check, а не присваиванием.
  const _set = (id, val) => {
    const n = el(id);
    if (!n || val == null) return;
    n.value = val;
    n.dispatchEvent(new Event("input",  { bubbles: true }));
    n.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const _check = (id, on) => {
    const n = el(id);
    if (!n) return;
    n.checked = !!on;
    n.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const _radio = (name, value) => {
    const n = document.querySelector(`input[name="${name}"][value="${value}"]`);
    if (!n) return;
    n.checked = true;
    n.dispatchEvent(new Event("change", { bubbles: true }));
  };
  // Видимый контрол — чип, скрытый чекбокс лишь хранит состояние: без синка
  // класса чип выглядел выключенным при включённой настройке.
  const _chip = (id, on) => el(id)?.classList.toggle("active", !!on);

  // 1. Регионы
  state.selectedRegions = Array.isArray(brief.geo?.regions) ? [...brief.geo.regions] : [];
  state.selectedRegion = state.selectedRegions[0] || null;
  renderSelectedRegions();
  // Форматные карточки и превью пула считаются от выбранных регионов и сами по
  // себе не пересчитываются — иначе после восстановления города на месте, а
  // инвентарь показан от прошлого выбора.
  renderFormats();
  window.dispatchEvent(new CustomEvent("planner:pool-updated"));

  // 2. Даты
  _set("date-start", brief.dates?.start || "");
  _set("date-end",   brief.dates?.end   || "");

  // 3. Расписание
  const schType = brief.schedule?.type || "all_day";
  const schChip = document.querySelector(`.sch-chip[data-sch="${schType}"]`);
  if (schChip) {
    schChip.click();
  } else {
    _check(`sch-r-${schType}`, true);
  }
  if (schType === "custom") {
    _set("time-from", brief.schedule?.from || "07:00");
    _set("time-to",   brief.schedule?.to   || "22:00");
  }
  if (schType === "weekly") {
    // Режим «общее расписание» (#global-rows) в текущей разметке виджета
    // отсутствует, поэтому восстанавливаем только по-дневный режим; вызов радио
    // безвреден и сработает, если блок вернут.
    _radio("weekly_mode", brief.schedule?.mode || "by_dow");
    const weekly = brief.schedule?.weekly;
    if (weekly) {
      const dows = ["mon","tue","wed","thu","fri","sat","sun"];
      const timeKey = t => `${t.from}-${t.to}`;
      const timeToGroup = {};
      const groups = [];
      for (const dow of dows) {
        for (const t of (weekly[dow] || [])) {
          const k = timeKey(t);
          if (!timeToGroup[k]) { timeToGroup[k] = { days: {}, times: [{ from: t.from, to: t.to }] }; groups.push(timeToGroup[k]); }
          timeToGroup[k].days[dow] = true;
        }
      }
      if (groups.length) state.weeklyGroups = groups;
      if (typeof window.renderWeeklyDays === "function") window.renderWeeklyDays();
    }
  }

  // 4. Цель и бюджет
  _radio("budget_mode", brief.budget?.mode || "fixed");
  // В поле возвращаем введённую сумму (с комиссией), а не очищенную от неё.
  const budgetForField = brief.budget?.amountGross ?? brief.budget?.amount;
  if (budgetForField != null) _set("budget-input", budgetForField);
  if (brief.goal?.ots   != null) _set("goal-ots",   brief.goal.ots);
  if (brief.goal?.plays != null) _set("goal-plays", brief.goal.plays);
  _radio("reco_tier", brief.recoTier || "optimal");
  // Разбивка по городам живёт в widget-init и пересобирается только при смене
  // набора регионов — заполняем через её собственную точку входа.
  if (typeof window.PLANNER?.restorePerCityBudget === "function") {
    window.PLANNER.restorePerCityBudget(brief.budget?.perCity || null);
  }

  // 5. Форматы
  const fmtAutoEl = el("formats-auto");
  if (fmtAutoEl) {
    fmtAutoEl.checked = brief.formats?.mode === "auto";
    fmtAutoEl.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (brief.formats?.mode !== "auto" && state.selectedFormats) {
    state.selectedFormats.clear();
    (brief.formats?.selected || []).forEach(f => state.selectedFormats.add(f));
    if (typeof window.renderFormatsCards === "function") window.renderFormatsCards();
  }

  // 6. Режим подбора
  const selMode = brief.selection?.mode || "city_even";
  const selEl = el("selection-mode");
  if (selEl) { selEl.value = selMode; selEl.dispatchEvent(new Event("change", { bubbles: true })); }
  // Чипы режима подбора — визуальный слой над скрытым <select>, класс сам не встанет.
  document.querySelectorAll("#selection-mode-chips .sel-chip").forEach(c =>
    c.classList.toggle("active", c.dataset.mode === selMode));
  if (selMode === "near_address") {
    // Восстанавливаем весь список адресов, а не только первый.
    const addrs = Array.isArray(brief.selection?.addresses) && brief.selection.addresses.length
      ? brief.selection.addresses
      : (brief.selection?.address ? [brief.selection.address] : []);
    if (addrs.length && typeof window.PLANNER?.setAddresses === "function") {
      window.PLANNER.setAddresses(addrs);
    }
    _set("planner-radius", brief.selection?.radius_m ?? 500);
  }
  if (selMode === "manual_screens") {
    if (typeof window.setGeoMode === "function") window.setGeoMode("gids");
    _set("manual-gids", (brief.selection?.manual_gids || []).join("\n"));
  }

  // 7. GRP
  _check("grp-enabled", brief.grp?.enabled);
  _set("grp-min", brief.grp?.min ?? 0);
  _set("grp-max", brief.grp?.max ?? 9.98);

  // 8. Конструкции
  _check("constructions-enabled", brief.constructions?.enabled);
  _chip("constructions-chip", brief.constructions?.enabled);
  if (brief.constructions?.count) _set("constructions-count", brief.constructions.count);
  if (brief.constructions?.playsPerHour) _set("constructions-ppm", brief.constructions.playsPerHour);
  // perRegionCount / perRegionPpm / perFormatCount не восстанавливаем: их поля
  // рендерятся только при раскрытии соответствующих аккордеонов и на момент
  // восстановления ещё не существуют в DOM.

  // 9. Аудитория VK
  _check("audience-enabled", brief.audience?.enabled);
  _chip("vk-affinity-card", brief.audience?.enabled);
  if (brief.audience?.segments) {
    document.querySelectorAll('#audience-segment-wrap input[type="checkbox"]').forEach(cb => {
      cb.checked = brief.audience.segments.includes(cb.value);
    });
  }
  if (brief.audience?.topPct != null) _set("audience-top-pct", Math.round(brief.audience.topPct * 100));

  // 10. Ставка: режим + ручная надбавка
  _check(brief.bidMode === "min" ? "bid-mode-min" : "bid-mode-recommended", true);
  const upliftPct = Number(brief.bidUpliftPct || 0);
  _check("bid-uplift-enabled", upliftPct > 0);
  _chip("bid-uplift-chip", upliftPct > 0);
  const upliftWrap = el("bid-uplift-wrap");
  if (upliftWrap) upliftWrap.style.display = upliftPct > 0 ? "block" : "none";
  if (upliftPct > 0) _set("bid-uplift-pct", upliftPct);

  // 11. Стратегия подбора и «только активные»
  if (brief.reachMode) _radio("reach_mode", brief.reachMode);
  _check("only-active-bids", brief.onlyActiveBids);

  // 12. Длительность ролика
  const durMs = Number(brief.duration?.ms);
  if (Number.isFinite(durMs) && durMs > 0) {
    state.selectedDurationMs = durMs;
    if (typeof window.renderDurationChips === "function") window.renderDurationChips();
  }

  if (typeof window.renderProgress === "function") window.renderProgress();
  if (typeof window.setStep === "function") window.setStep(1);
}

function computeRecoBudgetTiers() {
  const BASE_MONTHLY = { M: 2_000_000, SP: 1_500_000, A: 1_000_000, B: 500_000, C: 300_000, D: 100_000 };
  const MAX_MONTHLY  = { M: 30_000_000, SP: 15_000_000, A: 5_000_000, B: 2_000_000, C: 1_000_000, D: 300_000 };

  const sourceScreens = (Array.isArray(state.screensAll) && state.screensAll.length)
    ? state.screensAll : (Array.isArray(state.screens) ? state.screens : []);
  if (!sourceScreens.length) return null;

  const brief = buildBrief();
  const regions = Array.isArray(brief?.geo?.regions) ? brief.geo.regions : [];
  if (!regions.length) return null;

  const dates = brief?.dates;
  const days = (dates?.start && dates?.end)
    ? Math.max(1, Math.round((new Date(dates.end) - new Date(dates.start)) / 86400000) + 1)
    : 30;

  // Часы берём из реального расписания — иначе потолок считается по условным
  // 12 ч/сутки и расходится с тем, что покажет расчёт.
  const hpd = (dates?.start && dates?.end)
    ? (computeScheduleHoursForPeriod(brief.schedule, dates.start, dates.end).avgHpd || RECO_HOURS_PER_DAY)
    : RECO_HOURS_PER_DAY;

  const formatsMode = brief.formats?.mode || "auto";
  const manualFormats = new Set(Array.isArray(brief.formats?.selected) ? brief.formats.selected : []);

  let totalMin = 0, totalOpt = 0, totalMax = 0;

  for (const region of regions) {
    const regionKey = typeof region === "string" ? region : (region?.city || region?.region || "");
    let pool = sourceScreens.filter(s => screenMatchesGeoChoice(s, region));
    if (formatsMode === "manual" && manualFormats.size > 0) {
      pool = pool.filter(s => manualFormats.has(s.format));
    }
    pool = pool.filter(hasActiveInventory);
    if (!pool.length) continue;

    const tier = getTierForGeo(regionKey);
    // Тот же потолок, что и в onCalcClick: плановая ёмкость, а не SC_MAX × 12 ч.
    const capBudget = computeCapacity(pool, days * hpd, brief.bidMode, bidUpliftFactor(brief))?.budget ?? Infinity;

    const optRaw  = Math.floor((BASE_MONTHLY[tier] ?? BASE_MONTHLY.C) * (days / 30));
    const maxRaw  = Math.floor((MAX_MONTHLY[tier]  ?? MAX_MONTHLY.C)  * (days / 30));
    const optimal = Math.min(optRaw, capBudget);
    const max     = Math.min(maxRaw, capBudget);
    const min     = Math.round(optimal * 0.35);

    totalMin += min;
    totalOpt += optimal;
    totalMax += max;
  }

  if (totalOpt === 0) return null;
  return { min: totalMin, optimal: totalOpt, max: totalMax };
}

window.PLANNER = window.PLANNER || {};
window.PLANNER.pointInPolygon = pointInPolygon;
window.PLANNER.saveCalcToHistory = saveCalcToHistory;
window.PLANNER.restoreBriefToUI = restoreBriefToUI;
window.PLANNER.buildMediaPlanBlob = buildMediaPlanBlob;
window.PLANNER.computeRecoBudgetTiers = computeRecoBudgetTiers;
window.PLANNER._parseManualGids = _parseManualGids;
function getDspAgencyId() { return sessionStorage.getItem("dsp_agency_id") || ""; }
function setDspAgencyId(id) { id ? sessionStorage.setItem("dsp_agency_id", String(id)) : sessionStorage.removeItem("dsp_agency_id"); }
// additionalCharge — множитель надбавки агентства (напр. 0.15 = +15%), platformFee — фиксированная надбавка платформы (в той же валюте что и ставка)
function getDspAgencyMarkup() {
  try { return JSON.parse(sessionStorage.getItem("dsp_agency_markup") || "null") || {}; } catch { return {}; }
}
function setDspAgencyMarkup(obj) {
  if (obj) sessionStorage.setItem("dsp_agency_markup", JSON.stringify(obj));
  else sessionStorage.removeItem("dsp_agency_markup");
}

function renderDspUserBar() {
  const bar = document.getElementById("dsp-user-bar");
  if (!bar || !window.DSP_AUTH_ENABLED || !getDspToken()) return;
  const email = getDspUserEmail();
  bar.style.display = "block";
  const emailHtml = email
    ? `<span style="color:#555;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(email)}</span>`
    : `<span style="color:#888;">DSP</span>`;
  bar.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:6px;background:#f0f2f5;border-radius:20px;padding:4px 6px 4px 8px;font-size:12px;line-height:1;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      ${emailHtml}
      <span id="dsp-inv-age" style="color:#888;font-size:11px;white-space:nowrap;"></span>
      <a href="#" id="dsp-inv-refresh" style="display:inline-flex;align-items:center;gap:3px;margin-left:2px;padding:2px 8px;background:#fff;border:1px solid #ddd;border-radius:12px;color:#666;text-decoration:none;font-size:11px;white-space:nowrap;">
        Обновить
      </a>
      <a href="#" id="dsp-logout-btn" style="display:inline-flex;align-items:center;gap:3px;margin-left:2px;padding:2px 8px;background:#fff;border:1px solid #ddd;border-radius:12px;color:#666;text-decoration:none;font-size:11px;white-space:nowrap;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Выйти
      </a>
    </span>`;
  document.getElementById("dsp-logout-btn")?.addEventListener("click", e => {
    e.preventDefault();
    dspLogout();
  });

  renderDspInventoryAge();

  document.getElementById("dsp-inv-refresh")?.addEventListener("click", async e => {
    e.preventDefault();
    const link = e.currentTarget;
    link.textContent = "Обновляю…";
    link.style.pointerEvents = "none";
    try {
      await dspForceReloadAllInventoriesBlocking();
      state.dspInventoryCachedAt = Date.now();
      window.dispatchEvent(new CustomEvent("planner:screens-ready", { detail: { count: state.screensAll?.length || 0 } }));
    } catch (err) {
      console.warn("[DSP] manual refresh failed:", err);
      alert("Не удалось обновить инвентарь: " + err.message);
    } finally {
      link.textContent = "Обновить";
      link.style.pointerEvents = "";
      renderDspInventoryAge();
    }
  });
}

// Возраст инвентаря в шапке: без него неясно, смотришь ты свежие ставки или
// вчерашний кэш.
function renderDspInventoryAge() {
  const node = document.getElementById("dsp-inv-age");
  if (!node) return;
  const ts = state.dspInventoryCachedAt;
  if (!Number.isFinite(ts)) { node.textContent = ""; return; }
  const min = Math.round((Date.now() - ts) / 60000);
  node.textContent = min < 1 ? "данные: только что"
    : min < 60 ? `данные: ${min} мин назад`
    : `данные: ${Math.round(min / 60)} ч назад`;
  node.title = "Время загрузки инвентаря из DSP. Кэш живёт 24 часа, «Обновить» перезагружает принудительно.";
}

function dspLogout() {
  setDspToken("");
  setDspUserEmail("");
  setDspAgencyId("");
  setDspAgencyMarkup(null);
  localStorage.removeItem(getDspCacheKey());
  // Очищаем старые ключи предыдущих версий кэша
  localStorage.removeItem("dsp_inv_v2");
  window.location.reload();
}

async function dspLogin(email, password) {
  const res = await fetch(`${DSP_API}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    throw new Error(res.status < 500 ? "Неверный email или пароль" : `Ошибка сервера ${res.status}`);
  }
  const json = await res.json();
  const token = json.accessToken;
  if (!token) throw new Error("Токен не получен от сервера");
  setDspToken(token);
  const user = json.user || {};
  setDspUserEmail(user.email || user.login || user.username || "");
  const agencyId = user.agency?.id || user.agencyId || "";
  setDspAgencyId(agencyId);
  if (agencyId) {
    // Фоново подгружаем надбавки агентства; не блокируем интерфейс
    dspFetchAgencyMarkup(agencyId).catch(() => {});
  }
  return user;
}

// Подгружает agencyId через список агентств (/api/v1.0/clients/agencies)
async function dspFetchCurrentUserAgency() {
  const token = getDspToken();
  if (!token) return;
  try {
    const r = await fetch(`${DSP_API}/api/v1.0/clients/agencies`, {
      headers: { "Authorization": "Bearer " + token }
    });
    if (!r.ok) return;
    const j = await r.json();
    const agency = (j.content || j)[0];
    if (agency?.id) {
      setDspAgencyId(agency.id);
      console.log("[DSP] agency loaded:", agency.id, agency.name);
    }
  } catch (e) {
    console.warn("[DSP] agency fetch failed:", e.message);
  }
}

async function dspFetchAgencyMarkup(agencyId) {
  const token = getDspToken();
  if (!token || !agencyId) return;
  try {
    const r = await fetch(`${DSP_API}/api/v1.0/clients/agencies/${agencyId}`, {
      headers: { "Authorization": "Bearer " + token }
    });
    if (!r.ok) return;
    const agency = await r.json();
    const markup = {
      additionalCharge: agency.additionalCharge ?? 0,  // доп. надбавка агентства (доля, напр. 0.15)
      platformFee:      agency.platformFee      ?? 0,  // фиксированная надбавка платформы
    };
    setDspAgencyMarkup(markup);
    console.log("[DSP] agency markup loaded:", markup);
  } catch (e) {
    console.warn("[DSP] agency markup fetch failed:", e.message);
  }
}

function showLoginOverlay() {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.id = "dsp-login-overlay";
    overlay.style.cssText =
      "position:fixed;inset:0;z-index:99999;background:rgba(11,18,32,.75);" +
      "display:flex;align-items:center;justify-content:center;font-family:inherit;";

    overlay.innerHTML = `
      <div style="background:#fff;border-radius:20px;padding:40px 36px;width:340px;max-width:90vw;
                  box-shadow:0 24px 64px rgba(0,0,0,.22);">
        <div style="font-size:22px;font-weight:700;margin-bottom:6px;color:#0b1220;">Вход</div>
        <div style="font-size:13px;color:#667085;margin-bottom:24px;">
          Введите данные вашего аккаунта DSP
        </div>
        <input id="dsp-email" type="email" placeholder="Email"
               style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #e0e0e0;
                      border-radius:10px;font-size:14px;margin-bottom:10px;outline:none;">
        <input id="dsp-password" type="password" placeholder="Пароль"
               style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #e0e0e0;
                      border-radius:10px;font-size:14px;margin-bottom:16px;outline:none;">
        <div id="dsp-err" style="color:#e53e3e;font-size:13px;min-height:18px;margin-bottom:10px;"></div>
        <button id="dsp-login-btn"
                style="width:100%;padding:13px;background:#5b3ef5;color:#fff;border:none;
                       border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;">
          Войти
        </button>
      </div>
    `;

    document.body.appendChild(overlay);

    const emailEl = overlay.querySelector("#dsp-email");
    const passEl  = overlay.querySelector("#dsp-password");
    const errEl   = overlay.querySelector("#dsp-err");
    const btnEl   = overlay.querySelector("#dsp-login-btn");

    async function doLogin() {
      const email = emailEl.value.trim();
      const pass  = passEl.value;
      if (!email || !pass) { errEl.textContent = "Заполните все поля"; return; }
      btnEl.disabled = true;
      btnEl.textContent = "Вхожу…";
      errEl.textContent = "";
      try {
        const user = await dspLogin(email, pass);
        overlay.remove();
        resolve(user);
      } catch (e) {
        errEl.textContent = e.message || "Ошибка входа";
        btnEl.disabled = false;
        btnEl.textContent = "Войти";
      }
    }

    btnEl.addEventListener("click", doLogin);
    [emailEl, passEl].forEach(inp =>
      inp.addEventListener("keydown", e => { if (e.key === "Enter") doLogin(); })
    );
    setTimeout(() => emailEl.focus(), 50);
  });
}

async function dspFetchInventoriesPage(page, size = DSP_PAGE_SIZE) {
  const token = getDspToken();
  if (!token) throw new Error("SESSION_EXPIRED");
  const headers = { "Authorization": "Bearer " + token };
  let lastErr = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const ctrl = new AbortController();
      const tId = setTimeout(() => ctrl.abort(), 30000);
      const r = await fetch(
        `${DSP_API}/api/v1.0/clients/inventories?page=${page}&size=${size}&enabled=true`,
        { headers, signal: ctrl.signal }
      );
      clearTimeout(tId);
      if (r.status === 401) { setDspToken(""); throw new Error("SESSION_EXPIRED"); }
      if (!r.ok) {
        throw new Error(`HTTP_${r.status}`);
      }
      const j = await r.json();
      return {
        items: j.content || [],
        totalElements: j.totalElements || 0,
        totalPages: j.totalPages || 0
      };
    } catch (e) {
      if (e.message === "SESSION_EXPIRED") throw e;
      lastErr = e;
      console.warn(`[DSP] page ${page} attempt ${attempt + 1} failed:`, e.message);
      if (attempt < 2) await new Promise(res => setTimeout(res, 1000 * (attempt + 1)));
    }
  }

  throw new Error(`PAGE_FETCH_FAILED:${page}:${lastErr?.message || "unknown"}`);
}

// Субгородские административные единицы, которые не нужны как отдельные «города»
function dspBuildCityCache(raw, baseCache = null) {
  const cityCache = baseCache || {};
  for (const inv of raw || []) {
    const s = mapDspInventory(inv);
    const cityKey = String(s.city || "").trim() || "Не назначено";
    if (!cityCache[cityKey]) cityCache[cityKey] = [];
    cityCache[cityKey].push({ ...s, city: cityKey });
  }
  return cityCache;
}

function dspHydrateCityState(cityCache) {
  state.dspInventoryCache = cityCache;

  const allScreens = Object.values(cityCache || {}).flatMap(arr => Array.isArray(arr) ? arr : []);
  state.screensAll = allScreens.map(s => ({
    ...s,
    minBid: Number.isFinite(Number(s.minBid)) ? Number(s.minBid) : NaN,
    ots:    Number.isFinite(Number(s.ots))    ? Number(s.ots)    : NaN,
    grp:    Number.isFinite(Number(s.grp))    ? Number(s.grp)    : NaN,
    lat:    Number.isFinite(Number(s.lat))    ? Number(s.lat)    : NaN,
    lon:    Number.isFinite(Number(s.lon))    ? Number(s.lon)    : NaN,
    region: getRegionForDspCity(s.city),
  }));

  const cityNames = Object.keys(cityCache).sort((a, b) => a.localeCompare(b, "ru"));
  console.log(`[DSP] unique cities: ${cityNames.length}`, cityNames.slice(0, 5));

  state.dspCities = cityNames;
  state.citiesAll = cityNames;
  state.regionsByCity = {};
  state.dspRegionToCities = {};
  for (const c of cityNames) {
    const region = getRegionForDspCity(c);
    state.regionsByCity[c] = region;
    if (!state.dspRegionToCities[region]) state.dspRegionToCities[region] = [];
    state.dspRegionToCities[region].push(c);
  }

  state.regionsAll = [...new Set(Object.values(state.regionsByCity).filter(r => r && r !== "Не назначено"))]
    .sort((a, b) => a.localeCompare(b, "ru"));

  state.formatsAll = [...new Set(state.screensAll.map(s => s.format).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  state.ownersAll = [...new Set(
    state.screensAll
      .map(s => String(s.owner ?? s.Owner ?? "").trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, "ru"));

  setRegionsUIReady(true);
  renderFormats();
  renderOwners();
  renderSelectedRegions();
  window.dispatchEvent(new CustomEvent("planner:screens-ready", { detail: { count: state.screensAll.length } }));
}

async function dspWarmupInventoryInBackground(cityCacheSeed, totalLoadedSoFar, totalElements, totalPages) {
  const cityCache = cityCacheSeed || {};
  let hadFailures = false;

  for (let start = 1; start < totalPages; start += DSP_PAGE_BATCH) {
    const pages = [];
    for (let p = start; p < Math.min(start + DSP_PAGE_BATCH, totalPages); p++) pages.push(p);

    const results = await Promise.allSettled(
      pages.map(async p => ({ page: p, payload: await dspFetchInventoriesPage(p) }))
    );

    for (const r of results) {
      if (r.status === "fulfilled") {
        totalLoadedSoFar += (r.value.payload.items || []).length;
        dspBuildCityCache(r.value.payload.items || [], cityCache);
      }
      if (r.status === "rejected" && r.reason?.message === "SESSION_EXPIRED") throw r.reason;
      if (r.status === "rejected") {
        hadFailures = true;
        console.warn("[DSP] warmup page failed:", r.reason?.message || r.reason);
      }
    }

    dspHydrateCityState(cityCache);
    setStatus(`Загружаю экраны… ${totalLoadedSoFar} из ${totalElements || "?"}`);
    await new Promise(res => setTimeout(res, DSP_BATCH_DELAY_MS));
  }

  if (hadFailures) throw new Error("PARTIAL_INVENTORY_WARMUP");
  dspSaveInventoryToStorage(cityCache);
  state.dspInventoryWarmupDone = true;
  return cityCache;
}

// Загрузка всех доступных городов из DSP
// Показывает интерфейс после первой страницы и догружает хвост в фоне
async function dspFetchAllInventories() {
  const first = await dspFetchInventoriesPage(0);
  const totalElements = first.totalElements || 0;
  const totalPages = first.totalPages || Math.ceil(totalElements / DSP_PAGE_SIZE) || 1;
  state.dspInventoryTotal = totalElements;
  const cityCache = dspBuildCityCache(first.items || [], {});

  setStatus(`Загружаю экраны… ${first.items?.length || 0} из ${totalElements || "?"}`);
  dspHydrateCityState(cityCache);

  if (totalPages <= 1) {
    dspSaveInventoryToStorage(cityCache);
    state.dspInventoryWarmupDone = true;
    return cityCache;
  }

  state.dspInventoryWarmupDone = false;
  state.dspInventoryWarmupPromise = dspWarmupInventoryInBackground(
    cityCache,
    (first.items || []).length,
    totalElements,
    totalPages
  ).then(finalCache => {
    state.dspInventoryCache = finalCache;
    state.dspInventoryWarmupPromise = null;
    setStatus("");
    return finalCache;
  }).catch(err => {
    state.dspInventoryWarmupDone = false;
    state.dspInventoryWarmupPromise = null;
    console.warn("[DSP] background warmup failed:", err);
    setStatus("");
    return state.dspInventoryCache || cityCache;
  });

  return cityCache;
}

// Принудительная полная загрузка всего инвентаря (blocking),
// используется как fallback, если после обычной загрузки регион/город пуст.
async function dspForceReloadAllInventoriesBlocking() {
  const first = await dspFetchInventoriesPage(0);
  const totalElements = first.totalElements || 0;
  const totalPages = first.totalPages || Math.ceil(totalElements / DSP_PAGE_SIZE) || 1;
  const cityCache = dspBuildCityCache(first.items || [], {});
  let loaded = (first.items || []).length;

  setStatus(`Перезагружаю инвентарь… ${loaded} из ${totalElements || "?"}`);
  for (let p = 1; p < totalPages; p++) {
    const pageData = await dspFetchInventoriesPage(p);
    loaded += (pageData.items || []).length;
    dspBuildCityCache(pageData.items || [], cityCache);
    if (p % 5 === 0 || p === totalPages - 1) {
      setStatus(`Перезагружаю инвентарь… ${loaded} из ${totalElements || "?"}`);
    }
  }

  dspHydrateCityState(cityCache);
  await dspSaveInventoryToStorage(cityCache);
  state.dspInventoryWarmupDone = true;
  state.dspInventoryWarmupPromise = null;
  setStatus("");
  return cityCache;
}

// Загрузка инвентаря по конкретным cityId (ленивая, по запросу)
async function dspFetchInventoriesByCityId(cityId) {
  const token = getDspToken();
  if (!token) throw new Error("SESSION_EXPIRED");
  const headers = { "Authorization": "Bearer " + token };
  let page = 0, size = DSP_PAGE_SIZE, all = [];

  while (true) {
    const url = `${DSP_API}/api/v1.0/clients/inventories?page=${page}&size=${size}&enabled=true&cityId=${cityId}`;
    let res;
    try {
      res = await fetch(url, { headers });
    } catch (e) {
      console.warn(`[DSP] fetch failed for cityId=${cityId} page=${page}:`, e.message);
      break;
    }
    if (res.status === 401) { setDspToken(""); throw new Error("SESSION_EXPIRED"); }
    if (!res.ok) { console.warn(`[DSP] ${res.status} for cityId=${cityId} page=${page}, stopping`); break; }

    const json = await res.json();
    const items = json.content || [];
    all.push(...items);
    if (items.length < size || page >= (json.totalPages || 1) - 1) break;
    page++;
  }
  return all;
}

// Сводит сырые значения стороны экрана ("A1", "A51", "А", "Б", "b12"…) к простым
// "A"/"B". Берём первую букву, транслитерируем кириллицу (А→A, Б→B), остальное
// (цифры-позиции и т.п.) отбрасываем. Нераспознанное — возвращаем как есть,
// чтобы не потерять данные молча.
function normalizeSide(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const first = s[0].toUpperCase();
  if (first === "A" || first === "А") return "A"; // латинская/кириллическая А
  if (first === "B" || first === "Б") return "B"; // латинская B / кириллическая Б
  return s;
}

function mapDspInventory(inv) {
  const loc    = inv.location   || {};
  const meta   = inv.metadata   || {};
  const mbInfo = inv.minBidInfo || {};

  // GCD helper for aspect ratio
  const _gcd = (a, b) => b === 0 ? a : _gcd(b, a % b);

  // Resolution from screenResolutionPx → physicalResolutionPx → mediaParams.resolution
  const resPx = inv.screenResolutionPx
    || inv.physicalResolutionPx
    || inv.mediaParams?.resolution
    || meta.mediaParams?.[0]?.resolution
    || {};
  const resW = resPx.width  || 0;
  const resH = resPx.height || 0;
  const resolution = (resW && resH) ? `${resW}×${resH}` : "";

  // Aspect ratio = width / height (ширина/высота)
  let aspectRatio = "";
  if (resW && resH) {
    const g = _gcd(resW, resH);
    aspectRatio = `${resW / g}:${resH / g}`;
  } else {
    // fallback: from surfaceDimensionMM ratios
    const ar = inv.surfaceDimensionMM;
    if (ar?.awRation && ar?.ahRation) aspectRatio = `${ar.awRation}:${ar.ahRation}`;
  }

  // Physical size from surfaceDimensionMM (mm → metres, e.g. "3×6")
  const dim = inv.surfaceDimensionMM || {};
  const dimW = dim.width  || 0;
  const dimH = dim.height || 0;
  const size_wh = (dimW && dimH)
    ? `${(dimW / 1000).toFixed(1)}×${(dimH / 1000).toFixed(1)}`
    : "";

  // Side — API returns raw values like "A1", "A51", "А" (cyrillic), "Б" (cyrillic)
  // etc. Normalize everything down to plain "A"/"B" so filtering/display is simple.
  const side = normalizeSide(meta.side || "");

  // OTS per play: minBidInfo.ots is the canonical per-play OTS used in bidding
  const ots = mbInfo.ots
    ?? meta.otsInfo?.otsValue
    ?? meta.otsInfo?.estimatedOts
    ?? NaN;

  // Per-duration bid breakdown (e.g. 5s/10s/15s spots at different rates).
  // Base .minBid above already equals the shortest duration's entry — kept as the
  // no-selection default. applySelectedDuration() overwrites .minBid from this array
  // once the user picks a duration in step 4; screens without the array are untouched.
  const durationBidInfo = Array.isArray(mbInfo.durationBidInfo)
    ? mbInfo.durationBidInfo
        .map(d => ({ duration: Number(d.duration), minBid: Number(d.minBidCharged ?? d.minBid) }))
        .filter(d => Number.isFinite(d.duration) && Number.isFinite(d.minBid))
        .sort((a, b) => a.duration - b.duration)
    : [];

  // Daily slot count, when the API provides it (seen on campaign-segment responses
  // as inv.inventoryInfo.slotCountPerDay — not confirmed present on the plain
  // inventories-list endpoint, so this stays NaN/absent there and every consumer
  // must treat NaN as "unknown" rather than "zero/inactive").
  const slotCountPerDay = Number(inv.inventoryInfo?.slotCountPerDay);

  // Среднее число запросов в час по экрану — «Запросы/час» в интерфейсе DSP.
  // Главный признак активности: 0 означает, что аукционов по экрану не идёт.
  const requestHourlyAvg = Number(inv.requestHourlyAvg);

  return {
    screen_id:   inv.gid || String(inv.id),
    city:        inv.inventoryTypeAndCity?.cityName
               || inv.city?.name
               || (typeof loc.city === "string" ? loc.city : loc.city?.name)
               || "",
    format:      meta.format || inv.type || "",
    address:     loc.address  || inv.name || "",
    lat:         loc.latitude  ?? NaN,
    lon:         loc.longitude ?? NaN,
    minBid:      mbInfo.minBidCharged ?? mbInfo.minBid ?? NaN,
    recoBid:     NaN,   // not provided by this API
    ots,
    grp:         meta.grp ?? NaN,
    owner:       inv.displayOwner?.name || "",
    image_url:   inv.images?.[0]?.url   || "",
    resolution,
    aspectRatio,
    size_wh,
    side,
    durationBidInfo,
    slotCountPerDay: Number.isFinite(slotCountPerDay) ? slotCountPerDay : NaN,
    requestHourlyAvg: Number.isFinite(requestHourlyAvg) ? requestHourlyAvg : NaN,
    _dspId:      inv.id,
  };
}

// Находит запись durationBidInfo для выбранной длительности (точное совпадение,
// иначе ближайшая по значению duration). null если у экрана нет данных/длительность не задана.
function _resolveDurationMatch(s, durationMs) {
  if (!durationMs || !Array.isArray(s.durationBidInfo) || !s.durationBidInfo.length) return null;
  const exact = s.durationBidInfo.find(d => d.duration === durationMs);
  return exact || s.durationBidInfo.reduce((best, d) =>
    (!best || Math.abs(d.duration - durationMs) < Math.abs(best.duration - durationMs)) ? d : best, null);
}

// Множитель цены для выбранной длительности относительно базовой (кратчайшей).
// Используется и для .minBid (точное значение из durationBidInfo), и для .recoBid
// (который приходит из отдельного forecast-price API, не знающего о длительности —
// поэтому его масштабируем тем же коэффициентом, а не берём отдельное значение).
function _durationRatioForScreen(s, durationMs) {
  const base = Number.isFinite(s._baseMinBid) ? s._baseMinBid : s.minBid;
  if (!Number.isFinite(base) || base <= 0) return 1;
  const match = _resolveDurationMatch(s, durationMs);
  return (match && Number.isFinite(match.minBid) && match.minBid > 0) ? match.minBid / base : 1;
}

// Перезаписывает .minBid и (если известен) .recoBid у экранов с durationBidInfo под
// выбранную длительность (мс). durationMs=null → возврат к базовой ставке (кратчайшая
// длительность). Идемпотентно: всегда читает из исходных durationBidInfo/_baseRecoBid,
// а не из уже перезаписанных .minBid/.recoBid.
function applySelectedDuration(durationMs) {
  state.selectedDurationMs = durationMs || null;
  for (const arr of [state.screensAll, state.screens]) {
    if (!Array.isArray(arr)) continue;
    for (const s of arr) {
      if (!Array.isArray(s.durationBidInfo) || !s.durationBidInfo.length) continue;
      if (!Number.isFinite(s._baseMinBid)) s._baseMinBid = s.minBid;
      const match = _resolveDurationMatch(s, durationMs);
      s.minBid = (match && Number.isFinite(match.minBid)) ? match.minBid : s._baseMinBid;
      if (Number.isFinite(s._baseRecoBid)) {
        const ratio = _durationRatioForScreen(s, durationMs);
        s.recoBid = s._baseRecoBid * ratio;
      }
    }
  }
}
window.PLANNER = window.PLANNER || {};
window.PLANNER.applySelectedDuration = applySelectedDuration;

// Канонический список всех доступных длительностей (мс) — не зависит от того,
// какой инвентарь уже загружен/закэширован (в отличие от union по screensAll,
// который отражает только то, что успело подгрузиться). Результат кэшируется в
// state.availableDurationsMs; используется как приоритетный источник для чипов
// длительности в widget-init.js, с фолбэком на union при ошибке/недоступности.
async function dspFetchAvailableDurations() {
  if (!window.DSP_AUTH_ENABLED) return null;
  const token = getDspToken();
  if (!token) return null;
  try {
    const r = await fetch(`${DSP_API}/api/v1.0/clients/inventories/available-durations`, {
      headers: { "Authorization": "Bearer " + token }
    });
    if (!r.ok) return null;
    const j = await r.json();
    // Defensive: API shape not fully documented — accept plain array of numbers,
    // array of objects with .duration/.value, or wrapped in {content:[]}/{durations:[]}.
    const raw = Array.isArray(j) ? j
      : Array.isArray(j?.content)   ? j.content
      : Array.isArray(j?.durations) ? j.durations
      : [];
    const durations = raw
      .map(d => Number(typeof d === "object" && d !== null ? (d.duration ?? d.value) : d))
      .filter(d => Number.isFinite(d) && d > 0);
    const result = [...new Set(durations)].sort((a, b) => a - b);
    state.availableDurationsMs = result;
    return result;
  } catch (e) {
    console.warn("[DSP] available-durations fetch failed:", e.message);
    return null;
  }
}
window.PLANNER.dspFetchAvailableDurations = dspFetchAvailableDurations;

// Нормализует массив сырых инвентарей в state.screens
function dspApplyInventories(raw) {
  state.screens = raw.map(inv => {
    const s = mapDspInventory(inv);
    s.minBid = Number.isFinite(Number(s.minBid)) ? Number(s.minBid) : NaN;
    s.ots    = Number.isFinite(Number(s.ots))    ? Number(s.ots)    : NaN;
    s.grp    = Number.isFinite(Number(s.grp))    ? Number(s.grp)    : NaN;
    s.lat    = Number.isFinite(Number(s.lat))    ? Number(s.lat)    : NaN;
    s.lon    = Number.isFinite(Number(s.lon))    ? Number(s.lon)    : NaN;
    return s;
  });

  // OTS interpolation по формату
  const otsByFormat = {};
  for (const s of state.screens) {
    if (Number.isFinite(s.ots) && s.ots > 0 && s.format) {
      if (!otsByFormat[s.format]) otsByFormat[s.format] = { sum: 0, cnt: 0 };
      otsByFormat[s.format].sum += s.ots;
      otsByFormat[s.format].cnt++;
    }
  }
  for (const s of state.screens) {
    if (!(Number.isFinite(s.ots) && s.ots > 0) && s.format && otsByFormat[s.format]) {
      s.ots = otsByFormat[s.format].sum / otsByFormat[s.format].cnt;
    }
  }

  // OTS cap (те же пороги, что и для CSV-инвентаря)
  const OTS_CAPS_DSP = { BILLBOARD: 150, SUPERSITE: 200, OTHER: 100, MEDIAFACADE: 2000 };
  for (const s of state.screens) {
    const cap = OTS_CAPS_DSP[s.format];
    if (cap && Number.isFinite(s.ots) && s.ots > cap) s.ots = cap;
  }

  state.formatsAll = [...new Set(state.screens.map(s => s.format).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  for (const s of state.screens) {
    s.region = s.city || "Не назначено";
  }

  window.dispatchEvent(new CustomEvent("planner:screens-ready", { detail: { count: state.screens.length } }));
  renderFormats();
  renderSelectedRegions();
  renderOwners();
}

// ---- IndexedDB-кэш инвентаря (нет лимита размера, переживает Shift+R) ----
// Ставки и OTS в инвентаре меняются, а кэш жил 7 суток — отсюда жалобы на
// неактуальные данные. Сутки: старт по-прежнему мгновенный, но данные не
// «протухают» на неделю. Возраст кэша виден в шапке, рядом — «Обновить».
const DSP_CACHE_TTL  = 24 * 60 * 60 * 1000; // 24 часа
const DSP_IDB_NAME   = "dsp_planner";
const DSP_IDB_STORE  = "inventory";
const DSP_IDB_VER    = 1;

// v7: mapDspInventory теперь тащит requestHourlyAvg, и без него фильтр «только
// активные» работать не может — старые записи кэша (v6 и раньше) надо перечитать.
// (v6 в своё время поднимали ровно так же из-за durationBidInfo.)
function getDspCacheKey() {
  const agencyId = getDspAgencyId() || "default";
  const emailKey = normalizeKey(getDspUserEmail() || "").replace(/[^a-z0-9._@-]/gi, "_");
  if (agencyId && agencyId !== "default") return `dsp_inv_v7_agency_${agencyId}`;
  if (emailKey) return `dsp_inv_v7_email_${emailKey}`;
  return null;
}

function _openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DSP_IDB_NAME, DSP_IDB_VER);
    req.onupgradeneeded = e => e.target.result.createObjectStore(DSP_IDB_STORE);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

async function dspSaveInventoryToStorage(cityCache) {
  try {
    const key = getDspCacheKey();
    if (!key) { console.log("[DSP] skip cache save: no cache key"); return; }
    const total = Object.values(cityCache || {}).reduce((s, a) => s + a.length, 0);
    if (total === 0) { console.log("[DSP] skipping cache save: 0 screens"); return; }
    const db  = await _openIdb();
    await new Promise((res, rej) => {
      const tx  = db.transaction(DSP_IDB_STORE, "readwrite");
      tx.objectStore(DSP_IDB_STORE).put({ ts: Date.now(), d: cityCache }, key);
      tx.oncomplete = res; tx.onerror = rej;
    });
    db.close();
    state.dspInventoryCachedAt = Date.now();
    console.log(`[DSP] inventory saved to IndexedDB (${total} screens), ttl=24h`);
    // Также чистим старые localStorage-кэши
    ["dsp_inv_v2", "dsp_inv_v3_" + (getDspAgencyId() || "default")].forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });
  } catch (e) {
    console.warn("[DSP] IDB save failed:", e.message);
  }
}

async function dspLoadInventoryFromStorage() {
  try {
    const key = getDspCacheKey();
    if (!key) return null;
    const db  = await _openIdb();
    const rec = await new Promise((res, rej) => {
      const tx  = db.transaction(DSP_IDB_STORE, "readonly");
      const req = tx.objectStore(DSP_IDB_STORE).get(key);
      req.onsuccess = () => res(req.result);
      req.onerror   = () => rej(req.error);
    });
    db.close();
    if (!rec) return null;
    if (Date.now() - rec.ts > DSP_CACHE_TTL) {
      // Просрочен — удаляем
      const db2 = await _openIdb();
      const tx2 = db2.transaction(DSP_IDB_STORE, "readwrite");
      tx2.objectStore(DSP_IDB_STORE).delete(key);
      db2.close();
      return null;
    }
    const total  = Object.values(rec.d).reduce((s, a) => s + a.length, 0);
    const ageMin = Math.round((Date.now() - rec.ts) / 60000);
    console.log(`[DSP] IDB cache hit: ${total} screens, age=${ageMin}min`);
    if (total === 0) return null;
    state.dspInventoryCachedAt = rec.ts;
    return rec.d;
  } catch (e) {
    console.warn("[DSP] IDB load failed:", e.message);
    return null;
  }
}

// Owners whose OTS data is known-bad → always zero
const _ZERO_OTS_OWNERS = ["sunlight indoor", "maer indoor", "spectr"];
function _isZeroOtsOwner(s) {
  const o = String(s.owner ?? "").toLowerCase();
  return _ZERO_OTS_OWNERS.some(k => o.includes(k));
}

const _OTS_CAPS_DSP = { BILLBOARD: 150, SUPERSITE: 200, MEDIAFACADE: 2000 };
const _OTS_CAP_DEFAULT = 200; // for all other formats

// Применяет уже смапленные экраны (из кэша или после расчёта) в state.screens
function dspApplyMappedScreens(screens) {
  state.screens = screens.map(s => ({
    ...s,
    minBid: Number.isFinite(Number(s.minBid)) ? Number(s.minBid) : NaN,
    ots:    Number.isFinite(Number(s.ots))    ? Number(s.ots)    : NaN,
    grp:    Number.isFinite(Number(s.grp))    ? Number(s.grp)    : NaN,
    lat:    Number.isFinite(Number(s.lat))    ? Number(s.lat)    : NaN,
    lon:    Number.isFinite(Number(s.lon))    ? Number(s.lon)    : NaN,
    region: state.regionsByCity?.[s.city] || getRegionForDspCity(s.city),
  }));
  // IMPORTANT:
  // do not overwrite screensAll here.
  // screensAll is the full loaded DSP inventory and is used as a master pool;
  // this function applies only current selection into state.screens.

  // Zero out known-bad OTS owners before computing format averages
  for (const s of state.screens) {
    if (_isZeroOtsOwner(s)) s.ots = 0;
  }

  const otsByFormat = {};
  for (const s of state.screens) {
    if (_isZeroOtsOwner(s)) continue;
    if (Number.isFinite(s.ots) && s.ots > 0 && s.format) {
      const cap = _OTS_CAPS_DSP[s.format] ?? _OTS_CAP_DEFAULT;
      if (s.ots > cap) continue; // exclude outliers from average
      if (!otsByFormat[s.format]) otsByFormat[s.format] = { sum: 0, cnt: 0 };
      otsByFormat[s.format].sum += s.ots;
      otsByFormat[s.format].cnt++;
    }
  }
  for (const s of state.screens) {
    if (_isZeroOtsOwner(s)) continue;
    if (!(Number.isFinite(s.ots) && s.ots > 0) && s.format && otsByFormat[s.format])
      s.ots = otsByFormat[s.format].sum / otsByFormat[s.format].cnt;
  }

  // Apply OTS caps (same logic as CSV path)
  for (const s of state.screens) {
    if (_isZeroOtsOwner(s)) { s.ots = 0; continue; }
    const cap = _OTS_CAPS_DSP[s.format] ?? _OTS_CAP_DEFAULT;
    if (Number.isFinite(s.ots) && s.ots > cap) s.ots = cap;
  }

  state.formatsAll = [...new Set(state.screens.map(s => s.format).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  window.dispatchEvent(new CustomEvent("planner:screens-ready", { detail: { count: state.screens.length } }));
  renderFormats();
  renderSelectedRegions();
  renderOwners();
}

// Загружает весь инвентарь, строит список городов и кэш по городу (cityName → [mapped screens])
async function loadScreensFromDSP() {
  setStatus("Загружаю инвентарь…");

  // Fire-and-forget: canonical duration list, independent of inventory warmup.
  dspFetchAvailableDurations().then(list => {
    if (list && list.length) window.dispatchEvent(new CustomEvent("planner:filters-changed"));
  });

  let cityCache = await dspLoadInventoryFromStorage();
  if (cityCache) {
    const total = Object.values(cityCache).reduce((s, a) => s + a.length, 0);
    console.log(`[DSP] loaded from IndexedDB: ${total} screens, ${Object.keys(cityCache).length} cities`);
    state.dspInventoryTotal = total;
    state.dspInventoryWarmupPromise = null;
    state.dspInventoryWarmupDone = true;
  } else {
    cityCache = await dspFetchAllInventories();
  }

  dspHydrateCityState(cityCache);
  state.screens = [];
  if (state.dspInventoryWarmupDone) setStatus("");
}

// Применяет кэшированный инвентарь для выбранных регионов (вызывается из onCalcClick)
async function dspEnsureInventoryForRegions(regions) {
  if (!window.DSP_AUTH_ENABLED || !state.dspInventoryCache) return;

  // Важно: без ожидания warmup часть городов может отсутствовать в region->cities,
  // и расчёт проходит на неполном пуле.
  if (!state.dspInventoryWarmupDone && state.dspInventoryWarmupPromise) {
    setStatus(`Догружаю инвентарь перед расчётом…`);
    await state.dspInventoryWarmupPromise;
  }

  const regionToCities = state.dspRegionToCities || {};
  const regionCities = (regions || []).flatMap(r => regionToCities[r] || []);
  const missing = regionCities.filter(city => !state.dspInventoryCache[city]);
  if (missing.length && state.dspInventoryWarmupPromise) {
    setStatus(`Догружаю инвентарь для: ${regions.join(", ")}…`);
    await state.dspInventoryWarmupPromise;
  }
  const byCityName = (cityName) => {
    const cache = state.dspInventoryCache || {};
    if (cache[cityName]) return cache[cityName];
    const target = normalizeGeoName(cityName);
    if (!target) return [];
    for (const [k, arr] of Object.entries(cache)) {
      if (normalizeGeoName(k) === target) return arr || [];
    }
    // Fuzzy fallback: handles variants like "Набережные Челны" vs
    // "г. Набережные Челны"/"Набережные Челны городской округ".
    for (const [k, arr] of Object.entries(cache)) {
      const nk = normalizeGeoName(k);
      if (!nk) continue;
      if (nk.includes(target) || target.includes(nk)) return arr || [];
    }
    return [];
  };

  let screens = regionCities.flatMap(city => byCityName(city));

  // Fallback: если регионы в UI являются фактически названиями городов.
  if (!screens.length) {
    screens = (regions || []).flatMap(r => byCityName(r));
  }

  if (!screens.length) {
    const cacheKeys = Object.keys(state.dspInventoryCache || {});
    const wanted = (regions || []).map(r => normalizeGeoName(r)).filter(Boolean);
    const hints = cacheKeys
      .filter(k => {
        const nk = normalizeGeoName(k);
        return wanted.some(w => nk.includes(w) || w.includes(nk));
      })
      .slice(0, 20);
    console.warn("[DSP] no screens after region/city match", {
      requested: regions,
      requestedNorm: wanted,
      regionCities: regionCities.slice(0, 20),
      cacheCitiesTotal: cacheKeys.length,
      possibleCityMatches: hints
    });

    // Final fallback: if selected region/city is empty, force full reload
    // from API and retry matching once. This mitigates partial warmup/cache.
    try {
      setStatus("Не нашла экраны по выбору — делаю полную перезагрузку из API…");
      await dspForceReloadAllInventoriesBlocking();

      const regionToCities2 = state.dspRegionToCities || {};
      const regionCities2 = (regions || []).flatMap(r => regionToCities2[r] || []);
      screens = regionCities2.flatMap(city => byCityName(city));
      if (!screens.length) {
        screens = (regions || []).flatMap(r => byCityName(r));
      }

      console.warn("[DSP] retry after full reload", {
        requested: regions,
        regionCities: regionCities2.slice(0, 20),
        screens: screens.length
      });
    } catch (e) {
      console.warn("[DSP] full reload fallback failed:", e?.message || e);
      setStatus("");
    }
  }

  dspApplyMappedScreens(screens);
  console.log(`[DSP] inventory applied: ${screens.length} screens for regions:`, regions);
  setStatus("");
}

// ===== START =====
async function startPlanner() {
  bindPlannerUI();
  window.PLANNER.ui.photosAllowed = false;

  await loadTiers();
  await loadCityRegions();

  if (window.DSP_AUTH_ENABLED) {
    // DSP API mode: логин + загрузка инвентаря через API
    if (!getDspToken()) await showLoginOverlay();
    renderDspUserBar();
    // Если agencyId не сохранён (например, токен из предыдущей сессии),
    // подтягиваем профиль ДО чтения кэша, чтобы не попадать в default-cache.
    if (!getDspAgencyId()) {
      await dspFetchCurrentUserAgency().catch(() => {});
    } else if (!getDspAgencyMarkup().additionalCharge) {
      dspFetchAgencyMarkup(getDspAgencyId()).catch(() => {});
    }
    try {
      await loadScreensFromDSP();
    } catch (e) {
      if (e.message === "SESSION_EXPIRED") {
        // Токен протух — показываем логин снова
        await showLoginOverlay();
        renderDspUserBar();
        await loadScreensFromDSP();
      } else {
        throw e;
      }
    }
  } else {
    // Fallback: CSV
    await loadScreens();
  }
}

function bootPlanner() {
  startPlanner().catch(e => {
    console.error("Planner init failed:", e);
    setStatus("Ошибка инициализации. Открой консоль — там причина (Planner init failed).");
  });
}

// Автозапуск намеренно отключён: bootPlanner() вызывается внешним kick() из HTML-страницы.
// Это предотвращает двойной вызов (и двойной запрос логина).

// Auto-load affinity data from CDN
(function autoLoadAffinity() {
  function tryLoad() {
    if (PLANNER_CDN_BASE) {
      loadAffinityJSON().catch(err => console.warn("Affinity auto-load failed:", err));
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryLoad);
  } else {
    setTimeout(tryLoad, 0);
  }
})();

// ===== HTML MAP DOWNLOAD =====
function buildMapHtml(screens, regionLabel) {
  const pts = screens.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  if (!pts.length) return null;

  const pointsJson = JSON.stringify(pts.map(s => ({
    lat: +s.lat.toFixed(6), lon: +s.lon.toFixed(6),
    id: s.screen_id || "", fmt: s.format || "", city: s.city || "", addr: s.address || ""
  })));

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <title>Карта экранов${regionLabel ? " — " + regionLabel : ""}</title>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Inter,Arial,sans-serif;display:flex;flex-direction:column;height:100vh}
    #toolbar{padding:10px 16px;background:#5B3EF5;color:#fff;font-size:14px;font-weight:600;display:flex;align-items:center;gap:12px}
    #toolbar span{font-weight:400;opacity:.8}
    #map{flex:1}
  </style>
</head>
<body>
  <div id="toolbar">
    Карта экранов${regionLabel ? " — " + regionLabel : ""}
    <span id="cnt"></span>
  </div>
  <div id="map"></div>
  <script>
    const pts = ${pointsJson};
    document.getElementById("cnt").textContent = pts.length + " экранов";
    const map = L.map("map");
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap",maxZoom:19}).addTo(map);
    const markers = pts.map(p => {
      const popup = \`<b>\${p.fmt}</b><br>\${p.city}<br>\${p.addr}<br><small>\${p.id}</small>\`;
      return L.circleMarker([p.lat,p.lon],{radius:6,color:"#5B3EF5",fillColor:"#5B3EF5",fillOpacity:.8,weight:1.5}).bindPopup(popup);
    });
    const group = L.featureGroup(markers).addTo(map);
    map.fitBounds(group.getBounds().pad(.05));
  <\/script>
</body>
</html>`;
}

function downloadMapHtml() {
  const calc = window.PLANNER?.lastCalc;
  const screens = state.lastChosen || calc?.chosen || [];
  const pts = screens.filter(s => Number.isFinite(s.lat) && Number.isFinite(s.lon));
  if (!pts.length) { alert("Нет экранов с координатами"); return; }

  const regions = (calc?.brief?.geo?.regions || calc?.brief?.selectedRegions || state.selectedRegions || []);
  const regionLabel = regions.join(", ") || "";
  const html = buildMapHtml(screens, regionLabel);
  if (!html) return;

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const name = `map_${regions.join("-") || "screens"}_${today}.html`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ===== EXPORTS =====
Object.assign(window.PLANNER, {
  state,
  loadScreens,
  startPlanner,
  loadCityRegions,
  bootPlanner,
  downloadXLSX,
  geocodeAddressNominatim,
  pickScreensNearPoint,
  computeScheduleHoursForPeriod,
  getScreensFilteredByOwner,
  renderOwners,
  pointInPolygon,
  countScreensInPolygon,
  replaceScreen,
  removeScreen,
  downloadMapHtml,
  buildMapHtml,
});
