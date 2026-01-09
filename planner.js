console.log("planner.js loaded");

// ========== GLOBAL (single source) ==========
(function () {
  "use strict";

  window.PLANNER = window.PLANNER || {};

  // ====== CONSTS / URLS ======
  var REF = "planner";

  var SCREENS_CSV_URL =
    "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@24ada9ff4b42b7426b4c954e8b7bebc97efed72c/inventories_sync.csv?v=" +
    Date.now();

  var TIERS_JSON_URL =
    "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@8684fb51e3081987ae494eaaf5bacbd7b5e47160/tiers_v1.json?v=" +
    Date.now();

  var CITY_REGIONS_URL =
    "https://cdn.jsdelivr.net/gh/EkaterinaMochalova/dspbov2.0@f6f96a16980cda4d7165e692526ef08f2cd0c22e/city_regions.json?v=" +
    Date.now();

  // ===== Labels =====
  var FORMAT_LABELS = {
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

  window.PLANNER.FORMAT_LABELS = FORMAT_LABELS;
  window.PLANNER.ui = window.PLANNER.ui || {};
  window.PLANNER.ui.photosAllowed = false;
  window.FORMAT_LABELS = window.FORMAT_LABELS || FORMAT_LABELS;

  // ===== POI (оставила как есть, но ES5) =====
  var POI_QUERIES = {
    fitness: [
      'nwr(area.a)["leisure"="fitness_centre"];',
      'nwr(area.a)["amenity"="gym"];',
      'nwr(area.a)["sport"="fitness"];',
      'nwr(area.a)["leisure"="sports_centre"]["sport"="fitness"];'
    ].join("\n"),
    pet_store: [
      'nwr(area.a)["shop"="pet"];',
      'nwr(area.a)["shop"="pet_grooming"];',
      'nwr(area.a)["amenity"="veterinary"];'
    ].join("\n"),
    supermarket: [
      'nwr(area.a)["shop"="supermarket"];',
      'nwr(area.a)["shop"="convenience"];',
      'nwr(area.a)["shop"="hypermarket"];'
    ].join("\n"),
    mall: ['nwr(area.a)["shop"="mall"];'].join("\n"),
    cafe: [
      'nwr(area.a)["amenity"="cafe"];',
      'nwr(area.a)["shop"="coffee"];'
    ].join("\n"),
    restaurant: [
      'nwr(area.a)["amenity"="restaurant"];',
      'nwr(area.a)["amenity"="fast_food"];',
      'nwr(area.a)["amenity"="food_court"];'
    ].join("\n"),
    pharmacy: ['nwr(area.a)["amenity"="pharmacy"];'].join("\n"),
    school: ['nwr(area.a)["amenity"="school"];'].join("\n"),
    university: [
      'nwr(area.a)["amenity"="university"];',
      'nwr(area.a)["amenity"="college"];'
    ].join("\n"),
    hospital: [
      'nwr(area.a)["amenity"="hospital"];',
      'nwr(area.a)["amenity"="clinic"];'
    ].join("\n"),
    gas_station: ['nwr(area.a)["amenity"="fuel"];'].join("\n"),
    bank: [
      'nwr(area.a)["amenity"="bank"];',
      'nwr(area.a)["amenity"="atm"];'
    ].join("\n"),
    transport: [
      'nwr(area.a)["public_transport"];',
      'nwr(area.a)["railway"="station"];',
      'nwr(area.a)["railway"="subway_entrance"];'
    ].join("\n")
  };

  var POI_LABELS = {
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
  var BID_MULTIPLIER = 1.2;
  var SC_OPT = 30;
  var SC_MAX = 60;
  var RECO_HOURS_PER_DAY = 12;

  // ===== State =====
  var state = {
    screens: [],
    citiesAll: [],
    formatsAll: [],
    regionsAll: [],
    regionsByCity: {},
    selectedFormats: new Set(),
    selectedRegions: new Set(), // multi
    selectedRegion: null,
    lastChosen: []
  };

  if (!window.PLANNER.state) {
    try {
      Object.defineProperty(window.PLANNER, "state", {
        value: state,
        writable: false,
        configurable: false,
        enumerable: true
      });
    } catch (e) {
      window.PLANNER.state = state;
    }
  } else {
    var st0 = window.PLANNER.state;
    st0.screens = st0.screens || [];
    st0.citiesAll = st0.citiesAll || [];
    st0.formatsAll = st0.formatsAll || [];
    st0.regionsAll = st0.regionsAll || [];
    st0.regionsByCity = st0.regionsByCity || {};
    st0.selectedFormats = (st0.selectedFormats instanceof Set) ? st0.selectedFormats : new Set(st0.selectedFormats || []);
    st0.selectedRegions = (st0.selectedRegions instanceof Set) ? st0.selectedRegions : new Set(st0.selectedRegions || []);
    st0.selectedRegion = st0.selectedRegion || null;
    st0.lastChosen = st0.lastChosen || [];
  }

  window.state = window.PLANNER.state;

  // ===== Regions store (ONE AND ONLY ONE) =====
  // Важно: НЕ делаем аксессоры. Не делаем 2 разных __set.
  if (!window.PLANNER.__regionsSet) {
    window.PLANNER.__regionsSet = (window.PLANNER.state.selectedRegions instanceof Set)
      ? window.PLANNER.state.selectedRegions
      : new Set();
    window.PLANNER.state.selectedRegions = window.PLANNER.__regionsSet;
  }

  function ensureSelectedRegionsSet() {
    // если вдруг кто-то перезаписал — восстановим ссылку на "вечный" set
    if (!(window.PLANNER.__regionsSet instanceof Set)) window.PLANNER.__regionsSet = new Set();
    if (window.PLANNER.state.selectedRegions !== window.PLANNER.__regionsSet) {
      var cur = window.PLANNER.state.selectedRegions;
      var set = window.PLANNER.__regionsSet;

      // слить текущее в set
      if (cur instanceof Set) {
        cur.forEach(function (x) {
          var s = String(x || "").trim();
          if (s) set.add(s);
        });
      } else if (Array.isArray(cur)) {
        for (var i = 0; i < cur.length; i++) {
          var s2 = String(cur[i] || "").trim();
          if (s2) set.add(s2);
        }
      } else if (typeof cur === "string") {
        var s3 = cur.trim();
        if (s3) set.add(s3);
      }

      // восстановить ссылку (ВАЖНО: именно на тот же Set)
      window.PLANNER.state.selectedRegions = set;
    }
    return window.PLANNER.__regionsSet;
  }

  // ===== Utils =====
  function el(id) { return document.getElementById(id); }

  function setStatus(msg) {
    var s = el("status");
    if (s) s.textContent = msg || "";
  }

  function escapeHtml(s) {
    s = String((s === undefined || s === null) ? "" : s);
    return s.replace(/[&<>"']/g, function (m) {
      return ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      })[m];
    });
  }

  function normalizeKey(s) {
    s = String((s === undefined || s === null) ? "" : s);
    return s
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
    var x = document.querySelector('input[name="budget_mode"]:checked');
    return x ? x.value : "fixed";
  }

  function getScheduleType() {
    var x = document.querySelector('input[name="schedule"]:checked');
    return x ? x.value : "all_day";
  }

  function parseCSV(text) {
    if (!window.Papa) {
      console.error("PapaParse not found");
      return [];
    }
    var res = Papa.parse(text, { header: true, skipEmptyLines: true, dynamicTyping: false });
    if (res.errors && res.errors.length) console.warn("CSV parse errors:", res.errors.slice(0, 8));
    return res.data || [];
  }

  function toNumber(x) {
    if (x === undefined || x === null) return NaN;
    var s = String(x).trim().replace(/\s+/g, "").replace(",", ".");
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }

  function avgNumber(arr) {
    var sum = 0, cnt = 0;
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (isFinite(v)) { sum += v; cnt++; }
    }
    return cnt ? (sum / cnt) : null;
  }

  function daysInclusive(startStr, endStr) {
    var s = new Date(startStr + "T00:00:00");
    var e = new Date(endStr + "T00:00:00");
    return Math.floor((e - s) / (24 * 3600 * 1000)) + 1;
  }

  function hoursPerDay(schedule) {
    if (!schedule || !schedule.type) return 15;
    if (schedule.type === "all_day") return 15;
    if (schedule.type === "peak") return 7;
    if (schedule.type === "custom") {
      var from = (schedule.from || "07:00").split(":");
      var to = (schedule.to || "22:00").split(":");
      var fh = Number(from[0] || 7), fm = Number(from[1] || 0);
      var th = Number(to[0] || 22), tm = Number(to[1] || 0);
      return Math.max(0, (th + tm / 60) - (fh + fm / 60));
    }
    return 15;
  }

  function formatMeta(fmt) {
    return FORMAT_LABELS[fmt] || { label: fmt, desc: "Описание формата пока не задано." };
  }

  // ===== UI: selection extra =====
  function renderSelectionExtra() {
    var modeEl = el("selection-mode");
    var mode = modeEl ? modeEl.value : "city_even";
    var extra = el("selection-extra");
    if (!extra) return;
    extra.innerHTML = "";

    if (mode === "near_address") {
      extra.innerHTML =
        '<input id="planner-addr" type="text" placeholder="Адрес" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">' +
        '<input id="planner-radius" type="number" min="50" value="500" placeholder="Радиус, м" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">' +
        '<div style="font-size:12px; color:#666; margin-top:6px;">Геокодим адрес и выбираем экраны в радиусе.</div>';
      return;
    }

    if (mode === "poi") {
      var keys = Object.keys(POI_QUERIES || {});
      var options = "";
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        options += '<option value="' + escapeHtml(k) + '">' + escapeHtml(POI_LABELS[k] || k) + "</option>";
      }
      extra.innerHTML =
        '<select id="poi-type" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">' +
        options +
        "</select>" +
        '<input id="planner-radius" type="number" min="50" value="500" placeholder="Радиус вокруг POI, м" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">' +
        '<div style="font-size:12px; color:#666; margin-top:6px;">POI-тип берём из OpenStreetMap (Overpass), затем выбираем экраны вокруг POI.</div>';
      return;
    }

    if (mode === "route") {
      extra.innerHTML =
        '<input id="route-from" type="text" placeholder="Точка А" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">' +
        '<input id="route-to" type="text" placeholder="Точка Б" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">' +
        '<input id="planner-radius" type="number" min="50" value="300" placeholder="Радиус от маршрута, м" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">' +
        '<div style="font-size:12px; color:#666; margin-top:6px;">MVP: маршрут сохраняем в бриф (без построения).</div>';
      return;
    }
  }

  // ===== City -> Region loader (NO async) =====
  function loadCityRegions() {
    return fetch(CITY_REGIONS_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("city_regions http " + res.status);
        return res.json();
      })
      .then(function (json) {
        var regionsRaw = (json && json.regions && typeof json.regions === "object") ? json.regions : null;
        if (!regionsRaw) throw new Error("city_regions has no 'regions' object");

        var cityToRegion = {};
        var citiesCount = 0;
        var regionsCount = 0;

        Object.keys(regionsRaw).forEach(function (k) {
          var v = regionsRaw[k];

          // A) "Москва": "Москва"
          if (typeof v === "string") {
            var key = normalizeKey(k);
            if (key) {
              cityToRegion[key] = String(v).trim();
              citiesCount++;
            }
            return;
          }

          // B) "Московская область": ["Химки", ...]
          if (Array.isArray(v)) {
            var region = String(k).trim();
            regionsCount++;
            for (var i = 0; i < v.length; i++) {
              var city = v[i];
              var key2 = normalizeKey(city);
              if (!key2) continue;
              cityToRegion[key2] = region;
              citiesCount++;
            }
          }
        });

        window.PLANNER.cityRegions = cityToRegion;
        window.PLANNER.cityRegionsMeta = json.meta || null;

        console.log("[city_regions] loaded:", { cities: citiesCount, regions: regionsCount || "n/a" });
        return true;
      })
      .catch(function (e) {
        console.warn("[city_regions] load failed:", e);
        window.PLANNER.cityRegions = {};
        window.PLANNER.cityRegionsMeta = null;
        return false;
      });
  }

  function getRegionForCity(city) {
    var key = normalizeKey(city);
    var r = window.PLANNER && window.PLANNER.cityRegions ? window.PLANNER.cityRegions[key] : null;
    return (typeof r === "string" && r.trim()) ? r.trim() : "Не назначено";
  }

  // ===== Regions UI (multi-select) =====
  function normalizeRegionName(input) {
    var v = String(input || "").trim();
    if (!v) return "";
    var all = window.PLANNER.state.regionsAll || [];
    for (var i = 0; i < all.length; i++) {
      if (String(all[i]).toLowerCase() === v.toLowerCase()) return all[i];
    }
    return v;
  }

  function renderSelectedRegions() {
    var wrap = el("region-selected");
    if (!wrap) return;

    var set = ensureSelectedRegionsSet();
    var arr = Array.from(set);

    wrap.innerHTML = "";

    if (!arr.length) {
      wrap.innerHTML = '<div style="font-size:12px; color:#666;">Регион не выбран</div>';
      return;
    }

    arr.sort(function (a, b) { return String(a).localeCompare(String(b), "ru"); });

    for (var i = 0; i < arr.length; i++) {
      (function (region) {
        var chip = document.createElement("button");
        cssButtonBase(chip);
        chip.type = "button";
        chip.style.display = "inline-flex";
        chip.style.alignItems = "center";
        chip.style.gap = "6px";
        chip.textContent = "✕ " + region;

        chip.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          set.delete(region);
          renderSelectedRegions();
          window.dispatchEvent(new CustomEvent("planner:filters-changed"));
        });

        wrap.appendChild(chip);
      })(arr[i]);
    }
  }

  function renderRegionSuggestions(q) {
    var sug = el("city-suggestions");
    if (!sug) return;

    sug.innerHTML = "";

    var qq = String(q || "").trim().toLowerCase();
    if (!qq) return;

    var set = ensureSelectedRegionsSet();
    var all = window.PLANNER.state.regionsAll || [];
    if (!all.length) return;

    var matches = [];
    for (var i = 0; i < all.length; i++) {
      var r = String(all[i] || "");
      if (r.toLowerCase().indexOf(qq) !== -1) {
        matches.push(r);
        if (matches.length >= 12) break;
      }
    }

    for (var j = 0; j < matches.length; j++) {
      (function (r) {
        var b = document.createElement("button");
        cssButtonBase(b);
        b.type = "button";
        b.textContent = (set.has(r) ? "✓ " : "+ ") + r;

        b.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();

          // ✅ только ADD, никогда не replace/clear
          set.add(r);

          var inp = el("city-search");
          if (inp) inp.value = "";
          sug.innerHTML = "";

          renderSelectedRegions();
          window.dispatchEvent(new CustomEvent("planner:filters-changed"));
        });

        sug.appendChild(b);
      })(matches[j]);
    }
  }

  // ===== Data load (NO async) =====
  function loadScreens() {
    setStatus("Загружаю список экранов…");
    console.log("[screens] url:", SCREENS_CSV_URL);

    return fetch(SCREENS_CSV_URL, { cache: "no-store" })
      .then(function (res) {
        console.log("[screens] status:", res.status, res.statusText);
        if (!res.ok) throw new Error("Не удалось загрузить CSV: " + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);
        var st = window.PLANNER.state;

        st.screens = rows.map(function (r) {
          var city = String(r.city || r.City || r.CITY || "").trim();
          var format = String(r.format || r.Format || r.FORMAT || "").trim();
          var address = String(r.address || r.Address || r.ADDRESS || "").trim();
          var screenId = r.screen_id || r.screenId || r.inventory_id || r.inventoryId || r.id || "";

          var out = Object.assign({}, r);
          out.screen_id = String(screenId).trim();
          out.city = city;
          out.format = format;
          out.address = address;

          out.minBid = toNumber(r.minBid || r.min_bid || r.MINBID || r.minbid);
          out.ots = toNumber(r.ots || r.OTS);
          out.grp = toNumber(r.grp || r.GRP);

          out.lat = toNumber(r.lat || r.Lat || r.LAT);
          out.lon = toNumber(r.lon || r.Lon || r.LON || r.lng || r.Lng || r.LNG);

          return out;
        });

        // cities / formats
        var citiesSet = new Set();
        var formatsSet = new Set();
        for (var i = 0; i < st.screens.length; i++) {
          if (st.screens[i].city) citiesSet.add(st.screens[i].city);
          if (st.screens[i].format) formatsSet.add(st.screens[i].format);
        }
        st.citiesAll = Array.from(citiesSet).sort(function (a, b) { return String(a).localeCompare(String(b), "ru"); });
        st.formatsAll = Array.from(formatsSet).sort(function (a, b) { return String(a).localeCompare(String(b)); });

        // regionsByCity + regionsAll
        st.regionsByCity = {};
        var regionsSet = new Set();
        for (var j = 0; j < st.citiesAll.length; j++) {
          var c = st.citiesAll[j];
          var reg = getRegionForCity(c);
          st.regionsByCity[c] = reg;
          regionsSet.add(reg);
        }
        st.regionsAll = Array.from(regionsSet).sort(function (a, b) { return String(a).localeCompare(String(b), "ru"); });

        // assign region to screens
        for (var k = 0; k < st.screens.length; k++) {
          var s = st.screens[k];
          s.region = st.regionsByCity[s.city] || "Не назначено";
        }

        renderFormats();
        renderSelectedRegions();

        setStatus(
          "Всего доступно: Экранов: " + st.screens.length +
          ". Городов: " + st.citiesAll.length +
          ". Форматов: " + st.formatsAll.length +
          ". Регионов: " + st.regionsAll.length + "."
        );

        window.PLANNER.ready = true;
        window.dispatchEvent(new CustomEvent("planner:screens-ready", { detail: { count: st.screens.length } }));
      })
      .catch(function (err) {
        console.error("[screens] load failed:", err);
        setStatus("Ошибка загрузки экранов");
      });
  }

  // ===== UI: formats =====
  function renderFormats() {
    var wrap = el("formats-wrap");
    if (!wrap) return;
    wrap.innerHTML = "";

    var st = window.PLANNER.state;

    for (var i = 0; i < st.formatsAll.length; i++) {
      (function (fmt) {
        var meta = formatMeta(fmt);
        var b = document.createElement("button");
        cssButtonBase(b);
        b.style.borderRadius = "14px";
        b.style.padding = "10px 12px";
        b.style.textAlign = "left";
        b.style.maxWidth = "240px";

        b.innerHTML =
          '<div style="font-weight:700;">' + escapeHtml(meta.label) + "</div>" +
          '<div style="font-size:12px; color:#666;">' + escapeHtml(meta.desc) + "</div>" +
          '<div style="font-size:11px; color:#999; margin-top:4px;">Код: ' + escapeHtml(fmt) + "</div>";

        function sync() {
          b.style.borderColor = st.selectedFormats.has(fmt) ? "#111" : "#ddd";
        }
        sync();

        b.addEventListener("click", function () {
          var auto = el("formats-auto");
          if (auto && auto.checked) return;

          if (st.selectedFormats.has(fmt)) st.selectedFormats.delete(fmt);
          else st.selectedFormats.add(fmt);

          sync();
        });

        wrap.appendChild(b);
      })(st.formatsAll[i]);
    }
  }

  // ===== Brief =====
  function buildBrief() {
    var root = document.getElementById("planner-widget") || document;

    var budgetMode = getBudgetMode();
    var budgetEl = el("budget-input");
    var budgetVal = budgetEl ? budgetEl.value : "";

    var scheduleType = getScheduleType();
    var timeFromEl = el("time-from");
    var timeToEl = el("time-to");

    var selectionModeEl = el("selection-mode");
    var selectionMode = selectionModeEl ? selectionModeEl.value : "city_even";

    var set = ensureSelectedRegionsSet();
    var regions = Array.from(set).map(function (r) { return String(r || "").trim(); }).filter(Boolean);

    var st = window.PLANNER.state;

    var formatsAutoEl = el("formats-auto");
    var formatsAuto = formatsAutoEl ? !!formatsAutoEl.checked : false;

    var brief = {
      budget: {
        mode: budgetMode,
        amount: (budgetMode === "fixed") ? Number(budgetVal || 0) : null,
        currency: "RUB"
      },
      dates: {
        start: (el("date-start") && el("date-start").value) ? el("date-start").value : null,
        end: (el("date-end") && el("date-end").value) ? el("date-end").value : null
      },
      schedule: {
        type: scheduleType,
        from: (scheduleType === "custom") ? ((timeFromEl && timeFromEl.value) ? timeFromEl.value : null) : null,
        to: (scheduleType === "custom") ? ((timeToEl && timeToEl.value) ? timeToEl.value : null) : null
      },
      geo: { regions: regions },
      formats: {
        mode: formatsAuto ? "auto" : "manual",
        selected: formatsAuto ? [] : Array.from(st.selectedFormats)
      },
      selection: { mode: selectionMode },
      grp: {
        enabled: !!(el("grp-enabled") && el("grp-enabled").checked),
        min: toNumber(el("grp-min") ? el("grp-min").value : 0),
        max: toNumber(el("grp-max") ? el("grp-max").value : 9.98)
      }
    };

    // clamp grp
    if (!isFinite(brief.grp.min)) brief.grp.min = 0;
    if (!isFinite(brief.grp.max)) brief.grp.max = 9.98;
    brief.grp.min = Math.max(0, Math.min(9.98, brief.grp.min));
    brief.grp.max = Math.max(0, Math.min(9.98, brief.grp.max));
    if (brief.grp.max < brief.grp.min) {
      var tmp = brief.grp.min;
      brief.grp.min = brief.grp.max;
      brief.grp.max = tmp;
    }

    return brief;
  }

  // ===== Tiers (NO async) =====
  function loadTiers() {
    return fetch(TIERS_JSON_URL, { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("tiers json http " + res.status);
        return res.json();
      })
      .then(function (json) {
        var tiers = (json && json.tiers && typeof json.tiers === "object") ? json.tiers : null;
        if (!tiers) throw new Error("tiers json has no 'tiers' object");

        window.PLANNER.tiers = tiers;
        window.PLANNER.tiersMeta = {
          version: json.version || "unknown",
          generated_at: json.generated_at || null
        };

        console.log("[tiers] loaded:", Object.keys(tiers).length, "regions", window.PLANNER.tiersMeta);
        return true;
      })
      .catch(function (e) {
        console.warn("[tiers] load failed:", e);
        window.PLANNER.tiers = {};
        window.PLANNER.tiersMeta = { version: "missing", generated_at: null };
        return false;
      });
  }

  function getTierForGeo(name) {
    var key = String(name || "").trim();
    var t = (window.PLANNER && window.PLANNER.tiers) ? window.PLANNER.tiers[key] : null;
    return (t === "M" || t === "SP" || t === "A" || t === "B" || t === "C" || t === "D") ? t : "C";
  }

  // ===== Helpers =====
  function pickScreensByMinBid(screens, n) {
    var sorted = screens.slice().sort(function (a, b) {
      var aa = isFinite(a.minBid) ? a.minBid : 1e18;
      var bb = isFinite(b.minBid) ? b.minBid : 1e18;
      if (aa !== bb) return aa - bb;
      return String(a.screen_id || "").localeCompare(String(b.screen_id || ""));
    });
    return sorted.slice(0, n);
  }

  function gridKey(lat, lon, stepKm) {
    stepKm = stepKm || 2;
    var kmLat = 111;
    var kmLon = 111 * Math.cos(lat * Math.PI / 180);
    var gx = Math.floor(lat * kmLat / stepKm);
    var gy = Math.floor(lon * kmLon / stepKm);
    return gx + ":" + gy;
  }

  function groupByGrid(screens, stepKm) {
    stepKm = stepKm || 2;
    var map = new Map();
    for (var i = 0; i < screens.length; i++) {
      var s = screens[i];
      var lat = Number(s.lat !== undefined ? s.lat : s.latitude);
      var lon = Number(s.lon !== undefined ? s.lon : (s.lng !== undefined ? s.lng : s.longitude));
      if (!isFinite(lat) || !isFinite(lon)) continue;
      var key = gridKey(lat, lon, stepKm);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return Array.from(map.values());
  }

  function pickScreensUniformByGrid(pool, count, stepKm) {
    stepKm = stepKm || 2;
    var cells = groupByGrid(pool, stepKm);

    cells.forEach(function (cell) {
      cell.sort(function (a, b) { return (a.minBid || 1e18) - (b.minBid || 1e18); });
    });

    cells.sort(function () { return Math.random() - 0.5; });

    var result = [];
    var i = 0;
    while (result.length < count && cells.length) {
      var cell = cells[i % cells.length];
      if (cell.length) result.push(cell.shift());
      i++;
    }

    if (result.length < count) {
      var picked = new Set(result);
      var rest = pool.filter(function (s) { return !picked.has(s); });
      result = result.concat(pickScreensByMinBid(rest, count - result.length));
    }

    return result.slice(0, count);
  }

  // ===== Budget allocation =====
  function tierWeight(t) {
    t = String(t || "").toUpperCase();
    if (t === "M") return 6;
    if (t === "SP") return 5;
    if (t === "A") return 4;
    if (t === "B") return 3;
    if (t === "C") return 2;
    if (t === "D") return 1;
    return 2;
  }

  function allocateBudgetAcrossRegions(total, regions, opts) {
    opts = opts || {};
    if (!regions || !regions.length) return [];

    var minShare = (opts.minShare !== undefined) ? opts.minShare : 0.1;
    var maxShare = (opts.maxShare !== undefined) ? opts.maxShare : 0.7;

    var items = regions.map(function (r) {
      return { region: r.key, tier: r.tier, w: tierWeight(r.tier), share: 0 };
    });

    var sumW = items.reduce(function (a, b) { return a + b.w; }, 0) || 1;
    items.forEach(function (i) { i.share = i.w / sumW; });

    items.forEach(function (i) {
      if (i.share < minShare) i.share = minShare;
      if (i.share > maxShare) i.share = maxShare;
    });

    var sumShares = items.reduce(function (a, b) { return a + b.share; }, 0) || 1;
    items.forEach(function (i) { i.share = i.share / sumShares; });

    var out = items.map(function (i) {
      return { region: i.region, budget: Math.floor(total * i.share) };
    });

    var allocated = out.reduce(function (a, b) { return a + b.budget; }, 0);
    var diff = total - allocated;
    var k = 0;
    while (diff !== 0 && k < 10000) {
      var idx = k % out.length;
      out[idx].budget += (diff > 0 ? 1 : -1);
      diff += (diff > 0 ? -1 : 1);
      k++;
    }
    return out;
  }

  // ===== MAIN CALC (NO async) =====
  function onCalcClick() {
    var brief = buildBrief();

    if (!brief.dates.start || !brief.dates.end) {
      alert("Выберите даты");
      return;
    }

    var regions = brief.geo.regions;
    if (!regions || !regions.length) {
      alert("Выберите регион(ы)");
      return;
    }

    var days = daysInclusive(brief.dates.start, brief.dates.end);
    var hpd = (brief.budget.mode === "fixed") ? hoursPerDay(brief.schedule) : RECO_HOURS_PER_DAY;

    var fixedAlloc = null;
    if (brief.budget.mode === "fixed") {
      fixedAlloc = allocateBudgetAcrossRegions(
        brief.budget.amount,
        regions.map(function (r) { return { key: r, tier: getTierForGeo(r) }; })
      );
    }

    var chosenAll = [];
    var perRegion = [];
    var totalBudget = 0;
    var totalPlays = 0;
    var totalOts = 0;
    var hasOts = true;

    for (var i = 0; i < regions.length; i++) {
      var region = regions[i];
      var tier = getTierForGeo(region);

      var pool = window.PLANNER.state.screens.filter(function (s) { return s.region === region; });
      if (!pool.length) continue;

      if (brief.formats.mode === "manual") {
        pool = pool.filter(function (s) { return brief.formats.selected.indexOf(s.format) !== -1; });
      }

      var avgBid = avgNumber(pool.map(function (s) { return s.minBid; }));
      if (!avgBid) continue;

      var bid = avgBid * BID_MULTIPLIER;
      var budget = 0;

      if (brief.budget.mode === "fixed") {
        var found = fixedAlloc.filter(function (x) { return x.region === region; })[0];
        budget = found ? (found.budget || 0) : 0;
      } else {
        var baseMap = { M: 2000000, SP: 1500000, A: 1000000, B: 500000, C: 300000, D: 100000 };
        var base = baseMap[tier] || 300000;
        budget = Math.floor(base * (days / 30));
      }

      if (budget <= 0) continue;
      totalBudget += budget;

      var totalPlaysTheory = Math.floor(budget / bid);
      var playsPerHour = totalPlaysTheory / days / hpd;
      var screensNeeded = Math.max(1, Math.ceil(playsPerHour / SC_OPT));
      var chosen = pickScreensUniformByGrid(pool, screensNeeded, 2);

      var plays = Math.min(totalPlaysTheory, SC_MAX * chosen.length * days * hpd);

      var avgOts = avgNumber(pool.map(function (s) { return s.ots; }));
      var ots = avgOts ? plays * avgOts : null;
      if (!avgOts) hasOts = false;

      chosenAll = chosenAll.concat(chosen);
      totalPlays += plays;
      if (ots) totalOts += ots;

      perRegion.push({
        region: region,
        tier: tier,
        budget: budget,
        screens: chosen.length,
        plays: plays,
        ots: ots
      });
    }

    // dedupe screens
    var seen = new Set();
    chosenAll = chosenAll.filter(function (s) {
      if (seen.has(s.screen_id)) return false;
      seen.add(s.screen_id);
      return true;
    });

    window.PLANNER.state.lastChosen = chosenAll;

    window.dispatchEvent(new CustomEvent("planner:calc-done", { detail: { chosen: chosenAll, perRegion: perRegion } }));

    // soft-calls
    if (typeof window.renderPhotosCarousel === "function") {
      window.renderPhotosCarousel(chosenAll);
    }
    if (typeof window.renderSummaryPretty === "function") {
      window.renderSummaryPretty({
        brief: brief,
        perRegion: perRegion,
        totals: {
          budget: totalBudget,
          plays: totalPlays,
          ots: hasOts ? totalOts : null,
          screens: chosenAll.length,
          days: days,
          hpd: hpd
        }
      });
    }
  }

  // ===== UI BINDINGS =====
  function bindPlannerUI() {
    var calcBtn = el("calc-btn");
    if (calcBtn) calcBtn.addEventListener("click", onCalcClick);

    var input = el("city-search");
    if (!input) return;

    input.addEventListener("input", function (e) {
      renderRegionSuggestions(e.target.value);
    });

    input.addEventListener("keydown", function (e) {
      if (e.key !== "Enter") return;
      e.preventDefault();

      var raw = String(input.value || "").trim();
      if (!raw) return;

      var st = window.PLANNER.state;
      var regionsAll = st.regionsAll || [];
      if (!regionsAll.length) return;

      var found = null;
      var q = raw.toLowerCase();

      // exact
      for (var i = 0; i < regionsAll.length; i++) {
        if (String(regionsAll[i]).toLowerCase() === q) { found = regionsAll[i]; break; }
      }
      // includes
      if (!found) {
        for (var j = 0; j < regionsAll.length; j++) {
          if (String(regionsAll[j]).toLowerCase().indexOf(q) !== -1) { found = regionsAll[j]; break; }
        }
      }

      if (!found) return;

      ensureSelectedRegionsSet().add(found);

      input.value = "";
      var sug = el("city-suggestions");
      if (sug) sug.innerHTML = "";

      renderSelectedRegions();
      window.dispatchEvent(new CustomEvent("planner:filters-changed"));
    });
  }

  // ===== START =====
  function startPlanner() {
    if (window.PLANNER.__started) return;
    window.PLANNER.__started = true;

    bindPlannerUI();
    renderSelectionExtra();

    loadTiers()
      .then(function () { return loadCityRegions(); })
      .then(function () { return loadScreens(); })
      .catch(function (err) {
        console.error("[planner] init failed:", err);
      });
  }

  window.PLANNER.startPlanner = startPlanner;
  window.PLANNER.bootPlanner = startPlanner;

  // ===== START (inside IIFE) =====
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startPlanner);
  } else {
    startPlanner();
  }
})();
