console.log("planner.js loaded");

// ========== GLOBAL (single source) ==========
(function () {
  "use strict";

  window.PLANNER = window.PLANNER || {};

  // ====== CONSTS / URLS ======
  const REF = "planner";

  const SCREENS_CSV_URL =
    "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@24ada9ff4b42b7426b4c954e8b7bebc97efed72c/inventories_sync.csv?v=" +
    Date.now();

  const TIERS_JSON_URL =
    "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@8684fb51e3081987ae494eaaf5bacbd7b5e47160/tiers_v1.json?v=" +
    Date.now();

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

  // Export labels for Tilda UI
  window.PLANNER.FORMAT_LABELS = FORMAT_LABELS;
  window.PLANNER.ui = window.PLANNER.ui || {};
  window.PLANNER.ui.photosAllowed = false;

  // optional global alias
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
  const RECO_HOURS_PER_DAY = 12;

  // ===== State (single truth) =====
  const state = {
    screens: [],
    citiesAll: [],
    formatsAll: [],

    regionsAll: [],
    regionsByCity: {},

    unknownCities: [],
    unknownCitiesTop: [],

    selectedFormats: new Set(),

    // ✅ multi-region source of truth
    selectedRegions: new Set(),

    // legacy single-region (read-only semantics)
    selectedRegion: null,

    lastChosen: []
  };

  // Freeze the state reference on window.PLANNER (prevents overwrite)
  if (!window.PLANNER.state) {
    Object.defineProperty(window.PLANNER, "state", {
      value: state,
      writable: false,
      configurable: false,
      enumerable: true
    });
  } else {
    // If someone already created PLANNER.state, reuse it but ensure fields exist
    // (important if you reload script in Tilda preview)
    const st = window.PLANNER.state;
    st.screens = st.screens || [];
    st.citiesAll = st.citiesAll || [];
    st.formatsAll = st.formatsAll || [];
    st.regionsAll = st.regionsAll || [];
    st.regionsByCity = st.regionsByCity || {};
    st.selectedFormats = st.selectedFormats instanceof Set ? st.selectedFormats : new Set(st.selectedFormats || []);
    st.selectedRegions = st.selectedRegions instanceof Set ? st.selectedRegions : new Set(st.selectedRegions || []);
    st.selectedRegion = st.selectedRegion || null;
    st.lastChosen = st.lastChosen || [];
  }

  // convenient console alias
  window.state = window.PLANNER.state;

// ===== HARDEN legacy selectedRegion so it DOES NOT override selectedRegions =====
(function hardenSelectedRegionLegacy() {
  const st = window.PLANNER?.state || state;

  // Храним legacy значение отдельно, но не используем его как источник истины
  let _legacySelectedRegion = null;

  Object.defineProperty(st, "selectedRegion", {
    configurable: false,
    enumerable: true,
    get() {
      // для совместимости: показываем "первый выбранный", если есть
      const set = st.selectedRegions instanceof Set ? st.selectedRegions : new Set();
      if (set.size) return [...set][0];
      return _legacySelectedRegion;
    },
    set(v) {
      const val = String(v || "").trim();
      _legacySelectedRegion = val || null;

      // ✅ КЛЮЧЕВОЕ: любая запись в selectedRegion теперь = add в selectedRegions
      ensureSelectedRegionsSet();
      if (val) st.selectedRegions.add(val);

      // ничего не очищаем!
    }
  });

  // На всякий случай: если где-то уже было значение
  if (_legacySelectedRegion) {
    ensureSelectedRegionsSet();
    st.selectedRegions.add(_legacySelectedRegion);
  }
})();

  
  // ===== Hard guarantee: selectedRegions is ALWAYS a Set =====
  function ensureSelectedRegionsSet() {
    const st = window.PLANNER.state;

    // if missing or wrong type -> restore
    let restored;
    if (st.selectedRegions instanceof Set) restored = st.selectedRegions;
    else if (Array.isArray(st.selectedRegions)) restored = new Set(st.selectedRegions);
    else if (typeof st.selectedRegions === "string" && st.selectedRegions.trim()) restored = new Set([st.selectedRegions.trim()]);
    else restored = new Set();

    // Lock the property against reassignment (but Set can be mutated)
    try {
      Object.defineProperty(st, "selectedRegions", {
        value: restored,
        writable: false,
        configurable: false,
        enumerable: true
      });
    } catch (e) {
      // If already non-configurable, ignore
    }

    // legacy mirror
    st.selectedRegion = restored.size ? [...restored][0] : null;

    return restored;
  }

  window.PLANNER.ensureSelectedRegionsSet = ensureSelectedRegionsSet;
  ensureSelectedRegionsSet();

  console.log(
    "[planner] selectedRegions init:",
    window.PLANNER.state.selectedRegions,
    "isSet=",
    window.PLANNER.state.selectedRegions instanceof Set
  );

(function hardenSelectedRegionsNoReassign() {
  const st = window.PLANNER?.state || state;
  const restored = ensureSelectedRegionsSet();

  // если уже было defineProperty ранее — пропусти
  try {
    Object.defineProperty(st, "selectedRegions", {
      value: restored,
      writable: false,      // ✅ нельзя переassign
      configurable: false,
      enumerable: true
    });
  } catch (e) {
    // если уже зафиксировано — ок
  }
})();
  
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

  function getScheduleType() {
    // expected: all_day | peak | custom
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

  // ===== Regions UI (multi-select) =====
  function syncLegacySelectedRegion() {
    const set = ensureSelectedRegionsSet();
    window.PLANNER.state.selectedRegion = set.size ? [...set][0] : null;
  }

  function normalizeRegionName(input) {
    const v = String(input || "").trim();
    if (!v) return "";
    const found = (window.PLANNER.state.regionsAll || []).find(r => r.toLowerCase() === v.toLowerCase());
    return found || v;
  }

  function renderSelectedRegions() {
    const wrap = el("region-selected");
    if (!wrap) return;

    const set = ensureSelectedRegionsSet();
    const arr = [...set];

    wrap.innerHTML = "";

    if (arr.length === 0) {
      wrap.innerHTML = `<div style="font-size:12px; color:#666;">Регион не выбран</div>`;
      syncLegacySelectedRegion();
      return;
    }

    arr.forEach((region) => {
      const chip = document.createElement("button");
      cssButtonBase(chip);
      chip.type = "button";
      chip.style.display = "inline-flex";
      chip.style.alignItems = "center";
      chip.style.gap = "6px";
      chip.textContent = "✕ " + region;

      chip.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        set.delete(region);
        syncLegacySelectedRegion();
        renderSelectedRegions();
        window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      });

      wrap.appendChild(chip);
    });

    syncLegacySelectedRegion();
  }

  function renderRegionSuggestions(q) {
    const sug = el("city-suggestions");
    if (!sug) return;

    sug.innerHTML = "";
    const qq = String(q || "").trim().toLowerCase();
    if (!qq) return;

    const set = ensureSelectedRegionsSet();

    const matches = (window.PLANNER.state.regionsAll || [])
      .filter(r => String(r).toLowerCase().includes(qq))
      .slice(0, 12);

    matches.forEach(r => {
      const b = document.createElement("button");
      cssButtonBase(b);
      b.type = "button";
      b.textContent = (set.has(r) ? "✓ " : "+ ") + r;

      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (set.has(r)) set.delete(r);
        else set.add(r);

        const inp = el("city-search");
        if (inp) inp.value = "";
        sug.innerHTML = "";

        syncLegacySelectedRegion();
        renderSelectedRegions();
        window.dispatchEvent(new CustomEvent("planner:filters-changed"));
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

    const st = window.PLANNER.state;

    st.screens = rows.map(r => {
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

    st.citiesAll = [...new Set(st.screens.map(s => s.city).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "ru"));

    st.formatsAll = [...new Set(st.screens.map(s => s.format).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));

    // regionsByCity + regionsAll
    st.regionsByCity = {};
    const regionsSet = new Set();

    for (const c of st.citiesAll) {
      const reg = getRegionForCity(c);
      st.regionsByCity[c] = reg;
      regionsSet.add(reg);
    }

    st.regionsAll = [...regionsSet].sort((a, b) => a.localeCompare(b, "ru"));

    // set region for each screen
    for (const s of st.screens) {
      s.region = st.regionsByCity[s.city] || "Не назначено";
    }

    renderFormats();
    renderSelectedRegions();

    setStatus(
      `Всего доступно: Экранов: ${st.screens.length}. ` +
      `Городов: ${st.citiesAll.length}. ` +
      `Форматов: ${st.formatsAll.length}. ` +
      `Регионов: ${st.regionsAll.length}.`
    );

    window.PLANNER.ready = true;
    window.dispatchEvent(new CustomEvent("planner:screens-ready", { detail: { count: st.screens.length } }));
  }

  // ===== UI: formats =====
  function renderFormats() {
    const wrap = el("formats-wrap");
    if (!wrap) return;
    wrap.innerHTML = "";

    const st = window.PLANNER.state;

    st.formatsAll.forEach(fmt => {
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

      const sync = () => { b.style.borderColor = st.selectedFormats.has(fmt) ? "#111" : "#ddd"; };
      sync();

      b.addEventListener("click", () => {
        if (el("formats-auto")?.checked) return;
        if (st.selectedFormats.has(fmt)) st.selectedFormats.delete(fmt);
        else st.selectedFormats.add(fmt);
        sync();
      });

      wrap.appendChild(b);
    });
  }

  // ===== Brief =====
  function buildBrief() {
    const root = document.getElementById("planner-widget") || document;

    const budgetMode = getBudgetMode();
    const budgetVal = el("budget-input")?.value;

    const scheduleType = getScheduleType();
    const timeFrom = el("time-from")?.value;
    const timeTo = el("time-to")?.value;

    const selectionMode = el("selection-mode")?.value || "city_even";

    // ✅ regions (multi)
    const regions = [...ensureSelectedRegionsSet()]
      .map(r => String(r || "").trim())
      .filter(Boolean);

    const st = window.PLANNER.state;

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
      geo: { regions },
      formats: {
        mode: el("formats-auto")?.checked ? "auto" : "manual",
        selected: el("formats-auto")?.checked ? [] : [...st.selectedFormats]
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

  function pickScreensUniformByGrid(pool, count, stepKm = 2) {
    const cells = groupByGrid(pool, stepKm);

    for (const cell of cells) {
      cell.sort((a, b) => (a.minBid ?? 1e18) - (b.minBid ?? 1e18));
    }

    cells.sort(() => Math.random() - 0.5);

    const result = [];
    let i = 0;
    while (result.length < count && cells.length) {
      const cell = cells[i % cells.length];
      if (cell.length) result.push(cell.shift());
      i++;
    }

    if (result.length < count) {
      const picked = new Set(result);
      const rest = pool.filter(s => !picked.has(s));
      result.push(...pickScreensByMinBid(rest, count - result.length));
    }

    return result.slice(0, count);
  }

 // ================== MULTI-REGION BUDGET ==================
function tierWeight(t) {
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

function allocateBudgetAcrossRegions(total, regions, opts = {}) {
  if (!regions.length) return [];

  const minShare = opts.minShare ?? 0.1;
  const maxShare = opts.maxShare ?? 0.7;

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

  const sumShares = items.reduce((a, b) => a + b.share, 0) || 1;
  items.forEach(i => i.share /= sumShares);

  let out = items.map(i => ({
    region: i.region,
    budget: Math.floor(total * i.share)
  }));

  // fix rounding
  let diff = total - out.reduce((a, b) => a + b.budget, 0);
  let k = 0;
  while (diff !== 0 && k < 10000) {
    const i = k % out.length;
    out[i].budget += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
    k++;
  }

  return out;
}

// ================== MAIN CALC ==================
async function onCalcClick() {
  const brief = buildBrief();

  if (!brief.dates.start || !brief.dates.end) {
    alert("Выберите даты");
    return;
  }

  const regions = brief.geo.regions;
  if (!regions.length) {
    alert("Выберите регион(ы)");
    return;
  }

  const days = daysInclusive(brief.dates.start, brief.dates.end);
  const hpd = brief.budget.mode === "fixed"
    ? hoursPerDay(brief.schedule)
    : RECO_HOURS_PER_DAY;

  let fixedAlloc = null;
  if (brief.budget.mode === "fixed") {
    fixedAlloc = allocateBudgetAcrossRegions(
      brief.budget.amount,
      regions.map(r => ({ key: r, tier: getTierForGeo(r) }))
    );
  }

  let chosenAll = [];
  let perRegion = [];
  let totalBudget = 0;
  let totalPlays = 0;
  let totalOts = 0;
  let hasOts = true;

  for (const region of regions) {
    const tier = getTierForGeo(region);

    let pool = state.screens.filter(s => s.region === region);
    if (!pool.length) continue;

    if (brief.formats.mode === "manual") {
      pool = pool.filter(s => brief.formats.selected.includes(s.format));
    }

    const avgBid = avgNumber(pool.map(s => s.minBid));
    if (!avgBid) continue;

    const bid = avgBid * BID_MULTIPLIER;
    let budget = 0;

    if (brief.budget.mode === "fixed") {
      budget = fixedAlloc.find(x => x.region === region)?.budget || 0;
    } else {
      const base = {
        M: 2000000, SP: 1500000, A: 1000000,
        B: 500000, C: 300000, D: 100000
      }[tier] || 300000;
      budget = Math.floor(base * (days / 30));
    }

    if (budget <= 0) continue;
    totalBudget += budget;

    const totalPlaysTheory = Math.floor(budget / bid);
    const playsPerHour = totalPlaysTheory / days / hpd;
    const screensNeeded = Math.max(1, Math.ceil(playsPerHour / SC_OPT));
    const chosen = pickScreensUniformByGrid(pool, screensNeeded, 2);

    const plays = Math.min(
      totalPlaysTheory,
      SC_MAX * chosen.length * days * hpd
    );

    const avgOts = avgNumber(pool.map(s => s.ots));
    const ots = avgOts ? plays * avgOts : null;
    if (!avgOts) hasOts = false;

    chosenAll.push(...chosen);
    totalPlays += plays;
    if (ots) totalOts += ots;

    perRegion.push({
      region,
      tier,
      budget,
      screens: chosen.length,
      plays,
      ots
    });
  }

  // dedupe screens
  const seen = new Set();
  chosenAll = chosenAll.filter(s => {
    if (seen.has(s.screen_id)) return false;
    seen.add(s.screen_id);
    return true;
  });

  state.lastChosen = chosenAll;

  window.dispatchEvent(new CustomEvent("planner:calc-done", {
    detail: { chosen: chosenAll, perRegion }
  }));

  renderPhotosCarousel(chosenAll);

  renderSummaryPretty({
    brief,
    perRegion,
    totals: {
      budget: totalBudget,
      plays: totalPlays,
      ots: hasOts ? totalOts : null,
      screens: chosenAll.length,
      days,
      hpd
    }
  });
}

// ================== PRETTY SUMMARY ==================
function renderSummaryPretty(data) {
  const elSum = el("summary");
  if (!elSum) return;

  const money = n => Number(n || 0).toLocaleString("ru-RU") + " ₽";
  const intf = n => Math.floor(n || 0).toLocaleString("ru-RU");

  const byRegions = data.perRegion.map(r => `
    <div style="border:1px solid #eee;border-radius:14px;padding:12px;">
      <div style="font-weight:900;font-size:16px;">${escapeHtml(r.region)}</div>
      <div style="color:#666;font-size:13px;margin-bottom:6px;">Tier ${r.tier}</div>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
        <div><b>${intf(r.screens)}</b><br><span style="font-size:12px;color:#666;">экранов</span></div>
        <div><b>${money(r.budget)}</b><br><span style="font-size:12px;color:#666;">бюджет</span></div>
        <div><b>${intf(r.plays)}</b><br><span style="font-size:12px;color:#666;">выходов</span></div>
        <div><b>${r.ots ? intf(r.ots) : "—"}</b><br><span style="font-size:12px;color:#666;">OTS</span></div>
      </div>
    </div>
  `).join("");

  elSum.innerHTML = `
    <div style="display:grid;gap:14px;">
      <div style="border:1px solid #eee;border-radius:16px;padding:14px;">
        <div style="font-weight:900;font-size:18px;">Сводка кампании</div>
        <div style="color:#666;font-size:13px;margin-bottom:10px;">
          ${data.brief.dates.start} → ${data.brief.dates.end}
        </div>

        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
          <div><b>${money(data.totals.budget)}</b><br><span style="font-size:12px;color:#666;">бюджет</span></div>
          <div><b>${intf(data.totals.screens)}</b><br><span style="font-size:12px;color:#666;">экранов</span></div>
          <div><b>${intf(data.totals.plays)}</b><br><span style="font-size:12px;color:#666;">выходов</span></div>
          <div><b>${data.totals.ots ? intf(data.totals.ots) : "—"}</b><br><span style="font-size:12px;color:#666;">OTS</span></div>
        </div>
      </div>

      <div style="display:grid;gap:12px;">
        ${byRegions}
      </div>
    </div>
  `;
}

// ================== UI BINDINGS ==================
function bindPlannerUI() {
  el("calc-btn")?.addEventListener("click", onCalcClick);

  el("city-search")?.addEventListener("input", e =>
    renderRegionSuggestions(e.target.value)
  );

  el("city-search")?.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    addRegion(e.target.value);
    e.target.value = "";
    renderSelectedRegions();
  });
}

// ================== START ==================
async function startPlanner() {
  bindPlannerUI();
  renderSelectionExtra();
  await loadTiers();
  await loadCityRegions();
  await loadScreens();
}

document.readyState === "loading"
  ? document.addEventListener("DOMContentLoaded", startPlanner)
  : startPlanner();
