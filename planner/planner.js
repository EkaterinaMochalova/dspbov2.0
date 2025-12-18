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
      <input id="addr" type="text" placeholder="Адрес"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">
      <input id="radius" type="number" min="50" value="500" placeholder="Радиус, м"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">
      <div style="font-size:12px; color:#666; margin-top:6px;">
        Геокодим адрес и выбираем экраны в радиусе.
      </div>
    `;
  } else if(mode === "poi"){
    extra.innerHTML = `
      <select id="poi-type"
              style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">
        <option value="pet_store">Pet stores</option>
        <option value="supermarket">Супермаркеты</option>
        <option value="mall">ТЦ</option>
      </select>
      <input id="radius" type="number" min="50" value="500" placeholder="Радиус, м"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">
      <div style="font-size:12px; color:#666; margin-top:6px;">MVP: POI сохраняем в бриф (без POI-базы).</div>
    `;
  } else if(mode === "route"){
    extra.innerHTML = `
      <input id="route-from" type="text" placeholder="Точка А"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">
      <input id="route-to" type="text" placeholder="Точка Б"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px; margin-bottom:8px;">
      <input id="radius" type="number" min="50" value="300" placeholder="Радиус от маршрута, м"
             style="width:100%; padding:10px; border:1px solid #ddd; border-radius:10px;">
      <div style="font-size:12px; color:#666; margin-top:6px;">MVP: маршрут сохраняем в бриф (без построения).</div>
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

  if(selectionMode === "near_address"){
    brief.selection.address = el("addr")?.value || "";
    brief.selection.radius_m = Number(el("radius")?.value || 500);
  }
  if(selectionMode === "poi"){
    brief.selection.poi_type = el("poi-type")?.value || "pet_store";
    brief.selection.radius_m = Number(el("radius")?.value || 500);
  }
  if(selectionMode === "route"){
    brief.selection.from = el("route-from")?.value || "";
    brief.selection.to = el("route-to")?.value || "";
    brief.selection.radius_m = Number(el("radius")?.value || 300);
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

  // ===== near_address filter (NEW) =====
  if (brief.selection.mode === "near_address") {
    if (!window.GeoUtils?.geocodeAddress || !window.GeoUtils?.filterByRadius) {
      alert("GeoUtils не найден. Проверь, что geo.js подключён ПЕРЕД planner.js");
      return;
    }

    const addr = String(brief.selection.address || "").trim();
    const radius = Number(brief.selection.radius_m || 500);

    if (!addr) {
      alert("Введите адрес.");
      return;
    }

    setStatus("Геокодирую адрес…");

    // чтобы Nominatim лучше находил: добавляем город
    const query = `${city}, ${addr}`;
console.log("Geocode query:", query);

const geo = await GeoUtils.geocodeAddress(query);
console.log("Geocode result:", geo);

if (!geo) {
  alert("Адрес не найден. Уточните адрес (улица и дом).");
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.textContent = "";
  return;
}

const statusEl = document.getElementById("status");
if (statusEl) {
  statusEl.textContent =
    `Адрес найден: ${geo.display_name} (${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)})`;
}

    // фильтруем только те, у кого есть lat/lon
    const before = pool.length;
    pool = GeoUtils.filterByRadius(pool, geo.lat, geo.lon, radius);

    if (!pool.length) {
      setStatus("");
      alert("В этом радиусе нет экранов (или у них нет координат lat/lon).");
      return;
    }

    setStatus(`Экраны в радиусе: ${pool.length} из ${before}.`);
  }

  brief.selection.address_display = geo.display_name;
  brief.selection.address_lat = geo.lat;
  brief.selection.address_lon = geo.lon;
  
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

  const summaryText =
`Бриф:
— Бюджет: ${budget.toLocaleString("ru-RU")} ₽
— Даты: ${brief.dates.start} → ${brief.dates.end} (дней: ${days})
— Расписание: ${brief.schedule.type} (часов/день: ${hpd})
— Город: ${city}
— Форматы: ${selectedFormatsText}
— Подбор: ${brief.selection.mode}
${selectionLine}
— GRP: ${brief.grp.enabled ? `${brief.grp.min.toFixed(2)}–${brief.grp.max.toFixed(2)}` : "не учитываем"}
— Адрес: ${
  brief.selection.mode === "near_address"
    ? (brief.selection.address_display || brief.selection.address || "—")
    : "—"
}

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
