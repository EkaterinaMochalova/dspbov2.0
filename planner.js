const PLANNER_CDN_BASE = (() => {
  try {
    if (window.PLANNER_ASSET_BASE) return window.PLANNER_ASSET_BASE;
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

// ============================================================================
// ВАЛИДАЦИЯ ПОЛЕЙ
// ----------------------------------------------------------------------------
// Раньше каждая непройденная проверка выдавала alert(): модальное окно браузера
// блокирует вкладку, выглядит чужеродно поверх Тильды, не показывает, какое
// именно поле не заполнено, и на мобильном печатает адрес сайта. Теперь ошибка
// живёт рядом с полем: нужный шаг открывается сам, поле подсвечивается и
// получает фокус, а подпись гаснет, как только пользователь начал править.
// ============================================================================

// Куда прокручивать: window.scrollTo, а не scrollIntoView — в Тильде виджет
// лежит во вложенных скролл-контейнерах и scrollIntoView промахивается.
function _scrollToNode(node) {
  if (!node) return;
  const top = node.getBoundingClientRect().top + window.scrollY - 90;
  window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
}

function clearFieldError(target) {
  const node = (typeof target === "string") ? document.getElementById(target) : target;
  if (!node) return;
  node.classList.remove("fld-invalid", "fld-invalid-box");
  const holder = node.dataset.fldErrId ? document.getElementById(node.dataset.fldErrId) : null;
  if (holder) holder.remove();
  delete node.dataset.fldErrId;
}

let _fldErrSeq = 0;

/**
 * Показывает ошибку у поля.
 * @param {string|Element} target — id элемента или сам элемент
 * @param {string} message — что не так
 * @param {{step?: number, box?: boolean, anchor?: string|Element}} [opts]
 *        step   — на каком шаге визарда лежит поле (переключим туда)
 *        box    — подсветить рамкой-обводкой (для блоков без своей рамки)
 *        anchor — после какого элемента вставить подпись, если не после поля
 * @returns {false} — чтобы можно было писать `return fieldError(...)`
 */
function fieldError(target, message, opts) {
  const o = opts || {};
  const node = (typeof target === "string") ? document.getElementById(target) : target;

  if (o.step && typeof window.setStep === "function") window.setStep(o.step);

  if (!node) {
    // Поля нет в DOM — не молчим, но и не роняем поток.
    console.warn("[validate] нет элемента для ошибки:", target, message);
    toast(message);
    return false;
  }

  clearFieldError(node);
  node.classList.add(o.box ? "fld-invalid-box" : "fld-invalid");

  const holder = document.createElement("div");
  holder.className = "fld-err";
  holder.id = "fld-err-" + (++_fldErrSeq);
  holder.textContent = message;
  node.dataset.fldErrId = holder.id;

  const anchorEl = o.anchor
    ? ((typeof o.anchor === "string") ? document.getElementById(o.anchor) : o.anchor)
    : node;
  (anchorEl.parentNode || node.parentNode)?.insertBefore(holder, anchorEl.nextSibling);

  // Гасим подпись, как только пользователь начал править — в том числе когда
  // правит соседнее поле той же пары (даты, GRP).
  const off = () => clearFieldError(node);
  node.addEventListener("input",  off, { once: true });
  node.addEventListener("change", off, { once: true });
  node.addEventListener("click",  off, { once: true });

  // Прокрутка после переключения шага: setStep сам скроллит к началу виджета.
  setTimeout(() => {
    _scrollToNode(holder);
    if (typeof node.focus === "function" && !o.box) {
      try { node.focus({ preventScroll: true }); } catch (e) { node.focus(); }
    }
  }, o.step ? 220 : 0);

  return false;
}

// Короткое сообщение, не привязанное к полю (состояние, а не ошибка ввода).
let _toastTimer = null;
function toast(message, ms) {
  let n = document.getElementById("planner-toast");
  if (!n) {
    n = document.createElement("div");
    n.id = "planner-toast";
    document.body.appendChild(n);
  }
  n.textContent = message;
  // Форсируем reflow, иначе повторный вызов не переиграет анимацию.
  void n.offsetWidth;
  n.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => n.classList.remove("show"), ms || 3200);
  return false;
}

window.PLANNER.fieldError = fieldError;
window.PLANNER.clearFieldError = clearFieldError;
window.PLANNER.toast = toast;

// ===== Библиотеки по требованию =====
// papaparse / xlsx / exceljs больше не грузятся на старте — их подтягивает
// PLANNER_ENSURE_LIB() из widget-init.js в момент первого обращения.
// Возвращает библиотеку либо null (с понятным сообщением пользователю).
async function ensureLib(name) {
  const globals = { papaparse: "Papa", xlsx: "XLSX", exceljs: "ExcelJS" };
  const g = globals[name];
  if (window[g]) return window[g];
  if (typeof window.PLANNER_ENSURE_LIB !== "function") {
    console.error("[lib] PLANNER_ENSURE_LIB недоступен — planner.js запущен без widget-init.js");
    return null;
  }
  try {
    return await window.PLANNER_ENSURE_LIB(name);
  } catch (e) {
    console.error("[lib] не удалось загрузить", name, e);
    return null;
  }
}
window.PLANNER.ensureLib = ensureLib;

const TIERS_JSON_URL =
  PLANNER_CDN_BASE + "tiers_v1.json";

// ===== CITY -> REGION =====
const CITY_REGIONS_URL =
  PLANNER_CDN_BASE + "city_regions.json";

// ===== Labels =====
const FORMAT_LABELS = {
  BILLBOARD: { label: "Билборды", desc: "экраны 3×6 м вдоль трасс" },
  CITY_BOARD: { label: "Сити-борды", desc: "небольшие экраны в центре города, видимые и авто-, и пешеходному траффику" },
  CITY_FORMAT: { label: "Ситиформаты", desc: "вертикальные экраны, остановки/пешеходные зоны" },
  CITY_FORMAT_RC: { label: "Ситиформаты на МЦК", desc: "экраны на МЦК" },
  CITY_FORMAT_RD: { label: "Ситиформаты на вокзалах", desc: "экраны на вокзале" },
  CITY_FORMAT_WD: { label: "Ситиформаты в метро", desc: "экраны в метро" },
  RW_PLATFORM: { label: "Ситиформаты на МЦД", desc: "экраны на МЦД" },
  METRO_SCREEN_3X1: { label: "Горизонтальные экраны в метро", desc: "экраны в метро" },
  MEDIAFACADE: { label: "Медиафасады", desc: "огромные экраны на стенах домов" },
  METRO_LIGHTBOX: { label: "Лайтбоксы в метро", desc: "экраны в метро, горизонтальные" },
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
// В рекомендованном режиме у экрана без recoBid ставка = minBid × BID_MULTIPLIER:
// это та же оценка «рекомендованной», что используется во всём остальном коде.
// Раньше здесь для таких экранов бралась голая minBid, и медиаплан их недооценивал.
function screenBid(s, brief) {
  const uplift = bidUpliftFactor(brief);
  if (brief?.bidMode === "min") {
    return Number.isFinite(s?.minBid) ? s.minBid * uplift : s?.minBid;
  }
  if (Number.isFinite(s?.recoBid) && s.recoBid > 0) return s.recoBid * uplift;
  return Number.isFinite(s?.minBid) ? s.minBid * BID_MULTIPLIER * uplift : s?.minBid;
}

// Наружу — чтобы ставку можно было сверить снаружи теми же правилами,
// какими её считает расчёт, а не воспроизводить их заново.
window.PLANNER.screenBid = screenBid;
window.PLANNER.bidUpliftFactor = bidUpliftFactor;

// Медиафасад крутит не чаще 8 раз в час — это ограничение носителя, а не
// плановая планка: сколько бы пользователь ни поставил на слайдере, на фасаде
// частота срезается до 8. Раньше здесь стояло 12, и расчёт обещал на фасадах
// больше выходов, чем они физически отдают.
const MF_MAX_PPH = 8;

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
const SUSPICIOUS_BID_RATIO = 0.2; // ниже 20 % медианы группы
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
  list.forEach(s => { s._suspiciousBid = false; s._suspiciousMedian = null; s._effectiveBid = NaN; });
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
    // Эффективная ставка (режим + надбавка) — её же показывает карточка экрана.
    if (Number.isFinite(bid)) s._effectiveBid = bid;
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
// форматов. Для остальных форматов это НЕ физический потолок экрана
// (getScreenPphCap — 60), а плановая планка: выше неё нельзя ни рекомендовать
// «максимальный» бюджет, ни молча принять цель клиента по бюджету/показам/OTS.
// У медиафасадов оба числа совпадают: 8 — и планка, и физический предел.
const CAPACITY_PPH_MF = 8;
const CAPACITY_PPH_DEFAULT = 30;

function capacityPphForScreen(s) {
  const fmt = String(s?.format || "").toUpperCase();
  return (fmt === "MEDIAFACADE" || fmt === "MF") ? CAPACITY_PPH_MF : CAPACITY_PPH_DEFAULT;
}

// hoursTotal — суммарные часы размещения за период (дней × часов/день).
// Возвращает null, если считать не из чего: вызывающий код тогда просто не проверяет.
// Потолок правдоподобной ставки за выход. В инвентаре встречаются строки с
// ценой на четыре порядка выше рынка: на 23.08.2026 это четыре Indoor-экрана
// «Шоколадницы» в Москве по 16 800 000 ₽ при медиане по городу 3 ₽ и p99 294 ₽.
// Средняя ставка по Москве из-за них вырастает с ~6 ₽ до ~9 900 ₽, и ёмкость
// города превращается в 1,6 трлн вместо полумиллиарда. Раньше это не всплывало:
// бюджеты брались из таблицы с потолком. Считаем такие строки браком данных и
// не пускаем в расчёт ёмкости; максимум легальной ставки в базе — сотни рублей.
const MAX_PLAUSIBLE_BID = 10000;

function isImplausibleBid(s) {
  const b = Number(s?.minBid);
  return Number.isFinite(b) && b > MAX_PLAUSIBLE_BID;
}

function computeCapacity(screens, hoursTotal, bidMode, uplift = 1) {
  const all = Array.isArray(screens) ? screens : [];
  const list = all.filter(s => !isImplausibleBid(s));
  if (list.length !== all.length) {
    console.warn("[capacity] исключены экраны с неправдоподобной ставкой:",
      all.filter(isImplausibleBid).map(s => ({ id: s.screen_id, city: s.city, minBid: s.minBid })));
  }
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
// Экраны без ставки в GID-режиме и в режиме конструкций не выбрасываются, а
// получают оценку по среднему своего формата: список задан вручную, и молча
// терять его часть нельзя. Функция одна на все места — расчёт делал это двумя
// копиями, а подсказка на шаге «Цели» не делала вовсе, из-за чего показывала
// 4 экрана там, где расчёт берёт 6, и сумма расходилась в разы.
function withEstimatedBids(pool) {
  const bidScreens = pool.filter(hasActiveInventory);
  if (!bidScreens.length || bidScreens.length === pool.length) return pool;
  const fmtAvg = {};
  for (const s of bidScreens) {
    if (!fmtAvg[s.format]) fmtAvg[s.format] = { sum: 0, n: 0 };
    fmtAvg[s.format].sum += s.minBid; fmtAvg[s.format].n++;
  }
  const regionAvg = bidScreens.reduce((a, s) => a + s.minBid, 0) / bidScreens.length;
  return pool.map(s => {
    if (Number.isFinite(s.minBid) && s.minBid > 0) return s;
    const f = fmtAvg[s.format];
    return { ...s, minBid: f ? f.sum / f.n : regionAvg, _bidEstimated: true };
  });
}

// Передача фотоотчёта. От SSP приходит YES или NO; AUTO ставится на нашей
// стороне экранам с YES, которые фото реально присылают, и только у них есть
// lastShotTime. Экран с AUTO, у которого последнее фото старше полугода, фото
// фактически не передаёт — считаем его как NO. Дата отсутствует вовсе —
// значит фото мы не видели ни разу, тоже NO.
const PHOTO_REPORT_STALE_MS = 183 * 24 * 60 * 60 * 1000;
function photoReportOf(s) {
  const raw = String(s?.photoReportOption ?? "").trim().toUpperCase();
  if (raw !== "AUTO") return (raw === "YES" || raw === "NO") ? raw : "";
  const t = Number(s?.lastShotTime);
  if (!Number.isFinite(t) || t <= 0) return "NO";
  return (Date.now() - t > PHOTO_REPORT_STALE_MS) ? "NO" : "AUTO";
}
window.PLANNER.photoReportOf = photoReportOf;

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
  // Один GID у операторов иногда висит на нескольких экранах. Здесь лежит
  // решение пользователя: { "MAER00243MSKMF4": "<ключ варианта>" }. Пока
  // спорный GID не разобран, расчёт не пускаем — иначе молча берётся первый
  // попавшийся экран, а это может быть другой город и другая ставка.
  gidPicks: {},

  // Длительность ролика по формату: { BILLBOARD: [5000], MEDIAFACADE: [15000] }.
  // Что здесь не задано — берёт общий выбор selectedDurationsMs.
  durationsByFormat: {},
  manuallyExcluded: new Set(), // screens manually removed from map — persists across recalcs
  // Адресная программа, зафиксированная после расчёта. Пока она не пуста,
  // пересчёт (смена уровня бюджета, частоты, ручные правки) работает строго
  // внутри неё и не добирает новых экранов из пула. Сбрасывается при возврате
  // в бриф — новый бриф собирает программу заново.
  apFrozenIds: null,

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

  // affinityStats нужен интерфейсу только как перечень доступных сегментов
  // (renderAudienceSegments берёт Object.keys, updateAudienceCoverage — проверку
  // на наличие). Раньше здесь считалось покрытие по шести порогам для каждого
  // из 141 сегмента — 2,9 млн итераций и ~220 мс заморозки потока, — и ни одно
  // из этих чисел нигде не читалось. Если покрытие понадобится, считать его
  // надо для выбранных сегментов в updateAudienceCoverage(), а не для всех.
  const stats = {};
  const total = map.size;
  for (const seg of headers) {
    if (AFFINITY_SKIP_COLS.has(seg)) continue;
    stats[seg] = { total };
  }
  state.affinityStats = stats;

  window.dispatchEvent(new CustomEvent("planner:affinity-loaded", { detail: { count: map.size } }));
  return map.size;
}
window.PLANNER.loadAffinityJSON = loadAffinityJSON;

// ===== Ленивая загрузка данных ВК =====
// affinity_data.json весит 11,3 МБ и нужен только при включённом фильтре
// «Аудитория VK». Раньше он грузился на каждом открытии страницы: ~2,9 с сети
// плюс ~0,5 с заморозки интерфейса на разборе. Теперь — по первому обращению.
let _affinityPromise = null;
function ensureAffinityLoaded() {
  if (state.affinityMap) return Promise.resolve(state.affinityMap.size);
  if (!_affinityPromise) {
    _affinityPromise = loadAffinityJSON()
      .catch(err => {
        _affinityPromise = null; // дать возможность повторить
        console.warn("[affinity] загрузка не удалась:", err);
        window.dispatchEvent(new CustomEvent("planner:affinity-failed", {
          detail: { message: err?.message || String(err) }
        }));
        throw err;
      });
  }
  return _affinityPromise;
}
window.PLANNER.ensureAffinityLoaded = ensureAffinityLoaded;
window.PLANNER.isAffinityLoading = () => !!_affinityPromise && !state.affinityMap;

// Проставляет отложенный выбор сегментов ВК, если чекбоксы уже отрисованы.
// Возвращает true, когда применять больше нечего.
function applyPendingAudienceSegments() {
  const want = state._pendingAudienceSegments;
  if (!want) return true;
  const boxes = document.querySelectorAll('#audience-segment-wrap input[type="checkbox"]');
  if (!boxes.length) return false; // сегменты ещё не отрисованы — ждём
  const set = new Set(want);
  boxes.forEach(cb => { cb.checked = set.has(cb.value); });
  state._pendingAudienceSegments = null;
  return true;
}
window.PLANNER.applyPendingAudienceSegments = applyPendingAudienceSegments;

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

// Целевая частота на экран задаёт, на сколько экранов размажется бюджет:
// экранов ≈ (выходы / дни / часы) / порог. Чем ниже порог, тем шире адресная
// программа при тех же деньгах.
//
// Пороги 5 / 25 / 50 давали «Охвату» слишком плотную открутку — раз в 12 минут
// на экран, — и на типовом московском брифе он набирал 45 экранов вместо
// сотни с лишним. Снижено до 2 / 15 / 30:
//   охват   2 вых/час — выход раз в полчаса, экранов в 2,5 раза больше
//   баланс 15 вых/час — раз в 4 минуты
//   частота 30 вых/час — раз в 2 минуты
function targetPlaysPerHourPerScreen(mode) {
  if (mode === "max_reach") return 2;
  if (mode === "max_freq")  return 30;
  return 15; // balanced
}

// ===== Utils =====
function el(id) { return document.getElementById(id); }

function setStatus(msg, isError) {
  const s = el("status");
  if (!s) return;
  s.textContent = msg || "";
  // Итог расчёта «ничего не подобралось» раньше приходил через alert. Он читается,
  // но выбрасывает из контекста; строка под кнопкой остаётся на месте — только
  // её надо отличать от обычного «Считаю…», иначе теряется.
  if (isError) {
    s.style.cssText = "color:#c62828;background:#fff5f5;border:1px solid #f3c2c2;" +
                      "border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.45;";
  } else {
    s.style.cssText = "";
  }
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
  // Дней вещания бывает меньше календарных: «только будни» за октябрь — 23 из
  // 31. Считаем их отдельно, чтобы в сводке и в выгрузке стояли честные дни и
  // часы, а не среднее, размазанное по выходным.
  let minHpd = null, maxHpd = null, activeDays = 0;

  const start = new Date(startStr + "T00:00:00");
  for (let i = 0; i < days; i++) {
    const dt = new Date(start);
    dt.setDate(start.getDate() + i);

    const dayHours = (mode === "global")
      ? _hoursForWeekdayIntervals(globalIntervals)
      : _hoursForWeekdayIntervals(weekly[_weekdayKeyFromDate(dt)]);

    totalHours += dayHours;
    if (dayHours > 0) {
      activeDays++;
      minHpd = (minHpd == null) ? dayHours : Math.min(minHpd, dayHours);
      maxHpd = (maxHpd == null) ? dayHours : Math.max(maxHpd, dayHours);
    }
  }

  const avgHpd = days ? (totalHours / days) : 0;
  return { days, totalHours, avgHpd, minHpd: minHpd ?? 0, maxHpd: maxHpd ?? 0, activeDays };
}

  const hpd = hoursPerDay(schedule || { type: "all_day" });
  return { days, totalHours: hpd * days, avgHpd: hpd, minHpd: hpd, maxHpd: hpd,
           activeDays: hpd > 0 ? days : 0 };
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
            padding:8px 14px; background:#fff; color:#6b7280; border:1px solid #ddd;
            border-radius:8px; font-size:13px; cursor:pointer;">
            Отмена
          </button>
          <span id="addr-import-status" style="font-size:12px; color:#667085;"></span>
        </div>
      </div>

      <!-- Панель 2ГИС: подбор адресов по бренду -->
      <div id="addr-2gis-panel" style="display:none; background:#f4fdf7; border:1px solid #1DB244;
           border-radius:12px; padding:12px; margin-bottom:8px;">
        <div style="font-size:12px; font-weight:600; color:#0e7a2e; margin-bottom:8px;">
          Нет готового списка? Найдём адреса объектов в выбранных регионах и подставим их сюда.
        </div>
        <div style="font-size:12px; line-height:1.45; color:#8A5A00; background:#FFF6E1;
             border:1px solid #EFD8A1; border-radius:8px; padding:8px 10px; margin-bottom:8px;">
          Один бренд за раз. Поиск идёт по всем выбранным регионам и занимает от
          нескольких секунд до нескольких минут; параллельные запросы 2ГИС отбрасывает,
          и часть адресов потеряется. Дождитесь результата и запустите следующий.
        </div>
        <input type="text" id="addr-2gis-brand" placeholder="Напр.: Пятёрочка, Магнит, McDonald's"
          style="width:100%; box-sizing:border-box; padding:9px 12px; border:1px solid #b7e3c6;
                 border-radius:8px; font-size:13px;">
        <div style="display:flex; align-items:center; gap:8px; margin-top:8px; flex-wrap:wrap;">
          <span style="font-size:12px; color:#33691e;">Сколько адресов нужно</span>
          <input type="number" id="addr-2gis-limit" min="0" max="2000" step="10" value="200"
            placeholder="все"
            style="width:90px; padding:6px 8px; border:1px solid #b7e3c6; border-radius:8px;
                   font-size:13px;">
          <span style="font-size:11px; color:#5f7a68;">на регион; 0 или пусто — найти все (может занять несколько минут)</span>
        </div>
        <label style="display:flex; align-items:center; gap:6px; margin-top:8px; font-size:12px; color:#33691e; cursor:pointer;">
          <input type="checkbox" id="addr-2gis-full">
          Искать полнее (обход сеткой — дольше, но находит больше объектов)
        </label>
        <div style="display:flex; gap:8px; margin-top:8px; align-items:center; flex-wrap:wrap;">
          <button type="button" id="addr-2gis-apply" style="
            padding:8px 18px; background:#0e7a2e; color:#fff; border:none;
            border-radius:8px; font-size:13px; font-weight:600; cursor:pointer;">
            Найти адреса
          </button>
          <button type="button" id="addr-2gis-cancel" style="
            padding:8px 14px; background:#fff; color:#6b7280; border:1px solid #ddd;
            border-radius:8px; font-size:13px; cursor:pointer;">
            Отмена
          </button>
          <span id="addr-2gis-status" style="font-size:12px; color:#667085;"></span>
        </div>
      </div>

      <label style="display:flex; align-items:center; gap:10px; margin-top:10px; flex-wrap:wrap;">
        <span style="font-size:13px; color:#4C5368;">Радиус вокруг адреса</span>
        <input id="planner-radius" type="number" min="50" value="500"
               style="width:110px; box-sizing:border-box; padding:8px 10px;">
        <span style="font-size:12px; color:#6C7488;">метров</span>
      </label>
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

    // По центроиду инвентаря на каждый выбранный регион. Регионы без экранов с
    // координатами просто пропускаем.
    function geo2gisCenters() {
      const regions = Array.isArray(state.selectedRegions) ? state.selectedRegions : [];
      const all = (Array.isArray(state.screensAll) && state.screensAll.length)
        ? state.screensAll
        : (Array.isArray(state.screens) ? state.screens : []);
      const centroid = (arr, label) => {
        const pts = arr.filter(s => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon)));
        if (!pts.length) return null;
        return {
          lat: pts.reduce((a, s) => a + Number(s.lat), 0) / pts.length,
          lon: pts.reduce((a, s) => a + Number(s.lon), 0) / pts.length,
          label,
        };
      };
      if (!regions.length) {
        const c = centroid(all, "");
        return c ? [c] : [];
      }
      return regions
        .map(r => centroid(all.filter(s => screenMatchesGeoChoice(s, r)), r))
        .filter(Boolean);
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

    // Пересчёт счётчиков — O(строк × размер пула), а planner:pool-updated прилетает
    // почти на каждый ввод. Через 2ГИС в списке может оказаться несколько сотен
    // адресов, поэтому без дебаунса виджет встал бы колом.
    let _recountTimer = null;
    function recountAll(countOnly) {
      clearTimeout(_recountTimer);
      _recountTimer = setTimeout(() => {
        document.querySelectorAll("#addr-list .addr-row").forEach(row => resolveRow(row, countOnly));
      }, 250);
    }

    function addAddressRow(value, point, opts) {
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
      del.setAttribute("aria-label", "Удалить адрес");
      del.style.cssText = "background:none; border:none; font-size:20px; color:#6b7280; cursor:pointer; line-height:1; padding:0 4px;";
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
      // При массовом добавлении разрешение строк запускает bulkAddAddresses одним
      // проходом в конце — иначе на 500 адресов уйдёт 500 отдельных пересчётов.
      if (value && !opts?.defer) resolveRow(row, false);
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
    // Возвращает { added, skipped }: skipped — сколько дублей отброшено.
    function bulkAddAddresses(items) {
      let clean = (Array.isArray(items) ? items : [])
        .map(it => (typeof it === "string") ? { address: it } : it)
        .filter(it => it && String(it.address || "").trim())
        .map(it => ({ address: String(it.address).trim(), lat: it.lat, lon: it.lon }));
      if (!clean.length) return { added: 0, skipped: 0 };

      // Дедуп: и внутри самой пачки, и против уже стоящих в списке строк.
      // 2ГИС отдаёт разные точки с одинаковым адресом (несколько входов в одном
      // здании), файлы клиентов тоже приходят с повторами — без этого один адрес
      // оказывался в списке по два-три раза и столько же раз геокодировался.
      const seen = new Set();
      document.querySelectorAll("#addr-list .planner-addr-input").forEach(i => {
        const k = normalizeKey(i.value || "");
        if (k) seen.add(k);
      });
      const before = clean.length;
      clean = clean.filter(it => {
        const k = normalizeKey(it.address);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const skipped = before - clean.length;
      if (!clean.length) return { added: 0, skipped };

      // Убираем пустые строки, чтобы список не начинался с болтающегося поля
      document.querySelectorAll(".planner-addr-input").forEach(i => {
        if (!i.value.trim()) i.closest(".addr-row")?.remove();
      });
      clean.forEach(it => addAddressRow(it.address,
        (Number.isFinite(it.lat) && Number.isFinite(it.lon)) ? { lat: it.lat, lon: it.lon } : null,
        { defer: true }));
      if (clean.length > ADDR_COLLAPSE_LIMIT) addrCollapsed = true;
      updateAddrToggle();
      recountAll(false);
      return { added: clean.length, skipped };
    }

    el("addr-list-toggle")?.addEventListener("click", () => {
      addrCollapsed = !addrCollapsed;
      updateAddrToggle();
    });

    // Пустое поле на старте не ставим: три кнопки объясняют выбор лучше,
    // а поле появится по «Добавить адрес». Если адреса уже есть в черновике,
    // их отрисует восстановление состояния.
    // Пустую строку на старте не создаём — поле появится по кнопке ниже.

    // Список адресов пересобирается этой функцией с нуля, поэтому снаружи
    // (restoreBriefToUI) его не заполнить — отдаём точку входа.
    window.PLANNER = window.PLANNER || {};
    window.PLANNER.setAddresses = (list) => bulkAddAddresses(Array.isArray(list) ? list : []).added;

    // Смена радиуса не требует повторного геокодирования — только пересчёта.
    el("planner-radius")?.addEventListener("input", () => recountAll(true));
    // Массовое добавление (импорт, 2ГИС) считает счётчики один раз в конце, а не
    // по строке на каждую добавленную: строк может быть несколько сотен.
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

      // Центр поиска — по одному на регион. Один общий центроид на несколько
      // регионов попадал бы в чистое поле между городами, и круг радиусом 40 км
      // не накрывал бы ни один из них.
      const centers = geo2gisCenters();
      if (!centers.length) {
        if (status) { status.textContent = "Инвентарь ещё загружается."; status.style.color = "#dc2626"; }
        return;
      }

      btn.disabled = true;
      const btnText = btn.textContent;
      btn.textContent = "Ищу…";
      if (status) { status.style.color = "#667085"; status.textContent = "Загружаю объекты 2ГИС…"; }

      try {
        const full = !!el("addr-2gis-full")?.checked;
        const limit = Number(el("addr-2gis-limit")?.value || 0);
        const res = await fetch2gisAddresses(brand, centers, { full, limit }, (n, stage) => {
          if (status) status.textContent = `2ГИС, ${stage}: найдено ${n}`;
        });
        if (res.error) {
          if (status) { status.textContent = "Ошибка: " + res.error; status.style.color = "#dc2626"; }
        } else if (!res.results.length) {
          if (status) { status.textContent = `2ГИС не нашёл «${brand}» в этих регионах.`; status.style.color = "#dc2626"; }
        } else {
          const { added, skipped } = bulkAddAddresses(res.results);
          const notes = [];
          if (res.capped && !res.unlimited) notes.push(`остановились на лимите ${res.limit} на регион`);
          if (res.capped && res.unlimited) notes.push("дошли до предохранителя в 5000");
          if (skipped) notes.push(`${skipped} дублей отброшено`);
          if (res.withoutAddress) notes.push(`${res.withoutAddress} объектов без адреса пропущено`);
          if (res.failedText) notes.push("не дочитано: " +
            (res.failedRegions.length ? res.failedRegions.join(", ") : "часть регионов"));
          if (status) {
            status.textContent = `Добавлено адресов: ${added}` + (notes.length ? ` (${notes.join(", ")})` : "");
            status.style.color = "#1DB244";
          }
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

        // Парсеры грузятся по требованию: на старте виджета их нет.
        const _need = name.endsWith(".csv") ? "papaparse"
                    : (name.endsWith(".xlsx") || name.endsWith(".xls")) ? "xlsx"
                    : null;
        if (_need) {
          if (status) status.textContent = "Загружаю парсер файла…";
          if (!(await ensureLib(_need))) {
            if (status) status.textContent = "Не удалось загрузить парсер файла — проверьте соединение";
            e.target.value = ""; return;
          }
          if (status) status.textContent = "Читаю файл…";
        }

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
        const { added, skipped } = bulkAddAddresses(lines);
        if (status) {
          status.textContent = added
            ? `Добавлено: ${added} адресов` + (skipped ? ` (${skipped} дублей отброшено)` : "")
            : (skipped ? `Все ${skipped} адресов уже в списке` : "Нет адресов в файле");
        }
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
      const { added, skipped } = bulkAddAddresses(lines);
      const status = el("addr-import-status");
      if (status) {
        status.textContent = added
          ? `Добавлено: ${added}` + (skipped ? ` (${skipped} дублей отброшено)` : "")
          : (skipped ? `Все ${skipped} адресов уже в списке` : "Нет адресов");
      }
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

// Ключ группировки для GID-режима. Города экранов приходят как есть, поэтому
// «городской округ Екатеринбург» и «Екатеринбург» были разными строками, а
// подмосковные города не сворачивались в область. Гоняем через тот же
// справочник, что и обычный сценарий, — тогда сводки двух сценариев
// сопоставимы. Не нашли — оставляем как пришло, лучше отдельная строка,
// чем экран, потерянный в «Не назначено».
// Технический аккаунт: у настоящих операторов в поле владельца стоит
// название, а не адрес почты. На момент правки такой в инвентаре ровно один
// — test@maergroup.ru, он дублирует инвентарь MAER на 355 экранах. Из 389
// спорных GID-ов 264 были выбором между MAER и его же тестовой копией;
// правило по «собаке» убирает этот шум и переживёт появление новых тестовых
// аккаунтов, не задевая живых операторов.
function isTechnicalOwner(s) {
  return String(s?.owner ?? "").includes("@");
}

// GID-ы, у которых есть хотя бы один экран настоящего оператора. Для них
// технические варианты можно смело игнорировать. Если же GID существует
// только у технического аккаунта, экран остаётся — иначе он просто исчезнет
// из расчёта, а это хуже, чем взять что есть.
function gidsWithRealOwner(gidSet) {
  const out = new Set();
  if (!gidSet || !gidSet.size) return out;
  const all = (Array.isArray(state.screensAll) && state.screensAll.length)
    ? state.screensAll : (Array.isArray(state.screens) ? state.screens : []);
  for (const s of all) {
    const sid = _screenIdOf(s);
    if (sid && gidSet.has(sid) && !isTechnicalOwner(s)) out.add(sid);
  }
  return out;
}

// Различает экраны с одним и тем же GID. Идентичность объекта не годится:
// инвентарь перезагружается, а решение пользователя должно переживать это
// и попадать в черновик. Поэтому составной ключ из полей, которые у дублей
// как раз и различаются.
function gidVariantKey(s) {
  return [
    _screenIdOf(s),
    String(s?.owner ?? "").trim(),
    String(s?.format ?? "").trim(),
    String(s?.city ?? "").trim(),
    Number.isFinite(s?.lat) ? s.lat.toFixed(5) : "",
    Number.isFinite(s?.lon) ? s.lon.toFixed(5) : "",
  ].join("|");
}

// GID-ы из списка, под которые в инвентаре подходит больше одного экрана.
// Возвращает [{ gid, variants: [screen, ...] }] — по одной записи на GID.
function findAmbiguousGids(gidSet) {
  if (!gidSet || !gidSet.size) return [];
  const all = (Array.isArray(state.screensAll) && state.screensAll.length)
    ? state.screensAll : (Array.isArray(state.screens) ? state.screens : []);
  const поGid = new Map();
  for (const s of all) {
    const sid = _screenIdOf(s);
    if (!sid || !gidSet.has(sid)) continue;
    if (!поGid.has(sid)) поGid.set(sid, []);
    поGid.get(sid).push(s);
  }
  const реальные = gidsWithRealOwner(gidSet);
  const out = [];
  for (const [gid, variants] of поGid) {
    // Технические копии из выбора убираем: между настоящим оператором и его
    // тестовым аккаунтом выбирать нечего. Оставляем их только если больше
    // ничего нет.
    const живые = реальные.has(gid) ? variants.filter(v => !isTechnicalOwner(v)) : variants;
    // Полные близнецы (все поля ключа совпали) выбора не требуют: какой из
    // них взять — без разницы, отличить их всё равно нечем.
    const уникальные = new Map();
    for (const v of живые) uniqueSet(уникальные, gidVariantKey(v), v);
    if (уникальные.size > 1) out.push({ gid, variants: [...уникальные.values()] });
  }
  return out.sort((a, b) => a.gid.localeCompare(b.gid, "ru"));
}
function uniqueSet(map, key, value) { if (!map.has(key)) map.set(key, value); }

// Спорные GID-ы, по которым выбор ещё не сделан.
function unresolvedGids(gidSet) {
  const picks = state.gidPicks || {};
  return findAmbiguousGids(gidSet).filter(x => !picks[x.gid]);
}

function gidRegionKey(screen) {
  const raw = String(screen?.city || screen?.region || "").trim();
  if (!raw) return "\u2014";
  const reg = getRegionForDspCity(raw);
  return (reg && reg !== "Не назначено") ? reg : raw;
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

  // «Добавлено: N» — итог последнего импорта. Любая правка набора делает его
  // неверным, а висел он до перезагрузки страницы. Импорт ставит подпись уже
  // после этого вызова, так что свой собственный итог не стирается.
  const importStatus = el("region-import-status");
  if (importStatus) { importStatus.textContent = ""; importStatus.style.display = "none"; }

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
    duration: { ms: Number.isFinite(state.selectedDurationMs) ? state.selectedDurationMs : null, msList: Array.isArray(state.selectedDurationsMs) ? [...state.selectedDurationsMs] : [], byFormat: { ...(state.durationsByFormat || {}) } },
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

// Форматы, по числу которых регион относят к тиру (правило из tiers_v1.json).
// Форматы, по числу которых регион получает тир: билборды, суперсайты,
// сити-борды и ситиформаты. Считаются только они — «популярный» инвентарь
// показывает, насколько в городе есть куда разложить размещение. ПВЗ и Indoor
// в счёт не идут: их много там, где наружки нет вовсе.
const TIER_COUNT_FORMATS = new Set(["BILLBOARD", "SUPERSITE", "CITY_BOARD", "CITY_FORMAT"]);

// ===== МОДЕЛЬ БЮДЖЕТНЫХ ТИРОВ =====
// Максимум = 100% ёмкости отобранной адресной программы (30 вых/час, 8 для
// медиафасадов — CAPACITY_PPH_*), по выбранной пользователем ставке.
// Оптимум и минимум — доли от этого максимума, зависят от тира города.
// Пороги заданы по живому инвентарю на 23.08.2026 (13 249 популярных экранов
// в 336 городах): A — только Москва и Питер, B — Екб/НН/Ростов/Омск,
// C — 15 крупных региональных, D — всё остальное.
// Держим числа одним блоком: менять их будут чаще, чем остальной код.
const TIER_THRESHOLDS = { A: 1000, B: 300, C: 100 };   // >= порога → этот тир, иначе D
const TIER_SHARE = {
  M: { opt: 0.10, min: 0.015 },  // Москва и МО — экраны дороже, доля меньше
  A: { opt: 0.20, min: 0.05 },
  B: { opt: 0.40, min: 0.10 },
  C: { opt: 0.50, min: 0.25 },
  D: { opt: 0.67, min: 0.33 },
};

// Названия городов в инвентаре приходят в нескольких формах: «Сочи» и
// «городской округ Сочи», «Волгоград» и «город-герой Волгоград». Для счёта
// тира их надо считать одним городом, иначе половина щитов теряется и город
// проваливается в младший тир.
const CITY_PREFIX_RE = /^(городской округ|городское поселение|муниципальный округ|сельское поселение|городской|город-герой|поселение|посёлок городского типа|рабочий посёлок|посёлок|поселок|город|пгт|село|деревня|станица|зато|район)\s+/i;
const CITY_SUFFIX_RE = /\s+(городской округ|муниципальный округ|городское поселение|сельское поселение|поселение|сельсовет|поссовет|район|округ)$/i;

// Срезаем только служебные приставки, окончания не трогаем: «Первомайский»,
// «Первомайское» и «Первомайск» — разные места, и стемминг слепил бы их вместе.
function normalizeCityName(name) {
  let x = String(name || "").trim().toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
  let prev;
  do { prev = x; x = x.replace(CITY_PREFIX_RE, "").replace(CITY_SUFFIX_RE, ""); } while (x !== prev);
  return x.trim();
}

const REGION_UNSET_RE = /^не назначено$/i;

// Ключ для склейки дублей. Сливаем только внутри одного региона: одинаковые
// названия в разных областях — разные города. В «Не назначено» не сливаем
// вовсе: там семь разных «Первомайских», и объединять их наугад нельзя.
function cityMergeKey(screen) {
  const city = String(screen?.city || "").trim();
  const region = String(screen?.region || "").trim();
  if (!city) return "";
  return REGION_UNSET_RE.test(region)
    ? "RAW|" + city.toLowerCase()
    : normalizeCityName(region) + "|" + normalizeCityName(city);
}

// Порог тира по количеству популярных экранов в регионе (см. TIER_THRESHOLDS).
function tierFromBillboardCount(n) {
  if (n >= TIER_THRESHOLDS.A) return "A";
  if (n >= TIER_THRESHOLDS.B) return "B";
  if (n >= TIER_THRESHOLDS.C) return "C";
  return "D";
}

// Москва и область считаются одним рынком, но только когда они в одном плане:
// цены и конкуренция там общие. Отдельная кампания по одному Щёлкову — это
// не московский рынок, и ронять ей рекомендацию в шесть раз незачем.
const MOSCOW_OBLAST_RE = /^московская область$/i;

function planIncludesMoscow() {
  const regions = Array.isArray(state?.selectedRegions) ? state.selectedRegions : [];
  return regions.some(r => normalizeCityName(typeof r === "string" ? r : (r?.city || r?.region || "")) === "москва");
}

function isMoscowMarket(regionKey, regionScreens) {
  const key = normalizeCityName(regionKey);
  if (key === "москва") return true;
  if (!planIncludesMoscow()) return false;
  if (MOSCOW_OBLAST_RE.test(String(regionKey || "").trim())) return true;
  // регион экрана надёжнее названия: «Химки» сами по себе не говорят, что это МО
  return Array.isArray(regionScreens) && regionScreens.length > 0 &&
    regionScreens.every(s => MOSCOW_OBLAST_RE.test(String(s?.region || "").trim()));
}

// Тир региона. По возможности считается по живому инвентарю DSP, который уже
// загружен на странице; статический tiers_v1.json остаётся только запасным
// вариантом. Раньше тир брался исключительно из этого файла — снимка от
// 06.01.2026, собранного из давно удалённого inventories_sync.csv, — и любой
// регион, которого в нём нет (а там 80 из 751 города), молча получал тир C.
//
// regionScreens — все экраны региона до фильтров; если не переданы, работает
// прежняя логика по файлу.
function getTierForGeo(name, regionScreens) {
  const key = String(name || "").trim();
  const fromFile = window.PLANNER?.tiers?.[key];

  // Москва и — когда она в плане — Подмосковье идут по отдельному тиру M.
  // Спецтир SP из справочника больше не нужен: при пороге 1000 Питер и так
  // единственный, кто попадает в A вместе с Москвой.
  if (isMoscowMarket(key, regionScreens)) return "M";

  if (Array.isArray(regionScreens) && regionScreens.length) {
    // «Химки» и «городской округ Химки» — один город, но в выборку попадает
    // только выбранное написание. Поэтому берём ключи слияния выбранных
    // экранов и досчитываем по всему инвентарю всё, что схлопывается в те же
    // ключи, — иначе половина щитов теряется и город проваливается в D.
    const keys = new Set();
    for (const s of regionScreens) {
      const k = cityMergeKey(s);
      if (k) keys.add(k);
    }
    const all = Array.isArray(state.screensAll) && state.screensAll.length
      ? state.screensAll : regionScreens;
    let n = 0;
    for (const s of all) {
      if (!TIER_COUNT_FORMATS.has(String(s.format || "").trim())) continue;
      if (keys.has(cityMergeKey(s))) n++;
    }
    return tierFromBillboardCount(n);
  }

  const valid = (fromFile === "A" || fromFile === "B" || fromFile === "C" || fromFile === "D");
  return valid ? fromFile : "C";
}

// Откуда взялись тиры в последнем расчёте рекомендации — для подписи под
// кнопками бюджета, чтобы источник цифр был виден, а не подразумевался.
function getTiersSourceLabel() {
  const live = (Array.isArray(state.screensAll) && state.screensAll.length > 0);
  if (live) return "по живому инвентарю DSP";
  const gen = window.PLANNER?.tiersMeta?.generated_at;
  if (!gen) return "по справочнику регионов";
  const d = String(gen).slice(0, 10).split("-");
  return d.length === 3 ? `по справочнику от ${d[2]}.${d[1]}.${d[0]}` : "по справочнику регионов";
}
window.PLANNER.getTiersSourceLabel = getTiersSourceLabel;

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

// Экраны, от которых пользователь уже ушёл заменой. Предлагать их обратно
// нельзя: без этого повторный клик «Заменить» возвращает к тому, от чего
// только что ушли — ближайший кандидат к новому экрану это, как правило,
// старый. Живёт до следующего расчёта.
const _replacedAway = new Set();
window.addEventListener("planner:calc-done", () => _replacedAway.clear());

// Родство форматов: ступень размера и среда. Замена «на похожий» ходит
// только на соседнюю ступень внутри своей среды — ситиформат меняется на
// ситиборд, но не на суперсайт. Таблица одна, правится в одном месте.
const FORMAT_KIN = {
  MEDIAFACADE:      { size: 0, env: "outdoor" },
  SUPERSITE:        { size: 1, env: "outdoor" },
  BILLBOARD:        { size: 2, env: "outdoor" },
  CITY_BOARD:       { size: 3, env: "outdoor" },
  CITY_FORMAT:      { size: 4, env: "outdoor" },
  CITY_FORMAT_RC:   { size: 4, env: "transit" },
  CITY_FORMAT_RD:   { size: 4, env: "transit" },
  CITY_FORMAT_WD:   { size: 4, env: "transit" },
  RW_PLATFORM:      { size: 4, env: "transit" },
  METRO_SCREEN_3X1: { size: 5, env: "transit" },
  METRO_LIGHTBOX:   { size: 5, env: "transit" },
  PVZ_SCREEN:       { size: 6, env: "indoor"  },
  SKY_DIGITAL:      { size: 6, env: "indoor"  },
  OTHER:            { size: 6, env: "indoor"  },
};

function _fmtKey(v) { return String(v || "").trim().toUpperCase(); }

// Форматы, на которые можно заменить экран этого формата: свой и соседний
// по размеру в своей среде. Формат, которого в таблице нет, родни не имеет —
// меняем только на такой же, чтобы не подставить наугад что попало.
function kinFormats(format) {
  const f = _fmtKey(format);
  const own = FORMAT_KIN[f];
  if (!own) return f ? [f] : [];
  return Object.keys(FORMAT_KIN).filter(name => {
    const k = FORMAT_KIN[name];
    return k.env === own.env && Math.abs(k.size - own.size) <= 1;
  });
}
window.PLANNER = window.PLANNER || {};
window.PLANNER.kinFormats = kinFormats;

// Вторая сторона той же конструкции: то же место, только с другой стороны.
// Клиенту от такой замены ни холодно ни жарко — точка та же, поэтому в
// кандидаты она не идёт. Адрес сверяем нормализованным, а на случай
// расхождений в тексте — ещё и расстоянием: 30 м это одна опора, а не
// соседняя.
const SAME_SPOT_M = 30;

// Радиус поиска замены расширяется кольцами по километру: в первом
// километре ищем свой формат, потом соседнюю ступень; не нашли — до двух
// километров, и там снова сначала свой формат. И так далее.
const REPLACE_RING_M = 1000;

function _addrKey(s) {
  return String(s?.address || "").toLowerCase().replace(/ё/g, "е")
    .replace(/[^0-9a-zа-я]+/g, " ").trim();
}

function isOtherSideOf(cand, old) {
  const a = normalizeSide(cand?.side), b = normalizeSide(old?.side);
  if (!a || !b || a === b) return false;
  const ka = _addrKey(cand), kb = _addrKey(old);
  if (ka && kb && ka === kb) return true;
  const la = getLatLon(cand), lb = getLatLon(old);
  const dist = window.GeoUtils?.haversineMeters;
  if (!la || !lb || !dist) return false;
  return dist(la.lat, la.lon, lb.lat, lb.lon) <= SAME_SPOT_M;
}
window.PLANNER.isOtherSideOf = isOtherSideOf;

function _filterSet(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const out = new Set(list.map(v => String(v ?? "").trim()).filter(Boolean));
  return out.size ? out : null;
}

// Кандидаты на замену экрана — «любой похожий», по возрастанию расстояния.
// Похожий значит: тот же регион, свой формат (а своих нет — соседняя ступень
// размера в своей среде) и не вторая сторона той же конструкции.
//
// opts (всё необязательно) только СУЖАЕТ этот набор:
//   owners    — только эти операторы
//   formats   — только эти форматы, и лишь из числа родственных
//   durations — экран должен крутить КАЖДУЮ из этих длительностей (мс)
// Исключение — gids: это не фильтр, а выбор конкретного экрана, и он
// главнее всех правил похожести.
function replacementCandidates(screenId, opts) {
  const chosen = state.lastChosen;
  if (!chosen || !chosen.length) return [];
  const idx = chosen.findIndex(s => _screenIdOf(s) === String(screenId));
  if (idx < 0) return [];
  const old = chosen[idx];

  const flt = opts || {};
  const owners  = _filterSet(flt.owners);
  const formats = _filterSet(flt.formats);
  const gids    = _filterSet(flt.gids);
  const durs = Array.isArray(flt.durations)
    ? flt.durations.map(Number).filter(v => Number.isFinite(v) && v > 0) : [];

  const allScreens = state.screensAll || [];
  const chosenIds = new Set(chosen.map(s => _screenIdOf(s)));

  // Названный GID — прямое указание, а не фильтр: он перебивает и похожесть,
  // и вторую сторону, и прежние отказы. Нельзя только одного — взять экран,
  // который в программе уже стоит: получится дубль.
  if (gids) {
    return allScreens.filter(s => {
      const sid = _screenIdOf(s);
      return sid && gids.has(sid) && !chosenIds.has(sid);
    });
  }

  const excluded = state.manuallyExcluded || new Set();
  const oldLoc = getLatLon(old);
  const dist = window.GeoUtils?.haversineMeters;
  const метры = (s) => {
    const l = getLatLon(s);
    if (!oldLoc || !l) return Infinity;
    return dist ? dist(oldLoc.lat, oldLoc.lon, l.lat, l.lon)
                : Math.hypot(oldLoc.lat - l.lat, oldLoc.lon - l.lon) * 111000;
  };

  const годен = (s) => {
    const sid = _screenIdOf(s);
    if (!sid || chosenIds.has(sid)) return false;
    // Убранный вручную экран не должен возвращаться заменой соседа —
    // это ровно тот экран, который пользователь уже отверг.
    if (excluded.has(sid) || _replacedAway.has(sid)) return false;
    if (s.region && old.region && s.region !== old.region) return false;
    if (!getLatLon(s)) return false;
    // Вторая сторона той же конструкции — то же место: менять незачем.
    return !isOtherSideOf(s, old);
  };
  const подФильтр = (s) => {
    if (owners && !owners.has(String(s.owner || "").trim())) return false;
    // Длительность нужна ровно такая: _resolveDurationMatch берёт ближайший
    // слот и подошёл бы любой экран, а «доступная длительность» — про то,
    // что экран эту длительность правда крутит.
    if (durs.length) {
      const слоты = Array.isArray(s.durationBidInfo) ? s.durationBidInfo : [];
      if (!durs.every(ms => слоты.some(d => d.duration === ms))) return false;
    }
    return true;
  };

  // Фильтр форматов пересекаем с родственными, а не заменяем ими: поп-ап
  // сужает поиск и не должен уводить щит в ситиформат.
  const own = _fmtKey(old.format);
  let разрешено = kinFormats(old.format);
  if (formats) {
    const хотят = new Set([...formats].map(_fmtKey));
    разрешено = разрешено.filter(f => хотят.has(f));
  }

  if (!разрешено.length) return [];
  const набор = new Set(разрешено);

  // Очередь кандидата: номер километрового кольца, а внутри кольца свой
  // формат раньше соседней ступени. Получается ровно тот порядок, который
  // нужен: в километре сначала ситиформаты, потом ситиборды; не нашли —
  // второй километр, и там снова сначала ситиформаты. Ситиборд в ста метрах
  // обходит ситиформат за тридцать километров, а внутри одного кольца формат
  // всё ещё главнее близости.
  const очередь = (d) => {
    // Расстояние неизвестно (у заменяемого экрана нет координат) — считаем
    // всех одним кольцом, чтобы работало хотя бы предпочтение по формату.
    const кольцо = Number.isFinite(d) ? Math.max(1, Math.ceil(d / REPLACE_RING_M)) : 1;
    return кольцо * 2;
  };

  return allScreens
    .filter(s => набор.has(_fmtKey(s.format)) && годен(s) && подФильтр(s))
    .map(s => {
      const d = метры(s);
      return { s, d, t: очередь(d) + (_fmtKey(s.format) === own ? 0 : 1) };
    })
    .sort((a, b) => (a.t - b.t) || (a.d - b.d))
    .map(x => x.s);
}

// Из чего вообще можно выбирать замену для набора экранов: операторы,
// форматы и длительности их регионов. Один проход по инвентарю — при
// массовой замене список строится для сотни экранов сразу.
function replacementOptions(screenIds) {
  const ids = new Set((Array.isArray(screenIds) ? screenIds : [screenIds]).map(String));
  const chosen = Array.isArray(state.lastChosen) ? state.lastChosen : [];
  const выбранные = chosen.filter(s => ids.has(_screenIdOf(s)));
  const регионы = new Set(выбранные.map(s => s.region).filter(Boolean));
  const свои = new Set(выбранные.map(s => _fmtKey(s.format)).filter(Boolean));

  // Предлагаем только то, на что замена вообще может пойти: родственные
  // форматы, а операторы и длительности — по экранам этих форматов. Иначе
  // поп-ап показывал бы оператора, у которого подходящих экранов нет вовсе.
  const родня = new Set();
  for (const f of свои) for (const k of kinFormats(f)) родня.add(k);

  const owners = new Set(), formats = new Set(), durations = new Set();
  for (const s of (state.screensAll || [])) {
    if (регионы.size && s.region && !регионы.has(s.region)) continue;
    const f = _fmtKey(s.format);
    if (!f || (родня.size && !родня.has(f))) continue;
    formats.add(f);
    const o = String(s.owner || "").trim(); if (o) owners.add(o);
    if (Array.isArray(s.durationBidInfo)) {
      for (const d of s.durationBidInfo) {
        if (Number.isFinite(d.duration) && d.duration > 0) durations.add(d.duration);
      }
    }
  }
  return {
    owners:    [...owners].sort((a, b) => a.localeCompare(b, "ru")),
    formats:   [...formats].sort((a, b) => a.localeCompare(b, "ru")),
    durations: [...durations].sort((a, b) => a - b),
    ownFormats: [...свои],
  };
}

// Replace a chosen screen with nearest similar one from the pool
function replaceScreen(screenId, opts) {
  const chosen = state.lastChosen;
  if (!chosen || !chosen.length) return null;

  const idx = chosen.findIndex(s => _screenIdOf(s) === String(screenId));
  if (idx < 0) return null;

  const old = chosen[idx];
  const candidates = replacementCandidates(screenId, opts);
  if (!candidates.length) return null;

  const replacement = candidates[0];
  chosen.splice(idx, 1, replacement);
  _replacedAway.add(_screenIdOf(old));

  // Замена вручную — единственный законный способ пополнить замороженную
  // программу: иначе следующий пересчёт выкинет подставленный экран.
  if (state.apFrozenIds) {
    state.apFrozenIds.delete(_screenIdOf(old));
    state.apFrozenIds.add(_screenIdOf(replacement));
  }

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

// ===== ЗАМОРОЗКА АДРЕСНОЙ ПРОГРАММЫ =====
// После расчёта состав экранов зафиксирован. Иначе смена уровня бюджета
// пересобирала бы программу с нуля: цель уезжала быстрее, чем до неё
// доходишь (максимум считается по ёмкости отобранной АП, а АП растёт
// вместе с бюджетом), да и просто подменять экраны под пользователем нельзя.
function freezeAp() {
  // Уже зафиксирована — не перезаписываем. Пересчёт на минимуме отбирает
  // меньше экранов, и повторная заморозка по его результату сделала бы
  // сжатие необратимым: обратно к максимуму было бы уже не из чего собирать.
  if (isApFrozen()) return true;
  const chosen = Array.isArray(state.lastChosen) ? state.lastChosen : [];
  const ids = chosen.map(_screenIdOf).filter(Boolean);
  if (!ids.length) return false;
  state.apFrozenIds = new Set(ids);
  return true;
}

function unfreezeAp() {
  state.apFrozenIds = null;
}

function isApFrozen() {
  return !!(state.apFrozenIds && state.apFrozenIds.size);
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
async function downloadXLSX(rows) {
  if (!rows || !rows.length) return;

  const XLSX = await ensureLib("xlsx");
  if (!XLSX) { alert("Не удалось загрузить библиотеку выгрузки. Проверьте соединение и попробуйте ещё раз."); return; }

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
  if (!calc) { toast("Сначала нажмите «Рассчитать»."); return null; }

  const ExcelJS = await ensureLib("exceljs");
  if (!ExcelJS) { alert("Не удалось загрузить библиотеку выгрузки. Проверьте соединение и попробуйте ещё раз."); return null; }

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
  // Когда часы одинаковы во все дни вещания, ставим именно их, а не avgHpd:
  // тот делит часы на календарные дни, и «будни по 10 ч» за октябрь выходили
  // как 7,42 — число, которого нет ни в одном дне графика.
  const hpdShown = hpdIsRange ? null : (hpdMin > 0 ? hpdMin : hpd);
  const hpdValue = hpdIsRange ? `${hpdMin}–${hpdMax}` : hpdShown;
  // Дни вещания, а не календарные: при графике «только будни» в плане стояло
  // 31, хотя ролик выходит 23 дня. Суммарные часы от этого не меняются, так что
  // выходы, OTS и бюджет остаются те же.
  const daysShown = (_schedHours && _schedHours.activeDays > 0)
    ? _schedHours.activeDays : days;
  // Часы за весь период — на них делит частота. Делить на «График, ч/сутки»
  // нельзя: при расписании «10 ч в будни, 5 в выходные» там лежит диапазон
  // «5–10», то есть строка. А общее число часов однозначно при любом графике,
  // и клиент, поправив период или расписание в файле, увидит пересчёт частоты.
  const hoursTotalShown = (_schedHours && _schedHours.totalHours > 0)
    ? _round2(_schedHours.totalHours) : _round2(days * hpd);

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

  // Буква колонки по номеру (1 → A, 27 → AA). Нужна для сборки формул.
  function colLetter(n) {
    let s = "";
    while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; }
    return s;
  }
  // Ячейка-формула. result — посчитанное нами значение: без него Excel покажет
  // число только после пересчёта, а любой просмотрщик — пустоту.
  function fx(formula, result) {
    return { formula, result: (Number.isFinite(result) ? result : null) };
  }

  // Формат «до двух знаков, но без хвоста у целых».
  // Маска 0.## в Excel рисует десятичный разделитель ВСЕГДА, даже когда дробной
  // части нет: 34 показывается как «34,». Условного формата «прятать запятую у
  // целых» в Excel нет, поэтому выбираем маску по самому числу.
  function decFmt(v) {
    return Number.isFinite(v) && !Number.isInteger(v) ? "#,##0.##" : "#,##0";
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
    if (_isGidMode) return gidRegionKey(s);
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
    const u = String(fmt_ || "").toUpperCase();
    if (u === "MEDIAFACADE" || u === "MF")                                return "MF";
    if (u === "BILLBOARD"   || u === "BB")                                return "BB";
    if (u === "SUPERSITE"   || u === "SS")                                return "SS";
    if (u === "CITY_BOARD"  || u === "CITYBOARD" || u === "CB")           return "CB";
    if (u === "CITY_FORMAT" || u === "CITYFORMAT" || u === "CF")          return "CF";
    if (u === "PVZ_SCREEN"  || u === "PVZ")                               return "PVZ";
    return fmt_; // keep original name for everything else
  }

  // Порядок форматов в медиаплане — от меньшей поверхности к большей:
  // сначала индор (OTHER, PVZ), затем аутдор от сити-формата к медиафасаду.
  // Раньше колонки шли в порядке, в котором форматы попались в выборке, поэтому
  // в соседних городах одного плана они стояли по-разному.
  const FMT_ORDER = ["OTHER", "PVZ", "CF", "CB", "BB", "SS", "MF"];
  function fmtRank(fmt_) {
    const i = FMT_ORDER.indexOf(fmtLabel(fmt_));
    return i < 0 ? FMT_ORDER.length : i;   // неизвестные — в конец
  }
  function sortFormats(list) {
    return [...list].sort((a, b) => {
      const d = fmtRank(a) - fmtRank(b);
      return d !== 0 ? d : String(a).localeCompare(String(b), "ru");
    });
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
  // Длительность дописываем к строке "Формат" (а не отдельной строкой), чтобы
  // шапка не разрасталась. Нумерация строк ниже считается от metaRows.length,
  // так что сама по себе лишняя строка шапки ничего не сломает.
  // Длительностей может быть несколько — перечисляем все, иначе в плане
  // окажется одна цифра, а посчитано будет по нескольким роликам.
  const durList = (Array.isArray(brief.duration?.msList) && brief.duration.msList.length)
    ? brief.duration.msList
    : (Number(brief.duration?.ms) > 0 ? [Number(brief.duration.ms)] : []);
  // Длительность, заданная отдельному формату, главнее общего выбора.
  const durByFormat = (brief.duration && brief.duration.byFormat) || {};
  const _durSec = [...new Set(durList.map(Number).filter(ms => ms > 0))]
    .sort((a, b) => a - b).map(ms => Math.round(ms / 1000));
  const durTxt = _durSec.length
    ? ` (длительность: ${_durSec.join(", ")} сек)`
    : (durList.length ? " (длительность: любая)" : "");
  const fmtLabelWithDuration = (sortFormats(allFmts).join(", ") || "—") + durTxt;
  const metaRows = [
    ["Период размещения",  periodStr],
    ["Город",              cities.join(", ") || "—"],
    ["Адресная программа", screens.length],
    ["Формат",             fmtLabelWithDuration],
    ["Количество дней",    daysShown],
    ["Часов вещания за период", hoursTotalShown],
  ];
  // Номер строки берём из таблицы: на него ссылается формула частоты, и
  // вписанное число разъехалось бы при первой же перестановке шапки.
  const hoursRowNum = metaRows.findIndex(x => x[0] === "Часов вещания за период") + 1;
  // Между шапкой и сводом по городам — пустая строка: без неё заголовки
  // таблицы упираются в последнюю строку шапки и читаются как её часть.
  const HDR_ROW = metaRows.length + 2;
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
  ws.getRow(HDR_ROW).height = 30;
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
  hdr7.forEach((h, i) => {
    // Пустой заголовок — это выключенные комиссия/НДС. Раньше sc() всё равно
    // красил такую ячейку заливкой и рамкой, и в выгрузке оставался пустой
    // синий прямоугольник справа от «Прогноза бюджета», который приходилось
    // удалять руками. Теперь просто пропускаем.
    if (!h) { ws.getCell(HDR_ROW, i + 1).border = NO_B; return; }
    sc(ws, HDR_ROW, i + 1, h, { bold: true, fill: C_HDR, h: "center", v: "center", wrap: true });
  });

  // ── Layout: block positions (one block per city) ────────────────
  const SUMMARY_START = HDR_ROW + 1;
  const nCities  = cities.length;
  const totalRow = SUMMARY_START + nCities;
  // 9 строк: девятая — частота выходов. Сноска про OTS и разрывы считаются от
  // этого числа, поэтому менять его достаточно в одном месте.
  const BLOCK_ROWS = 9, BLOCK_GAP = 2;

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
      // Ёмкость формата — сумма фактических частот его экранов. По ней делятся
      // выходы: медиафасад крутит 8 раз в час против 40 у щита, и делёж по
      // числу экранов печатал в плане одинаковую частоту для обоих.
      const capW = fmtScr.reduce((a, sc_) =>
        a + (Number.isFinite(sc_._pphUsed) && sc_._pphUsed > 0
          ? sc_._pphUsed : getScreenPphCap(sc_)), 0);
      cfStats[city][fmt_] = {
        cnt: fmtScr.length, avgBid, avgOts, _w: w, _cap: capW,
        plays: 0,   // заполняется вторым проходом
        ots:   0,
        budget: 0,
      };
    }

    // Второй проход: делим деньги по ставкам, из них получаем выходы, из выходов — OTS.
    // Именно в таком порядке: бюджет ÷ ставка = выходы, выходы × OTS экрана = OTS.
    // Раньше выходы и OTS делились по числу экранов, а бюджет — по ставкам, из-за
    // чего «выходы × ставка» в выгрузке не давало бюджет и формулы было не поставить.
    const fmtKeys = Object.keys(cfStats[city]);
    const bidWeightSum = fmtKeys.reduce((s, f) => {
      const st = cfStats[city][f];
      return s + st.cnt * st.avgBid;
    }, 0);
    const capWeightSum = fmtKeys.reduce((s, f) => s + (cfStats[city][f]._cap || 0), 0);
    for (const f of fmtKeys) {
      const st = cfStats[city][f];
      if (capWeightSum > 0) {
        // Выходы — по ёмкости, деньги — из выходов и ставки формата. Сумма по
        // форматам сходится с бюджетом города: тот считается по той же
        // взвешенной по выходам ставке.
        st.plays  = regPlays * st._cap / capWeightSum;
        st.budget = st.plays * st.avgBid;
      } else if (bidWeightSum > 0 && st.avgBid > 0) {
        st.budget = regBudget * (st.cnt * st.avgBid) / bidWeightSum;
        st.plays  = st.budget / st.avgBid;
      } else {
        // Ни у одного формата нет ставки — делим поровну по экранам, как раньше.
        st.budget = regBudget * st._w;
        st.plays  = regPlays  * st._w;
      }
      // OTS формата = его выходы × средний OTS экрана этого формата. Если по
      // формату данных ВК/OTS нет (частый случай у мелких форматов), берём долю
      // городского OTS по числу экранов — иначе колонка молча схлопывается в 0.
      st.ots = (st.avgOts > 0) ? st.plays * st.avgOts : regOts * st._w;
    }
  }

  const r2 = v => Math.round((v || 0) * 100) / 100;

  // ── Итоги по городу — суммы его блока ───────────────────────────
  // Считаем заранее: и строка города, и «итого» ссылаются формулами именно на
  // блок, поэтому цифры в сводке обязаны быть суммами блока, а не отдельно
  // посчитанными значениями, которые могут с ним разъехаться.
  const citySums = {};
  for (const city of cities) {
    const st = cfStats[city] || {};
    const acc = { cnt: 0, plays: 0, ots: 0, budget: 0 };
    for (const v of Object.values(st)) {
      acc.cnt    += v.cnt    || 0;
      acc.plays  += v.plays  || 0;
      acc.ots    += v.ots    || 0;
      acc.budget += v.budget || 0;
    }
    citySums[city] = acc;
  }

  // Номера строк внутри блока города — на них ссылаются формулы сводки
  const BR = { fmts: 0, cnt: 1, rate: 2, ots: 3, hpd: 4, plays: 5, otsTot: 6, budget: 7 };

  // ── City summary rows (rows 8..8+n-1) ───────────────────────────
  for (const city of cities) {
    const r    = citySumRow[city];
    const base = blockStarts[city];
    const s    = citySums[city];
    sc(ws, r, 1, city, { bold: true, fill: C_LIGHT });
    sc(ws, r, 2, fx(`B${base + BR.plays}`,  s.plays),  { fill: C_LIGHT, numFmt: "#,##0" });
    sc(ws, r, 3, fx(`B${base + BR.otsTot}`, s.ots),    { fill: C_LIGHT, numFmt: "#,##0" });
    sc(ws, r, 4, fx(`B${base + BR.budget}`, r2(s.budget)), { fill: C_LIGHT, numFmt: '#,##0.00 "₽"' });
    const b = r2(s.budget);
    if (commOn && commRate > 0) {
      const wc = r2(b * (1 + commRate));
      sc(ws, r, 5, fx(`D${r}*${1 + commRate}`, wc), { fill: C_LIGHT, numFmt: '#,##0.00 "₽"' });
      if (vatOn) sc(ws, r, 6, fx(`E${r}*${1 + vatRate}`, r2(wc * (1 + vatRate))),
        { fill: C_LIGHT, numFmt: '#,##0.00 "₽"' });
      else ws.getCell(r, 6).border = NO_B;
    } else if (vatOn) {
      sc(ws, r, 5, fx(`D${r}*${1 + vatRate}`, r2(b * (1 + vatRate))),
        { fill: C_LIGHT, numFmt: '#,##0.00 "₽"' });
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
  const totP = cities.reduce((a, c) => a + citySums[c].plays,  0);
  const totO = cities.reduce((a, c) => a + citySums[c].ots,    0);
  const totB = r2(cities.reduce((a, c) => a + citySums[c].budget, 0));
  // Диапазон строк городов: если город один, SUM всё равно корректен.
  const sumRange = (col) => `SUM(${col}${SUMMARY_START}:${col}${totalRow - 1})`;
  sc(ws, totalRow, 1, "итого", { bold: true, fill: C_HDR, h: "right" });
  sc(ws, totalRow, 2, fx(sumRange("B"), totP), { bold: true, fill: C_HDR, numFmt: "#,##0" });
  sc(ws, totalRow, 3, fx(sumRange("C"), totO), { bold: true, fill: C_HDR, numFmt: "#,##0" });
  sc(ws, totalRow, 4, fx(sumRange("D"), totB), { bold: true, fill: C_HDR, numFmt: '#,##0.00 "₽"' });
  if (commOn && commRate > 0) {
    const twc = r2(totB * (1 + commRate));
    sc(ws, totalRow, 5, fx(sumRange("E"), twc), { bold: true, fill: C_HDR, numFmt: '#,##0.00 "₽"' });
    if (vatOn) sc(ws, totalRow, 6, fx(sumRange("F"), r2(twc * (1 + vatRate))),
      { bold: true, fill: C_HDR, numFmt: '#,##0.00 "₽"' });
    else ws.getCell(totalRow, 6).border = NO_B;
  } else if (vatOn) {
    sc(ws, totalRow, 5, fx(sumRange("E"), r2(totB * (1 + vatRate))),
      { bold: true, fill: C_HDR, numFmt: '#,##0.00 "₽"' });
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
    // Порядок колонок — от меньшего формата к большему, одинаковый во всех городах.
    const fmts      = sortFormats(Object.keys(rfMap[city] || {}));

    // Средневзвешенная ставка для колонки B. Средний OTS считается ниже —
    // по тем же числам, что реально попадут в ячейки строки.
    const wtAvgBid = regCnt > 0
      ? fmts.reduce((a, f) => a + (cfStats[city][f]?.avgBid || 0) * (cfStats[city][f]?.cnt || 0), 0) / regCnt
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

    // Суммы блока — они же кэшированные значения для формул-итогов.
    const s0 = citySums[city] || { cnt: 0, plays: 0, ots: 0, budget: 0 };
    // Диапазон колонок форматов — на нём строятся все формулы блока.
    const fCol1 = colLetter(5);
    const fColN = colLetter(5 + Math.max(0, fmts.length - 1));
    const rng   = (row) => `${fCol1}${row}:${fColN}${row}`;
    const rCnt  = base + BR.cnt, rRate = base + BR.rate, rOts = base + BR.ots;
    const rPlay = base + BR.plays;

    // ── base+1: Кол-во экранов ────────────────────────────────────
    sc(ws, base + 1, 1, "Кол-во экранов",   { bold: true, fill: C_LIGHT });
    sc(ws, base + 1, 2, fx(`SUM(${rng(rCnt)})`, regCnt), { fill: C_GREEN, numFmt: "#,##0" });
    fmts.forEach((fmt_, fi) => {
      sc(ws, base + 1, 5 + fi, cfStats[city][fmt_]?.cnt ?? null, { fill: C_GREEN, numFmt: "#,##0" });
    });

    // ── base+2: Средняя ставка за показ (or CPM for all-Russ cities) ──
    const isRussCity = rd.russOts === true;
    const rateLabel = isRussCity ? "Ставка за 1000 OTS" : "Средняя ставка за показ";
    // Ставку кладём НЕокруглённой: показывает её numFmt "0.00", а по значению
    // считает формула бюджета «выходы x ставка». Раньше в ячейке лежало
    // округлённое до копеек число, а бюджет был посчитан по полному — Excel
    // при пересчёте давал другой итог. На плане по Владивостоку это +5 878 ₽.
    const wtRateD = isRussCity
      ? (rd.avgCpm != null ? rd.avgCpm : null)
      : (wtAvgBid > 0 ? wtAvgBid : null);
    sc(ws, base + 2, 1, rateLabel, { bold: true, fill: C_LIGHT });
    // Средневзвешенная по количеству экранов. SUMPRODUCT, а не ручная сумма
    // произведений: в рукописных планах такую формулу писали под фиксированное
    // число колонок, и при добавлении формата она молча переставала их учитывать.
    sc(ws, base + 2, 2, fx(`IFERROR(SUMPRODUCT(${rng(rRate)},${rng(rCnt)})/B${rCnt},0)`, wtRateD),
      { fill: C_GREEN, numFmt: "0.00" });
    fmts.forEach((fmt_, fi) => {
      const r = isRussCity
        ? (rd.avgCpm != null ? rd.avgCpm : null)
        : (cfStats[city][fmt_]?.avgBid > 0 ? cfStats[city][fmt_].avgBid : null);
      sc(ws, base + 2, 5 + fi, r, { fill: C_GREEN, numFmt: "0.00" });
    });

    // ── base+3: Средний OTS* ─────────────────────────────────────
    // Средний OTS одного экрана формата — исходная величина, из которой формулой
    // считается строка «Прогноз кол-ва OTS». Если по формату данных нет,
    // подставляем то, что заложил расчёт (ots/plays): иначе колонка молча
    // схлопнется в 0, хотя город OTS отдаёт.
    const otsPerFmt = fmts.map(fmt_ => {
      const st = cfStats[city][fmt_];
      if (st?.avgOts > 0) return st.avgOts;
      if (st?.plays > 0 && st?.ots > 0) return st.ots / st.plays;
      return null;
    });
    // Итог считаем ровно по тем числам, что легли в ячейки, иначе формула
    // SUMPRODUCT в файле разойдётся с показанным значением.
    const _otsNum = otsPerFmt.reduce((a, o, i) => a + (o || 0) * (cfStats[city][fmts[i]]?.cnt || 0), 0);
    const wtOtsD = regCnt > 0 && _otsNum > 0 ? +(_otsNum / regCnt).toFixed(2) : null;
    sc(ws, base + 3, 1, "Средний OTS*",     { bold: true, fill: C_LIGHT });
    sc(ws, base + 3, 2, fx(`IFERROR(SUMPRODUCT(${rng(rOts)},${rng(rCnt)})/B${rCnt},0)`, wtOtsD),
      { fill: C_GREEN, numFmt: decFmt(wtOtsD) });
    otsPerFmt.forEach((o, fi) => {
      sc(ws, base + 3, 5 + fi, o, { fill: C_GREEN, numFmt: decFmt(o) });
    });

    // ── base+4: График ч/сутки ────────────────────────────────────
    // Диапазон («5–10») — строка, к ней числовой формат неприменим.
    // Высота задана явно: расписание лежит в ячейке с переносом, и на
    // мудрёном графике автоподбор растягивал строку на пол-экрана. Явная
    // высота автоподбор отключает; сам текст в ячейке остаётся целиком.
    ws.getRow(base + 4).height = 30;
    const hpdFmt = hpdIsRange ? undefined : decFmt(hpdShown);
    sc(ws, base + 4, 1, "График, ч/сутки", { bold: true, fill: C_LIGHT, v: "center" });
    sc(ws, base + 4, 2, hpdValue,          { fill: C_GREEN, numFmt: hpdFmt, h: "right", v: "center" });
    if (schedTxt) sc(ws, base + 4, 3, schedTxt,
      { fill: C_GREEN, size: 9, h: "center", v: "center", wrap: true });
    else ws.getCell(base + 4, 3).border = THIN_B;
    fmts.forEach((_, fi) => {
      sc(ws, base + 4, 5 + fi, hpdValue, { fill: C_GREEN, numFmt: hpdFmt, h: "right", v: "center" });
    });

    // ── base+5: Прогноз кол-ва выходов ───────────────────────────
    // Это исходные данные блока: из них формулами считаются и OTS, и бюджет.
    sc(ws, base + 5, 1, "Прогноз кол-ва выходов", { bold: true, fill: C_LIGHT });
    sc(ws, base + 5, 2, fx(`SUM(${rng(rPlay)})`, s0.plays), { fill: C_GREEN, numFmt: "#,##0" });
    fmts.forEach((fmt_, fi) => {
      sc(ws, base + 5, 5 + fi, cfStats[city][fmt_]?.plays || 0, { fill: C_GREEN, numFmt: "#,##0" });
    });

    // ── base+6: Прогноз кол-ва OTS* ──────────────────────────────
    ws.getRow(base + 6).height = 24.75;
    sc(ws, base + 6, 1, "Прогноз кол-ва OTS*", { bold: true, fill: C_LIGHT });
    // Ноль показываем как «–», а не как «0»: у формата просто нет данных OTS,
    // и голый ноль читался бы как проверенный ноль охвата.
    const OTS_NUMFMT = '#,##0;-#,##0;"–"';
    sc(ws, base + 6, 2, fx(`SUM(${rng(base + BR.otsTot)})`, s0.ots),
      { fill: C_GREEN, numFmt: OTS_NUMFMT });
    fmts.forEach((fmt_, fi) => {
      const st = cfStats[city][fmt_];
      const col = colLetter(5 + fi);
      // OTS = выходы × средний OTS экрана
      sc(ws, base + 6, 5 + fi, fx(`${col}${rPlay}*${col}${rOts}`, st?.ots || 0),
        { fill: C_GREEN, numFmt: OTS_NUMFMT });
    });

    // ── base+7: Прогноз бюджета ───────────────────────────────────
    sc(ws, base + 7, 1, "Прогноз бюджета",  { bold: true, fill: C_LIGHT });
    sc(ws, base + 7, 2, fx(`SUM(${rng(base + BR.budget)})`, r2(s0.budget)),
      { bold: true, fill: C_GREEN, numFmt: '#,##0.00 "₽"' });
    fmts.forEach((fmt_, fi) => {
      const col = colLetter(5 + fi);
      // Бюджет = выходы × ставка
      sc(ws, base + 7, 5 + fi, fx(`${col}${rPlay}*${col}${rRate}`, r2(cfStats[city][fmt_]?.budget || 0)),
        { bold: true, fill: C_GREEN, numFmt: '#,##0.00 "₽"' });
    });

    // ── base+8: Частота, вых/час на экран ─────────────────────────
    // Формулой, а не числом: клиент правит период или расписание прямо в файле,
    // и частота обязана пересчитаться вместе с ними. Делим на общее число часов
    // за период, а не на ч/сутки: при разном расписании по дням в той ячейке
    // стоит диапазон «5–10», и делить на неё нечем.
    const rFreq = base + 8;
    const freqFx = (col) => `IFERROR(${col}${rPlay}/${col}${rCnt}/$B$${hoursRowNum},"–")`;
    const freqVal = (plays, cnt) => (cnt > 0 && hoursTotalShown > 0)
      ? +(plays / cnt / hoursTotalShown).toFixed(2) : null;
    const FREQ_NUMFMT = '#,##0.0;-#,##0.0;"–"';
    sc(ws, rFreq, 1, "Частота, вых/час на экран", { bold: true, fill: C_LIGHT });
    sc(ws, rFreq, 2, fx(freqFx("B"), freqVal(s0.plays, regCnt)),
      { fill: C_GREEN, numFmt: FREQ_NUMFMT, h: "right" });
    fmts.forEach((fmt_, fi) => {
      const st = cfStats[city][fmt_];
      const col = colLetter(5 + fi);
      sc(ws, rFreq, 5 + fi, fx(freqFx(col), freqVal(st?.plays || 0, st?.cnt || 0)),
        { fill: C_GREEN, numFmt: FREQ_NUMFMT, h: "right" });
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
  // Ставка в колонке — та самая, по которой посчитан план (screenBid), а
  // заголовок называет её режим: иначе цифру нечем поверить.
  const _upl = Number(brief.bidUpliftPct) > 0 ? " + " + brief.bidUpliftPct + "%" : "";
  const AP_BID_HDR = (brief.bidMode === "min" ? "Мин. ставка" : "Рекомендованная ставка")
    + _upl + ", ₽";
  const AP_COLS = [
    { h: "GID",                w: 25, fn: s => s.gid ?? s.screen_id ?? "" },
    { h: "Город",              w: 22, fn: s => s.city       ?? "" },
    { h: "Оператор",           w: 22, fn: s => s.owner      ?? "" },
    { h: "Адрес",              w: 50, fn: s => s.address    ?? "" },
    { h: "Сторона",            w: 10, fn: s => s.side       ?? "" },
    { h: "Формат экрана",      w: 18, fn: s => s.format     ?? "" },
    // Длительностей может быть выбрано несколько. Показываем те из них, которые
    // этот экран реально поддерживает: по колонке видно, на каких поверхностях
    // идут оба ролика — а это те самые, что в расчёте ставки считались дважды.
    // Если по длительности не фильтровали, перечисляем все слоты экрана: раньше
    // колонка в этом случае стояла пустой, хотя данные о слотах есть.
    { h: "Длительность, сек",  w: 16, fn: s => {
        const info = Array.isArray(s.durationBidInfo) ? s.durationBidInfo : [];
        if (!info.length) return "";
        // Нули отсекаем на входе: у части экранов слот приходит нулевым
        // (длительность не указана), а «0 сек» в колонке — не слот, а мусор.
        // _resolveDurationMatch берёт ближайший слот по расстоянию, поэтому
        // нулевой пролезает и через фильтрованный путь, не только через «все».
        const секунды = (list) => [...new Set(list.filter(v => Number.isFinite(v) && v > 0))]
          .sort((a, b) => a - b).map(v => Math.round(v / 1000)).join(", ");

        const perFmt = durByFormat[String(s.format || "").trim()];
        const wanted = (Array.isArray(perFmt) && perFmt.length) ? perFmt : durList;
        // Пустой выбор и «Любая» — это одно и то же: ноль ни с одним слотом не
        // сопоставляется, поэтому отбрасываем его вместе с пустым списком.
        const filtered = wanted.map(Number).filter(ms => ms > 0);
        if (!filtered.length) return секунды(info.map(d => d.duration));

        const matched = new Set();
        for (const ms of filtered) {
          const m = _resolveDurationMatch(s, ms);
          if (m && Number.isFinite(m.duration)) matched.add(m.duration);
        }
        return matched.size ? секунды([...matched]) : "";
      } },
    // Ставка стоит рядом с длительностью не случайно: она от неё и зависит —
    // applySelectedDurations уже перезаписал minBid/recoBid под выбранный ролик.
    { h: AP_BID_HDR, w: 22, numFmt: '#,##0.00', fn: s => {
        const b = screenBid(s, brief);
        return Number.isFinite(b) && b > 0 ? b : "";
      } },
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
        if (col.numFmt && typeof v === "number") cell.numFmt = col.numFmt;
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
  if (!calc) { toast("Сначала нажмите «Рассчитать»."); return null; }
  const ExcelJS = await ensureLib("exceljs");
  if (!ExcelJS) { alert("Не удалось загрузить библиотеку выгрузки. Проверьте соединение и попробуйте ещё раз."); return null; }

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
    if (_isGidMode) return gidRegionKey(s);
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

// ===== Подбор адресов через 2ГИС =====
// Портировано из omni360-tools (lib/addresses-core.js) — там метод проверен
// замерами по API, здесь он подогнан под планировщик: центр берём из координат
// инвентаря выбранных регионов, а не геокодируем город по названию.
//
// Что было не так в прежней версии и почему выдача выглядела странно:
//   • слался параметр `location`, а круговой фильтр в /3.0/items — это `point`.
//     Замер: «Пятёрочка/Казань» — 490 объектов через point против 190 через
//     location, «Магнит/Казань» — 314 против 211. Треть-две трети выдачи терялись;
//   • radius=50000 при задокументированном пределе 40000;
//   • пагинация строилась от result.total, а он у 2ГИС ненадёжен — листать надо,
//     пока страницы не кончатся (неполная страница или 404 itemNotFound);
//   • дедуп шёл по тексту адреса, а не по координатам.
//
// Отдельно: «point + radius» у 2ГИС — НЕ геометрический фильтр. Для одних запросов
// total растёт с радиусом, для других падает, причём объекты из малого радиуса не
// попадают в выдачу большого. Поэтому у полного режима есть второй проход сеткой.
const GEO2GIS_KEY = "ba3c806e-746b-40b7-a1c8-4fc79c1a9667";
const GEO2GIS_PROXY = "https://silent-surf-cd5e.mochalova-kathrine-v.workers.dev/2gis";
const GEO2GIS = {
  RADIUS_MAX: 40000,      // предел API
  PAGE_SIZE: 50,          // предел API
  MAX_PAGES: 60,          // предохранитель на одну точку
  LIMIT_DEFAULT: 200,     // столько адресов хватает в большинстве задач
  LIMIT_MAX: 2000,        // выше — уже не адресная программа, а выгрузка справочника
  HARD_CAP: 5000,         // предохранитель на весь прогон в режиме «найти все»
  GRID: 4,                // сетка 4×4 во «полном» режиме
  GRID_SPAN: 0.3,         // сторона области обхода в градусах (≈33 км)
  GRID_RADIUS: 6000,      // радиус в точке сетки; круги перекрываются
};

// Адрес объекта: сначала короткий address_name, потом структурные компоненты,
// и только в конце full_address_name — он длиннее и чаще содержит лишнее.
function _2gisAddressOf(item) {
  if (item.address_name) return String(item.address_name).trim();
  const addr = item.address || {};
  if (addr.name) return String(addr.name).trim();
  const comps = addr.components || [];
  const parts = [];
  for (const c of comps) {
    if (c.street && c.number) parts.push(c.street + ", " + c.number);
    else if (c.street) parts.push(c.street);
  }
  if (parts.length) return parts.join("; ");
  return String(item.full_address_name || "").trim();
}

// Сетевой сбой и зависание — не конец выдачи, а повод переспросить: у 2ГИС одна
// страница из десятков висит до таймаута, а следующий же запрос проходит за
// секунду. Замерено на живой выдаче: page=4 вернулась 502 через 25,4 с, page=5 —
// 200 за 0,9 с. Без повтора такая осечка обрывала весь прогон, и пользователь
// получал ровно то, что успело набраться до неё — характерные «ровно 100».
// Таймаут свой: у fetch его нет вовсе, и зависший запрос висел бы бесконечно.
const GEO2GIS_TRY = { attempts: 3, timeoutMs: 12000, pauseMs: 600 };
const _2gisSleep = (ms) => new Promise(r => setTimeout(r, ms));
const _2gisSignal = () => (typeof AbortSignal !== "undefined" && AbortSignal.timeout)
  ? { signal: AbortSignal.timeout(GEO2GIS_TRY.timeoutMs) } : {};

// Одна страница выдачи. done=true — выдача кончилась (штатно или из-за ошибки).
async function _2gisFetchPage(query, center, radius, page) {
  const url = GEO2GIS_PROXY +
    "?q=" + encodeURIComponent(query) +
    "&point=" + center.lon + "," + center.lat +
    "&radius=" + Math.min(radius, GEO2GIS.RADIUS_MAX) +
    "&page=" + page +
    "&page_size=" + GEO2GIS.PAGE_SIZE +
    "&fields=" + encodeURIComponent("items.point,items.address,items.address_name,items.full_address_name") +
    "&key=" + GEO2GIS_KEY;

  let last = "";
  for (let attempt = 1; attempt <= GEO2GIS_TRY.attempts; attempt++) {
    // Пауза растёт: если справочник поперхнулся, второй мгновенный запрос
    // упрётся в то же самое.
    if (attempt > 1) await _2gisSleep(GEO2GIS_TRY.pauseMs * (attempt - 1));

    let r;
    try {
      r = await fetch(url, _2gisSignal());
    } catch (e) {
      last = (e && (e.name === "TimeoutError" || e.name === "AbortError"))
        ? "2ГИС не ответил за " + Math.round(GEO2GIS_TRY.timeoutMs / 1000) + " с"
        : "2ГИС не ответил: " + (e && e.message ? e.message : e);
      continue;
    }
    // 5xx — поперхнулись прокси или сам справочник, повтор осмыслен.
    if (r.status >= 500) { last = "2ГИС ответил " + r.status; continue; }

    let data;
    try {
      data = await r.json();
    } catch (e) {
      // Тело не разобралось — это страница ошибки платформы, а не ответ
      // справочника. Именно здесь раньше рождалось «ответил undefined».
      last = "2ГИС ответил не JSON (HTTP " + r.status + ")";
      continue;
    }

    const code = data?.meta?.code;
    // 404 itemNotFound — выдача закончилась, это нормальное завершение
    const type = data?.meta?.error?.type || "";
    if (code === 404 || type === "itemNotFound") return { items: [], done: true };
    if (code !== 200) {
      // Ответ разобрался — значит справочник объяснил отказ, и повтор его не
      // переубедит: неверный параметр останется неверным.
      return { items: [], done: true, error: data?.meta?.error?.message
        || ("2ГИС ответил " + (code == null ? "без кода" : code)) };
    }

    const raw = data?.result?.items || [];
    const items = [];
    for (const it of raw) {
      const pt = it.point;
      if (!pt || !Number.isFinite(Number(pt.lat)) || !Number.isFinite(Number(pt.lon))) continue;
      items.push({ address: _2gisAddressOf(it), lat: Number(pt.lat), lon: Number(pt.lon) });
    }
    // Неполная страница — дальше ничего нет. На result.total не опираемся: он врёт.
    return { items, done: raw.length < GEO2GIS.PAGE_SIZE };
  }
  return { items: [], done: true,
    error: last + " (попыток: " + GEO2GIS_TRY.attempts + ")" };
}

// Вычерпывает одну точку: листает страницы, пока они не кончатся или пока не
// набрано stopAt адресов (абсолютное значение счётчика, не приращение).
async function _2gisSweepPoint(query, center, radius, sink, stopAt) {
  for (let page = 1; page <= GEO2GIS.MAX_PAGES; page++) {
    const r = await _2gisFetchPage(query, center, radius, page);
    for (const it of r.items) sink.push(it);
    if (r.error) return { error: r.error };
    if (r.done) break;
    // Страница приходит целиком, поэтому цель можно перескочить на несколько
    // адресов — лишнее подрежется в конце.
    if (sink.size() >= stopAt) return { capped: true };
  }
  return {};
}

// Точки сетки вокруг центра.
function _2gisBuildSectors(center, grid, span) {
  const step = span / grid;
  const half = span / 2;
  const out = [];
  for (let i = 0; i < grid; i++) {
    for (let j = 0; j < grid; j++) {
      out.push({
        lat: center.lat - half + step / 2 + i * step,
        lon: center.lon - half + step / 2 + j * step,
      });
    }
  }
  return out;
}

/**
 * Ищет адреса объектов бренда вокруг каждого из центров.
 * centers    — [{lat, lon, label}], по одному на выбранный регион.
 * opts.full  — второй проход сеткой (дольше, но полнее).
 * opts.limit — сколько адресов нужно НА РЕГИОН; 0/пусто — искать все.
 *              Лимит именно на регион: общий съел бы первый же город, и на
 *              остальные не осталось бы ничего.
 * Возвращает [{address, lat, lon}] без дублей по координатам.
 */
async function fetch2gisAddresses(query, centers, opts = {}, onProgress) {
  const list = (Array.isArray(centers) ? centers : [centers])
    .filter(c => c && Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lon)))
    .map(c => ({ lat: Number(c.lat), lon: Number(c.lon), label: c.label || "" }));
  if (!list.length) return { results: [], error: "нет координат для поиска" };

  // 0 / пусто / мусор — режим «найти все»: он нужен на редких запросах, где важно
  // не пропустить ни одной точки. Ограничивает только предохранитель HARD_CAP.
  const askedLimit = Number(opts.limit);
  const unlimited = !(askedLimit > 0);
  const limit = unlimited ? GEO2GIS.HARD_CAP : Math.min(askedLimit, GEO2GIS.LIMIT_MAX);

  // Дедуп по координатам, а не по тексту: один и тот же адрес пишется по-разному,
  // а разные объекты иногда делят одну строку адреса.
  const byCoord = new Map();
  let withAddress = 0;
  const sink = {
    push(it) {
      const key = it.lat.toFixed(6) + "," + it.lon.toFixed(6);
      if (byCoord.has(key)) return;
      byCoord.set(key, it);
      if (it.address) withAddress++;
    },
    // К лимиту считаем только объекты С адресом: просили N адресов, а не N точек
    // справочника.
    size: () => withAddress,
  };

  const report = (stage) => { if (typeof onProgress === "function") onProgress(withAddress, stage); };

  // Осечка на одном регионе больше не отменяет остальные: раньше первая же
  // ошибка выходила из цикла, и города после неё не искались вовсе — отсюда
  // «по Питеру нашёл, на Москве сыпется». Порядок регионов решал всё.
  const failed = [];
  let capped = false;

  for (const center of list) {
    if (withAddress >= GEO2GIS.HARD_CAP) break;
    const where = center.label ? ` (${center.label})` : "";
    // Цель для этого региона: уже набранное плюс лимит.
    const stopAt = Math.min(withAddress + limit, GEO2GIS.HARD_CAP);

    report("широкий поиск" + where);
    const wide = await _2gisSweepPoint(query, center, GEO2GIS.RADIUS_MAX, sink, stopAt);
    if (wide.error) { failed.push({ label: center.label, message: wide.error }); continue; }
    // Лимит по этому региону набран — идём к следующему, а не выходим совсем.
    if (wide.capped) { capped = true; continue; }

    if (!opts.full) continue;

    const sectors = _2gisBuildSectors(center, GEO2GIS.GRID, GEO2GIS.GRID_SPAN);
    for (let i = 0; i < sectors.length; i++) {
      report(`сектор ${i + 1} из ${sectors.length}${where}`);
      const r = await _2gisSweepPoint(query, sectors[i], GEO2GIS.GRID_RADIUS, sink, stopAt);
      if (r.error) { failed.push({ label: center.label, message: r.error }); break; }
      if (r.capped) { capped = true; break; }
    }
  }

  // Страница приходит целиком, поэтому лимит можно перескочить на несколько
  // адресов — подрезаем, чтобы «нужно 200» означало ровно 200 на регион.
  let results = [...byCoord.values()].filter(it => it.address);
  const hardLimit = unlimited ? Infinity : limit * list.length;
  if (results.length > hardLimit) {
    results = results.slice(0, hardLimit);
    capped = true;
  }
  // error оставляем только когда не набралось ничего: по нему интерфейс красит
  // строку и выбрасывает результат. Если что-то нашлось, отдаём найденное, а
  // про недочитанные регионы говорим отдельно — терять адреса из-за осечки в
  // соседнем городе незачем.
  const failedText = failed.length
    ? failed.map(f => (f.label ? f.label + ": " : "") + f.message).join("; ")
    : null;
  return {
    results,
    withoutAddress: byCoord.size - withAddress,
    capped, unlimited,
    limit: unlimited ? null : limit,
    error: results.length ? null : failedText,
    failedText,
    failedRegions: failed.map(f => f.label).filter(Boolean),
  };
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
  // Данные ВК теперь ленивые. Если фильтр включён, а файл ещё не приехал —
  // дожидаемся, иначе фильтр молча не применится и пул окажется шире, чем
  // просил пользователь.
  if (el("audience-enabled")?.checked && !state.affinityMap) {
    setStatus("Загружаю данные ВК…");
    try {
      await ensureAffinityLoaded();
    } catch (e) {
      setStatus("");
      alert("Не удалось загрузить данные ВК — фильтр по аудитории применить нельзя.\nВыключите «Аудиторию VK» или попробуйте ещё раз.");
      return;
    }
    setStatus("");
  }

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
      if (state.selectedDurationsMs?.length) applySelectedDurations(state.selectedDurationsMs);
    }
  }

  const brief = buildBrief();
  const pphTarget = targetPlaysPerHourPerScreen(brief.reachMode);

  if (!brief.dates.start) return void fieldError("date-start", "Укажите дату начала размещения.", { step: 2 });
  if (!brief.dates.end)   return void fieldError("date-end",   "Укажите дату окончания размещения.", { step: 2 });

  const _selModeForRegions = brief?.selection?.mode;
  let regions = Array.isArray(brief?.geo?.regions) && brief.geo.regions.length
    ? brief.geo.regions.map(x => String(x || "").trim()).filter(Boolean)
    : (brief?.geo?.region ? [String(brief.geo.region).trim()] : []);

  if (!regions.length) {
    if (_selModeForRegions === "manual_screens") {
      // GID mode without regions: treat all screens as one pool
      regions = ["__gid_mode__"];
    } else {
      return void fieldError("city-search", "Выберите хотя бы один регион.", { step: 1 });
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
  // Шаг «Цели» — логический 4-й (физически div wiz-step-3), см. STEP_TO_DIV.
  if (brief.budget.mode === "fixed" && (!brief.budget.amount || brief.budget.amount <= 0)) {
    return void fieldError("budget-input",
      "Введите сумму бюджета — либо выберите «Подскажите бюджет» или цель по OTS/показам.", { step: 4 });
  }

  if (brief.budget.mode === "goal_ots" && (!brief.goal?.ots || brief.goal.ots <= 0)) {
    return void fieldError("goal-ots", "Введите целевой OTS.", { step: 4 });
  }

  if (brief.budget.mode === "goal_plays" && (!brief.goal?.plays || brief.goal.plays <= 0)) {
    return void fieldError("goal-plays", "Введите целевое количество показов.", { step: 4 });
  }

  const days = daysInclusive(brief.dates.start, brief.dates.end);
  if (!Number.isFinite(days) || days <= 0) {
    return void fieldError("date-end",
      "Дата окончания должна быть не раньше даты начала.", { step: 2 });
  }

  // ✅ schedule hours/day
  let hpdFixed = hoursPerDay(brief.schedule);

  if (brief.schedule?.type === "weekly") {
    const meta = computeScheduleHoursForPeriod(brief.schedule, brief.dates.start, brief.dates.end);
    hpdFixed = meta.avgHpd;

    if (!Number.isFinite(hpdFixed) || hpdFixed <= 0) {
      return void fieldError("schedule-chips",
        "В своём расписании не задано время вещания: включите хотя бы один день с ненулевым интервалом.",
        { step: 2, box: true, anchor: "weekly-wrap" });
    }
  }

  if (!Number.isFinite(hpdFixed) || hpdFixed <= 0) {
    return void fieldError("schedule-chips",
      "Проверьте расписание: получилось 0 часов вещания в сутки.",
      { step: 2, box: true });
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
      setStatus("");
      return void fieldError(document.querySelector(".planner-addr-input") || el("selection-extra"),
        "Добавьте хотя бы один адрес — рядом с ними и будем подбирать экраны.", { step: 3 });
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
      setStatus("");
      return void fieldError(document.querySelector(".planner-addr-input") || el("selection-extra"),
        "Ни один адрес не найден. Уточните: город, улица, дом.", { step: 3 });
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

  // Счётчики пробелов в данных ВК — копятся по всем регионам и выдаются одним
  // предупреждением после цикла, чтобы при полусотне регионов не завалить
  // сводку одинаковыми строками.
  let _vkBase = 0, _vkNoData = 0, _vkNoDataDropped = 0;

  for (const region of regions) {
    const regionDisplay = region === "__gid_mode__" ? "По GID-списку" : region;
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

    // Тир считаем по всему инвентарю региона — до фильтров по форматам,
    // операторам и зоне. Иначе выбор одного формата ронял бы регион в младший
    // тир и занижал и рекомендацию бюджета, и его долю при распределении.
    const tier = getTierForGeo(region, pool);

    // Программа зафиксирована — пересобираем в её пределах. Режем после
    // расчёта тира: тир считается по всему инвентарю региона, иначе он
    // упал бы вместе с размером отобранной программы.
    if (state.apFrozenIds && state.apFrozenIds.size) {
      pool = pool.filter(s => state.apFrozenIds.has(_screenIdOf(s)));
    }

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
      if (state.selectedPhotoReport && state.selectedPhotoReport.size > 0) {
        pool = pool.filter(s => state.selectedPhotoReport.has(photoReportOf(s)));
      }

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
        setStatus("");
        return void fieldError(document.querySelector(".planner-addr-input") || el("selection-extra"),
          "Ни один адрес не найден. Уточните: город, улица, дом.", { step: 3 });
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
        const _picks = state.gidPicks || {};
        const _realGids = gidsWithRealOwner(gidSet);
        pool = pool.filter(s => {
          const sid = _screenIdOf(s);
          // 1) типизированный GID-список — сохраняем всегда
          if (gidSet.has(sid) && !seenGids.has(sid)) {
            // Тестовый аккаунт дублирует инвентарь настоящего оператора.
            // Пока у GID есть живой владелец, техническую копию не берём —
            // иначе выбор зависел бы от порядка экранов в пуле.
            if (isTechnicalOwner(s) && _realGids.has(sid)) return false;
            // У спорного GID берём именно выбранный экран, а не первый
            // попавшийся: у дублей различаются город, формат и ставка.
            const выбран = _picks[sid];
            if (выбран && gidVariantKey(s) !== выбран) return false;
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

        // Экраны без данных ВК получают score = 0 и уходят в хвост сортировки,
        // то есть отсеиваются первыми — не из-за низкого аффинити, а из-за
        // пробелов в данных. Копим по всем регионам (см. итог после цикла).
        _vkBase += before;
        _vkNoData += noVkData;
        if (noVkData > 0) {
          _vkNoDataDropped += withScore.slice(keepN)
            .reduce((n, x) => n + (state.affinityMap.get(_screenIdOf(x.s)) ? 0 : 1), 0);
        }

        // В GID-режиме дополнительно показываем срез по региону: там фильтр
        // сужает введённый пользователем список, и это надо видеть поимённо.
        if (_isManualMode) {
          const _where = region === "__gid_mode__" ? "" : ` в «${regionDisplay}»`;
          warnings.push(
            `ℹ️ Фильтр ВК${_where}: из ${before} экранов GID-списка оставлено ${pool.length} ` +
            `(топ ${Math.round(topPct * 100)}% по [${segs.join(", ")}]).`
          );
        }
        if (!pool.length) {
          perRegionRows.push({ region: regionDisplay, tier, budget: 0, screens: 0, plays: 0, ots: null,
            note: `аффинити-фильтр: нет экранов в топ ${Math.round(topPct * 100)}% по [${segs.join(", ")}]` });
          continue;
        }
      } else {
        // Сюда попасть можно, только если данные ВК не загрузились. Молчать
        // нельзя: пул окажется шире запрошенного, а причина будет неочевидна.
        warnings.push("⚠️ Фильтр «Аудитория VK» не применён: данные ВК не загрузились. Отбор идёт по всему инвентарю.");
      }
    }

    // In constructions mode or GID mode keep all screens — estimate bid for no-bid screens.
    // onlyActiveBids=true → filter out no-bid screens (default-safe for city mode).
    // onlyActiveBids=false or GID mode → estimate bid for no-bid screens from same-format avg.
    const _skipBidFilter = (brief.constructions?.enabled && brief.constructions.count > 0) || _isManualMode;
    if (!_skipBidFilter && brief.onlyActiveBids !== false) {
      // Городской сценарий с включённым «Только активные»: экраны без ставки
      // выбрасываем, а не оцениваем — так просил пользователь.
      const bidScreens = pool.filter(hasActiveInventory);
      if (bidScreens.length > 0) pool = bidScreens;
    } else {
      pool = withEstimatedBids(pool);
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

  // Итог по пробелам в данных ВК — один раз на весь расчёт.
  // Без этого пользователь видел «оставлено 10%» и не знал, что часть отсева
  // произошла не по аффинити, а потому что по этим экранам данных ВК просто нет.
  if (_vkNoData > 0) {
    const pct = Math.round(_vkNoData / Math.max(1, _vkBase) * 100);
    warnings.push(
      `⚠️ Данные ВК есть не по всем экранам: их нет у ${_vkNoData.toLocaleString("ru-RU")} из ` +
      `${_vkBase.toLocaleString("ru-RU")} (${pct}%). Такие экраны получают нулевой аффинити и ` +
      `отсеиваются первыми — ` +
      (_vkNoDataDropped > 0
        ? `в этом расчёте так отсеялось ${_vkNoDataDropped.toLocaleString("ru-RU")} экр.`
        : `на этот расчёт это не повлияло.`)
    );
  }

  if (!prepared.length) {
    setStatus("Не удалось подобрать экраны: по выбранным условиям не осталось доступных. " +
              "Ослабьте фильтры — форматы, операторы, GRP, зону на карте — или расширьте географию.", true);
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
        prepared.map(r => ({ key: r.region, tier: r.tier })),
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
      setStatus("");
      return void fieldError("goal-ots", "Введите целевой OTS больше нуля.", { step: 4 });
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
      setStatus("");
      return void fieldError("goal-plays", "Введите количество показов больше нуля.", { step: 4 });
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
        prepared.map(r => ({ key: r.region, tier: r.tier })),
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
        // Считаем по экранам, а не через среднюю ставку: у медиафасада потолок
        // 8 вых/час и ставка в разы выше щита, поэтому «средняя ставка x
        // средняя частота» давала сумму, которой не хватало на заказанное, —
        // план приходил на 7,7 вых/час вместо 40. Здесь сумма ровно равна
        // стоимости того, что заказали, с настоящим потолком каждого носителя.
        const totalBudget = Math.round(hpdFixed * days * allGidScreens.reduce((sum, s) => {
          const bid = screenBid(s, brief);
          if (!Number.isFinite(bid) || bid <= 0) return sum;
          return sum + Math.min(_gidPpmGlobal, getScreenPphCap(s)) * bid;
        }, 0));
        const alloc = allocateBudgetAcrossRegions(
          totalBudget,
          prepared.map(r => ({ key: r.region, tier: r.tier })),
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
          prepared.map(r => ({ key: r.region, tier: r.tier })),
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
            prepared.map(r => ({ key: r.region, tier: r.tier })),
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

    // Цель по показам и по OTS — контракт: бюджет под неё выведен из неё же,
    // поэтому всё, что «доосваивает бюджет», обязано её уважать.
    const _goalIsTarget = brief.budget.mode === "goal_plays" || brief.budget.mode === "goal_ots";

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
      // Поднимать план до «сколько влезет в бюджет» можно только когда сумму
      // задал пользователь. В режиме цели бюджет выведен из цели, а сетка
      // отбирает экраны дешевле средней по пулу — на ту же сумму выходов
      // купится больше, и заказанные 150 000 показов превращались в 327 000.
      const adjustedTotalPlaysTheory = _goalIsTarget
        ? totalPlaysTheory
        : Math.max(totalPlaysTheory, totalPlaysTheoryByChosen);
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
    // Когда бюджет выводится из частоты («подскажите бюджет»), частота — цель, и
    // обнулять её нельзя: в GID-режиме бюджет по региону есть всегда, hasBudget
    // был true, частота становилась производной от суммы и возвращалась другой
    // (заказали 40 — получили 7,7). Когда сумму задал пользователь, всё
    // наоборот: частота = бюджет / ставка, и цель тут ставить нечего.
    const _freqIsTarget = ppmManual > 0 && brief.budget.mode === "recommendation";
    // Про _goalIsTarget см. объявление выше: цель нельзя ни резать бюджетом,
    // выведенным из неё же, ни поднимать выше заданной.
    const ppmOverride = (constructionsTarget !== null)
      ? ((hasBudget && !_freqIsTarget)
          ? (ppmRegionOverride > 0 ? ppmRegionOverride : null)
          : (ppmManual > 0 ? ppmManual : pphTarget))
      : (_isManualMode && ppmManual > 0 ? ppmManual : null);
    const _poolPphCap = pool.length > 0
      ? Math.round(pool.reduce((sum, s) => sum + getScreenPphCap(s), 0) / pool.length)
      : SC_MAX;
    // Запрошенную частоту режем только физическим потолком носителя.
    // _poolPphCap — СРЕДНЕЕ по пулу, и как потолок «на экран» он врал: в
    // смешанном пуле (фасады 8, остальные 60) среднее выходило, скажем, 36 и
    // молча срезало запрошенные 40, хотя ни один экран в 36 не упирается.
    // Настоящий кап каждого экрана всё равно применяется ниже, в
    // capPlaysByChosen: там стоит min(effectivePPH, getScreenPphCap(s)).
    const effectivePPH = ppmOverride !== null ? Math.min(ppmOverride, SC_MAX) : _poolPphCap;

    // С какой частотой каждый экран реально идёт в плане. Из этой метки растут
    // и средняя ставка плана, и разбивка выгрузки по форматам: без неё выходы
    // делились между форматами поровну по числу экранов, и в файле стояло 24
    // вых/час и у щита, и у фасада вместо 40 и 8.
    const tagPph = (list) => {
      for (const sc_ of list) sc_._pphUsed = Math.min(effectivePPH, getScreenPphCap(sc_));
    };
    tagPph(chosen);
    // Ставку пересчитываем уже с этими весами: выше она считалась до того, как
    // стала известна частота, то есть по экранам.
    const _pwBid = playWeightedBid(chosen, brief);
    if (Number.isFinite(_pwBid) && _pwBid > 0) effectiveChosenBid = _pwBid;

    // Реальный расход = фактические выходы × ставка ВЫБРАННЫХ экранов (не среднее по пулу).
    // Пересчитываем totalPlaysTheory по фактической ставке выбранных экранов — это убирает
    // раздутие, которое возникает в attempt-loop когда выбираются самые дешёвые экраны:
    // дешёвые → низкий effectiveChosenBid → большой totalPlaysTheoryByChosen → while-loop
    // добирает весь пул. Теперь после финального выбора пересчитываем строго по chosen-ставке.
    if (brief.budget.mode !== "goal_ots" && brief.budget.mode !== "goal_plays" && Number.isFinite(effectiveChosenBid) && effectiveChosenBid > 0) {
      totalPlaysTheory = Math.floor(budget / effectiveChosenBid);
    }

    // Per-screen-format cap: sum individual caps (e.g. MF=12, others=60)
    // let, а не const: цикл добора экранов по ёмкости ниже присваивает это
    // значение заново, и на const присваивание падало с TypeError — весь путь
    // «выбранных не хватает по ёмкости, добираем из пула» валил расчёт.
    let capPlaysByChosen = Math.floor(
      chosen.reduce((sum, s) => sum + Math.min(effectivePPH, getScreenPphCap(s)), 0) * days * hpd
    );
    // Срезанную частоту нельзя оставлять молча: пользователь ставит 40, видит в
    // плане 8 на фасадах и читает это как ошибку расчёта.
    if (ppmOverride !== null) {
      const capped = chosen.filter(s => getScreenPphCap(s) < ppmOverride);
      if (capped.length > 0) {
        warnings.push(
          `ℹ️ Регион «${regionDisplay}»: на ${capped.length} экр. частота срезана до ` +
          `${MF_MAX_PPH} вых/час вместо запрошенных ${Math.round(ppmOverride * 10) / 10} — ` +
          `медиафасад чаще не крутит.`
        );
      }
    }

    // Если ppmOverride — теоретический максимум определяется частотой, а не бюджетом.
    // Но всё равно кэпим по бюджету, чтобы не выходить за введённую сумму.
    if (ppmOverride !== null) {
      totalPlaysTheory = capPlaysByChosen;
    }
    let totalPlaysEffective = Math.min(totalPlaysTheory, capPlaysByChosen);

    // Цель, срезанную ёмкостью, молчать нельзя: пользователь задал число и
    // должен видеть, почему получил меньше. Ёмкость — единственное, что
    // теперь может урезать цель, и это честное физическое ограничение.
    if (_goalIsTarget && capPlaysByChosen < totalPlaysTheory && chosen.length > 0) {
      warnings.push(
        `⚠️ Регион «${regionDisplay}»: инвентарь отдаёт ` +
        `${capPlaysByChosen.toLocaleString("ru-RU")} выходов из запрошенных ` +
        `${totalPlaysTheory.toLocaleString("ru-RU")} — ${chosen.length} экр. на ` +
        `максимальной частоте больше не открутят. Нужны ещё экраны или период длиннее.`
      );
    }

    // Кэп по бюджету: сколько выходов можно купить на указанный бюджет.
    // ppm-слайдер — верхний предел частоты, но бюджет всегда ограничивает фактический расход.
    // Кроме одного случая: когда сумму вывели из частоты, она и есть стоимость
    // заказанного, и резать по ней выходы — гонять частоту по кругу. Сумма
    // складывается по ставке каждого экрана, а тратится по средней; в смешанном
    // пуле (дешёвые щиты по 40 вых/час и дорогие фасады по 8) эти два числа
    // расходятся в разы, и план сваливался с заказанных 40 до 2. Частоту задал
    // пользователь, сумма — следствие, её и показываем.
    const _skipBudgetCap = (_freqIsTarget && ppmOverride !== null) || _goalIsTarget;
    if (!_skipBudgetCap && Number.isFinite(effectiveChosenBid) && effectiveChosenBid > 0 && Number.isFinite(budget) && budget > 0) {
      const budgetMaxPlays = Math.floor(budget / effectiveChosenBid);
      if (budgetMaxPlays < totalPlaysEffective) {
        // In GID budget mode: frequency is OUTPUT (budget ÷ bid), not a target — no warning.
        // In constructions mode with budget: warn if desired pph can't be met.
        // Раньше условие «_isManualMode && !_isGidRegion» не выполнялось никогда:
        // в режиме manual_screens ключ региона как раз «__gid_mode__». Считаем по
        // делу: частота — цель ровно тогда, когда её задали явно (ppmOverride).
        if (ppmOverride !== null && chosen.length > 0 && hpd > 0 && days > 0) {
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

        tagPph(toAdd);
        avgChosenBid = avgNumber(chosen.map(s => s.minBid)) ?? pr.avgBid;
        const _pw = playWeightedBid(chosen, brief);
        effectiveChosenBid = (Number.isFinite(_pw) && _pw > 0) ? _pw
          : avgEffectiveBid(chosen, brief.bidMode, avgChosenBid * BID_MULTIPLIER, bidUpliftFactor(brief));

        capPlaysByChosen = Math.floor(chosen.reduce((sum, s) => sum + getScreenPphCap(s), 0) * days * hpd);
        const budgetCap = (effectiveChosenBid > 0) ? Math.floor(budget / effectiveChosenBid) : Infinity;
        totalPlaysEffective = Math.min(totalPlaysTheory, capPlaysByChosen, budgetCap);
      }
    }

    // Russ Outdoor: when ALL chosen screens are Russ and have CPM (otsBid),
    // pricing is per 1000 OTS: OTS = budget / cpm × 1000; plays = OTS / avgOts
    let russOtsBased = false;
    let avgChosenCpm = null;
    let avgOtsForRuss = null;
    if (chosen.length > 0 && chosen.every(s => isRussScreen(s))) {
      const cpms = chosen.map(s => s.otsBid).filter(v => Number.isFinite(v) && v > 0);
      if (cpms.length > 0) {
        avgChosenCpm = cpms.reduce((a, b) => a + b, 0) / cpms.length;
        avgOtsForRuss = avgNumberNonZero(chosen.map(s => s.ots));
        if (avgOtsForRuss != null && avgOtsForRuss > 0) {
          if (_goalIsTarget) {
            // Цель задана в показах или OTS — она и остаётся целью. У Russ цена
            // за 1000 OTS, поэтому из цели выводим сумму, а не наоборот: иначе
            // цель подменялась бюджетом, который сам из неё же и посчитан, и
            // заказанные 150 000 показов превращались в 327 000.
            russOtsBased = true;
          } else if (budget > 0) {
            const otsByBudget = Math.floor(budget / avgChosenCpm * 1000);
            totalPlaysEffective = Math.round(otsByBudget / avgOtsForRuss);
            russOtsBased = true;
          }
        }
      }
    }

    totalPlaysEffectiveAll += totalPlaysEffective;

    const actualBudget = !russOtsBased
      ? Math.ceil(totalPlaysEffective * effectiveChosenBid)
      : (_goalIsTarget
          // Цена за 1000 OTS: сумма = показы x OTS одного выхода / 1000 x CPM.
          ? Math.ceil(totalPlaysEffective * avgOtsForRuss / 1000 * avgChosenCpm)
          : budget);
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
    setStatus("Не удалось подобрать экраны: по выбранным условиям не осталось доступных. " +
              "Ослабьте фильтры — форматы, операторы, GRP, зону на карте — или расширьте географию.", true);
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

  // Фиксируем программу сразу, как она собрана, а не по событию calc-done.
  // Ниже по этой же функции считается предупреждение о бюджете, и оно зовёт
  // computeRecoBudgetTiers: до фиксации тот брал базой пул, после — саму
  // программу, и предупреждение называло не те суммы, что шкала на экране
  // результата. Одна фиксация на оба расчёта убирает расхождение.
  freezeAp();

  // ── Разбивка по форматам ────────────────────────────────────────
  // Выходы по формату = бюджет формата ÷ его ставка. Раньше выходы делились
  // поровну по экранам, а бюджет — по ставкам: медиафасад по 400 ₽ получал
  // столько же выходов на экран, сколько сити-борд по 5 ₽, и при этом в 80 раз
  // больше денег. Физически так не бывает — при фиксированной ставке дорогой
  // экран открутит меньше.
  //
  // Итоги при этом сходятся точно. Бюджет формата ∝ (кол-во × ставка), значит
  //   выходы_ф = бюджет × (кол-во_ф × ставка_ф) / Σ(кол-во × ставка) / ставка_ф
  //            = бюджет × кол-во_ф / Σ(кол-во × ставка)
  // и в сумме по форматам это бюджет / средняя ставка, то есть ровно тот общий
  // объём выходов, который посчитан выше.
  function buildFormatStats(screens, budgetTotal, playsTotal) {
  const formatStats = {};
  for (const s of screens) {
    const fmt = s.format || "—";
    if (!formatStats[fmt]) {
      formatStats[fmt] = {
        screens: 0,
        otsSum: 0, otsCnt: 0,  // для avg(s.ots per play)
        playsEst: 0,            // выходы по формату (заполняется вторым проходом)
        budget: 0,              // бюджет формата (заполняется вторым проходом)
        bidSum: 0, bidCnt: 0,  // для средней ставки по формату
      };
    }
    formatStats[fmt].screens++;
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

  // Второй проход: делим деньги по ставкам, из них получаем выходы.
  {
    const fmtKeys = Object.keys(formatStats);
    const bidWeight = fmtKeys.reduce((s, f) => {
      const fd = formatStats[f];
      return s + fd.screens * (fd.avgBid || 0);
    }, 0);
    for (const f of fmtKeys) {
      const fd = formatStats[f];
      if (bidWeight > 0 && fd.avgBid > 0) {
        fd.budget   = budgetTotal * (fd.screens * fd.avgBid) / bidWeight;
        fd.playsEst = fd.budget / fd.avgBid;
      } else {
        // Ни у одного формата нет ставки — делим поровну по экранам, как раньше.
        const share = screens.length > 0 ? fd.screens / screens.length : 0;
        fd.budget   = budgetTotal * share;
        fd.playsEst = playsTotal * share;
      }
    }
  }
  return formatStats;
  }

  const formatStats = buildFormatStats(chosenAll, totalBudgetFinal, totalPlaysEffectiveAll);

  // То же самое внутри каждого города: бюджет и выходы берём из строки
  // региона, чтобы столбцы сходились с тем, что показано «По регионам».
  const formatStatsByRegion = {};
  for (const row of perRegionRows) {
    const scr = chosenAll.filter(x => screenMatchesGeoChoice(x, row.region));
    if (!scr.length) continue;
    formatStatsByRegion[row.region] = {
      screens: scr.length,
      budget: row.budget,
      plays: row.plays,
      formats: buildFormatStats(scr, row.budget, row.plays),
    };
  }

  window.PLANNER = window.PLANNER || {};
  window.PLANNER.lastCalc = {
    brief,
    chosen: chosenAll,
    perRegion: perRegionRows,
    warnings: warnings || [],
    formatStats,
    formatStatsByRegion,
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

  // В GID-режиме расчёт отдаёт одну строку «По GID-списку»: география задана
  // списком, а не регионами. Для сводки это бесполезно — разбиваем её тем же
  // способом, каким это делает выгрузка: выходы поровну на экран, бюджет по
  // весу ставок. Иначе сводка и медиаплан показывали бы разное.
  const _gidSetForRows = (brief.selection?.mode === "manual_screens")
    ? brief.selection.manual_gids : null;
  let _rowsForText = perRegionRows || [];
  if (_gidSetForRows && _gidSetForRows.size && chosenAll.length) {
    const итого = _rowsForText.reduce((a, r) => ({
      budget: a.budget + (Number(r.budget) || 0),
      plays:  a.plays  + (Number(r.plays)  || 0),
    }), { budget: 0, plays: 0 });
    const tierOf = _rowsForText.length === 1 ? _rowsForText[0].tier : null;
    const playsPerScreen = итого.plays / chosenAll.length;

    const поРегиону = new Map();
    for (const sc of chosenAll) {
      const key = gidRegionKey(sc);
      let g = поРегиону.get(key);
      if (!g) { g = { screens: [], bidSum: 0 }; поРегиону.set(key, g); }
      g.screens.push(sc);
      g.bidSum += Number(sc.recoBid || 0) > 0
        ? sc.recoBid : (Number(sc.minBid || 0) * BID_MULTIPLIER);
    }
    const bidSumAll = [...поРегиону.values()].reduce((a, g) => a + g.bidSum, 0);

    _rowsForText = [...поРегиону.entries()].map(([region, g]) => {
      const plays = Math.round(playsPerScreen * g.screens.length);
      const otsVals = g.screens.map(x => x.ots).filter(v => Number.isFinite(v) && v > 0);
      const avgOts = otsVals.length ? otsVals.reduce((a, b) => a + b, 0) / otsVals.length : null;
      return {
        region, tier: tierOf,
        budget: bidSumAll > 0
          ? Math.round(итого.budget * g.bidSum / bidSumAll)
          : Math.round(итого.budget * g.screens.length / chosenAll.length),
        screens: g.screens.length,
        poolSize: null,
        plays,
        ots: avgOts != null ? Math.round(plays * avgOts) : null,
        note: "",
      };
    });
  }

  const perRegionText = (_rowsForText || [])
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

  // Та же правда, что и в выгрузке: календарные дни и среднее по ним ничего не
  // говорят клиенту, если график не каждый день. Произведение дней на часы не
  // меняется, поэтому выходы и частота на экран остаются те же.
  const _schedOnAir = brief.schedule?.type === "weekly"
    ? computeScheduleHoursForPeriod(brief.schedule, brief.dates.start, brief.dates.end)
    : null;
  const daysOnAir = (_schedOnAir && _schedOnAir.activeDays > 0) ? _schedOnAir.activeDays : days;
  const hpdOnAir  = (_schedOnAir && _schedOnAir.totalHours > 0 && daysOnAir > 0)
    ? _schedOnAir.totalHours / daysOnAir : hpd;

  const summaryText =
    `Бриф:
— Бюджет: ${totalBudgetFinal.toLocaleString("ru-RU")} ₽ ${
      brief.budget.mode === "fixed"
        ? "(распределён по регионам)"
        : (brief.budget.mode === "goal_ots" ? "(под цель OTS)" : brief.budget.mode === "goal_plays" ? "(под цель показов)" : "(сумма рекомендаций)")
    }${budgetAdviceLine}
— Даты: ${brief.dates.start} → ${brief.dates.end} (дней: ${daysOnAir})${
      daysOnAir !== days ? ` — дней вещания, календарных ${days}` : ""}
— Расписание: ${brief.schedule.type} (часов/день: ${hpdOnAir.toFixed(2)})
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
              formatStats, formatStatsByRegion, meta: window.PLANNER.lastCalc.meta, unmatchedGids }
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

  // Уровень мин/опт/макс выбран, но сумма ещё не подставлена: поле нарочно
  // пустое до нажатия «Рассчитать». Считаем это заданным бюджетом — иначе
  // кнопка гаснет, а подставляет сумму именно её нажатие.
  const tierPending = !!el("budget-tier-btns")?.dataset?.pending;

  const step3 =
    (mode === "recommendation") ||
    (mode === "fixed" && ((Number.isFinite(budgetVal) && budgetVal > 0) || tierPending)) ||
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
    // Пока идёт расчёт кнопка заблокирована независимо от валидации —
    // renderProgress зовётся из десятка мест и иначе снял бы блокировку.
    const busy = !!state._calcRunning;
    calcBtn.disabled = !ok || busy;
    if (!busy) calcBtn.style.opacity = ok ? "1" : ".55";
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
// Экраны, из которых сейчас будет собираться план: по регионам либо по
// списку GID-ов, с учётом ручного выбора форматов. Дальше по фильтрам
// (ставки, зона, операторы) не сужаем — для выбора длительности важно, какие
// поверхности вообще в игре, а не сколько их останется.
function planningPoolScreens() {
  const source = (Array.isArray(state.screensAll) && state.screensAll.length)
    ? state.screensAll : (Array.isArray(state.screens) ? state.screens : []);
  if (!source.length) return [];
  let brief;
  try { brief = buildBrief(); } catch { return source; }

  const gidSet = (brief.selection?.mode === "manual_screens" && brief.selection.manual_gids)
    ? brief.selection.manual_gids : null;
  if (gidSet && gidSet.size) {
    // Под одним GID-ом бывает несколько экранов — берём ровно те, что возьмёт
    // расчёт: выбранный вариант, иначе не технический аккаунт.
    const real = gidsWithRealOwner(gidSet);
    const picks = state.gidPicks || {};
    const seen = new Set();
    const out = [];
    for (const sc of source) {
      const id = _screenIdOf(sc);
      if (!gidSet.has(id) || seen.has(id)) continue;
      if (isTechnicalOwner(sc) && real.has(id)) continue;
      const выбран = picks[id];
      if (выбран && gidVariantKey(sc) !== выбран) continue;
      seen.add(id);
      out.push(sc);
    }
    return out;
  }

  const regions = Array.isArray(brief.geo?.regions) ? brief.geo.regions : [];
  let pool = regions.length
    ? source.filter(s => regions.some(r => screenMatchesGeoChoice(s, r)))
    : source;
  const manual = (brief.formats?.mode === "manual" && Array.isArray(brief.formats.selected))
    ? brief.formats.selected : [];
  if (manual.length) {
    const fset = new Set(manual);
    pool = pool.filter(s => fset.has(s.format));
  }
  return pool;
}
window.PLANNER = window.PLANNER || {};
window.PLANNER.planningPoolScreens = planningPoolScreens;

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

  // В GID-режиме регионов нет — экраны заданы списком. Без этой ветки счётчик
  // «Доступный инвентарь» уходил в null и не показывал ничего.
  const gidSet = (brief.selection?.mode === "manual_screens" && brief.selection.manual_gids)
    ? brief.selection.manual_gids : null;
  const gidMode = !!(gidSet && gidSet.size);
  if (!gidMode && !regions.length) return null;

  // 1. По регионам либо по списку GID-ов
  let pool = gidMode
    ? sourceScreens.filter(s => gidSet.has(_screenIdOf(s)))
    : sourceScreens.filter(s => regions.some(r => screenMatchesGeoChoice(s, r)));

  // 2. По форматам (если ручной выбор) — те же что в onCalcClick.
  // На GID-экраны фильтр форматов не влияет: список задан вручную.
  const formatsMode = brief.formats?.mode || "auto";
  const manualFormats = Array.isArray(brief.formats?.selected) ? brief.formats.selected : [];
  if (!gidMode && formatsMode === "manual" && manualFormats.length > 0) {
    const fset = new Set(manualFormats);
    pool = pool.filter(s => fset.has(s.format));
  }

  // onlyActiveBids: when toggled on, filter no-bid screens from the preview counts too.
  if (brief.onlyActiveBids) {
    pool = pool.filter(hasActiveInventory);
  }

  // Фильтр по стороне экрана (A/Б) — та же логика, что в onCalcClick
  if (state.selectedPhotoReport && state.selectedPhotoReport.size > 0) {
    pool = pool.filter(s => state.selectedPhotoReport.has(photoReportOf(s)));
  }

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
window.PLANNER.replacementCandidates = replacementCandidates;
window.PLANNER.replacementOptions = replacementOptions;
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

    // Слайдер частоты живёт в отдельном блоке и виден всегда — значит должен
    // честно говорить, работает он сейчас или только показывает, что выйдет.
    // Ручной ввод имеет смысл, только когда число конструкций задано, а бюджет
    // не задан: при заданном бюджете частота = бюджет ÷ ставка, слайдер ни на
    // что не влияет, а раньше выглядел рабочим.
    const ppmRow   = el("frequency-row");
    const ppmRange = el("constructions-ppm");
    const ppmVal   = el("constructions-ppm-val");
    const ppmNote  = el("constructions-ppm-note");
    const budgetMode = getBudgetMode();
    const manualPpmAllowed = checked && budgetMode === "recommendation";

    if (manualPpmAllowed) {
      if (ppmRange) ppmRange.disabled = false;
      if (ppmRow) ppmRow.style.opacity = "";
      if (ppmVal) ppmVal.textContent = ppmRange?.value || "10";
      if (ppmNote) ppmNote.style.display = "none";
      return;
    }

    if (ppmRange) ppmRange.disabled = true;
    if (ppmRow) ppmRow.style.opacity = "0.45";
    const pph = getPphTargetForUI();
    if (ppmVal) ppmVal.textContent = pph + " (авто)";
    if (ppmNote) {
      ppmNote.style.display = "block";
      ppmNote.textContent = checked
        ? "ℹ️ Бюджет задан — частота выйдет как бюджет ÷ ставка, слайдер на неё не влияет."
        : "ℹ️ Частоту подбирает стратегия. Включите «Задать вручную» в блоке выше и режим «Подскажите бюджет», чтобы задать её самому.";
    }
  }

  if (constructionsEnabled) {
    const _syncFreq = () => applyConstructionsState(!!el("constructions-enabled")?.checked);
    constructionsEnabled.addEventListener("change", _syncFreq);
    // Частота зависит и от стратегии, и от режима бюджета — слушаем оба.
    // Раньше подписка была только на стратегию и только при включённых
    // конструкциях, поэтому подпись под слайдером отставала от реальности.
    document.querySelectorAll('input[name="reach_mode"], input[name="budget_mode"]').forEach(r => {
      r.addEventListener("change", _syncFreq);
    });
    _syncFreq();
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

        // Парсеры грузятся по требованию: на старте виджета их нет.
        const _need = name.endsWith(".csv") ? "papaparse"
                    : (name.endsWith(".xlsx") || name.endsWith(".xls")) ? "xlsx"
                    : null;
        if (_need) {
          if (statusEl) statusEl.textContent = "Загружаю парсер файла…";
          if (!(await ensureLib(_need))) {
            if (statusEl) statusEl.textContent = "Не удалось загрузить парсер файла — проверьте соединение";
            e.target.value = ""; return;
          }
          if (statusEl) statusEl.textContent = "Читаю файл…";
        }

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
  if (downloadBtn) {
    // До первого расчёта скачивать нечего: кнопка была активна и по клику молча
    // ничего не делала. Включается там же, где и «Скачать план» — после расчёта.
    downloadBtn.disabled = true;
    downloadBtn.addEventListener("click", () => { downloadXLSX(state.lastChosen); logEvent("download_gids"); });
  }

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
      const ExcelJS = await ensureLib("exceljs");
      if (!ExcelJS) { alert("Не удалось загрузить библиотеку выгрузки. Проверьте соединение и попробуйте ещё раз."); return; }
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
  // Каких экранов нет в инвентаре, видно сразу: на шаге 1 инвентарь уже
  // загружен, и ждать расчёта незачем — раньше кнопка появлялась только
  // после него, то есть ровно тогда, когда список уже поздно исправлять.
  function _unmatchedGidsFromField() {
    if ((el("selection-mode")?.value || "") !== "manual_screens") return [];
    const set = _parseManualGids(el("manual-gids")?.value || "");
    if (!set.size) return [];
    const all = (Array.isArray(state.screensAll) && state.screensAll.length)
      ? state.screensAll : (Array.isArray(state.screens) ? state.screens : []);
    if (!all.length) return [];
    const have = new Set();
    for (const s of all) { const id = _screenIdOf(s); if (id) have.add(id); }
    return [...set].filter(g => !have.has(g));
  }

  function renderUnmatchedGids(list) {
    const btn = el("manual-gids-download-unmatched");
    if (!btn) return;
    // После расчёта список приходит от него: там учтён ещё и добор с карты.
    const unmatched = Array.isArray(list) ? list : _unmatchedGidsFromField();
    if (!unmatched.length) { btn.style.display = "none"; return; }
    btn.style.display = "inline-block";
    btn.textContent = `↓ Скачать не найденные GID-ы (${unmatched.length})`;
    btn.onclick = () => {
      const blob = new Blob([unmatched.join("\n")], { type: "text/plain;charset=utf-8;" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "gids_not_found.txt";
      a.click();
    };
  }

  window.addEventListener("planner:calc-done", (e) =>
    renderUnmatchedGids(e?.detail?.unmatchedGids || []));
  window.addEventListener("planner:screens-ready", () => renderUnmatchedGids());
  // Делегированно: разметка шага 1 к этому моменту может быть ещё не создана.
  let _unmatchedTimer = null;
  document.addEventListener("input", (e) => {
    if (e.target?.id !== "manual-gids") return;
    clearTimeout(_unmatchedTimer);
    _unmatchedTimer = setTimeout(() => renderUnmatchedGids(), 300);
  });

  // ===== Calc =====
  if (!state._calcClickDelegatedBound) {
    state._calcClickDelegatedBound = true;
    document.addEventListener("click", (e) => {
      const calcBtn = e.target?.closest?.("#calc-btn");
      if (!calcBtn) return;
      e.preventDefault();
      if (calcBtn.disabled) return;

      // Расчёт длится секунды (догрузка инвентаря, геокодинг, прогноз ставок).
      // Без этого замка двойной клик запускал два прохода параллельно, и оба
      // писали в общий state — итог зависел от того, кто финиширует вторым.
      if (state._calcRunning) return;
      state._calcRunning = true;
      // Помечаем виджет: пока считаем, клики по шкале бюджета всё равно
      // не доедут — recalc жмёт эту же кнопку, а она заблокирована.
      document.getElementById("planner-widget")?.setAttribute("data-calc", "busy");
      const _label = calcBtn.textContent;
      calcBtn.disabled = true;
      calcBtn.textContent = "Считаю…";
      calcBtn.style.opacity = ".7";
      calcBtn.style.cursor = "progress";

      Promise.resolve(onCalcClick())
        .catch((err) => {
          console.error("[calc] failed", err);
          alert("Не удалось выполнить расчёт: " + (err?.message || "неизвестная ошибка") +
                "\nПопробуйте ещё раз — если повторится, сообщите нам.");
          setStatus("");
        })
        .finally(() => {
          state._calcRunning = false;
          document.getElementById("planner-widget")?.removeAttribute("data-calc");
          calcBtn.textContent = _label;
          calcBtn.style.opacity = "";
          calcBtn.style.cursor = "";
          // Актуальную доступность вернёт общий валидатор — он же учтёт,
          // что за время расчёта пользователь мог что-то поменять.
          renderProgress();
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
// Средняя ставка по набору экранов — ровно среднее screenBid() по каждому.
//
// Раньше в рекомендованном режиме здесь усреднялись ТОЛЬКО экраны с recoBid, а
// экраны без него в среднее не попадали вовсе. Если recoBid есть у трети набора,
// средняя выходила по этой трети и применялась ко всем: на наборе 3×12 ₽ + 4×5 ₽
// расчёт брал ставку 12 вместо 8 и занижал выходы на треть. Медиаплан при этом
// считал по каждому экрану отдельно — отсюда и расхождение между сводкой на
// экране и выгрузкой, из-за которого «выходы × ставка» не сходилось с бюджетом.
// Вес экрана — число выбранных длительностей, которые он поддерживает
// (см. applySelectedDurations): экран под два ролика идёт в среднюю как два.
// Средняя ставка плана, взвешенная по ВЫХОДАМ экрана, а не по самому экрану.
// Пока все экраны крутились с одной частотой, разницы не было — множитель
// сокращался. Но у медиафасада планка 8 вых/час против 40 у щита, и средняя
// «по экранам» стала врать: выход щита за 11 ₽ считался по средней 365 ₽, и
// бюджет плана раздувался втрое. Метку _pphUsed ставит расчёт на выбранных
// экранах; здесь она и читается — в средние по пулу её пускать нельзя, там
// экраны не выбраны и метка осталась бы от прошлого прохода.
function playWeightedBid(screens, brief) {
  let sum = 0, weight = 0;
  for (const s of (screens || [])) {
    const b = screenBid(s, brief);
    if (!Number.isFinite(b) || b <= 0) continue;
    const wDur = Number.isFinite(s?._durSlots) && s._durSlots > 0 ? s._durSlots : 1;
    const wPph = Number.isFinite(s?._pphUsed) && s._pphUsed > 0 ? s._pphUsed : 1;
    sum += b * wDur * wPph;
    weight += wDur * wPph;
  }
  return weight ? sum / weight : null;
}

function avgEffectiveBid(screens, bidMode, fallback, uplift = 1) {
  const brief = { bidMode, bidUpliftPct: 0 };   // надбавку домножаем ниже, как и раньше
  let sum = 0, weight = 0;
  for (const s of (screens || [])) {
    const b = screenBid(s, brief);
    if (!Number.isFinite(b) || b <= 0) continue;
    const w = Number.isFinite(s?._durSlots) && s._durSlots > 0 ? s._durSlots : 1;
    sum += b * w;
    weight += w;
  }
  if (!weight) return fallback * uplift;
  return (sum / weight) * uplift;
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

// ============================================================================
// ЧЕРНОВИК БРИФА
// ----------------------------------------------------------------------------
// Сборка брифа занимает десятки минут, а любая перезагрузка страницы стирала
// всё: регионы, даты, форматы, разбивку бюджета по городам, нарисованную зону.
// История расчётов страхует только после успешного «Рассчитать» — до него не
// было ничего. Черновик пишется на каждое изменение (с дебаунсом) и предлагается
// к восстановлению одной кнопкой, а не подставляется молча: осознанный «начать
// с чистого листа» тоже сценарий.
// ============================================================================
const DRAFT_DEBOUNCE_MS = 800;
let _draftTimer = null;
let _draftRestoring = false;

function _draftKey() {
  const email = getDspUserEmail();
  const safe = email ? normalizeKey(email).replace(/[^a-z0-9._@-]/gi, "_") : "anon";
  return `planner_draft_${safe}`;
}

// В brief не попадают операторы, зона на карте, стороны экрана и форматы по
// городам — они живут прямо в state. Сохраняем их рядом.
function _draftExtras() {
  return {
    owners:  state.selectedOwners ? [...state.selectedOwners] : [],
    polygon: state.polygonFilter || null,
    sides:   state.selectedSides ? [...state.selectedSides] : [],
    photoReport: state.selectedPhotoReport ? [...state.selectedPhotoReport] : [],
    cityFormats: state.cityFormats
      ? Object.fromEntries(Object.entries(state.cityFormats).map(([k, v]) => [k, [...v]]))
      : null,
  };
}

function saveDraft() {
  if (_draftRestoring) return;
  try {
    const brief = buildBrief();
    const hasRegions = (brief.geo?.regions || []).length > 0;
    const hasGids    = (brief.selection?.manual_gids || []).length > 0;
    // Пустую форму не сохраняем — иначе баннер вылезал бы на ровном месте.
    if (!hasRegions && !hasGids && !brief.dates?.start) { clearDraft(); return; }
    localStorage.setItem(_draftKey(), JSON.stringify({
      v: 1,
      ts: new Date().toISOString(),
      brief,
      extras: _draftExtras(),
    }));
  } catch (e) {
    // Приватный режим или переполненное хранилище — не повод ронять виджет.
    console.warn("[draft] не удалось сохранить:", e?.message || e);
  }
}

function scheduleDraftSave() {
  clearTimeout(_draftTimer);
  _draftTimer = setTimeout(saveDraft, DRAFT_DEBOUNCE_MS);
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(_draftKey());
    if (!raw) return null;
    const d = JSON.parse(raw);
    return (d && d.v === 1 && d.brief) ? d : null;
  } catch (e) { return null; }
}

function clearDraft() {
  try { localStorage.removeItem(_draftKey()); } catch (e) {}
}

async function restoreDraft(draft) {
  if (!draft?.brief) return;
  _draftRestoring = true;
  try {
    // Операторы/зону/стороны выставляем до брифа: renderFormats и превью пула
    // внутри restoreBriefToUI считаются уже с учётом этих фильтров.
    const ex = draft.extras || {};
    if (Array.isArray(ex.owners))  state.selectedOwners = new Set(ex.owners);
    if (Array.isArray(ex.sides))   state.selectedSides  = new Set(ex.sides);
    if (Array.isArray(ex.photoReport)) state.selectedPhotoReport = new Set(ex.photoReport);
    state.polygonFilter = ex.polygon || null;
    if (ex.cityFormats) {
      state.cityFormats = {};
      for (const [k, v] of Object.entries(ex.cityFormats)) state.cityFormats[k] = new Set(v);
    }

    restoreBriefToUI(draft.brief);

    if (typeof window.renderOwners === "function") window.renderOwners();
    window.dispatchEvent(new CustomEvent("planner:filters-changed"));
    window.dispatchEvent(new CustomEvent("planner:polygon-changed"));
  } finally {
    // Восстановление рассылает те же события, что и правки пользователя;
    // снимаем флаг следующим тиком, чтобы они не перезаписали черновик.
    setTimeout(() => { _draftRestoring = false; }, 0);
  }
}

window.PLANNER.saveDraft    = saveDraft;
window.PLANNER.loadDraft    = loadDraft;
window.PLANNER.clearDraft   = clearDraft;
window.PLANNER.restoreDraft = restoreDraft;
window.PLANNER.scheduleDraftSave = scheduleDraftSave;

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
  // Чекбоксы сегментов рисуются только после загрузки данных ВК, а она теперь
  // ленивая — на момент восстановления их в DOM ещё нет. Запоминаем выбор и
  // применяем, когда сегменты отрисуются (см. applyPendingAudienceSegments).
  state._pendingAudienceSegments = Array.isArray(brief.audience?.segments)
    ? [...brief.audience.segments] : null;
  _check("audience-enabled", brief.audience?.enabled);
  _chip("vk-affinity-card", brief.audience?.enabled);
  applyPendingAudienceSegments();
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

  // 12. Длительность ролика (может быть несколько)
  const durList = Array.isArray(brief.duration?.msList) && brief.duration.msList.length
    ? brief.duration.msList
    : (Number(brief.duration?.ms) > 0 ? [Number(brief.duration.ms)] : []);
  state.durationsByFormat = { ...(brief.duration?.byFormat || {}) };
  if (durList.length) {
    state.selectedDurationsMs = [...durList];
    state.selectedDurationMs = durList[durList.length - 1];
    if (typeof window.renderDurationChips === "function") window.renderDurationChips();
  }
  if (typeof window.renderDurFmtRows === "function") window.renderDurFmtRows();

  if (typeof window.renderProgress === "function") window.renderProgress();
  if (typeof window.setStep === "function") window.setStep(1);
}

// Корзины, по которым считаются и уровни бюджета, и сумма под заданную частоту.
// Обе подсказки на шаге «Цели» обязаны видеть один и тот же набор экранов,
// иначе показанное расходится с тем, что потом посчитает расчёт.
function _budgetBuckets() {
  const sourceScreens = (Array.isArray(state.screensAll) && state.screensAll.length)
    ? state.screensAll : (Array.isArray(state.screens) ? state.screens : []);
  if (!sourceScreens.length) return null;

  const brief = buildBrief();
  const regions = Array.isArray(brief?.geo?.regions) ? brief.geo.regions : [];

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


  // Корзина — единица, для которой считается свой потолок и свой тир.
  // Обычный режим: выбранный регион. GID-режим: город экранов из списка.
  // key   — по нему берётся тир,
  // all   — весь инвентарь этого города/региона (основание для тира),
  // pool  — то, что реально доступно под фильтры и ставки (основание
  //         для потолка). Смешивать нельзя: выбор одного формата ронял бы
  //         регион в младший тир и занижал рекомендацию.
  // inAp  — принадлежность экрана корзине, для пересечения с фиксацией.
  const buckets = [];
  const gidSet = (brief.selection?.mode === "manual_screens" && brief.selection.manual_gids)
    ? brief.selection.manual_gids : null;

  if (gidSet && gidSet.size) {
    // Города считаем по тому же ключу, что и разбивка расчёта в GID-режиме.
    const cityKey = (s) => String(s.city || s.region || "\u2014").trim() || "\u2014";
    const поГороду = new Map();
    for (const s of sourceScreens) {
      const k = cityKey(s);
      let b = поГороду.get(k);
      if (!b) { b = { all: [], picked: [] }; поГороду.set(k, b); }
      b.all.push(s);
      if (gidSet.has(_screenIdOf(s))) b.picked.push(s);
    }
    // Под одним GID-ом бывает несколько экранов. Расчёт берёт ровно один —
    // выбранный пользователем, а при молчании отсеивает технический аккаунт.
    // Здесь должно быть то же, иначе и уровни бюджета, и сумма под частоту
    // считались бы по дублям и завышали план.
    const _real = gidsWithRealOwner(gidSet);
    const _picks = state.gidPicks || {};
    const оставить = (list) => {
      const seen = new Set();
      const out = [];
      for (const sc of list) {
        const id = _screenIdOf(sc);
        if (seen.has(id)) continue;
        if (isTechnicalOwner(sc) && _real.has(id)) continue;
        const выбран = _picks[id];
        if (выбран && gidVariantKey(sc) !== выбран) continue;
        seen.add(id);
        out.push(sc);
      }
      return out;
    };
    for (const [k, b] of поГороду) {
      if (!b.picked.length) continue;
      // Фильтры форматов и операторов на сами GID-экраны не влияют —
      // ровно как в расчёте: список задан вручную и уважается целиком.
      const picked = new Set(b.picked);
      // Ставку оцениваем так же, как расчёт, и hasActiveInventory здесь не
      // применяем: в GID-режиме расчёт его не применяет вовсе, а у части
      // экранов нулевой requestHourlyAvg — они выпадали и из уровней бюджета,
      // хотя в плане будут.
      const свои = withEstimatedBids(оставить(b.picked));
      if (!свои.length) continue;
      buckets.push({ key: k, all: b.all,
        pool: свои,
        poolAll: свои,
        inAp: (s) => picked.has(s) });
    }
  } else {
    if (!regions.length) return null;
    for (const region of regions) {
      const key = typeof region === "string" ? region : (region?.city || region?.region || "");
      const all = sourceScreens.filter(s => screenMatchesGeoChoice(s, region));
      let pool = all;
      if (formatsMode === "manual" && manualFormats.size > 0) {
        pool = pool.filter(s => manualFormats.has(s.format));
      }
      buckets.push({ key, all, pool: pool.filter(hasActiveInventory),
        poolAll: withEstimatedBids(pool),
        inAp: (s) => screenMatchesGeoChoice(s, region) });
    }
  }
  if (!buckets.length) return null;
  return { brief, days, hpd, buckets };
}

// Сумма под заданную вручную частоту: экраны x часы x частота x ставка — ровно
// той же формулой, какой её считает расчёт, с настоящим потолком каждого
// носителя (медиафасад чаще 8 раз в час не крутит).
function computeFreqBudget() {
  const ctx = _budgetBuckets();
  if (!ctx) return null;
  const { brief, days, hpd, buckets } = ctx;
  const pph = Number(brief.constructions?.playsPerHour || 0);
  const hours = days * hpd;
  if (!(pph > 0) || !(hours > 0)) return null;

  let sum = 0, screens = 0, capped = 0;
  for (const bucket of buckets) {
    // Расчёт выбрасывает экраны без ставки только при включённом «Только
    // активные» — уровни бюджета режут их всегда, и подсказка по их пулу
    // показывала 4 экрана там, где расчёт возьмёт 6.
    const список = brief.onlyActiveBids ? bucket.pool : (bucket.poolAll || bucket.pool);

    // Экран без своей ставки оцениваем средней ЭФФЕКТИВНОЙ ставкой его
    // формата, а не средним minBid: к сборке плана расчёт уже знает прогноз
    // аукциона, а он у медиафасадов много выше minBid x 1.8. Из-за этого
    // подсказка показывала 3,1 млн там, где расчёт давал 5,9 млн — вся
    // разница сидела в двух фасадах без ставки.
    const поФормату = new Map();
    let общаяСумма = 0, общаяШт = 0;
    for (const s of список) {
      if (s._bidEstimated) continue;
      const b = screenBid(s, brief);
      if (!Number.isFinite(b) || b <= 0) continue;
      const k = String(s.format || "");
      const acc = поФормату.get(k) || { sum: 0, n: 0 };
      acc.sum += b; acc.n++; поФормату.set(k, acc);
      общаяСумма += b; общаяШт++;
    }
    const средняяСтавка = (s) => {
      const acc = поФормату.get(String(s.format || ""));
      if (acc && acc.n) return acc.sum / acc.n;
      return общаяШт ? общаяСумма / общаяШт : 0;
    };

    for (const s of список) {
      const bid = s._bidEstimated ? средняяСтавка(s) : screenBid(s, brief);
      if (!Number.isFinite(bid) || bid <= 0) continue;
      const own = Math.min(pph, getScreenPphCap(s));
      if (own < pph) capped++;
      sum += own * bid * hours;
      screens++;
    }
  }
  if (!screens) return null;
  return {
    budget: Math.round(sum), screens, pph, capped,
    hours: Math.round(hours * 10) / 10,
  };
}

function computeRecoBudgetTiers() {
  const ctx = _budgetBuckets();
  if (!ctx) return null;
  const { brief, days, hpd, buckets } = ctx;

  const tiersUsed = new Set();
  let totalMin = 0, totalOpt = 0, totalMax = 0;

  // Максимум — это вся ёмкость адресной программы: 30 вых/час на экран
  // (8 для медиафасадов) по выбранной ставке. База — только зафиксированная
  // программа либо, когда фиксации нет, доступный пул. Запасной путь через
  // lastChosen убран: он давал базу, которая едет. Расчёт на минимуме
  // отбирает меньше экранов, база от них становится меньше, минимум падает,
  // следующий расчёт отбирает ещё меньше — и так без дна. Ровно это и
  // происходило после «Пересобрать адреску», где ждут как раз пул.
  //
  // Считается один раз: это перебор всего инвентаря, а корзин бывает десяток.
  const frozen = (state.apFrozenIds && state.apFrozenIds.size && Array.isArray(state.screensAll))
    ? state.screensAll.filter(s => state.apFrozenIds.has(_screenIdOf(s)))
    : null;

  for (const bucket of buckets) {
    const pool = bucket.pool;
    if (!pool.length) continue;

    const tier = getTierForGeo(bucket.key, bucket.all);
    const apForRegion = frozen ? frozen.filter(bucket.inAp) : null;
    const capBase = (apForRegion && apForRegion.length) ? apForRegion : pool;

    const capBudget = computeCapacity(capBase, days * hpd, brief.bidMode, bidUpliftFactor(brief))?.budget;
    if (!Number.isFinite(capBudget) || capBudget <= 0) continue;

    tiersUsed.add(tier);
    const share   = TIER_SHARE[tier] || TIER_SHARE.C;
    const max     = Math.floor(capBudget);
    const optimal = Math.floor(capBudget * share.opt);
    const min     = Math.floor(capBudget * share.min);

    totalMin += min;
    totalOpt += optimal;
    totalMax += max;
  }

  if (totalOpt === 0) return null;
  // Тир отдаём только когда он один на весь план: при нескольких регионах
  // доли смешаны и называть одну буквой было бы враньём.
  return {
    min: totalMin, optimal: totalOpt, max: totalMax,
    tier: tiersUsed.size === 1 ? [...tiersUsed][0] : null,
  };
}

window.PLANNER = window.PLANNER || {};
window.PLANNER.pointInPolygon = pointInPolygon;
window.PLANNER.saveCalcToHistory = saveCalcToHistory;
window.PLANNER.restoreBriefToUI = restoreBriefToUI;
window.PLANNER.buildMediaPlanBlob = buildMediaPlanBlob;
window.PLANNER.computeRecoBudgetTiers = computeRecoBudgetTiers;
window.PLANNER.computeFreqBudget = computeFreqBudget;
window.PLANNER.findAmbiguousGids = findAmbiguousGids;
window.PLANNER.unresolvedGids = unresolvedGids;
window.PLANNER.gidVariantKey = gidVariantKey;
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
    : `<span style="color:#4b5563;">DSP</span>`;
  bar.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:6px;background:#f0f2f5;border-radius:20px;padding:4px 6px 4px 8px;font-size:12px;line-height:1;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#888" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
      ${emailHtml}
      <span id="dsp-inv-age" style="color:#4b5563;font-size:11px;white-space:nowrap;"></span>
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

    // Настоящая <form> с name/autocomplete — иначе менеджеры паролей не
    // предлагают ни сохранить, ни подставить логин, а входить приходится
    // руками в каждой новой вкладке.
    overlay.innerHTML = `
      <form id="dsp-login-form" method="post" action="#" autocomplete="on"
            role="dialog" aria-modal="true" aria-labelledby="dsp-login-title"
            style="background:#fff;border-radius:20px;padding:40px 36px;width:340px;max-width:90vw;
                   box-sizing:border-box;
                   box-shadow:0 24px 64px rgba(0,0,0,.22);">
        <div id="dsp-login-title" style="font-size:22px;font-weight:700;margin-bottom:6px;color:#0b1220;">Вход</div>
        <div style="font-size:13px;color:#667085;margin-bottom:24px;">
          Тот же логин и пароль, что в кабинете DSP
        </div>
        <input id="dsp-email" name="username" type="email" placeholder="Email" aria-label="Email"
               autocomplete="username" autocapitalize="none" spellcheck="false" required
               style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #e0e0e0;
                      border-radius:10px;font-size:14px;margin-bottom:10px;">
        <input id="dsp-password" name="password" type="password" placeholder="Пароль" aria-label="Пароль"
               autocomplete="current-password" required
               style="width:100%;box-sizing:border-box;padding:12px 14px;border:1.5px solid #e0e0e0;
                      border-radius:10px;font-size:14px;margin-bottom:16px;">
        <div id="dsp-err" role="alert" style="color:#e53e3e;font-size:13px;min-height:18px;margin-bottom:10px;"></div>
        <button id="dsp-login-btn" type="submit"
                style="width:100%;padding:13px;background:#5b3ef5;color:#fff;border:none;
                       border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;">
          Войти
        </button>
        <div style="margin-top:16px;font-size:12px;color:#667085;text-align:center;line-height:1.5;">
          Забыли пароль — восстановить можно
          <a href="${DSP_API}" target="_blank" rel="noopener"
             style="color:#5b3ef5;text-decoration:underline;">в кабинете DSP</a>
        </div>
      </form>
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

    // submit покрывает и клик по кнопке, и Enter в любом поле, и автозаполнение
    // из менеджера паролей. preventDefault — чтобы страница не перезагружалась.
    overlay.querySelector("#dsp-login-form").addEventListener("submit", e => {
      e.preventDefault();
      doLogin();
    });
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
    // Передача фотоотчёта и дата последнего фото — на них строится фильтр ФО.
    photoReportOption: String(inv.photoReportOption ?? "").trim().toUpperCase(),
    lastShotTime: Number.isFinite(Number(inv.lastShotTime)) ? Number(inv.lastShotTime) : NaN,
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
// выбранные длительности. Идемпотентно: всегда читает из исходных
// durationBidInfo/_baseRecoBid, а не из уже перезаписанных .minBid/.recoBid.
//
// Несколько длительностей. Экран, поддерживающий два выбранных ролика, для
// расчёта ставки считается за два экрана: его ставка входит в среднюю дважды —
// по цене каждого ролика. В адресной программе и в «Кол-ве экранов» он при этом
// остаётся одним экраном. Реализовано так: ставка экрана = среднее по его
// подходящим длительностям, а вес в средней = число этих длительностей
// (s._durSlots), который учитывает avgEffectiveBid.
function applySelectedDurations(durationsMs) {
  const globalList = (Array.isArray(durationsMs) ? durationsMs : [durationsMs])
    .map(Number).filter(v => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b);
  state.selectedDurationsMs = globalList;
  // Одиночное значение оставляем для мест, которым нужна одна длительность
  // (подпись в медиаплане, восстановление черновика): берём самую длинную.
  state.selectedDurationMs = globalList.length ? globalList[globalList.length - 1] : null;

  for (const arr of [state.screensAll, state.screens]) {
    if (!Array.isArray(arr)) continue;
    for (const s of arr) {
      if (!Array.isArray(s.durationBidInfo) || !s.durationBidInfo.length) continue;
      if (!Number.isFinite(s._baseMinBid)) s._baseMinBid = s.minBid;

      // Формату можно задать свою длительность: билборды берём 5-секундные,
      // медиафасады 15-секундные. Если для формата ничего не задано,
      // работает общий выбор.
      const perFmt = state.durationsByFormat?.[String(s.format || "").trim()];
      const list = (Array.isArray(perFmt) && perFmt.length) ? perFmt : globalList;

      if (!list.length) {
        s.minBid = s._baseMinBid;
        if (Number.isFinite(s._baseRecoBid)) s.recoBid = s._baseRecoBid;
        s._durSlots = 1;
        continue;
      }

      // Разные выбранные длительности могут разрешиться в одну и ту же реальную
      // (nearest-match) — тогда это по-прежнему один слот, а не два.
      const matched = new Map();
      for (const ms of list) {
        const m = _resolveDurationMatch(s, ms);
        if (m && Number.isFinite(m.minBid) && m.minBid > 0) matched.set(m.duration, m.minBid);
      }
      const bids = [...matched.values()];
      if (!bids.length) {
        s.minBid = s._baseMinBid;
        if (Number.isFinite(s._baseRecoBid)) s.recoBid = s._baseRecoBid;
        s._durSlots = 1;
        continue;
      }
      const avg = bids.reduce((a, b) => a + b, 0) / bids.length;
      s.minBid = avg;
      s._durSlots = bids.length;
      if (Number.isFinite(s._baseRecoBid)) {
        const base = Number.isFinite(s._baseMinBid) && s._baseMinBid > 0 ? s._baseMinBid : avg;
        s.recoBid = s._baseRecoBid * (avg / base);
      }
    }
  }
}

// Совместимость: старое имя принимает одно значение.
function applySelectedDuration(durationMs) {
  applySelectedDurations(durationMs ? [durationMs] : []);
}
window.PLANNER = window.PLANNER || {};
window.PLANNER.applySelectedDuration  = applySelectedDuration;
window.PLANNER.applySelectedDurations = applySelectedDurations;

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
// Версия формата экрана в кэше. Добавили поле — подняли номер, и запись
// прошлого формата выбрасывается вместо того, чтобы сутки отдавать экраны
// без нового поля и молча ломать фильтр по нему.
const DSP_CACHE_SCHEMA = 2;

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
      tx.objectStore(DSP_IDB_STORE).put({ ts: Date.now(), v: DSP_CACHE_SCHEMA, d: cityCache }, key);
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
    if (rec.v !== DSP_CACHE_SCHEMA) {
      console.log("[DSP] IDB cache: формат экрана изменился, перечитываю инвентарь");
      const dbOld = await _openIdb();
      const txOld = dbOld.transaction(DSP_IDB_STORE, "readwrite");
      txOld.objectStore(DSP_IDB_STORE).delete(key);
      dbOld.close();
      return null;
    }
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
    // Режим без авторизации больше не поддерживается: снимок инвентаря
    // inventories_sync.csv удалён как устаревший — он был от 21.06.2026 и
    // отставал от живого инвентаря DSP примерно на 8 тысяч экранов.
    setStatus("Планировщик работает только с авторизацией в DSP.");
    throw new Error("DSP_AUTH_ENABLED=false не поддерживается: снимок инвентаря удалён");
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

// Данные ВК больше не грузятся автоматически — только по включению фильтра
// «Аудитория VK» (ensureAffinityLoaded выше). См. обработчик в widget-init.js.

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
  if (!pts.length) { toast("Ни у одного экрана нет координат — карту не построить."); return; }

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
  freezeAp,
  unfreezeAp,
  isApFrozen,
  downloadMapHtml,
  buildMapHtml,
});
