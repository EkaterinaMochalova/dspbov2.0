// DSP auth enabled by default (set false before loading this script to disable)
if (window.DSP_AUTH_ENABLED === undefined) window.DSP_AUTH_ENABLED = true;

// Где лежат собственные файлы виджета (geo.js, planner.js, *.csv, *.json).
// Вычисляется из адреса самого этого скрипта, поэтому виджет переносим:
// достаточно поменять один URL в Тильде — остальное подтянется само.
// Чтобы задать базу вручную (локальная отладка), выставьте
// window.PLANNER_ASSET_BASE до подключения этого файла.
window.PLANNER_ASSET_BASE = (function () {
  var override = window.PLANNER_ASSET_BASE;
  if (override) {
    override = String(override);
    return override.charAt(override.length - 1) === "/" ? override : override + "/";
  }
  var src = (document.currentScript && document.currentScript.src) || "";
  var i = src.indexOf("widget-init.js");
  if (i < 0) {
    console.error("[widget-init] не удалось определить базовый URL виджета");
    return "";
  }
  return src.slice(0, i);
})();

(async function() {
  const root = document.getElementById("planner-root");
  if (!root) { console.error("[widget-init] #planner-root not found"); return; }

  // Прежняя версия стилей виджета жила инлайном в блоке Тильды. Где её
  // не убрали руками, она перебивает всё, что приезжает отсюда: лежит в
  // body, а наш <style> — в head, специфичность та же, выигрывает порядок.
  // Метка «Apple-ish glass» есть только в том блоке.
  for (const old of document.querySelectorAll("style")) {
    if (old.textContent.indexOf("Apple-ish glass") >= 0) {
      old.remove();
      console.warn("[widget-init] снят старый инлайновый стиль со страницы");
    }
  }

  function loadCSS(href, integrity) {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href;
    if (integrity) { l.integrity = integrity; l.crossOrigin = ""; }
    document.head.appendChild(l);
  }

  function loadScript(src, parallel) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      // async=false у динамически вставленного тега сохраняет порядок
      // выполнения относительно других таких же тегов — поэтому все они
      // качаются параллельно, а выполняются строго в порядке вставки.
      // Для одиночной догрузки по требованию порядок неважен: async=true,
      // чтобы не ждать чужой очереди.
      s.async = !!parallel;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Failed to load: " + src));
      document.head.appendChild(s);
    });
  }

  function runScript(code) {
    // Use new Function() instead of script element:
    // DOM appendChild re-parses via HTML script loader which rejects some
    // Unicode chars in comments/strings that V8 eval accepts fine.
    (new Function(code))();
  }

  // 1. Inject external CSS
  loadCSS("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
          "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=");
  loadCSS("https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css");
  loadCSS("https://fonts.googleapis.com/css2?family=Golos+Text:wght@400;500;600;700" +
          "&family=IBM+Plex+Mono:wght@400;500;600&display=swap");

  // 2. Inject all inline CSS from widget.html
  const style = document.createElement("style");
  style.textContent = `

/* ===== ТОКЕНЫ ДИЗАЙН-СИСТЕМЫ =====
   Жили в инлайновом <style> внутри блока Тильды (Planner UI — Style A).
   Блок удалён 22.08.2026, потому что перебивал стили отсюда; переменные
   перенесены, чтобы не потерять зафиксированные значения акцента и радиусов.
   Пока ни одно правило ниже к ним не обращается — это точка входа для того,
   чтобы постепенно заменить 107 захардкоженных hex на var(--ux-*).          */
:root{
  /* поверхности: фон страницы, карточка, вложенная карточка */
  --ux-ground: #F1F2F7;
  --ux-bg: #FFFFFF;
  --ux-bg2: #F7F8FC;

  /* линии. Нейтральные с синим уклоном под акцент — чистый серый
     читается как невыбранный по умолчанию, а не как решение. */
  --ux-line: #E1E4EE;
  --ux-line2: #C9CEDE;

  /* текст. Три ступени, все проходят 4.5:1 на белом:
     18.0 / 7.6 / 4.7 — третья специально темнее, чем в макете,
     иначе подписи и подсказки набраны нечитаемым. */
  --ux-text: #0E1220;
  --ux-text2: #4C5368;
  --ux-text3: #6C7488;

  /* акцент — только нажимаемое и выбранное, ничего декоративного */
  --ux-accent: #4F2BE8;
  --ux-accent-ink: #3A1FB0;
  --ux-accent-soft: #EDE9FE;
  --ux-accent-line: #C5B6FA;
  --ux-ring: 0 0 0 3px rgba(79,43,232,.22);

  /* смысловые. Отдельно от акцента: это состояние данных,
     а не то, что можно нажать. */
  --ux-warn: #8A5A00;
  --ux-warn-bg: #FFF6E1;
  --ux-warn-line: #EFD8A1;
  --ux-danger: #B3261E;
  --ux-danger-bg: #FDECEA;
  --ux-ok: #14663A;
  --ux-ok-bg: #E7F5ED;
  --ux-ok-line: #A8D9BE;

  /* шрифты */
  --ux-font: "Golos Text", "Segoe UI", system-ui, -apple-system, sans-serif;
  --ux-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace;

  /* радиусы */
  --ux-radius: 16px;
  --ux-radius-sm: 12px;
  --ux-radius-xs: 8px;

  /* Тени сведены к одной волосяной линии: стекло и подъём при
     наведении убраны, иначе шестьсот карточек экранов пересчитывают
     размытие на каждый кадр прокрутки. */
  --ux-shadow-soft: none;
  --ux-shadow: none;

  /* старые имена — на них ссылаются перенесённые из Тильды правила */
  --ux-sub: var(--ux-text2);
  --ux-muted: var(--ux-bg2);
  --ux-accent2: var(--ux-accent-ink);
  --ux-accentSoft: var(--ux-accent-soft);
  --ux-glass: var(--ux-bg);
  --ux-glass-strong: var(--ux-bg);
  --ux-glass-line: var(--ux-line);
  --ux-blur: 0px;
}

#planner-widget .chart-card{
  background:#fff;
  border:1px solid var(--ux-line);
  border-radius:16px;
  padding:14px;
  margin-top:12px;
  
}

#planner-widget .chart-title{
  font-weight:700;
  font-size:14px;
  color:var(--ux-text);
}

#planner-widget .bar-row{
  display:grid;
  grid-template-columns: 84px 1fr 110px;
  gap:10px;
  align-items:center;
  margin-top:10px;
}

#planner-widget .bar-lbl{
  font-size:12px;
  color:var(--ux-text3);
  font-weight:700;
  white-space:nowrap;
}

#planner-widget .bar{
  height:10px;
  background:var(--ux-line);
  border-radius:999px;
  overflow:hidden;
}

#planner-widget .bar > i{
  display:block;
  height:100%;
  width:0%;
  background:var(--ux-accent);
  border-radius:999px;
}

#planner-widget .bar-val{
  font-size:12px;
  color:var(--ux-text);
  text-align:right;
  white-space:nowrap;
}


  #planner-widget.planner-root{ max-width:980px; margin:0 auto; font-family: var(--ux-font); }
  /* Font inheritance reset — browsers don't inherit font into button/input by default */
  #planner-widget button, #planner-widget input, #planner-widget select, #planner-widget textarea{
    font-family: inherit;
    font-size: inherit;
  }
  #planner-widget .planner-title{ margin:24px 0 12px 0; }
  /* ===== ДВЕ ФАЗЫ ВМЕСТО ДВУХ КОЛОНОК =====
     Сетка 50/50 неверна на обоих концах: до расчёта пустует правая половина,
     после — левая, а результат (108 карточек с фото, карта, разбивка по
     форматам) ужат в 390 px. Разводим по фазам: бриф во всю ширину, потом
     результат во всю ширину. */
  #planner-widget .planner-grid{ display:grid; grid-template-columns: 1fr; gap:16px; }

  #planner-widget[data-phase="brief"]  .planner-right{ display:none; }
  #planner-widget[data-phase="result"] .planner-left{ display:none; }

  /* ===== РЕЗУЛЬТАТ ВО ВСЮ ШИРИНУ ===== */
  /* Ленту фотографий сеткой НЕ раскладываем: карточек бывает 600+, и сетка по
     четыре растянет страницу на десятки тысяч пикселей. Лента для такого
     количества уместнее, а от смены фазы она и так выигрывает вдвое — в 940 px
     помещается 4 карточки вместо 2 в прежней колонке 390 px.
     Сетка имеет смысл только вместе с пагинацией — это правка рендера. */
  #planner-widget[data-phase="result"] .ps-grid{
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
  #planner-widget[data-phase="result"] .ps-metrics{
    grid-template-columns: repeat(6, minmax(0, 1fr));
  }
  @media (max-width: 900px){
    #planner-widget[data-phase="result"] .ps-metrics{ grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  #planner-widget[data-phase="result"] #planner-map.planner-map{ height: 520px; }

  @media (max-width: 920px){
    #planner-widget[data-phase="result"] #planner-map.planner-map{ height: 380px; }
  }

  #planner-widget .planner-kicker{ font-weight:700; margin-bottom:6px; }
  #planner-widget .planner-sub{ font-size:14px; color:var(--ux-text2); margin-bottom:12px; }
  #planner-widget .planner-block{ margin-bottom:12px; }
  #planner-widget .planner-label{ font-weight:600; margin-bottom:8px; }
  #planner-widget .planner-note{ font-size:12px; color:var(--ux-text2); margin-top:8px; }

  /* Разделитель "Дополнительные ограничения" */
  #planner-widget .additional-filters-divider{
    display:flex; align-items:center; gap:8px;
    margin:18px 0 10px;
    font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase;
    color:var(--ux-text2);
  }
  #planner-widget .additional-filters-divider::before,
  #planner-widget .additional-filters-divider::after{
    content:''; flex:1; height:1px; background:var(--ux-line);
  }

  /* Превью пула */
  #planner-widget .pool-preview-block{ background:var(--ux-bg2); border-radius:12px; padding:12px 14px; }
  #planner-widget .pool-preview-row{
    display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; font-size:14px;
  }
  #planner-widget .pool-preview-base{ font-weight:600; color:var(--ux-text); }
  #planner-widget .pool-preview-arrow{ color:var(--ux-text2); font-size:12px; }
  #planner-widget .pool-preview-filter{ color:var(--ux-text3); }
  #planner-widget .pool-preview-filter b{ color:var(--ux-text); }
  #planner-widget .pool-preview-pct{ font-size:12px; color:var(--ux-danger); margin-left:2px; }

  /* Мини-бейдж на шаге 1 */
  #pool-mini-badge{ transition: opacity .2s; }

  #planner-widget .ux-input{ width:100%; box-sizing:border-box; }
  #planner-widget .row-2{ display:flex; gap:10px; }
  #planner-widget .row-2 > *{ flex:1; min-width:0; }

  #planner-widget .radio-row{ display:block; margin-bottom:6px; }
  #planner-widget .radio-inline{ display:flex; gap:14px; flex-wrap:wrap; }
  #planner-widget .check-row{ display:flex; gap:8px; align-items:center; margin:0; }
  #planner-widget .hint{ font-size:12px; color:var(--ux-text2); margin-top:6px; }

  #planner-widget .city-suggestions{ margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; }
  #planner-widget .city-selected{ margin-top:10px; }

  #planner-widget .summary-pre{
    white-space: pre-wrap;
    background: var(--ux-bg2);
    border: 1px solid var(--ux-line);
    padding: 12px;
    border-radius: 12px;
    min-height: 180px;
    margin: 0;
  }

  #planner-widget .download-row{ margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  #planner-widget .dl-settings-gear{
    display:inline-flex;align-items:center;justify-content:center;
    width:32px;height:32px;border-radius:8px;border:1.5px solid var(--ux-accent-line);
    background:var(--ux-accent-soft);color:var(--ux-accent);cursor:pointer;transition:background .15s;flex-shrink:0;
    padding:0;
  }
  #planner-widget .dl-settings-gear:hover{ background:var(--ux-accent-soft); }
  #planner-widget .dl-settings-gear:disabled{ opacity:.4;cursor:default; }
  #planner-widget .dl-settings-popup{
    position:absolute;top:calc(100% + 8px);left:0;z-index:9999;
    background:#fff;border:1.5px solid var(--ux-accent-line);border-radius:12px;
    box-shadow:0 8px 32px var(--ux-accent-soft);padding:14px 16px;
    min-width:280px;
  }
  #planner-widget .dl-settings-title{
    font-size:12px;font-weight:700;color:var(--ux-accent);text-transform:uppercase;
    letter-spacing:.5px;margin-bottom:10px;
  }
  #planner-widget .dl-settings-row{
    display:flex;align-items:flex-start;gap:8px;cursor:pointer;
    font-size:13px;color:var(--ux-text2);margin-bottom:8px;line-height:1.4;
  }
  #planner-widget .dl-settings-row:last-child{ margin-bottom:0; }
  #planner-widget .dl-settings-row input{ margin-top:2px;accent-color:var(--ux-accent);flex-shrink:0; }
  #planner-widget .planner-status{ margin-top:10px; font-size:14px; color:var(--ux-text2); }
  #planner-map.planner-map{ height:420px; width:100%; border-radius:12px; overflow:hidden; border:1px solid var(--ux-line); font-family: var(--ux-font); }

  #planner-widget .wiz-step{ display:none; }
  #planner-widget .wiz-step.active{ display:block; }

  /* Pretty summary */
  #planner-widget .ps-wrap{ display:flex; flex-direction:column; gap:12px; }
  #planner-widget .ps-card{
    background: var(--ux-bg);
    border: 1px solid var(--ux-line);
    border-radius: 16px;
    padding: 12px 14px;
    
  }
  #planner-widget .ps-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  #planner-widget .ps-title{ font-weight:700; font-size:16px; margin:0; }
  #planner-widget .ps-sub{ font-size:12px; color: var(--ux-text2); margin-top:4px; }

  #planner-widget .ps-badges{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  #planner-widget .ps-badge{
    display:inline-flex; align-items:center; gap:8px;
    padding: 8px 10px;
    border-radius: 999px;
    border: 1px solid var(--ux-line);
    background: var(--ux-bg2);
    font-size: 12px;
    white-space: nowrap;
  }

  #planner-widget .ps-grid{ display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:8px; margin-top:10px; }
  @media (max-width: 920px){ #planner-widget .ps-grid{ grid-template-columns:1fr; } }

  #planner-widget .ps-metric{
    border: 1px solid var(--ux-line);
    background: var(--ux-bg2);
    border-radius: 12px;
    padding: 8px 10px;
    min-width: 0;
  }
  #planner-widget .ps-metric .k{
    font-size:11px; color: var(--ux-text2); line-height:1.25;
  }
  #planner-widget .ps-metric .v{
    margin-top:3px; font-weight:700; font-size:16px; line-height:1.2;
    font-variant-numeric: tabular-nums; white-space:nowrap;
  }

  #planner-widget .ps-region{
    border: 1px solid var(--ux-line);
    background: var(--ux-bg2);
    border-radius: 12px;
    padding: 10px 12px;
  }
  #planner-widget .ps-region-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  #planner-widget .ps-region-name{ font-weight:700; font-size:14px; }
  #planner-widget .ps-region-chip{
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid var(--ux-line);
    background: var(--ux-bg2);
    font-size: 12px;
    white-space: nowrap;
  }
  #planner-widget .ps-formats{ display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  #planner-widget .ps-fmt{
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid var(--ux-line);
    background: var(--ux-bg2);
    font-size: 12px;
  }

  #planner-widget .ps-warn{
    margin-top:10px;
    padding: 10px 12px;
    border-radius:12px;
    border: 1px solid var(--ux-warn-line);
    background: var(--ux-warn-bg);
    font-size: 12px;
    color: var(--ux-text2);
  }
  #planner-widget .ps-warn-h{
    display:block; font-size:11px; font-weight:700; letter-spacing:.06em;
    text-transform:uppercase; color:var(--ux-warn); margin-bottom:2px;
  }
  /* Каждое предупреждение — своя строка со знаком. Слитный абзац через
     <br> читался как один длинный текст, и число проблем было не видно. */
  #planner-widget .ps-warn-item{
    display:flex; gap:7px; align-items:flex-start;
    padding:6px 0; line-height:1.4;
    border-top:1px solid var(--ux-warn-line);
  }
  #planner-widget .ps-warn-item::before{
    content:"\u26A0"; flex:0 0 auto; color:var(--ux-warn); font-size:11px; line-height:1.5;
  }

  #planner-widget .ps-details{
    margin-top:10px;
    background: rgba(255,255,255,.45);
    border: 1px solid var(--ux-line);
    border-radius: 16px;
    padding: 10px 12px;
  }
  #planner-widget .ps-details summary{ cursor:pointer; font-weight:700; list-style:none; }
  #planner-widget .ps-details summary::-webkit-details-marker{ display:none; }
  #planner-widget .ps-details .hint{ font-size:12px; color: var(--ux-text2); margin-top:6px; }


  .ps-wrap{display:grid;gap:12px;}
  .ps-card{
    background:#fff;border:1px solid var(--ux-line);border-radius:16px;
    padding:14px; 
  }
  .ps-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;}
  .ps-title{font-weight:700;font-size:16px;line-height:1.2;}
  .ps-sub{color:var(--ux-text3);font-size:12px;margin-top:4px;}
  .ps-badges{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  .ps-badge{font-size:12px;padding:6px 10px;border-radius:999px;background:#F2F4F7;color:var(--ux-text);}
  .ps-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px;}
  @media (max-width: 980px){ .ps-grid{grid-template-columns:repeat(2,minmax(0,1fr));} }
  .ps-metric{border:1px solid var(--ux-line);border-radius:12px;padding:10px 12px;background:var(--ux-bg2);}
  .ps-metric .k{font-size:12px;color:var(--ux-text3);}
  .ps-metric .v{font-size:16px;font-weight:700;margin-top:6px;color:var(--ux-text);}
  .ps-regions{display:grid;gap:10px;margin-top:12px;}
  .ps-region-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}
  .ps-region-name{font-weight:700;font-size:14px;}
  .ps-chip{font-size:12px;padding:6px 10px;border-radius:999px;background:#F2EFFE;color:var(--ux-accent-ink);}
  .ps-mini{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
  .ps-mini span{font-size:12px;padding:6px 10px;border-radius:12px;background:var(--ux-bg2);border:1px solid var(--ux-line);color:var(--ux-text);}
  .ps-warn{border:1px solid var(--ux-warn-line);background:var(--ux-warn-bg);color:var(--ux-warn);border-radius:12px;padding:10px 12px;font-size:12px;line-height:1.35;}
  .ps-warn b{font-weight:700;}

  /* --- Region input UI --- */
.region-field{
  position: relative;
}

#region-field #city-search{
  width: 100%;
  padding-right: 38px;
}

.region-spinner{
  position: absolute;
  right: 12px;
  top: 50%;
  width: 16px;
  height: 16px;
  transform: translateY(-50%);
  border-radius: 50%;
  border: 2px solid rgba(17, 24, 39, 0.18);
  border-top-color: rgba(17, 24, 39, 0.65);
  animation: regionSpin .8s linear infinite;
  display: none;
  pointer-events: none;
}

.region-overlay{
  position: absolute;
  inset: 0;
  border-radius: 12px;
  background: rgba(243, 244, 246, 0.72);
  backdrop-filter: blur(2px);
  display: none;
  align-items: center;
  justify-content: center;
  z-index: 5;
}

.region-overlay-inner{
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: var(--ux-text2);
  background: rgba(255,255,255,0.85);
  border: 1px solid var(--ux-line);
  padding: 10px 12px;
  border-radius: 999px;
}

.region-overlay-spinner{
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid rgba(17, 24, 39, 0.18);
  border-top-color: rgba(17, 24, 39, 0.65);
  animation: regionSpin .8s linear infinite;
}

@keyframes regionSpin{
  from{ transform: rotate(0deg); }
  to{ transform: rotate(360deg); }
}
@keyframes spin{
  from{ transform: rotate(0deg); }
  to{ transform: rotate(360deg); }
}


  #planner-widget .fmt-toggle{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 90%;
    margin: 12px 12px 12px 12px;
    padding: 12px 14px;
    border-radius: 12px;
    border: 1px solid rgba(17, 23, 42, .14);
    background: rgba(255, 255, 255, .92);
    font-weight: 600;
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    user-select: none;
    box-shadow: 0 6px 18px rgba(17, 23, 42, .06);
    transition: transform .12s ease, box-shadow .12s ease, background-color .12s ease;
  }

  #planner-widget .fmt-toggle:hover{
    background: rgba(255, 255, 255, 1);
    box-shadow: 0 10px 26px rgba(17, 23, 42, .10);
    transform: translateY(-1px);
  }

  #planner-widget .fmt-toggle:active{
    transform: translateY(0px);
    box-shadow: 0 6px 18px rgba(17, 23, 42, .06);
  }

  #planner-widget .fmt-toggle:focus{ outline: none; }
  #planner-widget .fmt-toggle:focus-visible{
    outline: 3px solid rgba(47, 98, 255, .25);
    outline-offset: 2px;
  }

  #planner-widget .fmt-tip::before,
  #planner-widget .fmt-tip::after { display: none !important; content: none !important; }

  #fmt-tooltip-portal {
    display: none !important;
    opacity: 0 !important;
    visibility: hidden !important;
    pointer-events: none !important;
  }

  #planner-widget .owner-collapse { margin-top: 6px; }

  #planner-widget .owner-wrap.owner-collapsed{
    max-height: 128px;
    overflow: hidden;
    position: relative;
    border-radius: 16px;
  }

  #planner-widget .owner-wrap.owner-collapsed:after{
    content:"";
    position:absolute;
    left:0; right:0; bottom:0;
    height:44px;
    pointer-events:none;
    background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1));
  }

  #planner-widget #owner-wrap{
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  @media (max-width: 560px){
    #planner-widget #owner-wrap{ grid-template-columns: 1fr; }
  }

  .weekday-row{ display:flex; gap:8px; flex-wrap:wrap; }
  .ux-chip{ display:inline-flex; gap:8px; align-items:center; padding:8px 10px; border:1px solid var(--ux-line2); border-radius:999px; background:#fff; font-size:12px; cursor:pointer; }
  .ux-chip input{ margin:0; }

  #planner-widget .weekly-days{ display: grid; gap: 10px; margin-top: 10px; }

  #planner-widget .wd-card{
    border: 1px solid var(--ux-line);
    background: var(--ux-bg2);
    border-radius: 16px;
    padding: 12px;
  }

  #planner-widget .wd-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
  #planner-widget .wd-left{ display:flex; align-items:center; gap:10px; min-width: 0; }
  #planner-widget .wd-title{ font-weight: 700; font-size: 14px; white-space: nowrap; }
  #planner-widget .wd-sub{ font-size: 12px; color: var(--ux-text2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width: 360px; }
  #planner-widget .wd-actions{ display:flex; gap:8px; align-items:center; }
  #planner-widget .wd-btn{ padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(17, 23, 42, .14); background: var(--ux-bg); cursor: pointer; font-weight: 600; font-size: 12px; }
  #planner-widget .wd-btn:disabled{ opacity: .5; cursor: not-allowed; }
  #planner-widget .wd-rows{ display: grid; gap: 8px; }
  #planner-widget .wd-row{ display:flex; gap:10px; align-items:center; flex-wrap: wrap; }
  #planner-widget .wd-row .ux-input{ width: 160px; max-width: 42vw; }
  #planner-widget .wd-remove{ padding: 8px 10px; border-radius: 12px; border: 1px solid var(--ux-danger); background: var(--ux-danger-bg); cursor: pointer; font-weight: 700; font-size: 12px; }
  #planner-widget .wd-bars{ margin-top: 10px; display:flex; flex-direction: column; gap: 6px; }
  #planner-widget .wd-barline{ height: 10px; border-radius: 999px; background: rgba(15,23,42,.06); position: relative; overflow: hidden; }
  #planner-widget .wd-seg{ position:absolute; top:0; bottom:0; border-radius: 999px; background: rgba(79,43,232,.35); }
  #planner-widget .wd-barhint{ font-size: 12px; color: var(--ux-text2); }

  #planner-widget #owner-wrap{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 8px; }
  @media (max-width: 560px){ #planner-widget #owner-wrap{ grid-template-columns: 1fr; } }

  #planner-widget .own-card{
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding: 14px 14px; border-radius:16px;
    border: 1px solid var(--ux-line); background: var(--ux-bg);
    
    cursor:pointer; user-select:none;
    transition: transform .12s ease, box-shadow .12s ease, background-color .12s ease, border-color .12s ease;
  }
  #planner-widget .own-card:hover{ transform: translateY(-1px);  background: var(--ux-bg); }
  #planner-widget .own-card:active{ transform: translateY(0px);  }
  #planner-widget .own-left{ min-width:0; }
  #planner-widget .own-title{ font-weight: 700; font-size: 16px; color:var(--ux-text); line-height: 1.2; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; max-width: 100%; }
  #planner-widget .own-countline{ margin-top: 6px; font-size: 14px; color:var(--ux-text3); font-weight: 600; }
  #planner-widget .own-tip{ flex: 0 0 auto; width: 28px; height: 28px; border-radius: 999px; border: 1px solid var(--ux-line2); background: var(--ux-bg); color: var(--ux-text2); font-weight: 700; cursor: pointer; display:flex; align-items:center; justify-content:center;  }
  #planner-widget .own-card.is-selected{ border-color: rgba(79,43,232,.55);  background: var(--ux-accent-soft); }
  #planner-widget .own-card.is-selected .own-title{ color:var(--ux-accent-ink); }

  #planner-widget .owner-wrap.owner-collapsed{ max-height: 220px; overflow: hidden; position: relative; border-radius: 16px; }
  #planner-widget .owner-wrap.owner-collapsed:after{ content:""; position:absolute; left:0; right:0; bottom:0; height:60px; pointer-events:none; background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1)); }

  #planner-widget .ps-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:nowrap; }
  #planner-widget .ps-badges{ margin-left:auto; display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; max-width: 60%; }
  #planner-widget .ps-badge{ white-space:nowrap; }

  @media (max-width: 820px){
    #planner-widget .ps-head{ flex-direction:column; flex-wrap:nowrap; }
    #planner-widget .ps-badges{ max-width:100%; justify-content:flex-start; margin-left:0; }
  }

  #planner-widget .date-error{ margin-top:8px; font-size:14px; font-weight:600; color:#DC2626; display:none; }
  #planner-widget .ux-input.is-invalid{ border-color:#DC2626 !important; box-shadow:0 0 0 3px var(--ux-danger-bg); }

  /* ===== PANELS ===== */
  #planner-widget .ux-panel{
    background: var(--ux-bg);
    border: 1px solid var(--ux-line);
    border-radius: var(--ux-radius);
    padding: 20px 22px;
    min-width: 0;
  }
  @media (max-width: 640px){ #planner-widget .ux-panel{ padding: 14px; } }

  /* ===== WIZARD CHIPS (step tabs) ===== */
  #planner-widget .wiz-steps{
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 16px;
    position: sticky;
    top: 12px;
    z-index: 60;
    background: rgba(255,255,255,0.94);
    
    -webkit-
    padding: 6px 0 8px;
    border-radius: 10px;
  }
  #planner-widget .wiz-chip{
    padding: 6px 14px;
    border: 1px solid var(--ux-line2);
    border-radius: 999px;
    background: var(--ux-bg);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    color: var(--ux-text2);
    transition: background .12s ease, border-color .12s ease, color .12s ease;
  }
  #planner-widget .wiz-chip:hover{
    background: #fff;
    border-color: var(--ux-line2);
  }
  #planner-widget .wiz-chip.active{
    background: var(--ux-accent);
    border-color: var(--ux-accent);
    color: #fff;
  }
  #planner-widget .wiz-chip.done{
    background: var(--ux-ok-bg);
    border-color: var(--ux-ok-line);
    color: var(--ux-ok);
  }
  #planner-widget .wiz-chip.done.active{
    background: var(--ux-accent);
    border-color: var(--ux-accent);
    color: #fff;
  }

  /* ===== SCHEDULE CHIPS ===== */
  #planner-widget .sch-chip{
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:8px 14px; min-width:76px; text-align:center;
    border:1.5px solid var(--ux-line2); border-radius:12px;
    background:#fff; cursor:pointer;
    transition:border-color .12s, background .12s, box-shadow .12s;
  }
  #planner-widget .sch-chip:hover{
    border-color:rgba(79,43,232,.4); background:var(--ux-accent-soft);
  }
  #planner-widget .sch-chip.active{
    border-color:var(--ux-accent); background:var(--ux-accent-soft); color:var(--ux-accent-ink);
  }
  #planner-widget .sch-chip-name{ font-size:13px; font-weight:600; }
  #planner-widget .sch-chip-time{ font-size:11px; color:var(--ux-text2); margin-top:2px; }
  #planner-widget .sch-chip.active .sch-chip-time{ color:var(--ux-accent-ink); }
  #planner-widget .pct-chip{
    padding:6px 14px; font-size:13px; font-weight:600;
    border:1.5px solid var(--ux-line2); border-radius:12px;
    background:#fff; cursor:pointer; color:inherit;
    transition:border-color .12s, background .12s;
  }
  #planner-widget .pct-chip:hover{ border-color:rgba(79,43,232,.4); background:var(--ux-accent-soft); }
  #planner-widget .pct-chip.active{ border-color:var(--ux-accent); background:var(--ux-accent-soft); color:var(--ux-accent-ink); }

  /* ===== NAV ROW ===== */
  #planner-widget .wiz-nav{
    display: flex;
    gap: 10px;
    margin-top: 16px;
    flex-wrap: wrap;
  }

  /* ===== BUTTONS ===== */
  #planner-widget .wiz-btn{
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 22px;
    border-radius: 12px;
    border: 1px solid var(--ux-accent);
    background: var(--ux-accent);
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background .14s ease, box-shadow .14s ease, transform .12s ease;
    white-space: nowrap;
    user-select: none;
  }
  #planner-widget .wiz-btn:hover{
    background: var(--ux-accent-ink);
    border-color: var(--ux-accent-ink);
    box-shadow: none;
  }
  #planner-widget .wiz-btn:active{ transform: translateY(1px); }
  #planner-widget .wiz-btn.ghost{
    background: var(--ux-bg);
    border-color: var(--ux-line2);
    color: rgba(11,18,32,.80);
  }
  #planner-widget .wiz-btn.ghost:hover{
    background: #fff;
    border-color: var(--ux-line2);
    
  }
  #planner-widget .wiz-btn:disabled{
    opacity: .45;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  /* ===== RADIO LABELS ===== */
  #planner-widget .ux-radio{
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    margin-bottom: 6px;
    font-size: 14px;
  }
  #planner-widget .ux-radio input[type="radio"]{ flex-shrink: 0; }

  /* ===== SELECTION MODE CHIPS ===== */
  #planner-widget .sel-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;}
  #planner-widget .sel-chip{
    display:flex;flex-direction:column;align-items:center;gap:3px;
    padding:10px 12px;border:1.5px solid var(--ux-line);border-radius:12px;
    background:#fff;cursor:pointer;font-size:12px;font-weight:500;color:var(--ux-text2);
    transition:all 0.12s;min-width:76px;text-align:center;
  }
  #planner-widget .sel-chip{position:relative;}
  #planner-widget .sel-chip:hover{border-color:var(--ux-accent-line);background:#fff;}
  #planner-widget .sel-chip.active{
    border-color:var(--ux-accent);background:var(--ux-accent-soft);color:var(--ux-accent-ink);font-weight:600;
    box-shadow:inset 0 0 0 1px var(--ux-accent);
  }
  #planner-widget .sel-chip.active::after{
    content:"\u2713";position:absolute;top:3px;right:6px;
    font-size:11px;font-weight:700;color:var(--ux-accent);line-height:1;
  }
  #planner-widget .sel-chip-ico{font-size:18px;line-height:1;}

  /* ===== STRATEGY / BID CHIPS ===== */
  #planner-widget .strategy-chips{display:flex;gap:8px;}
  /* Длительность ролика — может быть много вариантов (5..150 сек), поэтому
     галерея с горизонтальным скроллом вместо равного flex-растяжения. */
  #planner-widget .strategy-chips.duration-chips{
    flex-wrap:nowrap;overflow-x:auto;padding-bottom:6px;-webkit-overflow-scrolling:touch;
    scrollbar-width:thin;
  }
  #planner-widget .strategy-chips.duration-chips .str-chip{flex:0 0 auto;min-width:64px;}
  #planner-widget .strategy-chips.duration-chips .str-chip-body{padding:8px 14px;text-align:center;}
  #planner-widget .strategy-chips.duration-chips .str-chip-title{white-space:nowrap;}
  #planner-widget .str-chip{flex:1;cursor:pointer;display:block;}
  #planner-widget .str-chip input[type="radio"],
  #planner-widget .str-chip input[type="checkbox"]{display:none;}
  #planner-widget .str-chip-body{
    padding:10px 12px;border:1.5px solid var(--ux-line);border-radius:12px;
    background:#fff;transition:all 0.12s;
  }
  #planner-widget .str-chip:hover .str-chip-body{border-color:var(--ux-accent-line);background:#fff;}
  #planner-widget .str-chip input:checked + .str-chip-body{
    border-color:var(--ux-accent);background:var(--ux-accent-soft);color:var(--ux-accent-ink);
    box-shadow:inset 0 0 0 1px var(--ux-accent);
  }
  #planner-widget .str-chip input:checked + .str-chip-body .str-chip-title::before{
    content:"\u2713\u00A0";color:var(--ux-accent);font-weight:700;
  }
  #planner-widget .str-chip-title{font-weight:600;font-size:13px;}
  #planner-widget .str-chip-desc{font-size:11px;color:var(--ux-text3);margin-top:2px;}
  #planner-widget .str-chip input:checked + .str-chip-body .str-chip-desc{color:var(--ux-accent-ink);}

  /* ===== CONSTRUCTIONS CHIP ===== */
  #planner-widget .cns-chip{
    padding:10px 14px;border:1.5px solid var(--ux-line);border-radius:12px;
    background:#fff;cursor:pointer;transition:all 0.12s;
    display:flex;align-items:center;gap:10px;margin-top:8px;
  }
  #planner-widget .cns-chip:hover{border-color:var(--ux-accent-line);background:#fff;}
  #planner-widget .cns-chip.active{
    border-color:var(--ux-accent);background:var(--ux-accent-soft);color:var(--ux-accent-ink);
    box-shadow:inset 0 0 0 1px var(--ux-accent);
  }
  #planner-widget .cns-chip.active .str-chip-desc{color:var(--ux-accent-ink);}
  #planner-widget .cns-chip-ico{font-size:18px;line-height:1;flex-shrink:0;}
  #planner-widget .cns-chip-body{flex:1;}
  #planner-widget .cns-chip-badge{
    font-size:12px;font-weight:700;color:var(--ux-accent);
    background:var(--ux-accent-line);border-radius:20px;padding:2px 8px;
    display:none;
  }
  #planner-widget .cns-chip.active .cns-chip-badge[data-val]{display:inline;}

  /* ===== VK AFFINITY CARD ===== */
  #planner-widget .vk-card{
    display:flex;align-items:center;gap:12px;
    padding:12px 14px;border:1.5px solid var(--ux-line);border-radius:12px;
    background:#fff;cursor:pointer;transition:all 0.12s;
  }
  #planner-widget .vk-card:hover{border-color:var(--ux-accent-line);background:#fff;}
  #planner-widget .vk-card.active{
    border-color:var(--ux-accent);background:var(--ux-accent-soft);
    box-shadow:inset 0 0 0 1px var(--ux-accent);
  }
  #planner-widget .vk-card-icon{
    width:38px;height:38px;border-radius:10px;
    background:#0077ff;color:#fff;
    display:flex;align-items:center;justify-content:center;
    font-weight:800;font-size:15px;letter-spacing:-0.5px;flex-shrink:0;
  }
  #planner-widget .vk-card-body{flex:1;}
  #planner-widget .vk-card-title{font-weight:600;font-size:13px;color:var(--ux-text);}
  #planner-widget .vk-card-desc{font-size:11px;color:var(--ux-text3);margin-top:2px;}
  #planner-widget .vk-card.active .vk-card-desc{color:var(--ux-accent-ink);}
  #planner-widget .vk-toggle{
    width:38px;height:22px;border-radius:11px;
    background:var(--ux-line2);transition:background 0.15s;flex-shrink:0;position:relative;
  }
  #planner-widget .vk-card.active .vk-toggle{background:var(--ux-accent);}
  #planner-widget .vk-toggle::after{
    content:'';position:absolute;top:3px;left:3px;
    width:16px;height:16px;border-radius:50%;background:#fff;
    box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left 0.15s;
  }
  #planner-widget .vk-card.active .vk-toggle::after{left:19px;}

  /* ===== PER-CITY BUDGET ===== */
  #planner-widget .per-city-row{
    display:flex;align-items:center;gap:8px;margin-bottom:6px;
  }
  #planner-widget .per-city-row-label{
    flex:1;font-size:13px;font-weight:500;color:var(--ux-text2);min-width:0;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  #planner-widget .per-city-row .ux-input{
    width:130px;flex-shrink:0;text-align:right;
  }

  /* ===== BUDGET EXTRAS (НДС / commission) ===== */
  #planner-widget .ux-toggle-track{
    position:relative;display:inline-block;width:36px;height:20px;
    background:var(--ux-line2);border-radius:999px;transition:background .2s;flex-shrink:0;
  }
  #planner-widget .ux-toggle-input{ position:absolute;opacity:0;width:0;height:0; }
  #planner-widget .ux-toggle-thumb{
    position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;
    background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s;
    pointer-events:none;
  }
  #planner-widget .ux-toggle-input:checked ~ .ux-toggle-thumb{ transform:translateX(16px); }
  #planner-widget .ux-toggle-input:checked + .ux-toggle-thumb{ transform:translateX(16px); }
  #planner-widget .ux-toggle-track:has(.ux-toggle-input:checked){ background:var(--ux-accent); }
  #planner-widget .reco-tier-btn{
    display:inline-flex;align-items:center;gap:6px;padding:6px 14px;
    border-radius:10px;border:1.5px solid var(--ux-accent-line);background:var(--ux-accent-soft);
    cursor:pointer;font-size:13px;font-weight:600;color:var(--ux-accent);
    transition:background .15s,border-color .15s;
  }
  #planner-widget .reco-tier-btn input{ display:none; }
  #planner-widget .reco-tier-btn:has(input:checked){ background:var(--ux-accent);color:#fff;border-color:var(--ux-accent); }
  #planner-widget .reco-tier-btn{ flex-direction:column;align-items:flex-start;gap:1px;padding:7px 12px; }
  #planner-widget .rtb-label{ font-size:10px;font-weight:500;color:var(--ux-accent-ink);text-transform:uppercase;letter-spacing:.4px; }
  #planner-widget .reco-tier-btn:has(input:checked) .rtb-label{ color:var(--ux-accent-line); }
  #planner-widget .rtb-sum{ font-size:13px;font-weight:700;white-space:nowrap; }
  /* Скелетон на месте суммы, пока идёт пересчёт по адресной программе */
  #planner-widget .rtb-sum.rtb-skel{
    display:inline-block;min-width:78px;height:14px;border-radius:4px;color:transparent;
    background:linear-gradient(90deg,var(--ux-accent-line) 25%,var(--ux-accent-soft) 50%,var(--ux-accent-line) 75%);
    background-size:200% 100%;animation:rtbShimmer 1.1s ease-in-out infinite;
  }
  #planner-widget .reco-tier-btn:has(input:checked) .rtb-sum.rtb-skel{
    background:linear-gradient(90deg,var(--ux-accent) 25%,var(--ux-accent-line) 50%,var(--ux-accent) 75%);
    background-size:200% 100%;
  }
  @keyframes rtbShimmer{ 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }
  #planner-widget .budget-tier-chip{
    display:inline-flex;flex-direction:column;align-items:flex-start;
    gap:1px;padding:7px 12px;border-radius:10px;border:1.5px solid var(--ux-accent-line);
    background:var(--ux-accent-soft);cursor:pointer;transition:background .15s,border-color .15s;
    font-size:11px;color:var(--ux-accent);font-weight:600;line-height:1.3;
  }
  #planner-widget .budget-tier-chip:hover{ background:var(--ux-accent-soft);border-color:var(--ux-accent-line); }
  #planner-widget .budget-tier-chip .btc-label{ font-size:10px;font-weight:500;color:var(--ux-accent-ink);text-transform:uppercase;letter-spacing:.4px; }
  #planner-widget .budget-extra-row{
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 8px;
  }
  #planner-widget .budget-extra-row label{
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    white-space: nowrap;
  }
  #planner-widget .budget-extra-rate{
    display: none;
    align-items: center;
    gap: 4px;
    font-size: 13px;
  }
  #planner-widget .budget-extra-rate input{
    width: 64px;
    padding: 4px 8px;
    border: 1px solid var(--ux-line2);
    border-radius: 8px;
    font-size: 13px;
    box-sizing: border-box;
  }
  #planner-widget .budget-extra-hint{
    display: none;
    margin-top: 4px;
    font-size: 12px;
    color: var(--ux-text3);
    padding: 6px 10px;
    background: var(--ux-accent-soft);
    border: 1px solid var(--ux-accent-soft);
    border-radius: 8px;
  }

  /* ===== FLOATING RECALC BUTTON ===== */
  #planner-recalc-float {
    position: fixed;
    right: 28px;
    z-index: 99999;
    display: none;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--ux-accent);
    color: #fff;
    border: none;
    border-radius:20px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    
    transition: top .15s, opacity .2s;
    white-space: nowrap;
  }
  #planner-recalc-float:hover { background: var(--ux-accent-ink); }
  #planner-recalc-float .rf-icon { font-size: 16px; line-height: 1; }

  /* ===== PER-REGION CONSTRUCTIONS ===== */
  #planner-widget .cns-per-region-toggle{
    display:inline-flex; align-items:center; gap:5px;
    font-size:12px; font-weight:600; color:var(--ux-accent);
    cursor:pointer; padding:4px 0; user-select:none;
    background:none; border:none;
  }
  #planner-widget .cns-per-region-rows{ display:flex; flex-direction:column; gap:6px; margin-top:6px; }
  #planner-widget .cns-per-region-row{
    display:flex; align-items:center; gap:8px;
  }
  #planner-widget .cns-per-region-label{
    flex:1; font-size:12px; color:var(--ux-text2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  #planner-widget .cns-per-region-row .ux-input{
    width:80px; flex:none; font-size:13px; padding:5px 8px;
  }
  #planner-widget .cns-per-region-unit{
    font-size:12px; color:var(--ux-text3); min-width:24px;
  }

  /* ===== PER-CITY FORMATS ===== */
  #planner-widget .city-fmt-rows{ display:flex; flex-direction:column; gap:4px; margin-top:6px; }
  #planner-widget .city-fmt-row{ display:flex; align-items:center; gap:5px; flex-wrap:wrap; padding:3px 0; border-bottom:1px solid var(--ux-line); }
  #planner-widget .city-fmt-row:last-child{ border-bottom:none; }
  #planner-widget .city-fmt-lbl{ font-size:12px; font-weight:600; color:var(--ux-text2); min-width:72px; max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0; }
  #planner-widget .city-fmt-chip{ padding:2px 8px; border-radius:999px; border:1px solid var(--ux-line2); background:#fff; font-size:11px; cursor:pointer; white-space:nowrap; transition:background .1s,border-color .1s; }
  #planner-widget .city-fmt-chip.on{ border-color:var(--ux-accent); background:var(--ux-accent-soft); color:var(--ux-accent-ink); font-weight:600; box-shadow:inset 0 0 0 1px var(--ux-accent); }
  #planner-widget .city-fmt-chip b{
    font-family:var(--ux-mono); font-variant-numeric:tabular-nums;
    font-weight:600; font-size:10.5px; color:var(--ux-text3); margin-left:6px;
  }
  #planner-widget .city-fmt-chip.on b{ color:var(--ux-accent-ink); }
  #planner-widget .city-fmt-none{ font-size:11px; color:var(--ux-text3); }
  #planner-widget .city-fmt-lbl{ max-width:none; }
  #planner-widget .city-fmt-reset{ font-size:11px; color:var(--ux-text3); cursor:pointer; padding:2px 4px; border:none; background:none; white-space:nowrap; }
  #planner-widget .city-fmt-reset:hover{ color:var(--ux-danger); }

  /* ===== SEND PLAN BUTTON ===== */
  #planner-widget #send-plan-btn{
    background:var(--ux-ok); color:#fff; border:1.5px solid var(--ux-ok);
    padding:8px 18px; border-radius:10px;
    font-size:13px; font-weight:600; cursor:pointer;
    display:none;
    transition:background 0.15s, opacity 0.15s;
  }
  #planner-widget #send-plan-btn:hover{ background:var(--ux-ok); }
  #planner-widget #send-plan-btn:disabled{ opacity:0.6; cursor:default; }

  /* ===== SEND PLAN POPUP ===== */
  #send-plan-popup{
    display:none; position:fixed; inset:0; z-index:999999;
    background:var(--ux-text3); backdrop-filter:blur(6px);
    align-items:center; justify-content:center;
  }
  #send-plan-popup.active{ display:flex; }
  #send-plan-popup .spp-card{
    background:#fff; border-radius:20px; padding:40px 40px 36px;
    max-width:380px; width:90%; text-align:center;
    box-shadow:0 24px 64px rgba(79,43,232,0.18), 0 2px 8px var(--ux-line);
    animation:spp-in 0.22s cubic-bezier(.34,1.36,.64,1);
  }
  @keyframes spp-in{
    from{ transform:scale(0.82) translateY(12px); opacity:0; }
    to  { transform:scale(1)    translateY(0);    opacity:1; }
  }
  #send-plan-popup .spp-icon{
    width:64px; height:64px; border-radius:50%;
    background:linear-gradient(135deg,var(--ux-accent),var(--ux-accent));
    display:flex; align-items:center; justify-content:center;
    margin:0 auto 20px; box-shadow:0 8px 24px rgba(79,43,232,0.35);
  }
  #send-plan-popup .spp-icon svg{ width:30px; height:30px; }
  #send-plan-popup .spp-title{
    font-size:18px; font-weight:700; color:var(--ux-text);
    margin-bottom:8px; letter-spacing:-0.2px;
  }
  #send-plan-popup .spp-sub{
    font-size:13px; color:var(--ux-text3); line-height:1.55;
    margin-bottom:28px;
  }
  #send-plan-popup .spp-close{
    background:var(--ux-accent); color:#fff; border:none;
    padding:12px 36px; border-radius:12px;
    font-size:14px; font-weight:600; cursor:pointer;
    transition:background 0.15s, box-shadow 0.15s;
    box-shadow:0 4px 14px rgba(79,43,232,0.35);
  }
  #send-plan-popup .spp-close:hover{
    background:var(--ux-accent-ink);
    box-shadow:0 6px 20px rgba(79,43,232,0.45);
  }

  /* ===== CALC HISTORY ===== */
  #planner-widget .calc-history-toggle{
    display:inline-flex; align-items:center; gap:6px;
    font-size:13px; font-weight:600; color:var(--ux-accent);
    cursor:pointer; padding:4px 0; user-select:none;
  }
  #planner-widget .calc-history-list{
    display:flex; flex-direction:column; gap:6px; margin-top:8px;
  }
  #planner-widget .calc-history-item{
    background:var(--ux-accent-soft); border:1.5px solid var(--ux-accent-line);
    border-radius:10px; padding:8px 12px;
    cursor:pointer; font-size:13px;
    transition:border-color 0.15s, background 0.15s;
  }
  #planner-widget .calc-history-item:hover{
    background:var(--ux-line)9ff; border-color:var(--ux-accent-line);
  }
  #planner-widget .calc-history-date{ font-size:11px; color:var(--ux-text3); margin-bottom:2px; }
  #planner-widget .calc-history-title{ font-weight:600; color:var(--ux-text); }
  #planner-widget .calc-history-meta{ font-size:11px; color:var(--ux-text3); margin-top:2px; }

  /* ===== ЗАГОЛОВОК ШАГА ===== */
  /* Раньше шаг назывался «Настройки» и не говорил, что внутри. Теперь у каждого
     шага есть название и строчка о том, что здесь решается. */
  #planner-widget .wiz-step-head{
    margin: 0 0 14px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--ux-line);
  }
  #planner-widget .wiz-step-title{
    font-size: 16px; font-weight: 700; color: var(--ux-text); line-height: 1.25;
  }
  #planner-widget .wiz-step-sub{
    margin-top: 3px; font-size:12px; color: var(--ux-text3); line-height: 1.45;
  }

  /* ===== ВАЛИДАЦИЯ ПОЛЕЙ (вместо alert) ===== */
  #planner-widget .fld-invalid,
  #planner-widget .fld-invalid:focus{
    border-color:var(--ux-danger) !important;
    box-shadow:0 0 0 3px var(--ux-danger-bg) !important;
  }
  /* Подсветка для блоков без собственной рамки (чипы расписания, список регионов) */
  #planner-widget .fld-invalid-box{
    border-radius:12px;
    box-shadow:0 0 0 2px var(--ux-danger), 0 0 0 6px var(--ux-danger-bg);
  }
  #planner-widget .fld-err{
    display:flex; align-items:flex-start; gap:6px;
    margin-top:6px; font-size:12px; line-height:1.4; color:var(--ux-danger);
  }
  #planner-widget .fld-err::before{ content:"!"; flex-shrink:0;
    width:15px; height:15px; border-radius:50%; background:var(--ux-danger); color:#fff;
    font-size:10px; font-weight:700; line-height:15px; text-align:center; }

  /* ===== ТОСТ ===== */
  #planner-toast{
    position:fixed; left:50%; bottom:26px; transform:translateX(-50%) translateY(8px);
    z-index:100000; max-width:min(440px, 92vw);
    background:var(--ux-text); color:#fff; padding:11px 18px; border-radius:12px;
    font-size:13px; line-height:1.45; box-shadow:0 10px 34px var(--ux-text3);
    opacity:0; pointer-events:none; transition:opacity .18s, transform .18s;
  }
  #planner-toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }

  /* ===== ПАНЕЛИ УПРАВЛЕНИЯ В РЕЗУЛЬТАТЕ ===== */
  #planner-widget .rc-card{
    background: var(--ux-bg);
    border: 1px solid var(--ux-line);
    border-radius:12px;
    padding: 12px 14px;
    margin-bottom: 10px;
  }
  #planner-widget .rc-head{ display:flex; align-items:baseline; gap:9px; flex-wrap:wrap; margin-bottom:10px; }
  #planner-widget .rc-head b{ font-size:13px; font-weight:700; }
  #planner-widget .rc-head span{ font-size:12px; color:var(--ux-text3); }
  #planner-widget .rc-tiers{ display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:7px; }
  @media (max-width: 720px){ #planner-widget .rc-tiers{ grid-template-columns: repeat(2, minmax(0,1fr)); } }
  #planner-widget .rc-tier{
    text-align:left; font:inherit; cursor:pointer; padding:8px 10px; border-radius:10px;
    border:1.5px solid var(--ux-line); background:#fff; transition:.12s; min-width:0;
  }
  #planner-widget .rc-tier:hover{ border-color:var(--ux-accent-line); background:var(--ux-accent-soft); }
  #planner-widget .rc-tier[aria-pressed="true"]{ border-color:var(--ux-accent); background:var(--ux-accent-soft); }
  #planner-widget .rc-tier .t{
    display:block; font-size:10px; font-weight:600; letter-spacing:.06em;
    text-transform:uppercase; color:var(--ux-text3);
  }
  #planner-widget .rc-tier[aria-pressed="true"] .t{ color:var(--ux-accent); }
  #planner-widget .rc-tier .v{
    display:block; font-size:14px; font-weight:700; margin-top:3px; white-space:nowrap;
  }
  #planner-widget .rc-wi-row{ display:flex; align-items:center; gap:11px; flex-wrap:wrap; }
  #planner-widget .rc-wi-row label{ font-size:12px; color:var(--ux-text2); font-weight:500; white-space:nowrap; }
  #planner-widget #rc-pph{ flex:1; min-width:150px; accent-color:var(--ux-accent); }
  #planner-widget #rc-pph-out{
    font-size:15px; font-weight:700; color:var(--ux-accent-ink); min-width:34px; text-align:right;
  }
  #planner-widget .rc-out{ margin-top:10px; font-size:12px; line-height:1.5; color:var(--ux-text2); }
  #planner-widget .rc-delta b{ font-size:16px; color:var(--ux-text); }
  #planner-widget .rc-up{
    font-size:12px; font-weight:600; color:var(--ux-danger);
    background:var(--ux-danger-bg); border-radius:6px; padding:2px 7px; margin-left:6px;
  }
  #planner-widget .rc-adv{
    margin-top:8px; padding:8px 10px; background:#fff;
    border:1px solid var(--ux-line); border-radius:8px; font-size:12px; line-height:1.5;
  }
  #planner-widget .rc-apply{
    margin-top:9px; font:600 12px var(--ux-font); border-radius:8px;
    padding:7px 14px; cursor:pointer; border:1.5px solid var(--ux-accent);
    background:var(--ux-accent); color:#fff;
  }
  #planner-widget .rc-apply:hover{ background:var(--ux-accent-ink); }

  /* ===== СТРОКА БРИФА (фаза результата) ===== */
  #planner-widget .brief-bar{
    display:flex; flex-direction:column; gap:8px;
    background: var(--ux-bg);
    border: 1px solid var(--ux-line);
    border-radius: 16px;
    padding: 10px 12px;
    margin-bottom: 14px;
  }
  #planner-widget .brief-row{ display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  #planner-widget .brief-row.second{ padding-top:8px; border-top:1px dashed var(--ux-line); }
  #planner-widget .brief-lbl{
    font-size:11px; font-weight:700; letter-spacing:.07em; text-transform:uppercase;
    color: var(--ux-text3); margin-right:2px;
  }
  #planner-widget .brief-chip{
    display:inline-flex; align-items:center; gap:6px;
    font-size:12px; font-weight:600; color:var(--ux-accent-ink);
    background:var(--ux-accent-soft); border:1px solid var(--ux-accent-line); border-radius:20px;
    padding:5px 11px; cursor:pointer;
    transition: background .12s, border-color .12s;
  }
  #planner-widget .brief-chip:hover{ background:var(--ux-accent-line); border-color:var(--ux-accent-line); }
  #planner-widget .brief-chip .k{ color:var(--ux-text3); font-weight:500; }
  #planner-widget .brief-chip.sm{
    font-size:12px; padding:4px 9px; font-weight:500;
    background:#fff; border-color:var(--ux-line); color:var(--ux-text2);
  }
  #planner-widget .brief-chip.sm.on{
    background:var(--ux-accent-soft); border-color:var(--ux-accent-line); color:var(--ux-accent-ink); font-weight:600;
  }
  #planner-widget .brief-chip.edit{
    margin-left:auto; background:#fff; border-color:var(--ux-accent-line); color:var(--ux-accent);
  }
  @media (max-width: 560px){
    #planner-widget .brief-chip.edit{ margin-left:0; }
  }

  /* ===================================================================
     ПЕРЕНЕСЕНО ИЗ БЛОКА ТИЛЬДЫ 22.08.2026
     Эти правила жили в инлайновом <style> внутри Tilda-блока
     rec2318926641 («Planner UI — Style A»), а не здесь. Блок удалён,
     потому что перебивал стили выше; но без этой части виджет остаётся
     без оформления полей ввода, кнопок, карточек форматов и галереи фото —
     widget-init.js всё это время был дельтой поверх тильдовского CSS,
     а не самостоятельной таблицей стилей.

     Перенесены только те селекторы, которых выше нет. Пятнадцать
     конфликтовавших (.wiz-chip, .wiz-btn, .ux-panel, .wiz-progress и др.)
     намеренно НЕ перенесены — их описывает код выше, и ровно из-за этого
     конфликта активный чип шага менял цвет.
     Оригинал целиком: Desktop/работа/tilda-removed-2026-08-22/
     =================================================================== */
  /* ========== container ========== */
  #planner-widget{
    color: var(--ux-text);
    background: transparent;
    font-family: var(--ux-font);
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    position: relative;
    isolation: isolate; /* свой stacking context, чтобы тултипы/слои предсказуемо */
  }
  #planner-widget button,
  #planner-widget input,
  #planner-widget select,
  #planner-widget textarea{ font-family: inherit; }

  /* Цифры, которые сравнивают взглядом по вертикали: деньги, выходы,
     OTS, коды экранов. Табличные знаки ставят разряды столбиком. */
  #planner-widget .ux-num{
    font-family: var(--ux-mono);
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
  }
  /* Ровный фон вместо трёх радиальных пятен, шума и наложения:
     градиент был единственным местом, где акцент работал декоративно,
     а фильтр saturate + mix-blend-mode перерисовывались на прокрутке. */
  #planner-widget::before{
    content:"";
    position:absolute;
    inset:-24px;
    z-index:-1;
    border-radius: 24px;
    background: var(--ux-ground);
    pointer-events:none;
  }
  #planner-widget > div[style*="grid-template-columns"] > div{
    border-radius: var(--ux-radius);
    border: 1px solid var(--ux-line);
    background: var(--ux-bg);
    overflow: visible;
  }
  /* ========== inputs/selects (НЕ задаём width:90% глобально — это ломает компоновку) ========== */
  #planner-widget input[type="text"],
  #planner-widget input[type="number"],
  #planner-widget input[type="date"],
  #planner-widget input[type="time"]{
    border: 1px solid var(--ux-line) !important;
    border-radius: var(--ux-radius-sm) !important;
    padding: 10px 12px !important;
    background: var(--ux-bg);
    
    
    outline: 0;
    transition: box-shadow .12s ease, border-color .12s ease, background .12s ease;
  }
  #planner-widget input:focus,
  #planner-widget select:focus{
    border-color: rgba(79,43,232,.45) !important;
    box-shadow: var(--ux-ring);
  }
  /* ========== buttons ========== */
  #planner-widget .ux-btn,
  #planner-widget .fmt-pill{
    transition: transform .08s ease, box-shadow .12s ease, background-color .12s ease, border-color .12s ease;
    user-select: none;
  }
  #planner-widget .ux-btn:active,
  #planner-widget .fmt-pill:active{
    transform: scale(.98);
  }
  #planner-widget .ux-btn:disabled{
    opacity: .55;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
  /* primary calculate */
  #planner-widget .ux-primary{
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid rgba(255,255,255,.20);
    cursor: pointer;
    font-weight: 800;
    color: #fff;
    background: linear-gradient(180deg, rgba(79,43,232,.96), rgba(58,31,176,.98));
    box-shadow: none;
    position: relative;
    overflow: hidden;
  }
  #planner-widget .ux-primary::after{
    content:"";
    position:absolute;
    inset:-40%;
    background: radial-gradient(circle at 30% 30%, rgba(255,255,255,.38), transparent 45%);
    transform: rotate(12deg);
    opacity: .55;
    pointer-events:none;
  }
  #planner-widget .ux-primary:focus-visible{
    outline: 0;
    box-shadow: var(--ux-ring);
  }
  #planner-widget .ux-primary:disabled{
    opacity:.55;
    cursor:not-allowed;
    filter:saturate(.8);
  }
  /* ========== live summary ========== */
  #planner-widget .wiz-summary{
    margin-top: 10px;
    padding: 14px 16px;
    border-radius: var(--ux-radius);
    border: 1px solid var(--ux-line);
    background: linear-gradient(180deg, rgba(255,255,255,.76), rgba(255,255,255,.56));
    
    
    -webkit-
    font-size: 13px;
  }
  #planner-widget .wiz-inline-row{
    display:flex;
    gap:16px;
    flex-wrap:wrap;
    justify-content:space-between;
  }
  #planner-widget .wiz-hint{
    margin-top:10px;
    font-size:12px;
    color: var(--ux-text2);
  }
  /* ========== formats toolbar ========== */
  #planner-widget .fmt-toolbar{
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    margin: 8px 0 10px;
  }
  #planner-widget .fmt-pill{
    padding: 8px 10px;
    border-radius: 999px;
    border: 1px solid var(--ux-line);
    background: rgba(255,255,255,.58);
    cursor: pointer;
    font-size: 13px;
    font-weight: 650;
    
    
  }
  #planner-widget .fmt-pill:hover{
    background: var(--ux-bg);
  }
  /* ========== formats grid/cards ========== */
  #planner-widget .fmt-grid{
    display:grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    overflow: visible;
  }
  @media (max-width: 920px){
    #planner-widget .fmt-grid{
      grid-template-columns: 1fr;
    }
  }
  /* карточка */
  #planner-widget .fmt-card{
    position: relative;
    border-radius: var(--ux-radius);
    border: 1px solid var(--ux-line);
    background: var(--ux-bg);
    
    
    -webkit-
    padding: 14px;
    cursor: pointer;
    user-select: none;
    transition: transform .08s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease;
    overflow: visible;
    z-index: 1;
  }
  #planner-widget .fmt-card:hover{
    transform: translateY(-1px);
    border-color: rgba(79,43,232,.30);
    
    z-index: 20;
  }
  #planner-widget .fmt-card.is-selected{
    background: linear-gradient(180deg, var(--ux-bg), var(--ux-accent-soft));
    border-color: var(--ux-accent);
    box-shadow: inset 0 0 0 1px var(--ux-accent), 0 20px 52px rgba(79,43,232,.14);
    z-index: 25;
  }
  #planner-widget .fmt-card.is-disabled{
    opacity: .55;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none !important;
  }
  /* layout внутри карточки — фиксы налезания текста */
  #planner-widget .fmt-card .t{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:12px;
  }
  #planner-widget .fmt-card .fmt-left{
    flex: 1;
    min-width: 0; /* КЛЮЧЕВО: иначе title лезет под правую часть */
  }
  #planner-widget .fmt-card .title{
    font-weight: 850;
    font-size: 15px;
    line-height: 1.15;
    letter-spacing: .2px;
    white-space: normal;
    word-break: break-word;
  }
  /* (если вдруг где-то ещё используется .sub — оставляем, но по умолчанию можно не рендерить в HTML) */
  #planner-widget .fmt-card .sub{
    margin-top: 6px;
    font-size: 13px;
    color: var(--ux-text2);
    line-height: 1.35;
  }
  /* правая колонка меты */
  #planner-widget .fmt-meta{
    display:flex;
    align-items:center;
    gap:10px;
    flex-shrink: 0;
  }
  #planner-widget .fmt-count{
    font-size: 12px;
    color: var(--ux-text2);
    border: 1px solid var(--ux-line);
    background: rgba(255,255,255,.52);
    border-radius: 999px;
    padding: 6px 8px;
    min-width: 32px;
    text-align: center;
    
    
  }
  /* empty state (если будешь добавлять класс is-empty из JS) */
  #planner-widget .fmt-card.is-empty{
    opacity: .80;
  }
  #planner-widget .fmt-card.is-empty::after{
    content:"Нет экранов";
    position:absolute;
    left: 14px;
    bottom: 12px;
    font-size: 11px;
    color: var(--ux-text3);
  }
  /* ========== info icon ========== */
  #planner-widget .fmt-tip{
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: 1px solid var(--ux-line);
    background: rgba(255,255,255,.58);
    display:flex;
    align-items:center;
    justify-content:center;
    font-weight: 900;
    color: var(--ux-text2);
    cursor: pointer;
    backdrop-filter: blur(10px) saturate(150%);
    -webkit-backdrop-filter: blur(10px) saturate(150%);
  }
  #planner-widget .fmt-tip:hover{
    border-color: rgba(79,43,232,.28);
    box-shadow: 0 10px 22px rgba(16,24,40,.14);
  }
  /* ========== inline tooltip (если ты ещё используешь вложенный .fmt-tooltip внутри fmt-tip) ========== */
  #planner-widget .fmt-tooltip{
    position:absolute;
    z-index: 99999;
    left: 10px;
    top: calc(100% + 10px);
    min-width: 240px;
    max-width: 360px;
    padding: 14px 14px;
    border-radius:16px;
    border: 1px solid rgba(255,255,255,.18);
    background: rgba(17,24,39,.38); /* “тёмное стекло” */
    color: rgba(255,255,255,.94);
    box-shadow: 0 22px 55px rgba(0,0,0,.22);
    backdrop-filter: blur(18px) saturate(160%);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    opacity: 0;
    transform: translateY(-6px);
    pointer-events: none;
    transition: opacity .12s ease, transform .12s ease;
  }
  #planner-widget .fmt-tooltip::before{
    content:"";
    position:absolute;
    width: 14px;
    height: 14px;
    background: rgba(17,24,39,.38);
    border-left: 1px solid rgba(255,255,255,.14);
    border-top: 1px solid rgba(255,255,255,.14);
    transform: rotate(45deg);
    top: -7px;
    left: 18px;
  }
  #planner-widget .fmt-tooltip::after{
    content:"";
    position:absolute;
    inset:0;
    border-radius: inherit;
    pointer-events:none;
    background: linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,0) 45%);
    opacity:.35;
  }
  #planner-widget .fmt-tip:hover .fmt-tooltip,
  #planner-widget .fmt-tip.is-open .fmt-tooltip{
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  /* ========== portal tooltip (если JS создаёт .fmt-tooltip-portal в body) ========== */
  .fmt-tooltip-portal{
    position: fixed; /* важно: portal позиционируется относительно viewport */
    z-index: 2147483647;
    min-width: 260px;
    max-width: 380px;
    padding: 14px 14px;
    border-radius:16px;
    border: 1px solid rgba(255,255,255,.18);
    background: rgba(17,24,39,.38);
    color: rgba(255,255,255,.94);
    box-shadow: 0 30px 70px rgba(0,0,0,.22);
    backdrop-filter: blur(18px) saturate(160%);
    -webkit-backdrop-filter: blur(18px) saturate(160%);
    opacity: 0;
    transform: translateY(-6px);
    pointer-events: none;
    transition: opacity .12s ease, transform .12s ease;
  }
  .fmt-tooltip-portal.is-show{
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
  .fmt-tooltip-portal .tt-title{
    font-weight: 900;
    font-size: 15px;
    margin-bottom: 6px;
  }
  .fmt-tooltip-portal .tt-code{
    font-size: 12px;
    opacity: .75;
    margin-bottom: 10px;
  }
  .fmt-tooltip-portal .tt-desc{
    font-size: 13px;
    line-height: 1.45;
    opacity: .92;
  }
  .fmt-tooltip-portal .tt-foot{
    margin-top: 12px;
    font-size: 12px;
    opacity: .78;
  }
  .fmt-tooltip-portal::before{
    content:"";
    position:absolute;
    width: 14px;
    height: 14px;
    background: rgba(17,24,39,.38);
    border-left: 1px solid rgba(255,255,255,.14);
    border-top: 1px solid rgba(255,255,255,.14);
    transform: rotate(45deg);
    left: 20px;
    top: -7px; /* JS может менять */
  }
  /* ========== safety: не режем тултипы ========== */
  #planner-widget,
  #planner-widget .fmt-grid,
  #planner-widget .fmt-card{
    overflow: visible;
  }
  #planner-widget #wiz-live-summary{
    display:block !important;
  }
  /* ===== FIX: titles, empty state, tooltip arrow ===== */
  #planner-widget .fmt-left{
    min-width:0;
  }
  /* важно для переносов в flex */
  #planner-widget .fmt-card .title{
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;         /* максимум 2 строки */
    overflow: hidden;
    line-height: 1.2;
  }
  #planner-widget .fmt-empty-note{
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.25;
    color: var(--ux-text3);
  }
  /* если нет инвентаря — слегка “приглушаем” карточку, но без налезания */
  #planner-widget .fmt-card.is-empty{
    opacity: .78;
  }
  /* ===== Tooltip portal: fixed, no drift ===== */
  .fmt-tooltip-portal{
    position: fixed !important;          /* ключевое */
    z-index: 2147483647;
    /* остальное у тебя уже есть */
  }
  /* уменьшить/смягчить ромб-стрелку (или можно убрать совсем) */
  .fmt-tooltip-portal::before{
    width: 10px !important;
    height: 10px !important;
    top: -6px !important;
    border-left: 1px solid rgba(255,255,255,.10) !important;
    border-top: 1px solid rgba(255,255,255,.10) !important;
    background: rgba(17,24,39,.50) !important; /* в тон тултипу */
    opacity: .9;
  }
  /* если тултип снизу (place="top"), стрелка тоже меньше */
  .fmt-tooltip-portal[data-place="top"]::before{
    bottom: -6px !important;
  }
  /* фиксируем структуру верхней части карточки */
  #planner-widget .fmt-card .t{
    align-items: flex-start;
  }
  #planner-widget .fmt-left{
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
  /* РЕЗЕРВ под заголовок: всегда 2 строки */
  #planner-widget .fmt-card .title{
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    line-height: 1.2;
    min-height: calc(1.2em * 2);   /* вот это главное */
  }
  /* подпись про пустой инвентарь — всегда ниже и с отступом */
  #planner-widget .fmt-empty-note{
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.25;
    color: var(--ux-text3);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  /* немного визуально "приглушаем" пустые карточки, но оставляем читабельность */
  #planner-widget .fmt-card.is-empty .title{
    color: rgba(11,18,32,.78);
  }
  #planner-widget .fmt-card.is-empty .fmt-count{
    opacity: .75;
  }
  /* выключаем старый дубль пустого состояния */
  #planner-widget .fmt-card.is-empty::after{
    content: none !important;
  }
  #planner-widget .fmt-card .title{
    font-size: 14px !important;     /* было крупновато */
    font-weight: 800 !important;
    letter-spacing: .1px;
    line-height: 1.18;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    overflow: hidden;
    min-height: calc(1.18em * 2);   /* резерв под 2 строки */
  }
  #planner-widget .fmt-card .t{
    display:flex;
    align-items:flex-start;
    justify-content:space-between;
    gap:12px;
  }
  #planner-widget .fmt-left{
    min-width: 0;                 /* критично для переноса текста */
    flex: 1 1 auto;
  }
  #planner-widget .fmt-card .title{
    font-size: 14px !important;
    font-weight: 800 !important;
    line-height: 1.18;
    margin: 0;
  }
  #planner-widget .fmt-countline{
    margin-top: 6px;
    font-size: 12px;
    color: var(--ux-text2);
    line-height: 1.2;
  }
  #planner-widget .fmt-empty-note{
    margin-top: 6px;
    font-size: 12px;
    color: var(--ux-text3);
  }
  /* иконка i справа */
  #planner-widget .fmt-tip{
    flex: 0 0 auto;
    width: 28px;
    height: 28px;
    border-radius: 999px;
    display:flex;
    align-items:center;
    justify-content:center;
    border: 1px solid var(--ux-line);
    background: var(--ux-bg2);
    cursor: pointer;
  }
  /* 1) даём нормальный отступ вниз у live-сводки */
  #planner-widget #wiz-live-summary{
    margin: 0 0 12px 0 !important;   /* ключевое */
    position: relative;
    z-index: 5;                      /* выше панелей */
  }
  /* 2) нижний grid — отдельным слоем ниже */
  #planner-widget > div[style*="grid-template-columns"]{
    margin-top: 0 !important;
    position: relative;
    z-index: 1;
  }
  /* Карусель: горизонтальный скролл внутри блока */
  .screens-photos-row{
    display:flex;
    gap:12px;
    overflow-x:auto;
    overflow-y:hidden;
    padding-bottom:8px;
    max-width:100%;
    -webkit-overflow-scrolling:touch;
    scroll-snap-type:x mandatory;
  }
  .screens-photos-row > .photo-card{
    flex: 0 0 260px;           /* фикс-ширина карточки */
    border:1px solid var(--ux-line);
    border-radius:12px;
    overflow:hidden;
    background:#fff;
    scroll-snap-align:start;
  }
  .photo-card img{
    width:100%;
    height:150px;
    object-fit:cover;
    display:block;
  }
  .photo-card .meta{
    padding:10px;
    font-size:13px;
  }
  .photo-card .gid{
    font-weight:700;
    margin-bottom:4px;
  }
  .photo-card .sub{
    color:var(--ux-text3);
    font-size:12px;
  }
  #img-carousel{
    max-width: 100%; overflow: hidden;
  }
  #img-carousel .img-row{
    max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch;
  }
  /* ВАЖНО: чтобы контент в колонках НЕ раздувал grid */
  #planner-widget .planner-left,
  #planner-widget .planner-right{
    min-width: 0;         /* ключевое */
  }
  /* ===== СЕТКА ЭКРАНОВ =====
     Была горизонтальная лента: из семидесяти карточек видно четыре,
     на большой адреске их шестьсот. Раскладываем сеткой, режем по 24
     на страницу. Карточки лежат в DOM все — страница переключается
     классом, потому что обработчики «Убрать» и «Заменить» вешаются
     один раз после отрисовки. Картинки ленивые, скрытые не грузятся. */
  #img-carousel{ max-width: 100%; }
  #img-carousel .img-row{
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(158px, 1fr));
    gap: 9px;
    max-width: 100%;
    overflow: visible;
  }
  #img-carousel .img-card{
    flex: initial; width: auto; min-width: 0;
    border: 1px solid var(--ux-line);
    border-radius: var(--ux-radius-sm);
    background: var(--ux-bg);
    overflow: hidden;
    cursor: pointer;
  }
  #img-carousel .img-card:hover{ border-color: var(--ux-accent-line); }
  #img-carousel .img-card.is-susp{
    border-color: var(--ux-danger);
    box-shadow: inset 0 0 0 1px var(--ux-danger);
  }
  /* Вне текущей страницы. Порядковый номер страницы карточки лежит на
     ней самой, номер открытой — на ряду; сравниваем через :not(). */
  #img-carousel .img-row[data-page="0"] .img-card:not([data-page="0"]),
  #img-carousel .img-row[data-page="1"] .img-card:not([data-page="1"]),
  #img-carousel .img-row[data-page="2"] .img-card:not([data-page="2"]),
  #img-carousel .img-row[data-page="3"] .img-card:not([data-page="3"]),
  #img-carousel .img-row[data-page="4"] .img-card:not([data-page="4"]),
  #img-carousel .img-row[data-page="5"] .img-card:not([data-page="5"]),
  #img-carousel .img-row[data-page="6"] .img-card:not([data-page="6"]),
  #img-carousel .img-row[data-page="7"] .img-card:not([data-page="7"]),
  #img-carousel .img-row[data-page="8"] .img-card:not([data-page="8"]),
  #img-carousel .img-row[data-page="9"] .img-card:not([data-page="9"]){
    display: none;
  }
  #img-carousel .ph-img{
    aspect-ratio: 4 / 3;
    background: var(--ux-bg2);
    display: flex; align-items: center; justify-content: center;
  }
  #img-carousel .ph-img img{ width: 100%; height: 100%; object-fit: cover; display: block; }
  #img-carousel .ph-meta{ padding: 8px 10px; }
  #img-carousel .ph-gid{
    font-family: var(--ux-mono); font-size: 12px; font-weight: 600;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  #img-carousel .ph-own{ font-size: 11.5px; color: var(--ux-text3); }
  #img-carousel .ph-adr{
    font-size: 11.5px; color: var(--ux-text2); margin-top: 3px; line-height: 1.3;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  #img-carousel .ph-acts{ display: flex; gap: 5px; margin-top: 8px; }
  #img-carousel .ph-acts button{
    flex: 1; font: inherit; font-size: 11.5px; padding: 4px 6px;
    border-radius: 6px; cursor: pointer;
    border: 1px solid var(--ux-line); background: var(--ux-bg); color: var(--ux-text2);
  }
  #img-carousel .ph-acts button:hover{ border-color: var(--ux-line2); color: var(--ux-text); }
  #img-carousel .ph-acts .card-remove-btn:hover{
    border-color: var(--ux-danger); color: var(--ux-danger);
  }
  #img-carousel .ph-acts .card-replace-btn:hover{
    border-color: var(--ux-accent); color: var(--ux-accent-ink);
  }
  #img-carousel .ux-ph-note{
    font-size: 12px; color: var(--ux-text3); margin-top: 8px;
  }
  #img-carousel .img-section{ margin-top: 16px; }
  /* ===== ФИЛЬТРЫ И МАССОВЫЙ ВЫБОР В АДРЕСНОЙ ПРОГРАММЕ ===== */
  #img-carousel .ph-filters{
    display: flex; flex-wrap: wrap; gap: 7px; align-items: center; margin-bottom: 9px;
  }
  #img-carousel .ph-filters input[type="text"],
  #img-carousel .ph-filters select{
    font: inherit; font-size: 12px; padding: 5px 8px; min-width: 0;
    border: 1px solid var(--ux-line); border-radius: 6px;
    background: var(--ux-bg); color: var(--ux-text);
  }
  #img-carousel .ph-filters input[type="text"]{ flex: 1 1 150px; }
  #img-carousel .ph-filters select{ flex: 0 1 170px; }
  #img-carousel .ph-filters button{
    font: inherit; font-size: 11.5px; padding: 5px 9px; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--ux-line); background: var(--ux-bg); color: var(--ux-text2);
  }
  #img-carousel .ph-filters button:hover{ border-color: var(--ux-line2); color: var(--ux-text); }
  #img-carousel .ph-filters .ph-n{
    font-family: var(--ux-mono); font-size: 11.5px; color: var(--ux-text3); margin-left: auto;
  }
  /* Галка выбора лежит поверх фото: в подписи для неё места нет, а промахнуться
     мимо неё и открыть просмотр — обычное дело, поэтому она крупная. */
  #img-carousel .ph-img{ position: relative; }
  #img-carousel .ph-pick{
    position: absolute; top: 6px; left: 6px; width: 18px; height: 18px; margin: 0;
    accent-color: var(--ux-accent); cursor: pointer; z-index: 2;
  }
  #img-carousel .img-card.is-picked{
    border-color: var(--ux-accent); box-shadow: inset 0 0 0 1px var(--ux-accent);
  }
  #img-carousel .ph-noimg{ font-size: 11.5px; color: var(--ux-text3); }
  #img-carousel .ph-susp{
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px;
  }
  #img-carousel .ph-susp-tag{
    padding: 2px 7px; border-radius: 6px; font-size: 10px; font-weight: 700;
    background: #FFF1F1; color: var(--ux-danger);
  }
  #img-carousel .ph-susp-bid{ font-size: 12px; font-weight: 700; color: var(--ux-danger); }
  #img-carousel .ph-susp-med{ font-size: 11px; color: #9A6B6B; }
  /* Панель массовых действий липкая: выбор набирают, прокручивая длинный список. */
  #img-carousel .ph-bulk{
    position: sticky; top: 0; z-index: 5;
    display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
    padding: 9px 12px; margin-bottom: 10px;
    border: 1px solid var(--ux-accent-line); border-radius: var(--ux-radius-sm);
    background: var(--ux-accent-soft);
  }
  #img-carousel .ph-bulk-t{ font-size: 12.5px; font-weight: 600; color: var(--ux-accent-ink); }
  #img-carousel .ph-bulk button{
    font: inherit; font-size: 12px; padding: 5px 10px; border-radius: 6px; cursor: pointer;
    border: 1px solid var(--ux-accent-line); background: var(--ux-bg); color: var(--ux-accent-ink);
  }
  #img-carousel .ph-bulk button:hover{ background: var(--ux-bg2); }
  #img-carousel .ph-bulk .ph-bulk-del{ border-color: var(--ux-danger); color: var(--ux-danger); }
  #img-carousel .ph-bulk .ph-bulk-off{
    margin-left: auto; border-color: var(--ux-line); color: var(--ux-text3);
  }
  /* Меню «Заменить»: на любой похожий или на конкретный — с фильтрами. */
  .ph-menu{
    position: fixed; z-index: 2147483646; min-width: 214px; padding: 5px;
    border: 1px solid var(--ux-line); border-radius: 10px;
    background: var(--ux-bg); box-shadow: 0 12px 34px rgba(15, 23, 42, .18);
  }
  .ph-menu button{
    display: block; width: 100%; text-align: left; font: inherit; font-size: 12.5px;
    padding: 8px 10px; border: 0; border-radius: 7px; background: none; cursor: pointer;
    color: var(--ux-text);
  }
  .ph-menu button:hover{ background: var(--ux-bg2); }
  .ph-menu .ph-menu-sub{ display: block; font-size: 11px; color: var(--ux-text3); margin-top: 2px; }
  /* Поп-ап «заменить на конкретный»: группы галок по операторам, форматам,
     длительностям. Список операторов бывает длинным — группа скроллится. */
  .ph-rep-grp{
    border: 1px solid var(--ux-line); border-radius: 9px; padding: 8px 10px;
    max-height: 168px; overflow-y: auto;
  }
  .ph-rep-grp label{
    display: flex; align-items: center; gap: 7px; font-size: 12.5px;
    padding: 3px 0; cursor: pointer; color: var(--ux-text);
  }
  .ph-rep-grp input{ accent-color: var(--ux-accent); flex: 0 0 auto; }
  .ph-rep-lbl{
    display: flex; align-items: baseline; gap: 8px;
    font-size: 11.5px; font-weight: 600; color: var(--ux-text3);
    text-transform: uppercase; letter-spacing: .04em; margin: 0 0 5px;
  }
  .ph-rep-lbl button{
    font: inherit; font-size: 10.5px; text-transform: none; letter-spacing: 0;
    padding: 0; border: 0; background: none; cursor: pointer;
    color: var(--ux-accent-ink); text-decoration: underline;
  }
  #results-toggle:hover{
    color: var(--ux-accent);
  }
  /* убираем дефолтную карусель от planner.js */
  #screens-photos{
    display:none !important;
  }
  /* на всякий случай, если planner.js показывает этот заголовок/ряд через вложенные элементы */
  #screens-photos *{
    display:none !important;
  }
  /* красивое summary вместо <pre> */
  #summary.summary-pre{
    background: transparent; border: none; padding: 0;
  }
  .sum-wrap{
    display:flex; flex-direction:column; gap:12px;
  }
  .sum-top{
    display:flex; align-items:flex-start; justify-content:space-between; gap:12px;
    padding:14px; border-radius:16px;
    border:1px solid var(--ux-line);
    background: var(--ux-bg);
    
  }
  .sum-title{
    font-weight:900; font-size:14px;
  }
  .sum-sub{
    margin-top:4px; font-size:12px; color: var(--ux-text2); line-height:1.35;
  }
  .pill-row{
    display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;
  }
  .pill{
    display:inline-flex; gap:6px; align-items:baseline;
    padding:6px 10px; border-radius:999px;
    border:1px solid var(--ux-line);
    background: var(--ux-bg2);
    font-size:12px;
  }
  .pill b{
    font-weight:900;
  }
  .sum-grid{
    display:grid; grid-template-columns:1fr; gap:12px;
  }
  .sum-card{
    padding:14px; border-radius:16px;
    border:1px solid var(--ux-line);
    background: var(--ux-bg);
    
  }
  .sum-card-head{
    display:flex; align-items:flex-start; justify-content:space-between; gap:10px;
  }
  .sum-city{
    font-weight:900; font-size:14px;
  }
  .sum-mini{
    font-size:12px; color: var(--ux-text2); margin-top:4px;
  }
  .kv-row{
    display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;
  }
  .kv{
    flex:1 1 140px;
    padding:10px 12px; border-radius:12px;
    border:1px solid var(--ux-line);
    background: var(--ux-bg2);
  }
  .kv .k{
    font-size:11px; color: var(--ux-text2);
  }
  .kv .v{
    margin-top:4px; font-weight:900; font-size:14px;
  }
  .fmt-list{
    margin-top:10px; display:flex; flex-direction:column; gap:8px;
  }
  .fmt-item{
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding:8px 10px; border-radius:12px;
    border:1px solid var(--ux-line);
    background: rgba(255,255,255,.45);
    font-size:12px;
  }
  .fmt-item .left{
    display:flex; gap:8px; align-items:center; min-width:0;
  }
  .dot{
    width:8px; height:8px; border-radius:999px; background: var(--ux-accent); flex:0 0 auto;
  }
  .fmt-name{
    font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:260px;
  }
  .fmt-val{
    font-weight:900; white-space:nowrap;
  }
  .sum-details{
    margin-top:2px;
    padding:12px 14px; border-radius:16px;
    border:1px solid var(--ux-line);
    background: var(--ux-bg2);
  }
  .sum-details summary{
    cursor:pointer; font-weight:800; font-size:13px;
    list-style:none;
  }
  .sum-details summary::-webkit-details-marker{
    display:none;
  }
  .raw-pre{
    margin-top:10px;
    white-space:pre-wrap;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
    font-size:12px;
    color: var(--ux-text2);
  }
  .ps-region-left{
    display:flex;
    flex-direction:column;
    gap:6px;
  }
  .ps-region-budget{
    font-size:13px;
    font-weight:600;
    color:var(--ux-text);
    padding:6px 10px;
    border-radius:999px;
    border:1px solid var(--ux-line);
    background:var(--ux-bg2);
    width:fit-content;
  }
  .ps-region-right{
    display:flex;
    gap:8px;
    flex-wrap:wrap;
    justify-content:flex-end;
  }
  .ps-region-left{
    display:flex;
    flex-direction:column;
    gap:6px;
  }
  .ps-region-screens{
    font-size:13px;
    color: var(--ux-text2);
    font-weight:600;
  }
  /* KPI в регионе — широкие */
  .ps-region-kpis{
    display:grid;
    grid-template-columns: 1fr;
    gap:10px;
    margin-top:12px;
  }
  .ps-kpi-wide{
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    padding:12px 14px;
    border-radius:12px;
    border:1px solid var(--ux-line);
    background: var(--ux-bg2);
    min-width:0;
  }
  .ps-kpi-wide .k{
    font-size:12px;
    color: var(--ux-text2);
    white-space:nowrap;
  }
  .ps-kpi-wide .v{
    font-weight:900;
    font-size:16px;
    text-align:right;
    white-space:nowrap;
  }
  /* ===== Форматная карточка ===== */
  #planner-widget .fmt-card{
    position: relative;
    padding: 14px 14px 16px;   /* было больше */
    min-height: 92px;          /* компактнее */
    border-radius: 16px;
    background: #fff;
    
  }
  /* заголовок */
  #planner-widget .fmt-title{
    font-size: 16px;           /* было ~18 */
    font-weight: 600;
    line-height: 1.2;
  }
  /* счётчик */
  #planner-widget .fmt-countline{
    margin-top: 4px;
    font-size: 13px;
    color: var(--ux-text3);
  }
  /* ===== Кнопка i ===== */
  #planner-widget .fmt-tip{
    position: absolute;
    top: 10px;
    right: 10px;
    width: 26px;
    height: 26px;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--ux-line2);
    background: #fff;
    font-size: 13px;
    font-weight: 600;
    line-height: 26px;
    text-align: center;
    cursor: pointer;
    color: var(--ux-text2);
    transition: background .12s ease, box-shadow .12s ease;
  }
  #planner-widget .fmt-tip:hover{
    background: var(--ux-bg2);
    box-shadow: 0 4px 12px var(--ux-line2);
  }
  #planner-widget .fmt-card{
    position: relative;
    padding: 12px 14px 12px;   /* было 14–16 → компактнее */
    min-height: 32px;          /* БЫЛО ~92 */
    border-radius: 16px;
    background: #fff;
    
  }
  #planner-widget .fmt-title{
    font-size: 15px;     /* было 16 */
    line-height: 1.15;   /* плотнее */
    margin-bottom: 2px; /* меньше воздуха */
  }
  #planner-widget .fmt-countline{
    font-size:12px;   /* было 13 */
    line-height: 1.2;
    margin-top: 2px;
  }
  #planner-widget .fmt-tip{
    top: 8px;
    right: 8px;
    width: 22px;
    height: 22px;
    line-height: 22px;
    font-size: 12px;
  }
  #planner-widget .fmt-grid{
    gap: 12px;   /* было 14–16 */
  }
  .fmt-tooltip-portal .tt-desc{
    margin-top: 6px;
    font-size: 13px;
    line-height: 1.25;
    opacity: .92;
  }
  /* убираем пустой серый тултип-контейнер */
  #planner-widget .fmt-tooltip-portal .tt-head{
    display: none !important;
  }



  /* ================================================================
     ОФОРМЛЕНИЕ ПО УТВЕРЖДЁННОМУ МАКЕТУ (23.08.2026)
     Идёт последним блоком: правила выше держат раскладку и поведение,
     здесь — только вид. Специфичность та же, побеждает порядок,
     поэтому менять достаточно тут, не разыскивая исходное правило.
     ================================================================ */

  /* ---- секция вместо коробки ----
     Заголовок с волосяной линейкой группирует не хуже панели с фоном
     и тенью, а коробок на экране становится втрое меньше. */
  #planner-widget .planner-block{ margin: 0 0 24px; }
  #planner-widget .planner-label{
    display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;
    font-size:14px; font-weight:600; color:var(--ux-text);
    padding-bottom:8px; margin-bottom:12px;
    border-bottom:1px solid var(--ux-line);
  }
  #planner-widget .planner-note{
    font-size:12.5px; color:var(--ux-text3); margin:0 0 12px; line-height:1.45;
  }
  #planner-widget .planner-block .planner-label + .planner-note{ margin-top:-6px; }

  /* ---- счётчик пула: одна строка вместо плашки на две ---- */
  #planner-widget .pool-preview-block{
    display:flex; align-items:baseline; gap:10px; flex-wrap:wrap;
    padding:10px 14px; margin-bottom:22px;
    background:var(--ux-accent-soft);
    border:1px solid var(--ux-accent-line);
    border-radius:var(--ux-radius-sm);
  }
  #planner-widget .pool-preview-block > div:first-child{
    display:flex; align-items:baseline; gap:9px; margin:0 !important; order:1;
  }
  #planner-widget .pool-preview-block .planner-label{
    border:0; padding:0; margin:0; font-size:13px; font-weight:600;
  }
  #planner-widget #pool-count-badge{
    font-family:var(--ux-mono); font-variant-numeric:tabular-nums;
    font-size:19px !important; font-weight:600 !important;
    color:var(--ux-accent-ink) !important;
  }
  #planner-widget #pool-preview-content{
    order:2; margin:0 0 0 auto !important; font-size:12.5px;
    color:var(--ux-text2) !important;
  }
  #planner-widget .pool-preview-row{ display:flex; gap:7px; flex-wrap:wrap; align-items:baseline; }
  #planner-widget .pool-preview-base,
  #planner-widget .pool-preview-filter{ font-family:var(--ux-mono); font-size:12px; }

  /* ---- шаги ---- */
  /* Липкая строка шагов перекрывала содержимое и всё время лезла
     в глаза: до кнопки «Дальше» всё равно надо долистать вниз. */
  #planner-widget .wiz-steps{
    position:static; top:auto; z-index:auto;
    background:transparent; backdrop-filter:none; -webkit-backdrop-filter:none;
    padding:0 0 14px; border-radius:0;
  }
  #planner-widget .wiz-chip{
    font-size:13px; font-weight:500; padding:7px 13px; border-radius:999px;
    border:1px solid var(--ux-line); background:var(--ux-bg); color:var(--ux-text2);
  }
  #planner-widget .wiz-chip:hover{ border-color:var(--ux-line2); background:var(--ux-bg); }
  #planner-widget .wiz-chip.done{
    background:var(--ux-ok-bg); border-color:var(--ux-ok-line); color:var(--ux-ok);
  }
  #planner-widget .wiz-chip.active,
  #planner-widget .wiz-chip.done.active{
    background:var(--ux-accent); border-color:var(--ux-accent); color:#fff; font-weight:600;
  }

  /* ---- кнопки ---- */
  #planner-widget .wiz-btn{
    font-size:13.5px; font-weight:600; padding:9px 18px;
    border-radius:var(--ux-radius-xs);
    border:1px solid var(--ux-accent); background:var(--ux-accent); color:#fff;
  }
  #planner-widget .wiz-btn:hover{ filter:brightness(1.08); background:var(--ux-accent); }
  #planner-widget .wiz-btn.ghost{
    background:var(--ux-bg); border-color:var(--ux-line2); color:var(--ux-text);
  }
  #planner-widget .wiz-btn.ghost:hover{ border-color:var(--ux-text3); filter:none; }

  /* ---- карточки форматов: плоские, счётчик справа моноширинным ---- */
  #planner-widget .fmt-grid{
    gap:8px;
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  }
  #planner-widget .fmt-countline::after{
    content:" экр."; font-weight:500; color:var(--ux-text3); white-space:pre;
  }
  #planner-widget .fmt-card{
    display:grid; grid-template-columns:1fr auto; align-items:center; gap:2px 12px;
    padding:11px 13px; border-radius:var(--ux-radius-sm);
    border:1px solid var(--ux-line); background:var(--ux-bg);
    transition:border-color .12s ease, background .12s ease;
    transform:none !important;
  }
  #planner-widget .fmt-card:hover{ border-color:var(--ux-accent-line); }
  #planner-widget .fmt-card.is-selected{
    border-color:var(--ux-accent); background:var(--ux-accent-soft);
    box-shadow:inset 0 0 0 1px var(--ux-accent);
  }
  #planner-widget .fmt-card.is-selected .fmt-title::before{ content:"\u2713\u00A0"; color:var(--ux-accent); }
  #planner-widget .fmt-card .fmt-left{
    grid-column:1; min-width:0; flex:initial; display:block;
  }
  #planner-widget .fmt-card .fmt-title{
    font-size:13.5px; font-weight:600; line-height:1.25; margin:0;
    overflow-wrap:break-word;
  }
  #planner-widget .fmt-countline{
    grid-column:2; grid-row:1;
    font-family:var(--ux-mono); font-variant-numeric:tabular-nums;
    font-size:13px; font-weight:600; color:var(--ux-text2);
    white-space:nowrap; margin:0;
  }
  #planner-widget .fmt-card.is-selected .fmt-countline{ color:var(--ux-accent-ink); }
  #planner-widget .fmt-tip{ position:static; grid-column:3; }
  #planner-widget .fmt-card:has(.fmt-tip){ grid-template-columns:1fr auto auto; }
  #planner-widget .fmt-toggle{ box-shadow:none; }
  #planner-widget .fmt-toggle:hover,
  #planner-widget .fmt-toggle:active{ box-shadow:none; }
  #planner-widget .fmt-pill{ transform:none !important; }

  /* ---- поля ввода ---- */
  #planner-widget input[type="text"],
  #planner-widget input[type="number"],
  #planner-widget input[type="date"],
  #planner-widget input[type="time"],
  #planner-widget select,
  #planner-widget textarea{
    border-radius:var(--ux-radius-xs);
    border:1px solid var(--ux-line);
    background:var(--ux-bg);
    color:var(--ux-text);
    font-size:13.5px;
  }
  #planner-widget input:focus-visible,
  #planner-widget select:focus-visible,
  #planner-widget textarea:focus-visible{
    border-color:var(--ux-accent); box-shadow:var(--ux-ring); outline:none;
  }

  /* ---- строка брифа ---- */
  #planner-widget .brief-bar{
    background:var(--ux-bg); border:1px solid var(--ux-line);
    border-radius:var(--ux-radius-sm); padding:10px 12px; margin-bottom:12px; gap:8px;
  }
  #planner-widget .brief-chip{
    font-size:12.5px; font-weight:500; color:var(--ux-text);
    background:var(--ux-bg2); border:1px solid var(--ux-line);
    border-radius:999px; padding:4px 10px;
  }
  #planner-widget .brief-chip:hover{
    background:var(--ux-accent-soft); border-color:var(--ux-accent-line);
  }
  #planner-widget .brief-chip .k{ color:var(--ux-text3); font-weight:400; }
  #planner-widget .brief-chip.sm{ font-size:12px; background:var(--ux-bg); }
  #planner-widget .brief-chip.sm.on{
    background:var(--ux-accent-soft); border-color:var(--ux-accent-line);
    color:var(--ux-accent-ink); font-weight:600;
  }
  #planner-widget .brief-chip.edit{
    background:var(--ux-bg); border-color:var(--ux-accent-line);
    color:var(--ux-accent-ink); font-weight:600;
  }
  #planner-widget .brief-lbl{ color:var(--ux-text3); }

  /* ---- метрики сводки: сплошная лента через волосяные линии ---- */
  #planner-widget .ps-card{
    background:var(--ux-bg); border:1px solid var(--ux-line);
    border-radius:var(--ux-radius); padding:14px 16px; margin-bottom:12px;
  }
  #planner-widget .ps-title{ font-size:15px; font-weight:700; }
  #planner-widget .ps-sub{ font-size:12.5px; color:var(--ux-text3); }
  #planner-widget .ps-grid{ gap:8px; margin-top:12px; }
  #planner-widget .ps-metrics{
    display:grid; gap:1px; background:var(--ux-line);
    border:1px solid var(--ux-line); border-radius:var(--ux-radius-sm); overflow:hidden;
  }
  #planner-widget .ps-metrics .ps-metric{
    border:0; border-radius:0; background:var(--ux-bg); padding:10px 12px;
  }
  #planner-widget .ps-metric .k{ font-size:11px; color:var(--ux-text3); line-height:1.3; }
  #planner-widget .ps-metric .v{
    font-family:var(--ux-mono); font-variant-numeric:tabular-nums;
    font-size:16px; font-weight:600; margin-top:4px; white-space:nowrap;
  }
  #planner-widget .ps-badge{
    background:var(--ux-bg2); border-color:var(--ux-line); font-size:12px;
  }
  #planner-widget .ps-badge b{ font-weight:500; color:var(--ux-text3); }
  #planner-widget .ps-region-chip,
  #planner-widget .ps-fmt{ background:var(--ux-bg2); border-color:var(--ux-line); }

  /* ---- предупреждения ---- */
  #planner-widget .ps-warn{
    border-color:var(--ux-warn-line); background:var(--ux-warn-bg);
    border-radius:var(--ux-radius-sm); color:var(--ux-text2);
  }
  #planner-widget .ps-warn-h{ color:var(--ux-warn); }
  #planner-widget .ps-warn-item{ border-top-color:var(--ux-warn-line); }
  #planner-widget .ps-warn-item::before{ color:var(--ux-warn); }

  /* ---- таблица (разбивка по форматам) ---- */
  #planner-widget .ux-tbl-wrap{
    overflow-x:auto; border:1px solid var(--ux-line);
    border-radius:var(--ux-radius-sm); background:var(--ux-bg);
  }
  #planner-widget table.ux-tbl{
    width:100%; border-collapse:collapse; font-size:13px; min-width:520px;
  }
  #planner-widget .ux-tbl th,
  #planner-widget .ux-tbl td{
    padding:9px 13px; text-align:right; border-bottom:1px solid var(--ux-line);
  }
  #planner-widget .ux-tbl th:first-child,
  #planner-widget .ux-tbl td:first-child{ text-align:left; }
  #planner-widget .ux-tbl thead th{
    font-family:var(--ux-mono); font-size:10.5px; font-weight:600;
    letter-spacing:.07em; text-transform:uppercase;
    color:var(--ux-text3); background:var(--ux-bg2);
  }
  #planner-widget .ux-tbl tbody td{
    font-family:var(--ux-mono); font-variant-numeric:tabular-nums; color:var(--ux-text2);
  }
  #planner-widget .ux-tbl tbody td:first-child{
    font-family:var(--ux-font); color:var(--ux-text); font-weight:500;
  }
  #planner-widget .ux-tbl tbody tr:last-child td{ border-bottom:0; }
  #planner-widget .ux-tbl tfoot td{
    font-family:var(--ux-mono); font-weight:600; background:var(--ux-bg2);
    font-variant-numeric:tabular-nums;
  }
  #planner-widget .ux-tbl tfoot td:first-child{ font-family:var(--ux-font); }
  #planner-widget .ux-bar{
    display:inline-block; vertical-align:middle; height:6px;
    border-radius:2px; background:var(--ux-accent); margin-right:6px;
  }

  /* ---- свёрнутое уточнение ---- */
  #planner-widget .ux-fold{
    border:1px solid var(--ux-line); border-radius:var(--ux-radius-sm);
    background:var(--ux-bg); margin-bottom:7px;
  }
  #planner-widget .ux-fold-sum{
    display:flex; align-items:center; gap:11px; width:100%; box-sizing:border-box;
    padding:11px 14px; font:inherit; text-align:left; cursor:pointer;
    background:none; border:0; color:inherit; border-radius:var(--ux-radius-sm);
    list-style:none;
  }
  #planner-widget .ux-fold-sum::-webkit-details-marker{ display:none; }
  #planner-widget .ux-fold-sum:hover{ background:var(--ux-bg2); }
  #planner-widget .ux-fold-sum .car{
    color:var(--ux-text3); font-size:11px; transition:transform .12s;
  }
  #planner-widget .ux-fold[open] .ux-fold-sum .car{ transform:rotate(90deg); }
  #planner-widget .ux-fold-t{ font-size:13.5px; font-weight:600; }
  #planner-widget .ux-fold-v{
    margin-left:auto; font-family:var(--ux-mono); font-size:12px;
    color:var(--ux-text3); display:flex; align-items:center; gap:8px;
  }
  #planner-widget .ux-fold-v .on{
    color:var(--ux-accent-ink); background:var(--ux-accent-soft);
    border:1px solid var(--ux-accent-line); border-radius:999px;
    padding:1px 8px; font-weight:600;
  }
  #planner-widget .ux-fold-body{
    padding:13px 14px 15px; border-top:1px solid var(--ux-line);
  }

  /* ---- переключатели-чипы внутри уточнений ---- */
  #planner-widget .sel-chip,
  #planner-widget .cns-chip,
  #planner-widget .vk-card,
  #planner-widget .str-chip-body{
    border-color:var(--ux-line); background:var(--ux-bg);
    border-radius:var(--ux-radius-sm); border-width:1px;
  }
  #planner-widget .sel-chip:hover,
  #planner-widget .cns-chip:hover,
  #planner-widget .vk-card:hover,
  #planner-widget .str-chip:hover .str-chip-body{
    border-color:var(--ux-accent-line); background:var(--ux-bg);
  }
  #planner-widget .sel-chip.active,
  #planner-widget .cns-chip.active,
  #planner-widget .vk-card.active,
  #planner-widget .str-chip input:checked + .str-chip-body{
    border-color:var(--ux-accent); background:var(--ux-accent-soft);
    color:var(--ux-accent-ink); box-shadow:inset 0 0 0 1px var(--ux-accent);
  }
  #planner-widget .str-chip-title{ font-size:13.5px; font-weight:600; }
  #planner-widget .str-chip-desc{ font-size:11.5px; color:var(--ux-text3); }

  /* ---- панель действий ---- */
  #planner-widget .ux-tools{
    display:flex; gap:8px; flex-wrap:wrap; align-items:center;
    padding:13px 14px; margin-top:14px;
    background:var(--ux-bg); border:1px solid var(--ux-line);
    border-radius:var(--ux-radius-sm);
  }
  #planner-widget .ux-tools .sep{ flex:1 1 0; min-width:0; }
  #planner-widget .ux-tools .ux-more{
    font:inherit; font-size:13px; padding:8px 12px;
    border-radius:var(--ux-radius-xs); cursor:pointer;
    border:1px solid var(--ux-line); background:var(--ux-bg); color:var(--ux-text2);
  }
  #planner-widget .ux-tools .ux-more:hover{ border-color:var(--ux-line2); color:var(--ux-text); }
  #planner-widget .ux-tools .ux-more:disabled{ opacity:.5; cursor:not-allowed; }

  /* ---- карта ---- */
  #planner-widget .ux-map-head{
    display:flex; align-items:center; gap:10px; flex-wrap:wrap;
    padding:9px 13px; border:1px solid var(--ux-line); border-bottom:0;
    border-radius:var(--ux-radius-sm) var(--ux-radius-sm) 0 0;
    background:var(--ux-bg2);
  }
  #planner-widget .ux-map-lg{ display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--ux-text2); }
  #planner-widget .ux-map-lg span{ display:inline-flex; align-items:center; gap:6px; }
  #planner-widget .ux-map-lg i{ width:9px; height:9px; border-radius:999px; display:inline-block; }
  #planner-widget .ux-map-head .ux-more{ margin-left:auto; }
  #planner-widget .ux-map-head + .planner-map,
  #planner-widget .ux-map-head + #planner-map{
    border-radius:0 0 var(--ux-radius-sm) var(--ux-radius-sm) !important;
    border:1px solid var(--ux-line) !important;
  }

  /* ---- рейка ёмкости ----
     Геометрия задана явно: подпись 0..14, штырь 28..48 по центру
     дорожки 34..42, сумма с 56. Высота 76 — на меньшей суммы
     наезжают на подпись под рейкой. */
  #planner-widget .rc-card{
    background:var(--ux-bg); border:1px solid var(--ux-line);
    border-radius:var(--ux-radius-sm); padding:16px 18px; margin-bottom:12px;
  }
  #planner-widget .rc-head{ display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; margin-bottom:16px; }
  #planner-widget .rc-head b{ font-size:14px; font-weight:600; }
  #planner-widget .rc-head span{ font-size:12px; color:var(--ux-text3); }
  #planner-widget .rc-now{
    margin-left:auto; font-family:var(--ux-mono); font-variant-numeric:tabular-nums;
    font-size:19px; font-weight:600; white-space:nowrap;
  }
  #planner-widget .rail{ position:relative; height:76px; margin:0 2px; }
  #planner-widget .gid-dupes{
    margin-top:10px; padding:10px 12px; font-size:12px;
    color:var(--ux-warn); background:var(--ux-warn-bg);
    border:1px solid var(--ux-warn-line); border-radius:var(--ux-radius-xs);
  }
  #planner-widget .gid-dupes-head{ font-weight:600; margin-bottom:2px; }
  #planner-widget .ux-freqsum{
    display:flex; flex-direction:column; gap:2px;
    padding:10px 12px; border:1px solid var(--ux-line); border-radius:var(--ux-radius-xs);
    background:var(--ux-soft);
  }
  #planner-widget .ux-freqsum b{ font-size:18px; color:var(--ux-text); }
  #planner-widget .ux-freqsum span{ font-size:12px; color:var(--ux-text2); }
  #planner-widget .ux-freqsum .cap{ color:var(--ux-warn); }
  #planner-widget .gid-dupes-sub{ color:var(--ux-text2); margin-bottom:8px; }
  #planner-widget .gid-dupe{ padding:8px 0; border-top:1px solid var(--ux-warn-line); }
  #planner-widget .gid-dupe-id{
    font-family:var(--ux-mono); font-weight:600; color:var(--ux-text); margin-bottom:4px;
  }
  #planner-widget .gid-dupe label{
    display:flex; align-items:center; gap:8px; padding:3px 0;
    color:var(--ux-text2); cursor:pointer;
  }
  #planner-widget .gid-dupe label:hover{ color:var(--ux-text); }
  #planner-widget .gid-dupe input{ accent-color:var(--ux-accent); }
  #planner-widget .gid-dupes-done{
    margin-top:10px; padding:8px 12px; font-size:12px;
    color:var(--ux-ok); background:var(--ux-ok-bg);
    border:1px solid var(--ux-ok-line); border-radius:var(--ux-radius-xs);
  }
  #planner-widget .brief-chip.reset{
    border-color:var(--ux-accent-line); color:var(--ux-accent-ink);
    background:var(--ux-accent-soft); font-weight:600;
  }
  #planner-widget .brief-chip.reset:hover{ background:var(--ux-bg); }
  #planner-widget .rail-track, #planner-widget .rail-fill{ cursor:pointer; }
  #planner-widget[data-calc="busy"] .rail-track,
  #planner-widget[data-calc="busy"] .rail-fill,
  #planner-widget[data-calc="busy"] .rail-stop .pip{ cursor:progress; }
  #planner-widget .ap-frozen{
    display:flex; align-items:center; gap:10px; flex-wrap:wrap;
    margin-top:8px; padding:8px 10px; font-size:12px;
    color:var(--ux-warn); background:var(--ux-warn-bg);
    border:1px solid var(--ux-warn-line); border-radius:var(--ux-radius-xs);
  }
  #planner-widget .ap-frozen b{ font-weight:600; }
  #planner-widget .ap-refreeze{
    margin-left:auto; font:inherit; font-weight:600; cursor:pointer;
    padding:4px 10px; border-radius:var(--ux-radius-xs);
    color:var(--ux-accent-ink); background:var(--ux-bg);
    border:1px solid var(--ux-accent-line);
  }
  #planner-widget .ap-refreeze:hover{ background:var(--ux-accent-soft); }
  /* Сумма подставлена по уровню — показывать её мы не обещали. */
  #planner-widget #budget-input[data-from-tier="1"]{ color:transparent; }
  #planner-widget .rail-track{
    position:absolute; left:0; right:0; top:34px; height:8px; border-radius:999px;
    background:var(--ux-bg2); border:1px solid var(--ux-line);
  }
  #planner-widget .rail-fill{
    position:absolute; left:0; top:34px; height:8px; border-radius:999px;
    background:var(--ux-accent);
  }
  #planner-widget .rail-stop{
    position:absolute; top:0; transform:translateX(-50%); text-align:center;
    pointer-events:none;
  }
  /* Нажимается только риска: подписи — легенда, а не кнопки. */
  #planner-widget .rail-stop .pip{ pointer-events:auto; position:relative; }
  #planner-widget .rail-stop .pip::after{
    content:""; position:absolute; left:50%; top:-8px; bottom:-8px;
    width:26px; transform:translateX(-50%);
  }
  #planner-widget .rail-stop .hit{
    display:block; width:100%; font:inherit; background:none; border:0;
    cursor:pointer; padding:0; color:inherit;
  }
  #planner-widget .rail-stop .lb{
    display:block; font-family:var(--ux-mono); font-size:10px; font-weight:600;
    letter-spacing:.07em; text-transform:uppercase; color:var(--ux-text3);
    line-height:14px; white-space:nowrap;
  }
  #planner-widget .rail-stop .pip{
    display:block; width:3px; height:20px; border-radius:2px;
    background:var(--ux-line2); margin:14px auto 0;
  }
  #planner-widget .rail-stop .sm{
    display:block; font-family:var(--ux-mono); font-variant-numeric:tabular-nums;
    font-size:11.5px; color:var(--ux-text2); margin-top:8px; white-space:nowrap;
  }
  /* Подписи двигает layoutRailStops, когда уровни стоят слишком близко. */
  #planner-widget .rail-stop .lb,
  #planner-widget .rail-stop .sm{ will-change:transform; }
  #planner-widget .rail-stop.on .pip{ background:var(--ux-accent); width:5px; }
  #planner-widget .rail-stop.on .lb{ color:var(--ux-accent-ink); }
  #planner-widget .rail-stop.on .sm{ color:var(--ux-text); font-weight:600; }
  #planner-widget .rail-stop .hit:hover .pip{ background:var(--ux-accent-line); }
  #planner-widget .rail-stop.on .hit:hover .pip{ background:var(--ux-accent); }
  #planner-widget .rail-cap{
    margin-top:12px; font-size:12px; color:var(--ux-text3);
    display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap;
  }
  #planner-widget .rc-freq{
    display:flex; align-items:center; gap:14px; flex-wrap:wrap;
    padding-top:15px; margin-top:15px; border-top:1px solid var(--ux-line);
  }
  #planner-widget .rc-freq label{ font-size:13px; color:var(--ux-text2); white-space:nowrap; }
  #planner-widget #rc-pph{ flex:1; min-width:170px; accent-color:var(--ux-accent); }
  #planner-widget #rc-pph-out{
    font-family:var(--ux-mono); font-variant-numeric:tabular-nums;
    font-size:16px; font-weight:600; color:var(--ux-accent-ink);
    min-width:42px; text-align:right;
  }
  #planner-widget .rc-out{ flex-basis:100%; margin:0; font-size:12.5px; color:var(--ux-text2); line-height:1.5; }
  #planner-widget .rc-up{
    font-family:var(--ux-mono); font-size:12.5px; font-weight:600;
    color:var(--ux-danger); background:var(--ux-danger-bg);
    border-radius:6px; padding:2px 7px; margin-left:6px;
  }
  #planner-widget .rc-adv{
    margin-top:8px; padding:8px 10px; background:var(--ux-bg2);
    border:1px solid var(--ux-line); border-radius:var(--ux-radius-xs);
    font-size:12.5px; line-height:1.5;
  }
  #planner-widget .rc-apply{
    margin-top:9px; font:inherit; font-size:12.5px; font-weight:600;
    border-radius:var(--ux-radius-xs); padding:7px 14px; cursor:pointer;
    border:1px solid var(--ux-accent); background:var(--ux-accent); color:#fff;
  }
  #planner-widget .rc-apply:hover{ filter:brightness(1.08); }

  /* ---- сетка экранов с постраничностью ---- */
  #planner-widget .ux-ph-head{
    display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; margin-bottom:12px;
  }
  #planner-widget .ux-ph-n{ font-family:var(--ux-mono); font-size:12px; color:var(--ux-text3); }
  #planner-widget .ux-pg{ margin-left:auto; display:flex; gap:4px; align-items:center; }
  #planner-widget .ux-pg button{
    font:inherit; font-family:var(--ux-mono); font-size:12px; min-width:28px;
    padding:4px 7px; border-radius:var(--ux-radius-xs); cursor:pointer;
    border:1px solid var(--ux-line); background:var(--ux-bg); color:var(--ux-text2);
  }
  #planner-widget .ux-pg button:hover{ border-color:var(--ux-line2); }
  #planner-widget .ux-pg button[aria-current="page"]{
    background:var(--ux-accent); border-color:var(--ux-accent); color:#fff; font-weight:600;
  }
  #planner-widget .ux-pg button:disabled{ opacity:.4; cursor:default; }

  /* ---- моноширинные числа в перенесённых блоках ---- */
  #planner-widget .ps-region-budget,
  #planner-widget .ps-region-screens,
  #planner-widget .bar-val,
  #planner-widget .cns-chip-badge{
    font-family:var(--ux-mono); font-variant-numeric:tabular-nums;
  }


  /* Ось наверху повторяет «Стратегию подбора» и «Частоту показов»
     целиком. Прячем правилом, а не через style.display: блоки заново
     показывает refreshVisibility, который ходит по ним по таймеру.
     Из DOM не убираем — расчёт читает reach_mode и constructions-ppm
     именно оттуда, ось только выставляет им значения. */
  #planner-widget #step4-strategy-block,
  #planner-widget #frequency-block{ display:none !important; }

  /* ---- карта зоны внутри ката ----
     Узел модалки переносится в тело ката как есть, чтобы не переписывать
     рисование полигонов; здесь снимаем с него всё оверлейное. */
  #poly-modal.is-inline{
    display:block !important; position:static !important; inset:auto !important;
    background:none !important; backdrop-filter:none !important;
    padding:0 !important; z-index:auto !important;
  }
  #poly-modal.is-inline > div{
    width:100% !important; max-width:none !important; height:420px !important;
    border-radius:var(--ux-radius-sm) !important;
    border:1px solid var(--ux-line) !important; box-shadow:none !important;
  }
  /* Шапка карты: заголовок и счётчик зон, справа «Перерисовать».
     Кнопки «Применить» больше нет — зона уходит в фильтр сразу, как
     дорисована. Ужимаем полосу по высоте. */
  #poly-modal.is-inline > div > div:first-child{ padding:10px 14px !important; }
  #poly-modal.is-inline #poly-modal-cancel{ display:none; }
  #planner-widget .ux-fold[data-fold-for="step4-map-zone-block"] #poly-draw-btn{ display:none; }

  /* Тумблер внутри ката дублировал сам кат: раскрыли — значит включили. */
  #planner-widget .ux-fold[data-fold-for="audience-block"] #vk-affinity-card,
  #planner-widget .ux-fold[data-fold-for="yandex-geo-block"] #yandex-geo-card,
  #planner-widget .ux-fold[data-fold-for="constructions-block"] #constructions-chip,
  #planner-widget .ux-fold[data-fold-for="step4-selection-block"] #selection-mode-chips{
    display:none;
  }
  #planner-widget .ux-fold-hint{ margin:0 0 12px; }


  /* ---- переключатель области у таблицы ---- */
  #planner-widget .ux-seg{
    display:inline-flex; border:1px solid var(--ux-line);
    border-radius:var(--ux-radius-xs); overflow:hidden; background:var(--ux-bg2);
  }
  #planner-widget .ux-seg button{
    font:inherit; font-size:12.5px; padding:5px 12px; cursor:pointer;
    border:0; background:none; color:var(--ux-text2); white-space:nowrap;
  }
  #planner-widget .ux-seg button:hover{ color:var(--ux-text); }
  #planner-widget .ux-seg button[aria-pressed="true"]{
    background:var(--ux-accent); color:#fff; font-weight:600;
  }
  /* Одно из двух тел таблицы прячем целиком — данные для обоих уже в DOM. */
  #planner-widget #fmt-table[data-scope="all"] .scope-region,
  #planner-widget #fmt-table[data-scope="region"] .scope-all{ display:none; }
  #planner-widget .ux-tbl-group td{
    background:var(--ux-bg2); font-family:var(--ux-font) !important;
    font-weight:600 !important; color:var(--ux-text) !important;
    text-align:left !important; padding-top:11px; padding-bottom:8px;
  }
  #planner-widget .ux-tbl-group td span{
    font-family:var(--ux-mono); font-variant-numeric:tabular-nums;
    font-weight:500; font-size:11.5px; color:var(--ux-text3); margin-left:10px;
  }

  /* ---- сумма плана правится прямо в шапке рейки ---- */
  #planner-widget input.rc-now{
    margin-left:auto; width:auto; max-width:190px; text-align:right;
    font-family:var(--ux-mono); font-variant-numeric:tabular-nums;
    font-size:19px !important; font-weight:600;
    padding:2px 8px; border:1px solid transparent; background:transparent;
    border-radius:var(--ux-radius-xs); color:var(--ux-text);
  }
  #planner-widget input.rc-now:hover{ border-color:var(--ux-line); background:var(--ux-bg2); }
  #planner-widget input.rc-now:focus{
    border-color:var(--ux-accent); background:var(--ux-bg); box-shadow:var(--ux-ring); outline:none;
  }
  /* По шкале можно кликнуть в любое место — курсор об этом говорит. */
  #planner-widget #rc-rail{ cursor:pointer; }
  #planner-widget #rc-rail:focus-visible{
    outline:2px solid var(--ux-accent); outline-offset:6px; border-radius:6px;
  }
  #planner-widget #rc-rail .rail-stop{ cursor:pointer; }

  /* ---- кнопки уровней на шаге «Цели» ---- */
  #planner-widget .ux-tierbtns{
    display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin-bottom:8px;
  }
  @media (max-width:520px){ #planner-widget .ux-tierbtns{ grid-template-columns:1fr; } }
  #planner-widget .ux-tierbtn{
    text-align:left; font:inherit; cursor:pointer; padding:8px 11px;
    border:1px solid var(--ux-line); background:var(--ux-bg);
    border-radius:var(--ux-radius-xs); color:var(--ux-text); min-width:0;
  }
  #planner-widget .ux-tierbtn:hover{ border-color:var(--ux-accent-line); }
  #planner-widget .ux-tierbtn[aria-pressed="true"]{
    border-color:var(--ux-accent); background:var(--ux-accent-soft);
    box-shadow:inset 0 0 0 1px var(--ux-accent);
  }
  #planner-widget .ux-tierbtn .t{
    display:block; font-family:var(--ux-mono); font-size:10px; font-weight:600;
    letter-spacing:.06em; text-transform:uppercase; color:var(--ux-text3);
  }
  #planner-widget .ux-tierbtn[aria-pressed="true"] .t{ color:var(--ux-accent-ink); }
  #planner-widget .ux-tierbtn .v.soon{
    font-family:var(--ux-font); font-size:11.5px; font-weight:500;
    color:var(--ux-text3); white-space:normal;
  }
  #planner-widget .ux-tierbtn .v{
    display:block; font-family:var(--ux-mono); font-variant-numeric:tabular-nums;
    font-size:13.5px; font-weight:600; margin-top:2px; white-space:nowrap;
  }

  /* ---- ось «охват или частота» ---- */
  #planner-widget .ux-axis{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; }
  @media (max-width:620px){ #planner-widget .ux-axis{ grid-template-columns:1fr; } }
  #planner-widget .ux-ax{
    text-align:left; font:inherit; cursor:pointer; padding:12px 14px;
    border:1px solid var(--ux-line); background:var(--ux-bg);
    border-radius:var(--ux-radius-sm); color:var(--ux-text);
  }
  #planner-widget .ux-ax:hover{ border-color:var(--ux-accent-line); }
  #planner-widget .ux-ax[aria-pressed="true"]{
    border-color:var(--ux-accent); background:var(--ux-accent-soft);
    box-shadow:inset 0 0 0 1px var(--ux-accent);
  }
  #planner-widget .ux-ax .t{ display:block; font-size:14px; font-weight:600; }
  #planner-widget .ux-ax[aria-pressed="true"] .t::before{ content:"✓ "; color:var(--ux-accent); }
  #planner-widget .ux-ax .d{ display:block; font-size:12px; color:var(--ux-text3); margin-top:2px; }
  #planner-widget .ux-ax .p{
    display:block; margin-top:9px; padding-top:8px; border-top:1px solid var(--ux-line);
    font-family:var(--ux-mono); font-variant-numeric:tabular-nums;
    font-size:12px; color:var(--ux-text2);
  }
  #planner-widget .ux-ax[aria-pressed="true"] .p{
    border-top-color:var(--ux-accent-line); color:var(--ux-accent-ink); font-weight:600;
  }
  #planner-widget .ux-exact{
    display:flex; align-items:center; gap:12px; flex-wrap:wrap;
    margin-top:10px; padding:11px 14px; border-radius:var(--ux-radius-sm);
    border:1px dashed var(--ux-line2); background:var(--ux-bg);
  }
  #planner-widget .ux-exact .lb{ font-size:13px; color:var(--ux-text2); }
  #planner-widget .ux-exact .fld{ display:flex; align-items:center; gap:7px; }
  #planner-widget .ux-exact input{
    font-family:var(--ux-mono); font-size:13px; width:82px;
    padding:6px 9px; background:var(--ux-bg2);
  }
  #planner-widget .ux-exact .u{ font-size:12px; color:var(--ux-text3); }
  #planner-widget .ux-exact .off{ margin-left:auto; font-size:12.5px; color:var(--ux-text3); }

  /* ---- моноширинная частота в подписи региона ---- */
  #planner-widget .ps-mini span{ background:var(--ux-bg2); border-color:var(--ux-line); }

  /* ===== ДОСТУПНОСТЬ ===== */
  /* «Импорт городов из файла» — это <label> вокруг input[type=file].
     Инпут спрятан визуально (не display:none), чтобы он остался в табуляции;
     рамку фокуса рисует сама метка. */
  #planner-widget .file-import-label{ position: relative; }
  #planner-widget .file-import-label:focus-within{
    outline: 3px solid rgba(79,43,232,.45);
    outline-offset: 2px;
  }

  /* Уважаем системную настройку «меньше движения»: спиннер регионов, шиммер
     суммы и всплытие попапа при вестибулярных нарушениях вызывают тошноту. */
  @media (prefers-reduced-motion: reduce){
    #planner-widget *,
    #planner-widget *::before,
    #planner-widget *::after,
    #dsp-login-overlay *,
    #send-plan-popup *,
    #planner-toast,
    #planner-recalc-float{
      animation-duration: .001ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: .001ms !important;
      scroll-behavior: auto !important;
    }
  }
`;
  document.head.appendChild(style);

  // Фаза виджета: brief — заполняем бриф, result — работаем с программой.
  // Переключается по planner:calc-done и по кнопке «Править бриф».
  window.PLANNER_UI = window.PLANNER_UI || {};
  window.PLANNER_UI.setPhase = function(phase){
    const w = document.getElementById("planner-widget");
    if (!w) return;
    w.dataset.phase = (phase === "result") ? "result" : "brief";
    // Состав программы фиксируется первым расчётом и держится, пока его не
    // отпустят кнопкой «Пересобрать». Возврат в бриф фиксацию не снимает:
    // иначе базой для уровней бюджета становилась прошлая адреска, каждый
    // пересчёт делал её короче, а минимум — ниже, и так без дна.
    if (phase === "result") window.PLANNER?.freezeAp?.();
    const bar = document.getElementById("brief-bar");
    if (bar) bar.style.display = (phase === "result") ? "flex" : "none";
    if (typeof window.renderBriefBar === "function") window.renderBriefBar();
    const top = w.getBoundingClientRect().top + window.scrollY - 20;
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  };
  window.addEventListener("planner:calc-done", () => window.PLANNER_UI.setPhase("result"));

  // Карточки форматов/операторов и четыре тумблера — это <div> с onclick.
  // role/tabindex проставлены в разметке и генераторах; здесь один делегированный
  // обработчик повторяет клик по Enter/Space, чтобы не дублировать его в шести местах.
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;
    const t = e.target.closest && e.target.closest("#planner-widget [data-kbd-click]");
    if (!t || t.getAttribute("aria-disabled") === "true") return;
    e.preventDefault();

    // Карточки форматов и операторов перерисовываются списком целиком, поэтому
    // после клика сфокусированный узел уже уничтожен и фокус падает в <body>.
    // Мышке всё равно, а с клавиатуры это выбрасывает в начало страницы —
    // возвращаем фокус на карточку, вставшую на то же место.
    const box = t.parentElement;
    const i = box ? Array.prototype.indexOf.call(box.children, t) : -1;
    t.click();
    if (i >= 0 && (!document.activeElement || document.activeElement === document.body)) {
      const back = box.children[i];
      if (back && back.matches("[data-kbd-click]")) back.focus();
    }
  });

  // 3. Тяжёлые библиотеки — по требованию, а не на старте.
  //    xlsx ~307 КБ и exceljs ~250 КБ нужны только при импорте файла и
  //    выгрузке плана, то есть в лучшем случае один раз за сессию.
  //    Раньше они висели в цепочке загрузки и задерживали появление виджета.
  const LIB_URLS = {
    papaparse: "https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js",
    xlsx:      "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    exceljs:   "https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js",
  };
  const LIB_GLOBALS = { papaparse: "Papa", xlsx: "XLSX", exceljs: "ExcelJS" };
  const _libLoading = {};

  // Возвращает промис с самой библиотекой. Повторные вызовы переиспользуют
  // один и тот же промис, поэтому параллельные обращения не качают файл дважды.
  window.PLANNER_ENSURE_LIB = function (name) {
    const g = LIB_GLOBALS[name];
    if (!g) return Promise.reject(new Error("Неизвестная библиотека: " + name));
    if (window[g]) return Promise.resolve(window[g]);
    if (!_libLoading[name]) {
      _libLoading[name] = loadScript(LIB_URLS[name], true)
        .then(() => {
          if (!window[g]) throw new Error(name + " загрузился, но не объявил window." + g);
          return window[g];
        })
        .catch(err => { delete _libLoading[name]; throw err; }); // дать шанс повторить
    }
    return _libLoading[name];
  };

  // 4. Всё остальное — параллельно. Порядок выполнения гарантирован async=false:
  //    leaflet отработает раньше leaflet-draw, planner.js — раньше инлайновых
  //    блоков ниже по файлу.
  await Promise.all([
    loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"),
    loadScript("https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js"),
    loadScript(window.PLANNER_ASSET_BASE + "geo.js"),
    loadScript(window.PLANNER_ASSET_BASE + "planner.js"),
  ]);

  // 4. Inject HTML markup into planner-root
  root.innerHTML = `<!-- ===================== PLANNER WIDGET (CLEAN, SINGLE-SOURCE, NO DUPLICATES) ===================== -->
<div id="planner-widget" class="planner-root">
<button id="planner-recalc-float" style="display:none;" title="Пересчитать">
  <span class="rf-icon">↻</span> Пересчитать
</button>
<div id="planner-exclusions-bar" style="display:none; position:fixed; bottom:18px; left:50%; transform:translateX(-50%); z-index:9999; background:#fff3cd; border:1px solid #ffc107; border-radius:8px; padding:7px 14px; font-size:13px; color:#7a5800; box-shadow:0 2px 8px rgba(0,0,0,.15); white-space:nowrap;">
  \\u274C Исключено вручную: <b id="planner-exclusions-count">0</b> экр. &nbsp;
  <button id="planner-exclusions-reset" style="background:#ffc107; border:none; border-radius:5px; padding:2px 10px; cursor:pointer; font-size:12px; font-weight:600; color:#3a2800;">\\u21A9 Вернуть все</button>
</div>
  <h2 class="planner-title">Расчёт размещения</h2>
  <div id="dsp-user-bar" style="display:none; font-size:12px; color:#6b7280; margin:-8px 0 10px;"></div>
  <div id="calc-history-panel" style="display:none; margin-bottom:12px;">
    <div id="calc-history-toggle" class="calc-history-toggle" role="button" tabindex="0" aria-expanded="false" aria-controls="calc-history-list" data-kbd-click>
      <span id="calc-history-arrow">▶</span> История расчётов
    </div>
    <div id="calc-history-list" class="calc-history-list" style="display:none; flex-direction:column;"></div>
  </div>
  <!-- Строка брифа: видна только в фазе результата, собирается из состояния. -->
  <div id="brief-bar" class="brief-bar" style="display:none;"></div>
  <div class="planner-grid">
  <!-- Left -->
  <div class="ux-panel planner-left">
    <div class="planner-kicker">План размещения</div>
    <div class="planner-sub">Ответь на несколько вопросов — и мы соберём программу.</div>
    <!-- Та же кнопка, что в плашке над итогом: чистить бриф нужно и не выходя из него. -->
    <button type="button" class="brief-chip reset" data-reset="1" id="brief-reset-inline"
      style="align-self:flex-start; margin-bottom:4px;">Очистить бриф</button>
    <div class="wiz-steps" id="wiz-steps">
      <button type="button" class="wiz-chip active" data-step="1">1. География</button>
      <button type="button" class="wiz-chip" data-step="2">2. Период</button>
      <button type="button" class="wiz-chip" data-step="3">3. Экраны</button>
      <button type="button" class="wiz-chip" data-step="4">4. Адреска</button>
      <button type="button" class="wiz-chip" data-step="5">5. Цели</button>
    </div>
    <!-- Доступный инвентарь виден на шагах отбора: пул сжимается по мере
         добавления фильтров, и это должно быть видно сразу, а не после перехода. -->
    <div id="pool-sticky-slot"></div>
    <!-- STEP 1 -->
    <div class="wiz-step active" id="wiz-step-1">
      <div class="wiz-step-head">
        <div class="wiz-step-title">Выбираем географию</div>
        <div class="wiz-step-sub">Города и регионы размещения — или готовый список GID-ов, если экраны уже отобраны.</div>
      </div>
      <!-- Geo mode tabs -->
      <div id="geo-mode-tabs" style="display:flex; gap:8px; margin-bottom:14px;">
        <button type="button" id="geo-tab-cities"
          style="flex:1; padding:9px 14px; border-radius:10px; border:1.5px solid #5B3EF5;
                 background:#5B3EF5; color:#fff; font-size:13px; font-weight:600; cursor:pointer; transition:all .15s;">
          🗺 Выбрать города
        </button>
        <button type="button" id="geo-tab-gids"
          style="flex:1; padding:9px 14px; border-radius:10px; border:1.5px solid #e0d9fd;
                 background:#faf8ff; color:#5B3EF5; font-size:13px; font-weight:600; cursor:pointer; transition:all .15s;">
          📋 По GID-списку
        </button>
      </div>

      <!-- CITIES block -->
      <div id="geo-cities-block">
        <div class="planner-block">
          <div class="planner-label">Регион</div>
          <div class="region-field" id="region-field">
            <input id="city-search" type="text" placeholder="Загружаю список регионов…" class="ux-input" disabled autocomplete="off" />
            <span class="region-spinner" id="region-spinner" aria-hidden="true"></span>
            <div class="region-overlay" id="region-overlay">
              <div class="region-overlay-inner">
                <span class="region-overlay-spinner" aria-hidden="true"></span>
                <span>Загружаю регионы…</span>
              </div>
            </div>
          </div>
          <div id="city-suggestions" class="city-suggestions"></div>
          <div id="city-selected" class="city-selected"></div>
          <!-- City import + select all -->
          <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
            <label class="file-import-label" style="display:inline-flex; align-items:center; gap:6px; padding:7px 14px;
                   border:1.5px dashed #c4b5fd; border-radius:10px; background:#faf8ff;
                   color:#5B3EF5; font-size:13px; cursor:pointer; font-weight:500;">
              ↓ Импорт городов из файла
              <input type="file" id="region-file-input" accept=".xlsx,.csv,.txt"
                     style="position:absolute; width:1px; height:1px; opacity:0; pointer-events:none;">
            </label>
            <button type="button" id="regions-paste-btn"
              style="padding:7px 14px; border:1.5px dashed #c4b5fd; border-radius:10px;
                     background:#faf8ff; color:#5B3EF5; font-size:13px; font-weight:500; cursor:pointer;">
              📋 Вставить список
            </button>
            <button type="button" id="regions-select-all"
              style="padding:7px 14px; border:1.5px dashed #c4b5fd; border-radius:10px;
                     background:#faf8ff; color:#5B3EF5; font-size:13px; font-weight:500; cursor:pointer;">
              Выбрать все
            </button>
          </div>
          <!-- Paste area (скрыт до клика на кнопку) -->
          <div id="regions-paste-wrap" style="display:none; margin-top:8px;">
            <textarea id="regions-paste-area"
              placeholder="Москва&#10;Санкт-Петербург&#10;Екатеринбург&#10;или через запятую: Москва, Казань, Уфа"
              style="width:100%; height:90px; padding:8px 10px; border:1.5px solid #c4b5fd;
                     border-radius:10px; font-size:13px; color:#0b1220; resize:vertical;
                     font-family:inherit; box-sizing:border-box;"></textarea>
            <div style="display:flex; gap:8px; margin-top:6px;">
              <button type="button" id="regions-paste-go"
                style="padding:7px 18px; background:#5B3EF5; color:#fff; border:none;
                       border-radius:10px; font-size:13px; font-weight:600; cursor:pointer;">
                Добавить
              </button>
              <button type="button" id="regions-paste-cancel"
                style="padding:7px 14px; background:#f3f4f6; color:#374151; border:none;
                       border-radius:10px; font-size:13px; cursor:pointer;">
                Отмена
              </button>
            </div>
          </div>
          <div id="region-import-status" style="margin-top:6px; font-size:12px; color:#667085; display:none;"></div>
          <div class="planner-note">
            Под "регион" у нас попадают: крупные города (как отдельные), МО/ЛО (областью) и т.д.
          </div>
        </div>
        <div id="region-selected" style="display:flex; flex-wrap:wrap; gap:8px; margin-top:10px;"></div>
        <!-- Only-active-bids toggle -->
        <div style="margin-top:12px; display:flex; align-items:center; gap:8px;">
          <label class="ux-toggle-label" for="only-active-bids" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:#374151;font-weight:500;">
            <span class="ux-toggle-track">
              <input type="checkbox" id="only-active-bids" class="ux-toggle-input">
              <span class="ux-toggle-thumb"></span>
            </span>
            Только активные
          </label>
          <span style="font-size:12px;color:#6b7280;">экраны с известной ставкой</span>
        </div>
        <!-- Pool mini badge (step 1) -->
        <div id="pool-mini-badge" style="display:none; margin-top:10px; padding:10px 14px;
             background:#f4f1ff; border-radius:10px; font-size:13px; color:#5b3ef5;
             align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-size:16px;">📺</span>
          <span>Доступно экранов: <strong id="pool-mini-count" style="font-size:16px; font-weight:700;"></strong></span>
          <span id="pool-mini-filters" style="font-size:12px; color:#9b8aff; margin-left:2px;"></span>
        </div>
        <button id="regions-clear" type="button"
          style="margin-top:10px; display:none; padding:8px 12px; border:1px solid #ddd; border-radius:10px; background:#fff; cursor:pointer;">
          Очистить регионы
        </button>
        <!-- DSP loading progress (shown only while inventory loads) -->
        <div id="dsp-load-progress" style="display:none; margin-top:12px;
             padding:10px 14px; background:#F4F1FF; border-radius:10px; font-size:13px; color:#5B3EF5;">
          <div style="display:flex; align-items:center; gap:10px;">
            <div style="width:16px; height:16px; border:2px solid #5B3EF5; border-top-color:transparent;
                 border-radius:50%; animation:spin 0.8s linear infinite; flex-shrink:0;"></div>
            <span id="dsp-load-status-text">Загружаю инвентарь…</span>
          </div>
          <div style="margin-top:8px; height:4px; background:rgba(91,62,245,0.15); border-radius:2px; overflow:hidden;">
            <div id="dsp-load-bar" style="height:100%; width:0%; background:#5B3EF5; border-radius:2px; transition:width 0.3s;"></div>
          </div>
        </div>
      </div>

      <!-- GID block (initially hidden) -->
      <div id="geo-gids-block" style="display:none;">
        <div class="planner-block">
          <div class="planner-label">Список GID-ов экранов</div>
          <textarea id="manual-gids"
            placeholder="Вставьте GID-ы экранов — по одному на строку или через запятую/пробел/таб.&#10;&#10;Пример:&#10;GID-12345&#10;GID-67890, GID-11111"
            style="width:100%; height:160px; padding:10px; border:1.5px solid #c4b5fd; border-radius:10px;
                   font-size:13px; resize:vertical; box-sizing:border-box; font-family:monospace;"></textarea>
          <div id="manual-gids-status" style="font-size:12px; color:#667085; margin-top:6px;">
            Введите GID-ы — после расчёта будут использованы только эти экраны.
          </div>
          <!-- Один GID у операторов бывает на нескольких экранах. Пока выбор
               не сделан, дальше не пускаем: иначе молча берётся первый
               попавшийся, а у дублей другой город и другая ставка. -->
          <div id="gid-dupes" style="display:none;"></div>
          <!-- Прогресс загрузки инвентаря в GID-режиме -->
          <div id="gid-inventory-progress" style="display:none; margin-top:8px; padding:8px 12px;
               background:#f4f1ff; border-radius:8px; font-size:12px; color:#5b3ef5;
               display:flex; align-items:center; gap:8px;">
            <div style="width:12px; height:12px; border:2px solid #5B3EF5; border-top-color:transparent;
                 border-radius:50%; animation:spin 0.8s linear infinite; flex-shrink:0;"></div>
            <span id="gid-inventory-progress-text">Загружаю инвентарь…</span>
          </div>
          <button id="manual-gids-download-unmatched" type="button" style="display:none; margin-top:8px;
            padding:6px 14px; background:#fff3cd; border:1px solid #ffc107; border-radius:8px;
            font-size:12px; color:#856404; cursor:pointer; font-weight:600;">
            ↓ Скачать не найденные GID-ы
          </button>
        </div>
      </div>

      <div class="wiz-nav">
        <button type="button" class="wiz-btn" id="wiz-next-1">Дальше</button>
      </div>
    </div>
     <!-- STEP 2 -->
<div class="wiz-step" id="wiz-step-2">
  <div class="wiz-step-head">
    <div class="wiz-step-title">Задаём период и расписание</div>
    <div class="wiz-step-sub">Даты кампании и часы, в которые крутится ролик.</div>
  </div>
  <div class="planner-block">
    <div class="planner-label">Даты</div>
    <div class="row-2">
      <input id="date-start" type="date" class="ux-input" aria-label="Дата начала кампании" />
      <input id="date-end" type="date" class="ux-input" aria-label="Дата окончания кампании" />
    </div>
    <button type="button" class="wiz-btn ghost" id="date-next-month"
      style="margin-top:8px;">Ближайший месяц</button>
  </div>
  <div class="planner-block">
    <div class="planner-label">Расписание</div>
    <!-- Скрытые radio — читаются planner.js без изменений -->
    <input type="radio" name="schedule" id="sch-r-all_day" value="all_day" checked style="display:none;">
    <input type="radio" name="schedule" id="sch-r-peak"    value="peak"    style="display:none;">
    <input type="radio" name="schedule" id="sch-r-custom"  value="custom"  style="display:none;">
    <input type="radio" name="schedule" id="sch-r-weekly"  value="weekly"  style="display:none;">
    <!-- Скрытые time-from/to для custom-пресетов -->
    <input type="hidden" id="time-from" value="07:00">
    <input type="hidden" id="time-to"   value="22:00">
    <!-- Чипы-пресеты -->
    <div id="schedule-chips" style="display:flex; gap:8px; flex-wrap:wrap;">
      <button type="button" class="sch-chip active" data-sch="all_day">
        <span class="sch-chip-name">Весь день</span>
        <span class="sch-chip-time">07:00–22:00</span>
      </button>
      <button type="button" class="sch-chip" data-sch="custom" data-from="07:00" data-to="12:00">
        <span class="sch-chip-name">Утро</span>
        <span class="sch-chip-time">07:00–12:00</span>
      </button>
      <button type="button" class="sch-chip" data-sch="custom" data-from="12:00" data-to="18:00">
        <span class="sch-chip-name">День</span>
        <span class="sch-chip-time">12:00–18:00</span>
      </button>
      <button type="button" class="sch-chip" data-sch="custom" data-from="17:00" data-to="22:00">
        <span class="sch-chip-name">Вечер</span>
        <span class="sch-chip-time">17:00–22:00</span>
      </button>
      <button type="button" class="sch-chip" data-sch="peak">
        <span class="sch-chip-name">Часы пик</span>
        <span class="sch-chip-time">07–10 / 17–21</span>
      </button>
      <button type="button" class="sch-chip" data-sch="weekly">
        <span class="sch-chip-name">Свой</span>
        <span class="sch-chip-time">настроить →</span>
      </button>
    </div>
    <!-- Раскрывается при выборе "Свой" -->
    <div id="weekly-wrap" style="display:none; margin-top:12px;">
      <div id="weekly-days" class="weekly-days"></div>
    </div>
  </div>
  <div class="wiz-nav">
    <button type="button" class="wiz-btn ghost" id="wiz-back-2">← География</button>
    <button type="button" class="wiz-btn" id="wiz-next-2">Настройки →</button>
  </div>
</div>
      <!-- STEP 3 -->
      <div class="wiz-step" id="wiz-step-3">
        <div class="wiz-step-head">
          <div class="wiz-step-title">Считаем бюджет</div>
          <div class="wiz-step-sub">Сумма, цель по охвату или показам — и во что это обойдётся с комиссией и НДС.</div>
        </div>
        <div class="planner-block">
          <div class="planner-label">Бюджет</div>
<div class="strategy-chips" style="flex-direction:column;gap:6px;">
  <label class="str-chip">
    <input type="radio" name="budget_mode" value="fixed" checked>
    <div class="str-chip-body">
      <div class="str-chip-title">💰 Бюджет</div>
      <div class="str-chip-desc">Сумма целиком или по городам</div>
    </div>
  </label>
  <!-- Режим «Подскажите бюджет» остался в расчёте: на него переключаемся,
       если поле пустое и уровни ещё не посчитаны. Отдельным пунктом он не
       нужен — кнопки уровней это он и есть, только с видимыми суммами. -->
  <label class="str-chip" style="display:none;">
    <input type="radio" name="budget_mode" value="recommendation">
    <div class="str-chip-body"><div class="str-chip-title">Подскажите бюджет</div></div>
  </label>
  <label class="str-chip">
    <input type="radio" name="budget_mode" value="goal_ots">
    <div class="str-chip-body">
      <div class="str-chip-title">👁 Цель по OTS</div>
      <div class="str-chip-desc">Задам нужный охват — подберёте бюджет</div>
    </div>
  </label>
  <label class="str-chip">
    <input type="radio" name="budget_mode" value="goal_plays">
    <div class="str-chip-body">
      <div class="str-chip-title">📊 Цель по показам</div>
      <div class="str-chip-desc">Задам кол-во показов — подберём бюджет</div>
    </div>
  </label>
</div>
<!-- fixed -->
<div id="budget-input-wrap" style="margin-top:10px;">
  <!-- Уровни от ёмкости отобранной адрески: те же три числа, что и на
       рейке в результате. Клик подставляет сумму в поле. -->
  <div class="ux-tierbtns" id="budget-tier-btns" style="display:none;"></div>
  <input id="budget-input" type="number" class="ux-input" placeholder="Введите бюджет, ₽" min="0" step="1000">
  <input id="budget-total-abs" type="number" style="display:none;">
  <div class="planner-note" style="margin-top:6px;" id="budget-distrib-note">
    Распределим сумму по выбранным регионам.
  </div>
  <!-- per-city toggle (shown when 2+ regions selected) -->
  <div id="per-city-toggle-wrap" style="display:none; margin-top:12px;">
    <div id="per-city-toggle-row" role="switch" aria-checked="false" tabindex="0" data-kbd-click
         style="display:flex;align-items:center;justify-content:space-between;
         padding:10px 12px;border:1.5px solid #e5e3f0;border-radius:12px;background:#fff;cursor:pointer;
         transition:border-color .12s;">
      <span style="font-size:13px;font-weight:500;color:#344054;">Задать бюджет по городам</span>
      <div id="per-city-slider" style="width:38px;height:22px;border-radius:11px;background:#d0d5dd;
           flex-shrink:0;position:relative;transition:background .15s;pointer-events:none;">
        <div id="per-city-knob" style="position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;
             background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:left .15s;"></div>
      </div>
      <input type="checkbox" id="per-city-enabled" style="display:none;">
    </div>
  </div>
  <!-- per-city rows -->
  <div id="per-city-budget-wrap" style="display:none; margin-top:10px;">
    <!-- mode switcher ₽ / % -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <span style="font-size:12px;font-weight:500;color:#667085;">Распределение</span>
      <div style="display:flex;border:1.5px solid #e5e3f0;border-radius:8px;overflow:hidden;background:#f9f8ff;">
        <button type="button" id="per-city-mode-abs" class="pct-mode-btn active"
          style="padding:4px 12px;font-size:12px;font-weight:600;border:none;cursor:pointer;
                 background:#5b3ef5;color:#fff;transition:all .12s;">₽</button>
        <button type="button" id="per-city-mode-pct" class="pct-mode-btn"
          style="padding:4px 12px;font-size:12px;font-weight:600;border:none;cursor:pointer;
                 background:transparent;color:#667085;transition:all .12s;">%</button>
      </div>
    </div>
    <div id="per-city-rows"></div>
    <div style="display:flex;justify-content:space-between;align-items:center;
                border-top:1px solid #e5e3f0;padding-top:8px;margin-top:4px;">
      <span style="font-size:13px;font-weight:600;color:#344054;" id="per-city-total-label">Итого</span>
      <span style="font-size:13px;font-weight:700;color:#5b3ef5;" id="per-city-total-val">0 ₽</span>
    </div>
  </div>
</div>
<!-- goal_ots -->
<div id="goal-ots-wrap" style="margin-top:10px; display:none;">
  <input id="goal-ots" type="number" class="ux-input" placeholder="Введите целевой OTS" min="0" step="1000">
  <div class="planner-note" style="margin-top:6px;">
    Подберём экраны и бюджет так, чтобы получить нужный охват (если физически возможно).
  </div>
</div>
<!-- goal_plays -->
<div id="goal-plays-wrap" style="margin-top:10px; display:none;">
  <input id="goal-plays" type="number" class="ux-input" placeholder="Введите целевое кол-во показов" min="0" step="10000">
</div>
<!-- goal_reco -->
<div id="budget-reco-hint" style="margin-top:6px; color:#667085;">
  Планировщик соберёт адреску для адекватного охвата региона.
  <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;" id="reco-tier-btns">
    <label class="reco-tier-btn"><input type="radio" name="reco_tier" value="min">
      <span class="rtb-label">Минимум</span><span class="rtb-sum" data-sum="min">—</span></label>
    <label class="reco-tier-btn"><input type="radio" name="reco_tier" value="optimal" checked>
      <span class="rtb-label">Оптимальный</span><span class="rtb-sum" data-sum="optimal">—</span></label>
    <label class="reco-tier-btn"><input type="radio" name="reco_tier" value="max">
      <span class="rtb-label">Максимум</span><span class="rtb-sum" data-sum="max">—</span></label>
  </div>
</div>

<!-- НДС + Комиссия -->
<div id="budget-extras-wrap" style="margin-top:14px;">
  <div class="budget-extra-row">
    <label>
      <input type="checkbox" id="vat-enabled">
      С НДС
    </label>
    <div class="budget-extra-rate" id="vat-rate-wrap">
      <input type="number" id="vat-rate" value="22" min="0" max="100" step="0.1">
      <span>%</span>
    </div>
  </div>
  <div class="budget-extra-hint" id="vat-display"></div>

  <div class="budget-extra-row">
    <label>
      <input type="checkbox" id="commission-enabled">
      Включая комиссию системы
    </label>
    <div class="budget-extra-rate" id="commission-rate-wrap">
      <input type="number" id="commission-rate" min="0" max="100" step="0.1" placeholder="0">
      <span>%</span>
    </div>
  </div>
  <div class="budget-extra-hint" id="commission-display"></div>

  <div class="budget-extra-row">
    <label style="cursor:default; font-size:13px; font-weight:500;">
      Надбавка на клиента
    </label>
    <div class="budget-extra-rate" style="display:flex;">
      <input type="number" id="client-markup-rate" min="0" max="100" step="0.1" placeholder="0">
      <span>%</span>
    </div>
  </div>
  <div class="budget-extra-hint" id="client-markup-display"></div>
</div>

        </div>
        <!-- Сюда раскладка переносит блоки этого шага (см. STEP_LAYOUT) -->
        <div id="wiz-step-3-body"></div>
        <button id="calc-btn" class="ux-primary" disabled>Рассчитать</button>
        <div id="calc-blocked-hint" role="alert" style="display:none; margin-top:8px; font-size:12px; color:#c62828; padding:6px 10px; background:#fff5f5; border-radius:8px;"></div>
        <!-- Пока адреска зафиксирована, расчёт идёт внутри неё: новые регионы
             и форматы в неё не попадут, пока её не пересоберут. -->
        <div id="ap-frozen-note" style="display:none;"></div>
        <div id="status" class="planner-status"></div>
        <div class="wiz-nav" style="margin-top:12px;">
          <button type="button" class="wiz-btn ghost" id="wiz-back-3">← Адреска</button>
        </div>
      </div>
      <!-- STEP 4 -->
<div class="wiz-step" id="wiz-step-4">
  <div class="wiz-step-head">
    <div class="wiz-step-title">Подбираем экраны</div>
    <div class="wiz-step-sub">Какие поверхности берём в работу и по каким ограничениям их отбираем.</div>
  </div>
  <!-- Сюда раскладка переносит блоки этого шага (см. STEP_LAYOUT) -->
  <div id="wiz-step-4-body"></div>
  <!-- Форматы -->
  <div class="planner-block" id="step4-formats-block">
    <div class="planner-label">Форматы</div>
    <div class="fmt-toolbar" id="formats-presets">
      <button type="button" class="fmt-pill" data-preset="all">Все</button>
      <button type="button" class="fmt-pill" data-preset="max_reach">Макс. охват</button>
      <button type="button" class="fmt-pill" data-preset="street">Улицы</button>
      <button type="button" class="fmt-pill" data-preset="indoor">Indoor</button>
      <button type="button" class="fmt-pill" data-preset="clear">Очистить</button>
    </div>
    <div class="fmt-grid" id="formats-wrap"></div>
    <div style="margin-top:10px;">
      <button type="button" id="formats-toggle" class="fmt-toggle" style="display:none;">
        Показать все форматы
      </button>
    </div>
    <div id="city-formats-section" style="display:none; margin-top:10px;">
      <button type="button" class="cns-per-region-toggle" id="city-formats-toggle">
        <span id="city-formats-arrow">▶</span> Форматы по городам
      </button>
      <div id="city-formats-rows" class="city-fmt-rows" style="display:none;"></div>
    </div>
  </div>
  <!-- ===== ПЕРЕДАЧА ФОТООТЧЁТА ===== -->
  <div class="planner-block" id="photo-report-block" style="display:none;">
    <div class="planner-label">Передача фотоотчёта</div>
    <div class="planner-note" style="margin-bottom:8px;">
      Ничего не выбрано = не фильтруем. «Авто» — экраны, которые фото реально
      присылают; если последнее фото старше полугода, экран считается как «Нет».
    </div>
    <div class="strategy-chips" id="photo-report-chips" style="max-width:420px;">
      <label class="str-chip">
        <input type="checkbox" id="pr-yes" value="YES">
        <div class="str-chip-body"><div class="str-chip-title">Да</div>
          <div class="str-chip-desc">оператор заявил передачу</div></div>
      </label>
      <label class="str-chip">
        <input type="checkbox" id="pr-auto" value="AUTO">
        <div class="str-chip-body"><div class="str-chip-title">Авто</div>
          <div class="str-chip-desc">фото приходят, проверено нами</div></div>
      </label>
      <label class="str-chip">
        <input type="checkbox" id="pr-no" value="NO">
        <div class="str-chip-body"><div class="str-chip-title">Нет</div>
          <div class="str-chip-desc">не передаёт</div></div>
      </label>
    </div>
    <div class="planner-note" id="photo-report-counts" style="margin-top:8px;"></div>
  </div>
  <!-- ===== СТОРОНА ЭКРАНА A/Б ===== -->
  <div class="planner-block" id="side-block" style="display:none;">
    <div class="planner-label">Сторона экрана</div>
    <div class="planner-note" style="margin-bottom:8px;">Ничего не выбрано = все стороны.</div>
    <div class="strategy-chips" id="side-chips" style="max-width:280px;">
      <label class="str-chip">
        <input type="checkbox" id="side-a" value="A">
        <div class="str-chip-body"><div class="str-chip-title">Сторона A</div></div>
      </label>
      <label class="str-chip">
        <input type="checkbox" id="side-b" value="B">
        <div class="str-chip-body"><div class="str-chip-title">Сторона Б</div></div>
      </label>
    </div>
  </div>
  <!-- Стратегия подбора -->
  <div class="planner-block reach-mode-block" id="step4-strategy-block">
    <div class="planner-label">Стратегия подбора</div>
    <div class="strategy-chips">
      <label class="str-chip">
        <input type="radio" name="reach_mode" value="max_reach" checked>
        <div class="str-chip-body">
          <div class="str-chip-title">↗ Охват</div>
          <div class="str-chip-desc">Больше точек, реже показы</div>
        </div>
      </label>
      <label class="str-chip">
        <input type="radio" name="reach_mode" value="balanced">
        <div class="str-chip-body">
          <div class="str-chip-title">⚖ Баланс</div>
          <div class="str-chip-desc">Середина между тем и другим</div>
        </div>
      </label>
      <label class="str-chip">
        <input type="radio" name="reach_mode" value="max_freq">
        <div class="str-chip-body">
          <div class="str-chip-title">🔁 Частота</div>
          <div class="str-chip-desc">Меньше точек, чаще показы</div>
        </div>
      </label>
    </div>
    <div class="planner-note" style="margin-top:10px;" id="reach-mode-hint"></div>
  </div>
  <!-- Количество экранов -->
  <div class="planner-block" id="constructions-block">
    <div class="planner-label">Количество экранов</div>
    <div class="planner-note" style="margin-bottom:8px;">
      По умолчанию число подбирает стратегия. Включите, чтобы задать точное.
    </div>
    <div class="cns-chip" id="constructions-chip" role="switch" aria-checked="false" tabindex="0" data-kbd-click>
      <span class="cns-chip-ico">🏗</span>
      <div class="cns-chip-body">
        <div class="str-chip-title">Задать вручную</div>
        <div class="str-chip-desc">Точное число конструкций</div>
      </div>
      <span class="cns-chip-badge" id="cns-chip-badge"></span>
    </div>
    <input type="checkbox" id="constructions-enabled" style="display:none;">
    <div id="constructions-count-wrap" style="display:none; margin-top:8px;">
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="number" id="constructions-count" min="1" step="1" placeholder="Количество конструкций" class="ux-input" style="flex:1;">
        <button type="button" id="constructions-max-btn" title="Взять все доступные экраны"
          style="padding:8px 14px; border:1px solid #c4b5fd; border-radius:10px; background:#faf8ff;
                 color:#5B3EF5; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap;">
          max
        </button>
      </div>
      <!-- per-format screen count -->
      <div id="cns-format-count-wrap" style="display:none; margin-top:8px;">
        <button type="button" class="cns-per-region-toggle" id="cns-format-count-toggle">
          <span id="cns-format-count-arrow">▶</span> По форматам
        </button>
        <div id="cns-format-count-rows" class="cns-per-region-rows" style="display:none;"></div>
      </div>
      <!-- per-region screen count -->
      <div id="cns-region-count-wrap" style="display:none; margin-top:8px;">
        <button type="button" class="cns-per-region-toggle" id="cns-region-count-toggle">
          <span id="cns-region-count-arrow">▶</span> По регионам
        </button>
        <div id="cns-region-count-rows" class="cns-per-region-rows" style="display:none;"></div>
      </div>
    </div>
  </div>
  <!-- Частота показов -->
  <div class="planner-block" id="frequency-block">
    <div class="planner-label">Частота показов</div>
    <div class="planner-note" style="margin-bottom:8px;">
      Сколько раз в час ролик выходит на одном экране. Чем выше частота, тем меньше экранов уместится в бюджет.
    </div>
    <!-- id, а не closest("div[style]"): раньше строку слайдера искали по
         ближайшему родителю со стилем, и любая перестановка вёрстки её ломала. -->
    <div id="frequency-row">
      <div style="font-size:12px; font-weight:600; margin-bottom:6px; color:#0b1220;">
        Выходов в час на экран: <span id="constructions-ppm-val" style="color:#5b3ef5;">10</span>
      </div>
      <input type="range" id="constructions-ppm" min="1" max="60" value="10" style="width:100%; accent-color:#5b3ef5;">
      <div style="display:flex; justify-content:space-between; font-size:11px; color:#6b7280; margin-top:2px;">
        <span>1 / час</span><span>60 / час</span>
      </div>
    </div>
    <div id="constructions-ppm-note" style="display:none; margin-top:6px; font-size:12px; color:#5b3ef5;">
      ℹ️ Частота определяется стратегией подбора. Слайдер неактивен.
    </div>
    <!-- per-region ppm -->
    <div id="cns-region-ppm-wrap" style="display:none; margin-top:8px;">
      <button type="button" class="cns-per-region-toggle" id="cns-region-ppm-toggle">
        <span id="cns-region-ppm-arrow">▶</span> По регионам
      </button>
      <div id="cns-region-ppm-rows" class="cns-per-region-rows" style="display:none;"></div>
    </div>
  </div>
  <!-- Выходов в час (только GID-режим) -->
  <div class="planner-block" id="step4-gid-ppm-block" style="display:none;">
    <div class="planner-label">Выходов в час на экран</div>
    <div style="display:flex; align-items:center; gap:10px; margin-top:4px;">
      <input type="range" id="gid-ppm" min="1" max="60" value="10" style="flex:1; accent-color:#5b3ef5;">
      <span id="gid-ppm-val" style="font-weight:700; color:#5b3ef5; min-width:28px; text-align:right;">10</span>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:11px; color:#6b7280; margin-top:2px;">
      <span>1 / час</span><span>60 / час</span>
    </div>
  </div>
  <!-- Дополнительные экраны с карты (только GID-режим) -->
  <div class="planner-block" id="step4-gid-extra-block" style="display:none;">
    <div class="planner-label">Дополнительные экраны с карты</div>
    <div class="planner-note" style="margin-bottom:8px;">
      GID-список используется полностью. Здесь можно <b>добавить</b> экраны из зоны на карте и при необходимости сузить их по формату/оператору — на сам GID-список эти фильтры не влияют.
    </div>
    <div id="gid-extra-zone-badge" style="display:none; align-items:center; gap:8px; margin-bottom:8px; padding:8px 12px; background:#EDE9FD; border-radius:8px; font-size:13px; color:#3a2bb5;">
      <span>📍</span><span id="gid-extra-zone-text"></span>
      <button id="gid-extra-zone-clear" type="button" style="margin-left:auto; background:none; border:none; color:#5B3EF5; cursor:pointer; font-size:12px; text-decoration:underline; padding:0;">Очистить зону</button>
    </div>
    <button id="gid-extra-zone-draw" type="button" class="wiz-btn ghost" onclick="(function(){var b=document.getElementById('poly-draw-btn');if(b)b.click();else{var m=document.getElementById('poly-modal');if(m){m.style.display='flex';}}})()">🗺 Нарисовать зону на карте</button>
    <div id="gid-extra-filters" style="display:none; margin-top:14px;">
      <div class="planner-label" style="font-size:13px; margin-bottom:4px;">Форматы добавленных экранов</div>
      <div class="planner-note" style="margin-bottom:8px;">Ничего не выбрано = берём все форматы из зоны.</div>
      <div style="display:flex; gap:14px; align-items:center; margin-bottom:10px;">
        <button type="button" id="gid-extra-fmt-all" class="wiz-btn ghost">Выбрать все</button>
        <button type="button" id="gid-extra-fmt-clear" class="wiz-btn ghost">Очистить</button>
        <div style="margin-left:auto; font-size:12px; color:#667085;">Выбрано: <span id="gid-extra-fmt-count">—</span></div>
      </div>
      <div id="gid-extra-formats" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
      <button type="button" id="gid-extra-fmt-toggle" class="fmt-toggle" style="display:none; margin-top:8px;">Показать все форматы</button>
      <div class="planner-label" style="font-size:13px; margin-top:16px; margin-bottom:4px;">Операторы добавленных экранов</div>
      <div class="planner-note" style="margin-bottom:8px;">Ничего не выбрано = берём всех операторов из зоны.</div>
      <div style="display:flex; gap:14px; align-items:center; margin-bottom:10px;">
        <button type="button" id="gid-extra-own-all" class="wiz-btn ghost">Выбрать все</button>
        <button type="button" id="gid-extra-own-clear" class="wiz-btn ghost">Очистить</button>
        <div style="margin-left:auto; font-size:12px; color:#667085;">Выбрано: <span id="gid-extra-own-count">—</span></div>
      </div>
      <div id="gid-extra-owners" style="display:flex; flex-wrap:wrap; gap:6px;"></div>
      <button type="button" id="gid-extra-own-toggle" class="fmt-toggle" style="display:none; margin-top:8px;">Показать всех операторов</button>
    </div>
    <div id="gid-extra-summary" style="margin-top:12px; font-size:13px; color:#5b3ef5; font-weight:600;"></div>
  </div>
  <!-- Режим ставки -->
  <div class="planner-block" id="step4-bid-mode-block">
    <div class="planner-label">Режим ставки</div>
    <div class="strategy-chips">
      <label class="str-chip">
        <input type="radio" name="bid_mode" id="bid-mode-recommended" value="recommended" checked>
        <div class="str-chip-body">
          <div class="str-chip-title">✦ Рекомендованная</div>
          <div class="str-chip-desc">Стабильный откруг</div>
        </div>
      </label>
      <label class="str-chip">
        <input type="radio" name="bid_mode" id="bid-mode-min" value="min">
        <div class="str-chip-body">
          <div class="str-chip-title">↓ Минимальная</div>
          <div class="str-chip-desc">Больше выходов</div>
        </div>
      </label>
    </div>
    <!-- Надбавка — независимый toggle поверх выбранного режима, а не третий
         взаимоисключающий режим: поднимать можно и минималку, и рекомендованную. -->
    <div class="cns-chip" id="bid-uplift-chip" role="switch" aria-checked="false" tabindex="0" data-kbd-click>
      <span class="cns-chip-ico">↑</span>
      <div class="cns-chip-body">
        <div class="str-chip-title">Надбавка к ставке</div>
        <div class="str-chip-desc">Поднять выбранную ставку на %</div>
      </div>
      <span class="cns-chip-badge" id="bid-uplift-badge"></span>
    </div>
    <input type="checkbox" id="bid-uplift-enabled" style="display:none;">
    <div id="bid-uplift-wrap" style="display:none; margin-top:8px;">
      <div style="display:flex; gap:8px; align-items:center;">
        <input type="number" id="bid-uplift-pct" min="0" max="500" step="1" value="10"
               class="ux-input" placeholder="Надбавка, %" style="flex:1;">
        <span style="font-weight:700; color:#5b3ef5;">%</span>
      </div>
      <div class="planner-note" style="margin-top:6px;" id="bid-uplift-note"></div>
    </div>
    <div class="planner-note" style="margin-top:8px;" id="bid-mode-hint-recommended">Оптимальная ставка для стабильного открута — предсказуемый результат.</div>
    <div class="planner-note" style="margin-top:8px; display:none;" id="bid-mode-hint-min">Минимальная цена из инвентаря. Больше выходов, но без гарантии полного открута.</div>
  </div>
  <!-- ===== ДЛИТЕЛЬНОСТЬ РОЛИКА ===== -->
  <div class="planner-block" id="duration-block" style="display:none;">
    <div class="planner-label">Длительность ролика</div>
    <div class="planner-note" style="margin-bottom:8px;">Ставка зависит от длительности — длиннее ролик, выше цена за выход.</div>
    <div class="strategy-chips duration-chips" id="duration-chips"></div>
    <!-- Длительность по форматам: билборды можно взять 5-секундные,
         а медиафасады 15-секундные. Что не задано — идёт по общему выбору. -->
    <div id="duration-by-format" style="margin-top:12px;">
      <button type="button" class="cns-per-region-toggle" id="dur-fmt-toggle">
        <span id="dur-fmt-arrow">\u25B6</span> Задать по форматам
      </button>
      <div id="dur-fmt-rows" class="city-fmt-rows" style="display:none;"></div>
    </div>
  </div>
  <!-- ===== АУДИТОРИЯ VK ===== -->
    <div class="planner-block" id="audience-block">
      <div class="vk-card" id="vk-affinity-card" role="switch" aria-checked="false" tabindex="0" data-kbd-click>
        <div class="vk-card-icon">VK</div>
        <div class="vk-card-body">
          <div class="vk-card-title">Аудитория VK</div>
          <div class="vk-card-desc">Фильтр по affinity-сегментам</div>
        </div>
        <div class="vk-toggle"></div>
      </div>
      <input type="checkbox" id="audience-enabled" style="display:none;">
      <div id="audience-wrap" style="display:none; margin-top:12px;">
        <div id="audience-load-status" style="font-size:12px; color:#667085; margin-bottom:10px;">⏳ Загрузка данных…</div>
        <div id="audience-ui" style="display:none;">
          <!-- Сегменты -->
          <div id="audience-segment-wrap"></div>
          <!-- Глубина отбора по аффинити -->
          <div style="margin-top:12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
              <span style="font-size:12px; font-weight:600; color:#0b1220;">Глубина отбора</span>
              <span style="font-size:13px; font-weight:700; color:#5b3ef5;" id="audience-top-pct-val">10%</span>
            </div>
            <input type="range" id="audience-top-pct" min="5" max="100" step="5" value="10"
                   style="width:100%; accent-color:#5b3ef5;">
            <div style="display:flex; justify-content:space-between; font-size:11px; color:#6b7280; margin-top:2px;">
              <span>5%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>
          <!-- Coverage result -->
          <div id="audience-coverage" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  <!-- ===== ЯНДЕКС ГЕОАНАЛИТИКА ===== -->
  <div class="planner-block" id="yandex-geo-block">
    <div class="vk-card" id="yandex-geo-card" role="switch" aria-checked="false" tabindex="0" data-kbd-click>
      <div class="vk-card-icon" style="background:#fc3f1d; font-size:10px; font-weight:800; letter-spacing:-0.5px;">ЯГео</div>
      <div class="vk-card-body">
        <div class="vk-card-title">Яндекс Геоаналитика</div>
        <div class="vk-card-desc" id="yandex-geo-card-desc">Плотность категорий бизнеса на карте</div>
      </div>
      <div class="vk-toggle"></div>
    </div>
    <div id="yandex-geo-wrap" style="display:none; margin-top:14px;">
      <div style="margin-bottom:10px;">
        <div class="planner-label" style="margin-bottom:6px;">Категория бизнеса рядом с экраном</div>
        <select id="poi-category" style="width:100%; padding:9px 12px; border:1.5px solid #c4b5fd;
            border-radius:10px; font-size:13px; color:#0b1220; background:#fff; cursor:pointer;">
          <option value="searches.pharmacy">Аптеки</option>
          <option value="searches.food">Рестораны и кафе</option>
          <option value="searches.grocery">Продуктовые магазины</option>
          <option value="searches.mall">Торговые центры</option>
          <option value="searches.gas_station">АЗС</option>
          <option value="searches.beauty">Красота и уход</option>
          <option value="searches.bank">Банки и банкоматы</option>
          <option value="searches.auto_service">Автосервисы</option>
          <option value="searches.clinic">Медицина</option>
          <option value="searches.sport">Спорт и фитнес</option>
          <option value="searches.hotel">Гостиницы</option>
          <option value="searches.electronics">Техника и электроника</option>
          <option value="searches.clothes">Одежда и аксессуары</option>
          <option value="searches.furniture">Мебель и товары для дома</option>
          <option value="searches.alcohol">Алкоголь</option>
          <option value="searches.kindergarten">Детские сады</option>
          <option value="searches.pets">Зоотовары</option>
          <option value="searches.flowers">Цветы</option>
          <option value="searches.jewelry">Ювелирные украшения</option>
          <option value="searches.children">Детские товары</option>
          <option value="searches.books">Книги и канцелярия</option>
          <option value="searches.optics">Оптика</option>
          <option value="searches.hardware">Строительство и ремонт</option>
          <option value="searches.pickup_point">Пункты выдачи</option>
        </select>
      </div>
      <div style="margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
          <div class="planner-label" style="margin:0;">Радиус поиска</div>
          <span style="font-weight:700; color:#c62d10; font-size:13px;"><span id="yandex-radius-val">500</span> м</span>
        </div>
        <input type="range" id="yandex-radius" min="100" max="2000" step="50" value="500"
               style="width:100%; accent-color:#fc3f1d;">
        <div style="display:flex; justify-content:space-between; font-size:11px; color:#6b7280; margin-top:2px;">
          <span>100 м</span><span>500 м</span><span>1 км</span><span>2 км</span>
        </div>
      </div>
      <button id="yandex-find-btn" type="button"
        style="padding:11px 24px; background:#c62d10; color:#fff; border:none;
               border-radius:12px; font-size:14px; font-weight:700; cursor:pointer; width:100%;">
        🔍 Найти экраны
      </button>
      <div id="yandex-poi-status" style="font-size:13px; color:#667085; margin-top:10px; min-height:20px;"></div>
      <div id="yandex-poi-progress-wrap" style="display:none; margin-top:8px;">
        <div style="height:6px; background:rgba(252,63,29,0.12); border-radius:3px; overflow:hidden;">
          <div id="yandex-poi-progress-bar" style="height:100%; width:0%; background:#fc3f1d; border-radius:3px; transition:width 0.2s;"></div>
        </div>
        <div id="yandex-poi-progress-text" style="font-size:11px; color:#c62d10; margin-top:4px;"></div>
      </div>
    </div>
  </div>
  <!-- Зона на карте (перед "Как собираем") -->
  <div class="planner-block" id="step4-map-zone-block">
    <div class="planner-label">Зона на карте</div>
    <div id="poly-badge" style="display:none; align-items:center; gap:8px; margin-bottom:8px;
         padding:8px 12px; background:#EDE9FD; border-radius:8px; font-size:13px; color:#3a2bb5;">
      <span>📍</span>
      <span id="poly-badge-text"></span>
      <button id="poly-clear-btn" type="button" style="margin-left:auto; background:none; border:none;
              color:#5B3EF5; cursor:pointer; font-size:12px; text-decoration:underline; padding:0;">
        Очистить зону
      </button>
    </div>
    <button id="poly-draw-btn" type="button" class="wiz-btn ghost">🗺 Нарисовать зону</button>
    <div class="planner-note" style="margin-top:6px;">
      Нарисуйте полигон — в расчёт попадут только экраны внутри зоны.
    </div>
  </div>
  <!-- Как собираем программу -->
  <div class="planner-block" id="step4-selection-block">
    <div class="planner-label">Как собираем программу</div>
    <div class="sel-chips" id="selection-mode-chips">
      <button type="button" class="sel-chip active" data-mode="city_even">
        <span class="sel-chip-ico">⚡</span><span>Равномерно</span>
      </button>
      <button type="button" class="sel-chip" data-mode="near_address">
        <span class="sel-chip-ico">🏠</span><span>Рядом с адресом</span>
      </button>
    </div>
    <select id="selection-mode" style="display:none;">
      <option value="city_even">Равномерно по региону</option>
      <option value="near_address">Рядом с адресом</option>
      <option value="manual_screens">По GID-списку</option>
    </select>
    <div id="selection-extra" style="margin-top:10px;"></div>
  </div>
  <!-- ===== ПРЕВЬЮ ПУЛА ===== -->
  <div class="planner-block pool-preview-block" id="pool-preview-block">
    <div style="display:flex; align-items:baseline; gap:8px; margin-bottom:6px;">
      <div class="planner-label" style="margin:0;">Доступный инвентарь</div>
      <div id="pool-count-badge" style="font-size:24px; font-weight:700; color:#5b3ef5; line-height:1;"></div>
    </div>
    <div id="pool-preview-content" class="planner-note" style="color:#667085;">
      Укажите регионы, чтобы увидеть объём доступного инвентаря.
    </div>
  </div>
  <!-- Разделитель (переезжает вместе с блоком операторов) -->
  <div class="additional-filters-divider">
    <span>Дополнительные ограничения</span>
  </div>
  <!-- Операторы -->
  <div class="planner-block" id="owners-block">
    <div class="planner-label">Операторы</div>
    <input type="text" id="owner-search" placeholder="Поиск оператора…" class="ux-input"
           style="margin-bottom:10px; width:100%;">
    <div style="display:flex; gap:14px; align-items:center; margin-bottom:10px;">
      <button type="button" id="owner-all" class="wiz-btn ghost">Все</button>
      <button type="button" id="owner-clear" class="wiz-btn ghost">Очистить</button>
      <div style="margin-left:auto; font-size:12px; color:#667085;">Выбрано: <span id="owners-count">—</span></div>
    </div>
    <div id="owner-wrap" class="owner-wrap owner-collapsed"></div>
    <button type="button" id="owner-toggle" class="fmt-toggle">Показать всех операторов</button>
    <div class="planner-note" style="margin-top:6px;">Можно выбрать конкретных операторов или оставить всех доступных.</div>
  </div>
  <!-- GRP -->
  <div class="planner-block" id="grp-block">
    <div class="planner-label">GRP</div>
    <label class="check-row"><input id="grp-enabled" type="checkbox" /> Фильтровать по GRP (0–9.98)</label>
    <div id="grp-wrap" style="display:none; margin-top:10px;">
      <div class="row-2">
        <input id="grp-min" type="number" step="0.01" min="0" max="9.98" value="0" class="ux-input" />
        <input id="grp-max" type="number" step="0.01" min="0" max="9.98" value="9.98" class="ux-input" />
      </div>
      <div class="planner-note" style="margin-top:6px;">⚠️ Не все экраны передают GRP. При включении фильтра будут предложены только экраны с заполненным GRP.</div>
    </div>
  </div>
  <div class="wiz-nav" style="margin-top:12px;">
    <button type="button" class="wiz-btn ghost" id="wiz-back-4">← Период</button>
    <button type="button" class="wiz-btn" id="wiz-next-4">Адреска →</button>
  </div>
</div>
<!-- STEP 5 (логический шаг 4) — «Настраиваем адреску».
     Блоки в него переносятся из div4 на старте, см. STEP_LAYOUT в скрипте ниже:
     держать разметку в одном месте, а раскладку — списком, дешевле, чем
     физически перетаскивать по файлу тысячи строк при каждой перекомпоновке. -->
<div class="wiz-step" id="wiz-step-5">
  <div class="wiz-step-head">
    <div class="wiz-step-title">Настраиваем адресную программу</div>
    <div class="wiz-step-sub">Сколько экранов брать, как часто крутить и где именно они стоят.</div>
  </div>
  <!-- Ось «охват или частота». Три прежних блока — «Стратегия подбора»,
       «Количество экранов» и «Частота показов» — описывали один и тот же
       компромисс, а между ними стоял ползунок, не работавший без двух
       переключателей в соседних блоках. Сами блоки остаются в DOM и
       остаются источником истины для расчёта: отсюда мы просто их ставим. -->
  <div class="planner-block" id="axis-block">
    <div class="planner-label">Охват или частота
      <span class="grp-d" style="font-weight:400;">одно за счёт другого — бюджет один</span>
    </div>
    <div class="ux-axis" id="axis-chips">
      <button type="button" class="ux-ax" data-mode="max_reach" aria-pressed="true">
        <span class="t">Охват</span><span class="d">больше точек, реже показы</span>
        <span class="p" data-p="max_reach"></span>
      </button>
      <button type="button" class="ux-ax" data-mode="balanced" aria-pressed="false">
        <span class="t">Баланс</span><span class="d">середина между тем и другим</span>
        <span class="p" data-p="balanced"></span>
      </button>
      <button type="button" class="ux-ax" data-mode="max_freq" aria-pressed="false">
        <span class="t">Частота</span><span class="d">меньше точек, чаще показы</span>
        <span class="p" data-p="max_freq"></span>
      </button>
    </div>
    <div class="ux-exact" id="axis-exact">
      <span class="lb">Или задать точно:</span>
      <span class="fld"><input type="number" id="axis-screens" min="1" step="1" placeholder="—" aria-label="Экранов"><span class="u">экранов</span></span>
      <span class="fld"><input type="number" id="axis-pph" min="1" max="60" step="1" placeholder="—" aria-label="Выходов в час"><span class="u">вых/час</span></span>
      <span class="off" id="axis-exact-note">пока пусто — считает стратегия</span>
    </div>
    <div class="planner-note" id="reach-mode-hint-proxy" style="margin-top:10px;"></div>
  </div>
  <div id="wiz-step-5-body"></div>
  <div class="wiz-nav" style="margin-top:12px;">
    <button type="button" class="wiz-btn ghost" id="wiz-back-5">← Экраны</button>
    <button type="button" class="wiz-btn" id="wiz-next-5">Цели →</button>
  </div>
</div>
  </div>
    <!-- Right -->
    <div class="ux-panel planner-right">
      <!-- raw summary from planner.js (оставляем как источник истины) -->
<pre id="summary" class="summary-pre"></pre>
<!-- Рейка ёмкости и частота. Стоят над сводкой: это рычаги, а числа
     ниже — их показание. Видны только после расчёта, обе шкалы
     считаются от зафиксированной адресной программы. -->
<div id="result-controls" style="display:none; margin-top:12px;"></div>
<!-- КРАСИВАЯ СВОДКА (карточки) -->
<div id="pretty-summary" style="margin-top:12px;"></div>
<!-- CHARTS -->
<div id="charts" style="margin-top:12px;"></div>
<div class="download-row ux-tools">
  <div style="position:relative;display:inline-flex;align-items:center;gap:4px;">
    <button id="download-plan-xlsx" class="wiz-btn" disabled>Скачать медиаплан</button>
    <button id="dl-settings-btn" class="dl-settings-gear" title="Настройки скачивания" disabled>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    </button>
    <div id="dl-settings-popup" class="dl-settings-popup" style="display:none;">
      <div class="dl-settings-title">Настройки скачивания</div>
      <label class="dl-settings-row">
        <input type="checkbox" id="dl-show-commission" checked>
        <span>Показывать сумму и % комиссии отдельно</span>
      </label>
      <label class="dl-settings-row">
        <input type="checkbox" id="dl-show-vat" checked>
        <span>Показывать сумму НДС и итого отдельно</span>
      </label>
      <label class="dl-settings-row">
        <input type="checkbox" id="dl-split-operator">
        <span>Разбить строки по операторам</span>
      </label>
      <label class="dl-settings-row">
        <input type="checkbox" id="dl-download-map" checked>
        <span>Скачивать карту</span>
      </label>
    </div>
  </div>
  <button id="download-csv" class="ux-more" disabled>GIDы</button>
  <button id="download-pool-gids" class="ux-more" style="display:none;" title="Скачать все экраны пула (до ограничений бюджета)">Весь пул</button>
  <button id="download-poi-csv" class="ux-more" disabled>POI (CSV)</button>
  <button id="download-poi-xlsx" class="ux-more" disabled>POI (XLSX)</button>
  <span class="sep"></span>
  <button id="send-plan-btn">🚀 Передать менеджеру</button>
</div>
<div id="poi-results" style="margin-top:12px;"></div>
<!-- это твоя таблица "первые 10 экранов" — оставляем -->
<div id="results" style="margin-top:14px;"></div>
<div id="img-carousel" style="margin-top:16px;"></div>
<!-- Карта идёт сразу за сеткой экранов: это один и тот же список,
     показанный двумя способами — сетка отвечает «какие», карта «где». -->
<div id="planner-map-head" class="ux-map-head" style="display:none; margin-top:16px;">
  <div class="ux-map-lg">
    <span><i style="background:var(--ux-accent)"></i> Экран программы</span>
    <span><i style="background:var(--ux-warn)"></i> Медиафасад</span>
    <span><i style="background:var(--ux-danger)"></i> Подозрительная ставка</span>
  </div>
  <button type="button" id="map-download-btn" class="ux-more">Скачать карту</button>
</div>
<div id="planner-map" class="planner-map" style="display:none; margin-top:0;"></div>
    </div>
  </div>
    </div>
<!-- ===================== SEND PLAN POPUP ===================== -->
<div id="send-plan-popup">
  <div class="spp-card">
    <div class="spp-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
    </div>
    <div class="spp-title">План передан менеджеру!</div>
    <div class="spp-sub">Мы свяжемся с вами в ближайшее время и уточним детали размещения.</div>
    <button class="spp-close" id="send-plan-popup-close">Отлично</button>
  </div>
</div>
<!-- ===================== POLYGON DRAW MODAL ===================== -->
<div id="poly-modal" style="
  display:none; position:fixed; inset:0; z-index:10000;
  background:rgba(11,18,32,0.72); backdrop-filter:blur(4px);
  align-items:center; justify-content:center; padding:16px;">
  <div style="
    background:#fff; border-radius:20px; overflow:hidden;
    width:100%; max-width:960px; height:90vh;
    display:flex; flex-direction:column;
    box-shadow:0 24px 80px rgba(11,18,32,0.35);">
    <!-- Header -->
    <div style="
      padding:16px 20px; border-bottom:1px solid #eee;
      display:flex; align-items:center; gap:12px; flex-shrink:0;">
      <div style="font-weight:700; font-size:16px; color:#0B1220;">🗺 Нарисовать зону</div>
      <div id="poly-modal-count" style="
        font-size:13px; color:#5B3EF5; font-weight:600;
        background:#EDE9FD; padding:3px 10px; border-radius:20px; display:none;">
      </div>
      <div style="margin-left:auto; display:flex; gap:8px;">
        <button id="poly-modal-reset" type="button" class="wiz-btn ghost" style="display:none;">
          Перерисовать
        </button>
        <button id="poly-modal-cancel" type="button" class="wiz-btn ghost">Отмена</button>
      </div>
    </div>
    <!-- Draw mode toolbar -->
    <div style="padding:8px 20px; border-bottom:1px solid #f0f0f0; background:#FAFAFA; display:flex; gap:8px; align-items:center; flex-shrink:0;">
      <span style="font-size:12px; color:#667085; font-weight:500;">Инструмент:</span>
      <button id="draw-mode-polygon" type="button" style="padding:5px 14px; border-radius:999px; border:1.5px solid #5B3EF5; background:#EDE9FD; color:#4930C7; font-size:12px; font-weight:600; cursor:pointer;">◻ Полигон</button>
      <button id="draw-mode-line" type="button" style="padding:5px 14px; border-radius:999px; border:1.5px solid rgba(15,23,42,.14); background:#fff; color:#374151; font-size:12px; font-weight:500; cursor:pointer;">— Линия (100 м)</button>
    </div>
    <!-- Hint bar -->
    <div id="poly-hint" style="
      padding:8px 20px; font-size:12px; color:#667085;
      background:#F9FAFB; border-bottom:1px solid #f0f0f0; flex-shrink:0;">
      Кликайте на карту, чтобы добавлять точки полигона. Замкните его — кликните на первую точку или нажмите «Завершить».
    </div>
    <!-- Map -->
    <div style="flex:1; position:relative; min-height:0;">
      <div id="poly-map" style="height:100%; width:100%;"></div>
      <!-- Finish button (floating) -->
      <button id="poly-finish-btn" type="button" style="
        display:none; position:absolute; bottom:16px; left:50%; transform:translateX(-50%);
        background:#5B3EF5; color:#fff; border:none; border-radius:999px;
        padding:10px 24px; font-size:14px; font-weight:600; cursor:pointer;
        box-shadow:0 4px 20px rgba(91,62,245,0.4); z-index:500;">
        ✓ Завершить полигон
      </button>
    </div>
  </div>
</div>
<!-- ===================== LIBS ===================== -->
<!-- CSS Leaflet подключает loadCSS() выше; дублирующие <link> убраны -->
<!-- ===================== STRUCTURE CSS ===================== -->
<!-- ===================== BOOT (PLANNER) ===================== -->
<!-- ===================== HELPERS (REGIONS) ===================== -->
<!-- ===================== WIZARD NAV ===================== -->
<!-- ===================== LIVE SUMMARY + PROGRESS (FIXED STEP ORDER) ===================== -->
<!-- ===================== POLYGON ZONE ===================== -->
<!-- ===================== OWNERS ===================== -->
<!-- ===================== PRETTY SUMMARY (SINGLE IMPLEMENTATION, NO BROKEN PARSERS) ===================== -->
<!-- ===================== BID MODE HINT TOGGLE ===================== -->
<!-- ===================== POOL PREVIEW ===================== -->`;

  // Стартуем в фазе брифа: правая колонка скрыта, форма во всю ширину.
  document.getElementById("planner-widget")?.setAttribute("data-phase", "brief");

  // ===== СТРОКА БРИФА =====
  // В фазе результата условия сжимаются в чипы над программой. Каждый чип —
  // кнопка: возвращает в бриф на нужный шаг. Показываем только то, что
  // отличается от дефолта: если фильтр не трогали, чипа нет вовсе, иначе
  // строка распухнет — переключателей в инструменте полтора десятка.
  runScript(`
(function(){
  const el = (id) => document.getElementById(id);
  const RU = (n) => Math.round(n).toLocaleString("ru-RU");

  function esc(v){
    return String(v == null ? "" : v)
      .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  function chip(step, key, val, cls){
    return '<button type="button" class="brief-chip ' + (cls || "") + '" data-step="' + step + '">'
      + (key ? '<span class="k">' + esc(key) + '</span> ' : '')
      + esc(val) + '</button>';
  }

  function fmtDate(v){
    if (!v) return "";
    const p = String(v).split("-");
    return p.length === 3 ? p[2] + "." + p[1] : v;
  }

  function scheduleLabel(){
    const r = document.querySelector('input[name="schedule"]:checked');
    const map = { all_day:"весь день", peak:"часы пик", custom:"свои часы", weekly:"по дням" };
    return map[r && r.value] || "";
  }

  window.renderBriefBar = function renderBriefBar(){
    const bar = el("brief-bar");
    if (!bar) return;
    const st = window.PLANNER && window.PLANNER.state ? window.PLANNER.state : {};

    // --- первая строка: то, без чего расчёта не бывает ---
    const main = [];
    const regions = Array.isArray(st.selectedRegions) ? st.selectedRegions : [];
    if (regions.length){
      main.push(chip(1, "Где", regions.length > 2
        ? regions[0] + " и ещё " + (regions.length - 1)
        : regions.join(", ")));
    }
    const ds = el("date-start") && el("date-start").value;
    const de = el("date-end") && el("date-end").value;
    if (ds && de){
      const sch = scheduleLabel();
      main.push(chip(2, "Когда", fmtDate(ds) + "–" + fmtDate(de) + (sch ? " · " + sch : "")));
    }
    const budget = el("budget-input") && Number(el("budget-input").value);
    if (budget > 0) main.push(chip(5, "Бюджет", RU(budget) + " \u20BD"));

    const reach = document.querySelector('input[name="reach_mode"]:checked');
    const reachMap = { reach:"Охват", balance:"Баланс", frequency:"Частота" };
    if (reach && reachMap[reach.value]) main.push(chip(4, "Стратегия", reachMap[reach.value]));

    const bid = document.querySelector('input[name="bid_mode"]:checked');
    if (bid) main.push(chip(5, "Ставка", bid.value === "min" ? "Минимальная" : "Рекомендованная"));

    main.push('<button type="button" class="brief-chip edit" data-step="1">Править бриф</button>');
    main.push('<button type="button" class="brief-chip reset" data-reset="1"' +
      ' title="' + RESET_HINT + '">Очистить бриф</button>');

    // --- вторая строка: что из необязательного включено ---
    const extra = [];
    const fmtsAuto = el("formats-auto") && el("formats-auto").checked;
    const nFmt = st.selectedFormats && st.selectedFormats.size ? st.selectedFormats.size : 0;
    extra.push(chip(3, "", fmtsAuto || !nFmt ? "Форматы: все" : "Форматы: " + nFmt, "sm" + (nFmt ? " on" : "")));

    const nOwn = st.selectedOwners && st.selectedOwners.size ? st.selectedOwners.size : 0;
    extra.push(chip(3, "", nOwn ? "Операторы: " + nOwn : "Операторы: все", "sm" + (nOwn ? " on" : "")));

    if (el("audience-enabled") && el("audience-enabled").checked)
      extra.push(chip(4, "", "Аудитория VK", "sm on"));
    if (el("yandex-geo-card") && el("yandex-geo-card").classList.contains("active"))
      extra.push(chip(4, "", "Яндекс Гео", "sm on"));
    if (Array.isArray(st.polygonFilter) && st.polygonFilter.length)
      extra.push(chip(4, "", "Зона на карте", "sm on"));
    if (el("constructions-enabled") && el("constructions-enabled").checked)
      extra.push(chip(4, "", "Экранов вручную: " + ((el("constructions-count") && el("constructions-count").value) || "?"), "sm on"));
    if (el("bid-uplift-enabled") && el("bid-uplift-enabled").checked)
      extra.push(chip(5, "", "Надбавка +" + ((el("bid-uplift-pct") && el("bid-uplift-pct").value) || 0) + "%", "sm on"));

    bar.innerHTML =
      '<div class="brief-row">' + main.join("") + '</div>' +
      '<div class="brief-row second"><span class="brief-lbl">Применено</span>' + extra.join("") + '</div>';
  };

  // Делегирование: чипы перерисовываются целиком, свои слушатели вешать некуда.
  document.addEventListener("click", function(e){
    const c = e.target.closest && e.target.closest("#brief-bar .brief-chip");
    if (!c || c.dataset.reset) return;
    if (window.PLANNER_UI && window.PLANNER_UI.setPhase) window.PLANNER_UI.setPhase("brief");
    const step = Number(c.dataset.step || 1);
    if (typeof window.setStep === "function") window.setStep(step);
  });

  const RESET_HINT = "Сбросить бриф целиком и начать с чистого листа. " +
    "Страница перезагрузится, посчитанный план останется в истории расчётов";
  el("brief-reset-inline")?.setAttribute("title", RESET_HINT);

  document.addEventListener("click", function(e){
    const b = e.target.closest && e.target.closest("[data-reset]");
    if (!b) return;

    // Черновик снимаем до перезагрузки, иначе страница встретит
    // предложением восстановить только что вычищенный бриф.
    try { window.PLANNER?.clearDraft?.(); } catch (err) { console.warn("[reset]", err); }
    window.location.reload();
  });
})();
`);

  // ===== БЛИЖАЙШИЙ МЕСЯЦ =====
  runScript(`
(function(){
  const btn = el("date-next-month");
  if (!btn) return;
  const two = (v) => String(v).padStart(2, "0");
  const iso = (d) => d.getFullYear() + "-" + two(d.getMonth() + 1) + "-" + two(d.getDate());
  btn.addEventListener("click", () => {
    // Следующий календарный месяц целиком: 24 августа даёт 01–30 сентября,
    // 4 сентября — 01–31 октября. День внутри месяца роли не играет.
    // Считаем в локальном времени: через UTC на восточных поясах дата
    // уезжает на сутки назад.
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth() + 1;
    const first = new Date(y, m, 1);
    const last  = new Date(y, m + 1, 0);   // нулевой день = последний день предыдущего
    for (const pair of [["date-start", first], ["date-end", last]]) {
      const inp = el(pair[0]);
      if (!inp) continue;
      inp.value = iso(pair[1]);
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
})();
`);

  // ===== ОБЛАСТЬ РАЗБИВКИ ПО ФОРМАТАМ =====
  // Общая ставка по формату отвечает на вопрос «сколько стоит билборд»,
  // а клиент чаще спрашивает «сколько стоит билборд в Казани».
  runScript(`
(function(){
  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("#fmt-scope button");
    if (!b) return;
    const seg = b.parentNode;
    const table = document.getElementById("fmt-table");
    if (!table) return;
    seg.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    table.dataset.scope = b.dataset.scope;
  });
})();
`);

  // ===== УРОВНИ БЮДЖЕТА НА ШАГЕ «ЦЕЛИ» =====
  // Отдельного режима «подскажите бюджет» больше нет: три кнопки с живыми
  // суммами и есть подсказка, только видно, из чего она сложилась.
  runScript(`
(function(){
  const el = (id) => document.getElementById(id);
  const money = (v) => Math.round(v).toLocaleString("ru-RU") + " \u20BD";

  // «Частоту задали руками» — это осознанное действие, а не значение по
  // умолчанию: GID-слайдер всегда стоит на 10, и без метки уровни исчезали бы
  // в GID-режиме всегда. Метку ставит сам сдвиг слайдера.
  function freqFixed(){
    const gids = el("geo-gids-block");
    if (gids && gids.style.display !== "none") return !!el("gid-ppm")?.dataset?.touched;
    return !!(el("constructions-enabled")?.checked
      && Number(el("constructions-ppm")?.value) > 0);
  }
  window.plannerFreqFixed = freqFixed;

  function render(){
    const host = el("budget-tier-btns");
    if (!host) return;
    // Частота и уровень бюджета — одно число с двух сторон: бюджет = экраны x
    // частота x часы x ставка. Когда частота задана, уровень ей противоречит:
    // выбрали 40 вых/час, а план приходил на 15, потому что сумма от уровня
    // пересчитывала частоту обратно. Убираем уровни, считаем от частоты.
    if (freqFixed()){
      host.dataset.pending = "";
      const inp = el("budget-input");
      if (inp){ inp.disabled = false; inp.placeholder = "Введите бюджет, ₽"; }
      // Уровни здесь не к месту, но и пустое место — не ответ: когда частота
      // задана, сумма из неё выводится однозначно, её и показываем. Считает
      // planner.js той же формулой, какой потом пойдёт расчёт.
      const f = window.PLANNER?.computeFreqBudget?.();
      if (!f){ host.style.display = "none"; host.innerHTML = ""; return; }
      const режим = document.querySelector('input[name="budget_mode"]:checked')?.value;
      host.style.display = "block";
      host.innerHTML = "<div class='ux-freqsum'>"
        + "<b>" + money(f.budget) + "</b>"
        + "<span>" + f.screens.toLocaleString("ru-RU") + " экр. \u00D7 "
        + String(f.pph).replace(".", ",") + " вых/час \u00D7 "
        + String(f.hours).replace(".", ",") + " ч вещания \u00D7 ваша ставка</span>"
        + (f.capped ? "<span class='cap'>у " + f.capped
            + " экр. частота срезана потолком носителя</span>" : "")
        + (режим && режим !== "recommendation"
            ? "<span class='cap'>сейчас выбран свой бюджет — тогда частота станет"
              + " производной от суммы. Выберите «подскажите бюджет», чтобы"
              + " считать от частоты</span>" : "")
        + "</div>";
      return;
    }
    const t = window.PLANNER?.computeRecoBudgetTiers?.();
    if (!t || !t.max){ host.style.display = "none"; return; }

    const pending = host.dataset.pending || "";
    const items = [
      { k: "min", t: "Минимум",     v: t.min },
      { k: "opt", t: "Оптимальный", v: t.optimal },
      { k: "max", t: "Максимум",    v: t.max },
    ].filter(x => x.v > 0);
    if (!items.length){ host.style.display = "none"; return; }

    host.style.display = "grid";
    host.innerHTML = items.map(x => {
      return '<button type="button" class="ux-tierbtn" data-k="' + x.k
        + '" aria-pressed="' + (pending === x.k) + '"><span class="t">' + x.t
        + '</span><span class="v soon">посчитаем при расчёте</span></button>';
    }).join("");

    // Выбран уровень — сумму задаёт он, руками её вводить нечего.
    const inp = el("budget-input");
    if (inp){
      const locked = !!pending;
      inp.disabled = locked;
      inp.placeholder = locked
        ? "Сумму подставим по выбранному уровню"
        : "Введите бюджет, \u20BD";
    }
  }
  window.renderBudgetTiers = render;

  // Ввод руками возвращает сумме видимость. Только настоящий ввод:
  // события, которые мы рассылаем сами, метку снимать не должны.
  document.addEventListener("input", (e) => {
    if (e.isTrusted && e.target && e.target.id === "budget-input"){
      delete e.target.dataset.fromTier;
    }
  }, true);

  // Отложенный выбор доезжает до расчёта: перехватываем клик по кнопке
  // на фазе перехвата — обработчик самого расчёта висит на всплытии.
  ["pointerdown", "click"].forEach(ev => document.addEventListener(ev, (e) => {
    const btn = e.target.closest && e.target.closest("#calc-btn");
    if (!btn) return;
    const host = el("budget-tier-btns");
    const k = host && host.dataset.pending;
    if (!k) return;
    const t = window.PLANNER?.computeRecoBudgetTiers?.();
    const v = t && ({ min: t.min, opt: t.optimal, max: t.max })[k];
    const inp = el("budget-input");
    if (v > 0 && inp){
      inp.disabled = false;
      // Сумму прячем, но не стираем: бриф читает её из поля, и не однажды
      // за расчёт. Метку снимает либо ввод руками, либо отжатие уровня.
      inp.dataset.fromTier = "1";
      inp.value = String(Math.round(v));
      inp.dispatchEvent(new Event("input", { bubbles: true }));
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      // Помним, какой уровень просили: подставленная сейчас сумма считана
      // от пула, а после расчёта её надо пересчитать от собранной адрески.
      if (e.type === "pointerdown") host.dataset.secondPass = k;
    }
    // pointerdown только подставляет сумму — до чтения брифа; снимаем
    // выбор уже по клику, иначе нажатие с уводом мимо кнопки сбросило бы
    // уровень, хотя расчёт так и не начался.
    if (e.type === "click") host.dataset.pending = "";
  }, true));

  // planner:calc-done летит изнутри расчёта, когда замок ещё стоит: снимает
  // его finally следом. Всё, что запускает новый проход, обязано дождаться
  // снятия — иначе жмём заблокированную кнопку и проход не начнётся.
  window.plannerAfterCalc = function afterCalc(fn){
    let tries = 0;
    (function wait(){
      if (!window.PLANNER?.state?._calcRunning) return fn();
      if (++tries > 200) return;   // 20 секунд, дальше что-то не так
      setTimeout(wait, 100);
    })();
  };

  window.addEventListener("planner:calc-done", () => {
    const host = el("budget-tier-btns");
    const k = host && host.dataset.secondPass;
    if (!k) return;
    host.dataset.secondPass = "";
    // Клик по шкале — более позднее решение пользователя, оно главнее.
    if (window.plannerBudgetQueued && window.plannerBudgetQueued()) return;

    const t = window.PLANNER?.computeRecoBudgetTiers?.();
    const v = t && ({ min: t.min, opt: t.optimal, max: t.max })[k];
    const inp = el("budget-input");
    const now = Number(inp?.value || 0);
    if (!(v > 0) || !now) return;
    // Полпроцента — уже попадание: план набирается целыми выходами и
    // ровно в сумму всё равно не ложится. Второй проход тут ничего не даст.
    if (Math.abs(v - now) <= Math.max(1, v * 0.005)) return;
    window.plannerAfterCalc(() => window.plannerApplyBudget?.(v));
  });

  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("#budget-tier-btns .ux-tierbtn");
    if (!b) return;
    const host = el("budget-tier-btns");
    const inp = el("budget-input");
    if (!inp || !host) return;

    // Второй клик по выбранному уровню снимает выбор и отпускает поле.
    const wasPending = host.dataset.pending;
    host.dataset.pending = (wasPending === b.dataset.k) ? "" : b.dataset.k;
    if (host.dataset.pending) {
      // Запоминаем введённое руками ровно один раз — при первом выборе
      // уровня. Переключение между уровнями своё значение не затирает.
      if (!wasPending) host.dataset.own = inp.value || "";
      inp.value = "";
    } else {
      inp.value = host.dataset.own || "";
      delete inp.dataset.fromTier;
    }
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    render();
    if (typeof window.renderProgress === "function") window.renderProgress();
  });

  ["change", "input"].forEach(ev => document.addEventListener(ev, () => setTimeout(render, 0)));
  window.addEventListener("planner:pool-updated", () => render());
  window.addEventListener("planner:calc-done", () => setTimeout(render, 60));
  setTimeout(render, 400);
})();
`);

  // ===== ОСЬ «ОХВАТ ИЛИ ЧАСТОТА» =====
  runScript(`
(function(){
  const el = (id) => document.getElementById(id);

  // Те же числа, что и в расчёте (targetPlaysPerHourPerScreen):
  // выдумывать вторую таблицу нельзя, разъедется на первой же правке.
  const PPH = { max_reach: 2, balanced: 15, max_freq: 30 };

  function poolSize(){
    const pv = window.PLANNER && window.PLANNER.computePoolPreview
      ? window.PLANNER.computePoolPreview() : null;
    return pv ? (pv.countFinal != null ? pv.countFinal : pv.countBase) : null;
  }

  // Сколько экранов получится — производная от бюджета, а его на этом шаге
  // может ещё не быть. Тогда честнее показать одну частоту, чем выдумать
  // второе число: пул тут ни при чём, он только потолок.
  function predict(mode){
    const pph = PPH[mode];
    const pool = poolSize();
    const lc = window.PLANNER && window.PLANNER.lastCalc;
    let screens = null;
    if (lc && lc.meta && lc.meta.totalPlays && lc.meta.days && lc.meta.hpd) {
      // Уже считали: держим выходы постоянными и пересчитываем на новую частоту.
      const total = lc.meta.totalPlays;
      screens = Math.round(total / (pph * lc.meta.days * lc.meta.hpd));
      if (pool) screens = Math.min(screens, pool);
    }
    const f = String(pph).replace(".", ",");
    return screens && screens > 0
      ? "~" + screens.toLocaleString("ru-RU") + " экр \u00B7 " + f + " вых/час"
      : "до " + f + " вых/час на экран";
  }

  function currentMode(){
    const r = document.querySelector('input[name="reach_mode"]:checked');
    return r ? r.value : "max_reach";
  }

  function paintAxis(){
    const mode = currentMode();
    document.querySelectorAll("#axis-chips .ux-ax").forEach(b => {
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    });
    document.querySelectorAll("#axis-chips .p").forEach(sp => {
      sp.textContent = predict(sp.dataset.p);
    });

    // Подсказку стратегии показываем на своём месте: исходный блок свёрнут.
    const src = el("reach-mode-hint"), dst = el("reach-mode-hint-proxy");
    if (src && dst) dst.textContent = src.textContent || "";

    const manual = !!(el("constructions-enabled") && el("constructions-enabled").checked);
    const note = el("axis-exact-note");
    if (note) note.textContent = manual
      ? "задано вручную — стратегия не вмешивается"
      : "пока пусто — считает стратегия";
    const sc = el("axis-screens"), pp = el("axis-pph");
    if (sc && document.activeElement !== sc) {
      sc.value = manual ? ((el("constructions-count") || {}).value || "") : "";
    }
    if (pp && document.activeElement !== pp) {
      pp.value = manual ? ((el("constructions-ppm") || {}).value || "") : "";
    }
  }
  window.paintAxis = paintAxis;

  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest("#axis-chips .ux-ax");
    if (!b) return;
    const r = document.querySelector('input[name="reach_mode"][value="' + b.dataset.mode + '"]');
    if (r && !r.checked) { r.checked = true; r.dispatchEvent(new Event("change", { bubbles: true })); }
    // Стратегия и ручной режим взаимоисключающи: иначе выбор стратегии
    // выглядит нажатым, а считает всё равно ручное число.
    const cb = el("constructions-enabled"), chip = el("constructions-chip");
    if (cb && cb.checked && chip) chip.click();
    paintAxis();
  });

  // Ввод в поля «задать точно» включает ручной режим и правит исходные
  // контролы — они остаются источником истины для расчёта.
  document.addEventListener("input", (e) => {
    const t = e.target;
    if (!t || (t.id !== "axis-screens" && t.id !== "axis-pph")) return;
    const cb = el("constructions-enabled"), chip = el("constructions-chip");
    if (cb && !cb.checked && chip) chip.click();
    const dstId = (t.id === "axis-screens") ? "constructions-count" : "constructions-ppm";
    const dst = el(dstId);
    if (dst) {
      dst.value = t.value;
      dst.dispatchEvent(new Event("input", { bubbles: true }));
      dst.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  ["change", "input"].forEach(ev => document.addEventListener(ev, () => setTimeout(paintAxis, 0)));
  window.addEventListener("planner:pool-updated", () => paintAxis());
  window.addEventListener("planner:calc-done", () => setTimeout(paintAxis, 60));
  setTimeout(paintAxis, 300);
})();
`);

  // ===== УПРАВЛЕНИЕ ПРЯМО В РЕЗУЛЬТАТЕ =====
  runScript(`
(function(){
  const el = (id) => document.getElementById(id);
  const RU = (n) => Math.round(n).toLocaleString("ru-RU");
  const money = (n) => RU(n) + " \u20BD";

  // Пересчёт после смены уровня бюджета сети не стоит: прогноз ставок лежит
  // в памяти час и при неизменном пуле dspFetchForecastBids выходит сразу.
  function recalc(){ const b = el("calc-btn"); if (b && !b.disabled) b.click(); }

  function plan(){
    const lc = window.PLANNER && window.PLANNER.lastCalc;
    if (!lc || !lc.meta) return null;
    const m = lc.meta;
    const screens = (lc.chosen || []).length;
    if (!screens || !m.days || !m.hpd || !m.totalPlays) return null;
    return {
      screens, days: m.days, hpd: m.hpd,
      plays: m.totalPlays,
      budget: m.totalBudget || 0,
      ots: m.totalOts || 0,
      pph: m.totalPlays / m.days / m.hpd / screens,
      costPerPlay: (m.totalBudget || 0) / m.totalPlays
    };
  }

  // Засечки стоят по значению, и когда два уровня близки, их подписи
  // перекрываются, а крайняя левая ещё и уезжает за край дорожки.
  // Двигаем только текст: риска обязана остаться на своём значении.
  function layoutRailStops(rail){
    if (!rail) return;
    const stops = Array.prototype.slice.call(rail.querySelectorAll(".rail-stop"));
    if (!stops.length) return;
    const railBox = rail.getBoundingClientRect();
    // Пиксель запаса: сдвиг округляется до целого, и без него крайняя
    // подпись садится ровно на границу и вылезает на субпиксель.
    const W = Math.floor(railBox.width) - 1;
    if (W <= 0) return;
    const GAP = 10;

    const items = stops.map(st => {
      const lb = st.querySelector(".lb"), sm = st.querySelector(".sm");
      lb.style.transform = ""; sm.style.transform = "";
      const lbB = lb.getBoundingClientRect(), smB = sm.getBoundingClientRect();
      const w = Math.max(lbB.width, smB.width);
      // Точка отсчёта — центр самой широкой из двух подписей: сдвиг
      // применяем к обеим, и уехать они должны одинаково.
      const wide = lbB.width >= smB.width ? lbB : smB;
      const c = wide.left + wide.width / 2 - railBox.left;
      return { lb, sm, w, c, x: c };
    });

    // Слева направо расталкиваем и держим левый край.
    for (let i = 0; i < items.length; i++){
      const need = i
        ? items[i-1].x + items[i-1].w / 2 + items[i].w / 2 + GAP
        : items[i].w / 2;
      if (items[i].x < need) items[i].x = need;
      if (items[i].x < items[i].w / 2) items[i].x = items[i].w / 2;
    }
    // Справа налево возвращаем внутрь дорожки. Правый край проверяем на
    // каждом шаге: первый проход мог вытолкнуть за него крайнюю подпись,
    // а она тянет за собой всю цепочку.
    for (let i = items.length - 1; i >= 0; i--){
      let lim = W - items[i].w / 2;
      if (i < items.length - 1){
        lim = Math.min(lim, items[i+1].x - items[i+1].w / 2 - items[i].w / 2 - GAP);
      }
      if (items[i].x > lim) items[i].x = lim;
    }
    // Если подписи не помещаются даже впритык, жертвуем правым краем:
    // обрезанное начало суммы читается хуже, чем обрезанный хвост.
    for (const it of items) it.x = Math.max(it.x, it.w / 2);

    for (const it of items){
      const d = Math.round(it.x - it.c);
      const tr = d ? "translateX(" + d + "px)" : "";
      it.lb.style.transform = tr;
      it.sm.style.transform = tr;
    }
  }

  function renderTiers(host){
    const t = window.PLANNER && window.PLANNER.computeRecoBudgetTiers
      ? window.PLANNER.computeRecoBudgetTiers() : null;
    const pl = plan();
    const now = pl ? pl.budget : (Number(el("budget-input") && el("budget-input").value) || 0);
    if (!t) return "";
    const items = [
      { k: "min", t: "Минимум",     v: t.min },
      { k: "opt", t: "Оптимальный", v: t.optimal },
      { k: "max", t: "Максимум",    v: t.max }
    ].filter(x => x.v > 0);
    // Активен уровень, на который лёг текущий план. Совпадение считаем с
    // допуском в полпроцента: программа собирается по целым выходам и
    // ровно в сумму почти никогда не попадает.
    let active = null;
    for (const x of items) if (Math.abs(x.v - now) <= Math.max(1, x.v * 0.005)) active = x.k;
    items.sort((a, b) => a.v - b.v);
    // Позиция засечки — доля от максимума: он и есть полная ёмкость.
    const max = t.max || 0;
    const pct = (v) => max > 0 ? Math.max(0, Math.min(100, v / max * 100)) : 0;
    const nowPct = pct(now);
    const tierName = t.tier ? (" \u00B7 тир " + t.tier) : "";

    const stops = items.map(x => {
      const on = (x.k === active);
      return '<div class="rail-stop' + (on ? ' on' : '') + '" style="left:' + pct(x.v).toFixed(2) + '%">' +
        '<button type="button" class="hit rc-tier" data-sum="' + Math.round(x.v) + '"' +
        ' aria-pressed="' + on + '">' +
        '<span class="lb">' + x.t + '</span><span class="pip"></span>' +
        '<span class="sm">' + money(x.v) + '</span></button></div>';
    }).join("");

    return '<div class="rc-card">' +
      '<div class="rc-head"><b>Уровень бюджета</b>' +
      '<span>' + tierName.replace(/^ \u00B7 /, "") +
      (tierName ? ' \u00B7 ' : '') + 'пересобирает в пределах отобранной адрески</span>' +
      '<input class="rc-now" id="rc-now-input" inputmode="numeric" ' +
        'aria-label="Бюджет плана" value="' + money(now) + '">' +
      '</div>' +
      '<div class="rail" id="rc-rail" role="slider" tabindex="0" ' +
        'aria-label="Бюджет: доля от полной ёмкости" aria-valuemin="0" ' +
        'aria-valuemax="' + Math.round(max) + '" aria-valuenow="' + Math.round(now) + '">' +
      '<div class="rail-track"></div>' +
      '<div class="rail-fill" style="width:' + nowPct.toFixed(2) + '%"></div>' +
      stops + '</div>' +
      '<p class="rail-cap"><span>Уровни считаются в пределах отобранных ' + RU(pl ? pl.screens : 0) +
      ' экранов, а не по всему инвентарю: 30 выходов в час, 8 у медиафасадов.' +
      ' В брифе, до сборки адрески, они выше.</span>' +
      '<span>Занято ' + Math.round(nowPct) + '\u00A0%</span></p>' +
      '</div>';
  }

  // Частота текущего плана округляется до сотых, а не до десятых: при большой
  // адресной программе она бывает 0,2 вых/час, и округление до 1 увело бы
  // ползунок с фактического значения — подпись разошлась бы с положением.
  // Округляем до шага ползунка (0,1), иначе позиция и подпись расходятся:
  // текст говорил 0,24, а ручка вставала на 0,2.
  function planPph(pl){ return Math.max(0.1, Math.round(pl.pph * 10) / 10); }

  function renderWhatIf(pl){
    const pph = planPph(pl);
    return '<div class="rc-freq"><label for="rc-pph">Выходов в час на экран</label>' +
      '<input id="rc-pph" type="range" min="0.1" max="60" step="0.1" value="' + pph + '">' +
      '<output id="rc-pph-out">' + String(pph).replace(".", ",") + '</output>' +
      '<div class="rc-out" id="rc-out"></div></div>';
  }

  function paint(target){
    const pl = plan(); if (!pl) return;
    const out = el("rc-out"); if (!out) return;
    const k = target / pl.pph;
    const plays = pl.plays * k, budget = plays * pl.costPerPlay, ots = pl.ots * k;
    const base = pl.budget;
    if (Math.abs(target - pl.pph) < 0.05){
      out.innerHTML = 'Текущий план — <b>' + String(planPph(pl)).replace(".", ",") +
        ' вых/час</b>, ' + RU(pl.plays) + ' выходов, ' + money(pl.budget);
      return;
    }
    const diff = budget - base;
    let html = '<div class="rc-delta"><b>' + money(budget) + '</b>' +
      (diff > 0 ? '<span class="rc-up">+' + money(diff) + '</span>' : '') +
      ' &nbsp;<span style="color:#667085">' + RU(plays) + ' выходов · OTS ' + RU(ots) + '</span></div>';
    if (diff > 0){
      const ratio = base / budget;
      const d = Math.floor(pl.days * ratio), h = Math.floor(pl.hpd * ratio);
      html += (d < 1 || h < 1)
        ? '<div class="rc-adv">В ' + money(base) + ' такая частота не укладывается даже за один день: ' +
          'сутки стоят <b>' + money(budget / pl.days) + '</b>. Резать период бесполезно, нужна меньшая частота.</div>'
        : '<div class="rc-adv">Не увеличивать бюджет можно двумя способами, оба режут охват по времени:' +
          '<br>— период <b>' + d + ' дн.</b> вместо ' + pl.days + ' при том же расписании;' +
          '<br>— расписание <b>' + h + ' ч/день</b> вместо ' + Math.round(pl.hpd) + ' при том же периоде.</div>';
    }
    html += '<button type="button" class="rc-apply" data-pph="' + target + '">Пересобрать по этой частоте</button>';
    out.innerHTML = html;
  }

  window.renderResultControls = function(){
    const host = el("result-controls"); if (!host) return;
    const pl = plan();
    if (!pl){ host.style.display = "none"; return; }
    host.style.display = "block";
    // Частота — вторая шкала того же рычага, поэтому вкладываем её
    // внутрь карточки рейки, а не ставим отдельной панелью.
    const html = renderTiers(host);
    // Без регулярки: обратный слэш внутри неё съедает внешний шаблон, и
    // /<\/div>$/ приезжает в new Function уже сломанной — весь блок падает.
    const CLOSE = "</div>";
    host.innerHTML = html
      ? html.slice(0, -CLOSE.length) + renderWhatIf(pl) + CLOSE
      : renderWhatIf(pl);
    layoutRailStops(host.querySelector("#rc-rail"));
    paint(planPph(pl));
  };

  let railResizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(railResizeTimer);
    railResizeTimer = setTimeout(() => layoutRailStops(el("rc-rail")), 120);
  });

  // Сумма в шапке — поле ввода. Применяем по Enter и по уходу фокуса,
  // а не на каждый символ: пересчёт занимает секунды.
  function commitNowInput(inp){
    const v = Number(String(inp.value).replace(/[^0-9]/g, ""));
    const pl = plan();
    if (!v || (pl && Math.abs(v - pl.budget) < 1)) { window.renderResultControls?.(); return; }
    applyBudget(v);
  }
  document.addEventListener("keydown", function(e){
    if (e.target && e.target.id === "rc-now-input"){
      if (e.key === "Enter"){ e.preventDefault(); e.target.blur(); }
      if (e.key === "Escape"){ window.renderResultControls?.(); }
    }
    // Шкала с клавиатуры: шаг в пять процентов ёмкости.
    if (e.target && e.target.id === "rc-rail" && (e.key === "ArrowLeft" || e.key === "ArrowRight")){
      const t = window.PLANNER?.computeRecoBudgetTiers?.();
      const pl = plan();
      if (!t || !t.max || !pl) return;
      e.preventDefault();
      const step = t.max * 0.05 * (e.key === "ArrowRight" ? 1 : -1);
      applyBudget(Math.max(t.max * 0.01, Math.min(t.max, pl.budget + step)));
    }
  }, true);
  ["focusout", "change"].forEach(ev => document.addEventListener(ev, function(e){
    if (e.target && e.target.id === "rc-now-input") commitNowInput(e.target);
  }));

  document.addEventListener("input", function(e){
    if (e.target && e.target.id === "rc-pph"){
      const v = parseFloat(e.target.value);
      const o = el("rc-pph-out"); if (o) o.textContent = String(v).replace(".", ",");
      paint(v);
    }
  });

  // Общий путь для любой суммы: перевести режим в «свой бюджет»,
  // записать её в поле шага «Цели» и пересчитать. Уровни, клик по шкале
  // и ручной ввод в шапке приходят сюда все трое.
  // Последняя запрошенная сумма, которую не удалось применить сразу.
  let queuedBudget = null;
  window.plannerBudgetQueued = () => queuedBudget != null;

  window.addEventListener("planner:calc-done", () => {
    if (queuedBudget == null) return;
    const v = queuedBudget;
    queuedBudget = null;
    (window.plannerAfterCalc || ((fn) => fn()))(() => applyBudget(v));
  });

  function applyBudget(sum){
    const v = Math.max(0, Math.round(Number(sum) || 0));
    if (!v) return;
    // Проход уже идёт — кнопка расчёта заблокирована, жать её бесполезно.
    // Держим намерение до конца прохода; последний клик побеждает.
    if (window.PLANNER?.state?._calcRunning){ queuedBudget = v; return; }
    const fixed = document.querySelector('input[name="budget_mode"][value="fixed"]');
    if (fixed && !fixed.checked){ fixed.checked = true; fixed.dispatchEvent(new Event("change", { bubbles: true })); }
    const b = el("budget-input");
    if (b){
      b.value = String(v);
      b.dispatchEvent(new Event("input", { bubbles: true }));
      b.dispatchEvent(new Event("change", { bubbles: true }));
    }
    recalc();
  }
  window.plannerApplyBudget = applyBudget;

  // Клик по шкале = доля от полной ёмкости. Округляем до тысячи: точность
  // до рубля по пикселю всё равно ничего не значит, а число читается хуже.
  function budgetFromRail(rail, clientX){
    const t = window.PLANNER && window.PLANNER.computeRecoBudgetTiers
      ? window.PLANNER.computeRecoBudgetTiers() : null;
    if (!t || !t.max) return 0;
    const r = rail.getBoundingClientRect();
    const share = Math.max(0.01, Math.min(1, (clientX - r.left) / r.width));
    return Math.round(t.max * share / 1000) * 1000;
  }

  document.addEventListener("click", function(e){
    // Засечка перехватывает клик сама — на пустом месте шкалы берём долю.
    const rail = e.target.closest && e.target.closest("#rc-rail");
    if (rail && !e.target.closest(".rail-stop")){
      // Только по дорожке и рядом с ней: подписи лежат выше и ниже,
      // и попадание в них не должно уводить бюджет непонятно куда.
      const track = rail.querySelector(".rail-track");
      if (track){
        const tr = track.getBoundingClientRect();
        if (e.clientY < tr.top - 14 || e.clientY > tr.bottom + 14) return;
      }
      applyBudget(budgetFromRail(rail, e.clientX));
      return;
    }
    const tier = e.target.closest && e.target.closest("#result-controls .rc-tier");
    if (tier){
      const fixed = document.querySelector('input[name="budget_mode"][value="fixed"]');
      if (fixed && !fixed.checked){ fixed.checked = true; fixed.dispatchEvent(new Event("change", { bubbles: true })); }
      const b = el("budget-input");
      if (b){
        b.value = tier.dataset.sum;
        b.dispatchEvent(new Event("input", { bubbles: true }));
        b.dispatchEvent(new Event("change", { bubbles: true }));
      }
      recalc();
      return;
    }
    const apply = e.target.closest && e.target.closest("#result-controls .rc-apply");
    if (apply){
      // Частоту можно задать руками только в связке «Задать вручную» +
      // «Подскажите бюджет»: при фиксированном бюджете она производная —
      // бюджет ÷ ставка. Поэтому переключаем режим, иначе слайдер ни на что
      // не влияет и пользователь получит тот же план.
      const rec = document.querySelector('input[name="budget_mode"][value="recommendation"]');
      if (rec && !rec.checked){ rec.checked = true; rec.dispatchEvent(new Event("change", { bubbles: true })); }
      // В GID-режиме бриф берёт частоту из gid-ppm, а не из constructions-ppm:
      // запись не в тот слайдер уходила в пустоту, и «пересобрать» возвращало
      // тот же план. Ручной чип трогаем только в городском сценарии — в
      // GID-режиме его блок скрыт, и клик по нему ничего не значит.
      const gids = el("geo-gids-block");
      const gidMode = gids && gids.style.display !== "none";
      if (!gidMode){
        const cb = el("constructions-enabled"), chip = el("constructions-chip");
        if (cb && !cb.checked && chip) chip.click();
      }
      const sl = el(gidMode ? "gid-ppm" : "constructions-ppm");
      if (sl){
        sl.value = String(Math.max(1, Math.round(Number(apply.dataset.pph))));
        sl.dispatchEvent(new Event("input", { bubbles: true }));
        sl.dispatchEvent(new Event("change", { bubbles: true }));
      }
      setTimeout(recalc, 0);
    }
  });

  window.addEventListener("planner:calc-done", () => setTimeout(() => window.renderResultControls(), 60));
})();
`);

  // 5. Run all inline script blocks in order
  // Script block 1
  runScript(`
(function(){
  function kick(){
    if (!window.PLANNER) { console.warn("[kick] PLANNER missing"); return; }

    if (typeof window.PLANNER.bootPlanner === "function") {
      console.log("[kick] bootPlanner()");
      window.PLANNER.bootPlanner();
      return;
    }
    if (typeof window.PLANNER.startPlanner === "function") {
      console.log("[kick] startPlanner()");
      window.PLANNER.startPlanner();
      return;
    }
    console.warn("[kick] no bootPlanner/startPlanner in PLANNER", window.PLANNER);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(kick, 0));
  } else {
    setTimeout(kick, 0);
  }
})();
`);

  // Script block 2
  runScript(`
  // Papa/XLSX/ExcelJS здесь заведомо ещё нет — они грузятся по требованию
  // через PLANNER_ENSURE_LIB(); проверяем то, что действительно нужно к старту.
  console.log("after include:", "GeoUtils?", !!window.GeoUtils, "PLANNER?", !!window.PLANNER, "Leaflet?", !!window.L);
`);

  // Script block 3
  runScript(`
(function(){
  window.PLANNER_UI = window.PLANNER_UI || {};

  window.PLANNER_UI.getSelectedRegionsArr = function(){
    const st = window.PLANNER?.state;
    if(!st) return [];
    if(Array.isArray(st.selectedRegions) && st.selectedRegions.length) return st.selectedRegions;
    if(st.selectedRegion) return [st.selectedRegion];
    return [];
  };

  window.PLANNER_UI.getSelectedRegionsLabel = function(){
    const a = window.PLANNER_UI.getSelectedRegionsArr();
    if (!a.length) return null;
    const SHOW = 3;
    if (a.length <= SHOW) return a.join(", ");
    return a.slice(0, SHOW).join(", ") + \` и ещё \${a.length - SHOW}\`;
  };
})();
`);

  // Script block 4
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  // Порядок шагов:
  //   1 = География  (div1)
  //   2 = Период     (div2)
  //   3 = Экраны     (div4)  — что берём в работу
  //   4 = Адреска    (div5)  — сколько, как часто и где
  //   5 = Цели       (div3)  — бюджет
  // Цели идут последними: к этому моменту адресная программа уже собрана, и
  // рекомендация бюджета считается от реального пула, а не от пустого набора.
  // Номера div-ов не совпадают с номерами шагов исторически — раскладка
  // менялась дважды, а id блоков используются в десятке других мест.
  const STEP_TO_DIV = { 1: 1, 2: 2, 3: 4, 4: 5, 5: 3 };

  // ── Раскладка блоков по шагам ────────────────────────────────────
  // Разметка всех блоков лежит в div4 (исторически «Настройки»), а раскладка
  // задаётся здесь списком: так перекомпоновать шаги можно правкой одного
  // массива, не перетаскивая по файлу тысячи строк вёрстки.
  const STEP_LAYOUT = {
    // 3. Подбираем экраны — чем ограничиваем набор поверхностей
    "wiz-step-4-body": [
      "step4-formats-block",     // Форматы
      "photo-report-block",      // Передача фотоотчёта
      "side-block",              // Сторона экрана A/Б
      "duration-block",          // Длительность ролика
      "owners-block",            // Операторы
      "grp-block",               // GRP
    ],
    // 4. Настраиваем адреску — сколько, как часто, где
    "wiz-step-5-body": [
      "step4-strategy-block",    // Стратегия подбора
      "constructions-block",     // Количество экранов
      "frequency-block",         // Частота показов
      "step4-gid-ppm-block",     // Частота в GID-режиме
      "step4-gid-extra-block",   // Доп. экраны с карты (GID)
      "step4-map-zone-block",    // Зона на карте
      "step4-selection-block",   // Равномерно / рядом с адресом
      "audience-block",          // Аудитория VK
      "yandex-geo-block",        // Яндекс Геоаналитика
    ],
    // 5. Цели — ставка стоит рядом с бюджетом: она и есть цена одного показа,
    // а раньше лежала среди фильтров отбора, где к деньгам отношения не имела.
    "wiz-step-3-body": [
      "step4-bid-mode-block",    // Режим ставки + надбавка
    ],
  };

  // ===== СВЁРНУТЫЕ УТОЧНЕНИЯ =====
  // На обоих шагах отбора обязателен ровно один блок, остальные ничего не
  // ограничивают, пока их не тронешь. Они сворачиваются, а текущее значение
  // выносится в заголовок — «Любая», «все 14», «обе». Раскрывать, чтобы
  // убедиться, что ничего не задано, больше не нужно.
  const FOLDABLE = [
    { id: "constructions-block", t: "Точное число экранов",
      hint: "По умолчанию количество подбирает стратегия. Здесь можно задать его "
          + "точно — целиком и отдельно по форматам и городам.",
      v: () => {
        const on = !!el("constructions-enabled")?.checked;
        return on ? [(el("constructions-count")?.value || "?") + " экр", true] : ["по стратегии", false];
      },
      onOpen: () => {
        // Включаем ручной режим и сразу раскрываем обе разбивки: иначе
        // до поля ввода три клика вместо одного.
        const cb = el("constructions-enabled"), chip = el("constructions-chip");
        if (cb && !cb.checked && chip) chip.click();
        ["cns-format-count", "cns-region-count"].forEach(k => {
          const rows = el(k + "-rows"), tgl = el(k + "-toggle");
          if (rows && tgl && rows.style.display === "none") tgl.click();
        });
      },
      onClose: () => {
        const cb = el("constructions-enabled"), chip = el("constructions-chip");
        if (cb && cb.checked && chip) chip.click();
      } },
    { id: "duration-block", t: "Длительность ролика", v: () => {
        const st = window.PLANNER?.state;
        const list = st?.selectedDurationsMs;
        const nFmt = Object.keys(st?.durationsByFormat || {}).length;
        const tail = nFmt ? (" \u00B7 " + nFmt + " с исключением") : "";
        const base = (!Array.isArray(list) || !list.length || (list.length === 1 && list[0] === 0))
          ? "Любая"
          : list.map(ms => Math.round(ms / 1000) + " сек").join(", ");
        return [base + tail, !!(nFmt || (base !== "Любая"))];
      } },
    { id: "owners-block", t: "Операторы", v: () => {
        const n = window.PLANNER?.state?.selectedOwners?.size || 0;
        const all = window.PLANNER?.state?.ownersAll?.length || 0;
        return n ? ["выбрано " + n, true] : ["все" + (all ? " " + all : ""), false];
      } },
    { id: "photo-report-block", t: "Передача фотоотчёта", v: () => {
        const set = window.PLANNER?.state?.selectedPhotoReport;
        if (!set || !set.size) return ["не фильтруем", false];
        const имя = { YES: "да", AUTO: "авто", NO: "нет" };
        return [[...set].map(k => имя[k] || k).join(", "), true];
      } },
    { id: "side-block", t: "Сторона экрана", v: () => {
        const n = window.PLANNER?.state?.selectedSides?.size || 0;
        return n ? [n === 1 ? "одна" : "обе", true] : ["обе", false];
      } },
    { id: "grp-block", t: "GRP", v: () => {
        const on = !!el("grp-enabled")?.checked;
        if (!on) return ["без фильтра", false];
        return [(el("grp-min")?.value || "0") + "\u2013" + (el("grp-max")?.value || ""), true];
      } },
    { id: "step4-map-zone-block", t: "Зона на карте", v: () => {
        // Состояние зоны лежит в polygonFilter — по нему считает расчёт.
        // Читали несуществующий state.polygon, поэтому здесь всегда стояло
        // «весь город», даже когда зона была задана.
        const poly = window.PLANNER?.state?.polygonFilter;
        const n = Array.isArray(poly) ? poly.length : 0;
        return n ? [n === 1 ? "1 зона" : n + " зоны", true] : ["весь город", false];
      },
      // Карта была за модалкой: раскрыть кат, нажать «Нарисовать зону»,
      // дождаться попапа. Переносим сам узел модалки внутрь ката и
      // распрямляем его правилом — вся обвязка рисования остаётся своя.
      onOpen: () => {
        const modal = el("poly-modal");
        const body = document.querySelector('.ux-fold[data-fold-for="step4-map-zone-block"] .ux-fold-body');
        if (modal && body && modal.parentNode !== body) {
          modal.classList.add("is-inline");
          body.appendChild(modal);
        }
        if (typeof window.plannerOpenPolyMap === "function") window.plannerOpenPolyMap();
      },
      onClose: () => {
        const modal = el("poly-modal");
        if (modal) { modal.classList.remove("is-inline"); document.body.appendChild(modal); }
        if (typeof window.plannerClosePolyMap === "function") window.plannerClosePolyMap();
      } },
    // Кат сам и есть переключатель режима: закрыт — равномерно по городу,
    // открыт — собираем вокруг заданных адресов.
    { id: "step4-selection-block", t: "Рядом с адресом",
      hint: "Закрыто — система сама подбирает количество конструкций под заданные "
          + "параметры и раскладывает их равномерно по городу с учётом фильтров. "
          + "Открыто — собираем вокруг ваших адресов: список можно вводить по одному, "
          + "загрузить готовым файлом с адресами или координатами либо найти по картам 2ГИС.",
      v: () => {
        const m = el('selection-mode')?.value;
        if (m !== "near_address") return ["выключено — равномерно по городу", false];
        const k = document.querySelectorAll("#addr-list .addr-row, #addr-list > div").length;
        return [k ? ("адресов: " + k) : "адреса не заданы", true];
      },
      onOpen: () => setSelectionMode("near_address"),
      onClose: () => setSelectionMode("city_even") },
    { id: "audience-block", t: "Аудитория VK", v: () => {
        return el("audience-enabled")?.checked ? ["включена", true] : ["выключена", false];
      },
      onOpen: () => { if (!el("audience-enabled")?.checked) el("vk-affinity-card")?.click(); },
      onClose: () => { if (el("audience-enabled")?.checked) el("vk-affinity-card")?.click(); } },
    { id: "yandex-geo-block", t: "Яндекс Геоаналитика", v: () => {
        const on = el("yandex-geo-card")?.classList.contains("active");
        return on ? ["включена", true] : ["выключена", false];
      },
      onOpen: () => { const c = el("yandex-geo-card"); if (c && !c.classList.contains("active")) c.click(); },
      onClose: () => { const c = el("yandex-geo-card"); if (c && c.classList.contains("active")) c.click(); } },
  ];

  function setSelectionMode(mode){
    const sel = el("selection-mode");
    if (!sel || sel.value === mode) return;
    sel.value = mode;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    // Чипы «Равномерно / Рядом с адресом» показывают то же самое, что и
    // сам кат, — держим их в согласии на случай, если кто-то нажмёт их.
    document.querySelectorAll("#selection-mode-chips .sel-chip").forEach(c => {
      c.classList.toggle("active", c.dataset.mode === mode);
    });
  }

  function foldOptionalBlocks(){
    for (const item of FOLDABLE) {
      const block = el(item.id);
      if (!block || block.closest(".ux-fold")) continue;

      const d = document.createElement("details");
      d.className = "ux-fold";
      d.dataset.foldFor = item.id;

      const sum = document.createElement("summary");
      sum.className = "ux-fold-sum";
      sum.innerHTML = "<span class=car>\u25B6</span><span class=ux-fold-t></span>"
        + "<span class=ux-fold-v></span>";
      sum.querySelector(".ux-fold-t").textContent = item.t;

      const body = document.createElement("div");
      body.className = "ux-fold-body";

      block.parentNode.insertBefore(d, block);
      d.appendChild(sum);
      d.appendChild(body);
      body.appendChild(block);

      // Заголовок блока внутри уже назван в шапке — второй раз не нужен.
      block.querySelector(".planner-label")?.remove();
      block.style.marginBottom = "0";

      if (item.hint) {
        const h = document.createElement("div");
        h.className = "planner-note ux-fold-hint";
        h.textContent = item.hint;
        body.insertBefore(h, block);
      }

      if (item.onOpen || item.onClose) {
        d.addEventListener("toggle", () => {
          try { (d.open ? item.onOpen : item.onClose)?.(); } catch (e) { console.warn("[fold]", e); }
          refreshFoldValues();
        });
      }
    }
    refreshFoldValues();
  }

  function refreshFoldValues(){
    for (const item of FOLDABLE) {
      const d = document.querySelector('.ux-fold[data-fold-for="' + item.id + '"]');
      if (!d) continue;
      const slot = d.querySelector(".ux-fold-v");
      if (!slot) continue;
      let txt = "", on = false;
      try { [txt, on] = item.v() || ["", false]; } catch (e) { continue; }
      slot.innerHTML = "";
      const span = document.createElement("span");
      if (on) span.className = "on";
      span.textContent = txt;
      slot.appendChild(span);
      // Блок скрыт целиком (например, длительность до загрузки инвентаря) —
      // прячем и обёртку, иначе остаётся пустая строка-заголовок.
      const block = el(item.id);
      d.style.display = (block && block.style.display === "none") ? "none" : "";
    }
  }
  window.refreshFoldValues = refreshFoldValues;

  ["planner:filters-changed", "planner:pool-updated", "change", "input"].forEach(ev => {
    const target = ev.startsWith("planner:") ? window : document;
    target.addEventListener(ev, () => refreshFoldValues());
  });

  function applyStepLayout(){
    for (const [hostId, ids] of Object.entries(STEP_LAYOUT)) {
      const host = el(hostId);
      if (!host) continue;
      for (const id of ids) {
        const node = el(id);
        if (node) host.appendChild(node);   // appendChild переносит, а не копирует
        else console.warn("[layout] блок не найден:", id);
      }
    }
    foldOptionalBlocks();

    // «Доступный инвентарь» — над шагами, чтобы пул было видно и на отборе
    // экранов, и на настройке адрески, а не только внутри одного шага.
    const pool = el("pool-preview-block");
    const slot = el("pool-sticky-slot");
    if (pool && slot) slot.appendChild(pool);
    // Разделитель «Дополнительные ограничения» относился к операторам и GRP —
    // они уехали на шаг «Экраны», а сам разделитель больше не нужен.
    document.querySelectorAll("#planner-widget .additional-filters-divider")
      .forEach(n => n.remove());
  }
  applyStepLayout();
  function setStep(step){
    // Используем и class, и inline style -- чтобы CSS Tilda не перебивал display
    document.querySelectorAll("#planner-widget .wiz-step").forEach(s => {
      s.classList.remove("active");
      s.style.display = "none";
    });
    const divId = STEP_TO_DIV[step] || step;
    const target = el("wiz-step-" + divId);
    if (target) {
      target.classList.add("active");
      target.style.display = "block";
    }

    document.querySelectorAll("#planner-widget .wiz-chip").forEach(c => c.classList.remove("active"));
    document.querySelector('#planner-widget .wiz-chip[data-step="'+ step +'"]')?.classList.add("active");

    // window.scrollTo надёжнее чем scrollIntoView в Tilda (вложенные контейнеры)
    const widget = el("planner-widget");
    if (widget) {
      const top = widget.getBoundingClientRect().top + window.scrollY - 20;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }
  }

  // Делаем setStep доступным глобально
  window.setStep = setStep;

  // В GID-режиме пользователь уже перечислил экраны поимённо, поэтому всё, что
  // отбирает и режет набор, теряет смысл и только путает. Показываем частоту,
  // добор с карты и фильтр ВК (он сужает сам введённый список по аффинити).
  const GID_HIDDEN = [
    "step4-formats-block", "side-block", "photo-report-block", "owners-block", "grp-block",
    // axis-block: его поле «вых/час» пишет в constructions-ppm, а GID-режим
    // читает свой слайдер — на экране выходили две шкалы частоты одна над
    // другой, и работала из них нижняя. Заодно уходит «экранов»: в GID-режиме
    // берётся весь перечисленный список, ограничить его этим полем нельзя.
    "axis-block",
    "step4-strategy-block", "constructions-block", "frequency-block",
    "step4-map-zone-block", "step4-selection-block", "pool-preview-block",
  ];
  const GID_ONLY = ["step4-gid-ppm-block", "step4-gid-extra-block"];

  function applyGidVisibility(){
    const gidsBlock = el("geo-gids-block");
    const isGidMode = !!(gidsBlock && gidsBlock.style.display !== "none");
    GID_HIDDEN.forEach(id => { const n = el(id); if (n) n.style.display = isGidMode ? "none" : ""; });
    GID_ONLY.forEach(id  => { const n = el(id); if (n) n.style.display = isGidMode ? "" : "none"; });
    if (isGidMode && typeof window.renderGidExtra === "function") window.renderGidExtra();
    return isGidMode;
  }
  window.PLANNER_UI = window.PLANNER_UI || {};
  window.PLANNER_UI.applyGidVisibility = applyGidVisibility;

  // Отмечаем посещённые шаги отбора — чтобы чип не был зелёным до первого визита
  const _origSetStep = setStep;
  window.setStep = function(step) {
    if (step === 3) window._plannerScreensVisited = true;
    if (step === 4) window._plannerProgramVisited = true;
    _origSetStep(step);
    if (step === 3 || step === 4) applyGidVisibility();
    if (typeof window.renderProgress === "function") window.renderProgress();
  };

  function hasDates(){
    const s = el("date-start")?.value;
    const e = el("date-end")?.value;
    return !!(s && e);
  }

  // Используем делегирование событий -- работает даже после перерисовки
  document.getElementById("wiz-steps")?.addEventListener("click", e => {
    const chip = e.target.closest(".wiz-chip");
    if (chip) window.setStep(Number(chip.dataset.step || 1));
  });

  // ===== СПОРНЫЕ GID-Ы =====
  // Один GID у операторов иногда висит на нескольких экранах — в инвентаре
  // таких около четырёхсот. Раньше расчёт брал первый попавшийся, а у дублей
  // различаются город, формат и ставка. Просим выбрать явно.
  function gidsFromField(){
    const raw = el("manual-gids")?.value || "";
    return window.PLANNER?._parseManualGids?.(raw) || new Set();
  }

  function renderGidDupes(){
    const box = el("gid-dupes");
    if (!box) return;
    const gidsBlock = el("geo-gids-block");
    const gidMode = gidsBlock && gidsBlock.style.display !== "none";
    if (!gidMode){ box.style.display = "none"; box.innerHTML = ""; return; }

    const набор = gidsFromField();
    const спорные = набор.size ? (window.PLANNER?.findAmbiguousGids?.(набор) || []) : [];
    if (!спорные.length){ box.style.display = "none"; box.innerHTML = ""; return; }

    const picks = window.PLANNER.state.gidPicks || {};
    const осталось = спорные.filter(x => !picks[x.gid]).length;
    box.style.display = "block";

    if (!осталось){
      box.innerHTML = "<div class='gid-dupes-done'>Все спорные GID-ы разобраны: "
        + спорные.length + ". Можно идти дальше.</div>";
      return;
    }

    const money = (v) => Number.isFinite(v)
      ? Math.round(v).toLocaleString("ru-RU") + " ₽" : "ставка неизвестна";
    const описание = (sc) => [
      String(sc.owner || "").trim() || "оператор не указан",
      (window.FORMAT_LABELS?.[String(sc.format || "").trim()]?.label)
        || String(sc.format || "").trim() || "формат не указан",
      String(sc.city || sc.region || "").trim() || "город не указан",
      money(Number(sc.recoBid) > 0 ? sc.recoBid : sc.minBid),
    ].join(" · ");

    let html = "<div class='gid-dupes'>"
      + "<div class='gid-dupes-head'>Найдено GID-ов с несколькими экранами: " + спорные.length
      + ". Не разобрано: " + осталось + "</div>"
      + "<div class='gid-dupes-sub'>У операторов один GID иногда висит на нескольких"
      + " экранах — с разным городом, форматом и ставкой. Выберите нужный:</div>";

    for (const item of спорные){
      html += "<div class='gid-dupe'><div class='gid-dupe-id'>" + item.gid + "</div>";
      for (const sc of item.variants){
        const key = window.PLANNER.gidVariantKey(sc);
        const on = picks[item.gid] === key;
        html += "<label><input type='radio' name='gidpick-" + item.gid + "'"
          + " data-gid='" + item.gid + "' value='" + key.split("'").join("&#39;") + "'"
          + (on ? " checked" : "") + "><span>" + описание(sc) + "</span></label>";
      }
      html += "</div>";
    }
    box.innerHTML = html + "</div>";
  }
  window.renderGidDupes = renderGidDupes;

  // Сколько спорных GID-ов ещё не разобрано. Ноль — путь свободен.
  window.plannerGidUnresolved = function(){
    const gidsBlock = el("geo-gids-block");
    if (!gidsBlock || gidsBlock.style.display === "none") return 0;
    const набор = gidsFromField();
    if (!набор.size) return 0;
    return (window.PLANNER?.unresolvedGids?.(набор) || []).length;
  };

  document.addEventListener("change", (e) => {
    const r = e.target;
    if (!r || r.type !== "radio" || !r.dataset || !r.dataset.gid) return;
    const st = window.PLANNER.state;
    if (!st.gidPicks) st.gidPicks = {};
    st.gidPicks[r.dataset.gid] = r.value;

    // Перерисовываем панель целиком только когда разобрано всё — там меняется
    // сам блок. На каждом отдельном выборе обновляем один счётчик: список из
    // трёх десятков GID-ов иначе пересобирался бы под курсором и уводил скролл.
    const осталось = window.plannerGidUnresolved();
    if (!осталось) {
      renderGidDupes();
    } else {
      const head = el("gid-dupes")?.querySelector(".gid-dupes-head");
      if (head) {
        const всего = (window.PLANNER?.findAmbiguousGids?.(gidsFromField()) || []).length;
        head.textContent = "Найдено GID-ов с несколькими экранами: " + всего +
          ". Не разобрано: " + осталось;
      }
    }
    updateNext1Btn();
    if (typeof window.renderProgress === "function") window.renderProgress();
  });

  document.addEventListener("input", (e) => {
    if (e.target && e.target.id === "manual-gids") setTimeout(renderGidDupes, 150);
  });
  window.addEventListener("planner:screens-ready", () => renderGidDupes());

  function updateNext1Btn(){
    const btn = el("wiz-next-1");
    if(!btn) return;
    const loading = window.DSP_AUTH_ENABLED && !window.PLANNER?.state?.dspInventoryWarmupDone;
    btn.textContent = loading ? "Загружаю экраны\\u2026" : "Дальше";
    const спорных = window.plannerGidUnresolved ? window.plannerGidUnresolved() : 0;
    if (!loading && спорных > 0) btn.textContent = "Разберите GID-ы: " + спорных;
    const стоп = loading || спорных > 0;
    btn.style.opacity = стоп ? "0.6" : "";
    btn.style.cursor  = стоп ? "default" : "";
  }
  window.addEventListener("planner:screens-ready", updateNext1Btn);
  setInterval(updateNext1Btn, 1000);

  const _err  = (id, msg, opts) => window.PLANNER?.fieldError?.(id, msg, opts) ?? false;
  const _note = (msg) => window.PLANNER?.toast?.(msg) ?? false;

  el("wiz-next-1")?.addEventListener("click", () => {
    const gidsBlockEl = el("geo-gids-block");
    const isGidMode   = gidsBlockEl && gidsBlockEl.style.display !== "none";
    if (isGidMode) {
      if (!el("manual-gids")?.value?.trim()) {
        return _err("manual-gids", "Вставьте хотя бы один GID экрана — по одному на строку или через запятую.");
      }
      const спорных = window.plannerGidUnresolved ? window.plannerGidUnresolved() : 0;
      if (спорных > 0) {
        renderGidDupes();
        el("gid-dupes")?.scrollIntoView({ block: "center", behavior: "smooth" });
        return _err("manual-gids", "Под " + спорных + " GID-ами подходит несколько экранов. " +
          "Выберите нужный по каждому — иначе в расчёт попадёт случайный.");
      }
    } else {
      const regions = window.PLANNER_UI.getSelectedRegionsArr();
      if (!regions.length) {
        return _err("city-search", "Выберите хотя бы один регион — начните вводить название или нажмите «Выбрать все».");
      }
    }
    if (window.DSP_AUTH_ENABLED && !window.PLANNER?.state?.dspInventoryWarmupDone) {
      // Это состояние, а не ошибка ввода: править нечего, надо просто подождать.
      return _note("Инвентарь ещё загружается — секунду.");
    }
    window.setStep(2);
  });

  // wiz-step-2 (Период, шаг 2) → проверяем даты → Настройки (шаг 3)
  el("wiz-next-2")?.addEventListener("click", () => {
    if (!el("date-start")?.value) return _err("date-start", "Укажите дату начала размещения.");
    if (!el("date-end")?.value)   return _err("date-end",   "Укажите дату окончания размещения.");
    if (window.PLANNER_UI?.validateStep2Schedule && !window.PLANNER_UI.validateStep2Schedule()) {
      return _err("schedule-chips",
        "В своём расписании включите хотя бы один день и задайте корректные интервалы времени.",
        { box: true, anchor: "weekly-wrap" });
    }
    window.setStep(3);
  });

  // Кнопки названы по номеру div-а, в котором лежат, а не по номеру шага —
  // поэтому рядом указан осмысленный переход.
  el("wiz-next-4")?.addEventListener("click", () => window.setStep(4)); // Экраны  → Адреска
  el("wiz-next-5")?.addEventListener("click", () => window.setStep(5)); // Адреска → Цели

  el("wiz-back-2")?.addEventListener("click", () => window.setStep(1)); // Период  → География
  el("wiz-back-4")?.addEventListener("click", () => window.setStep(2)); // Экраны  → Период
  el("wiz-back-5")?.addEventListener("click", () => window.setStep(3)); // Адреска → Экраны
  el("wiz-back-3")?.addEventListener("click", () => window.setStep(4)); // Цели    → Адреска

  window.setStep(1);
})();
`);

  // Script block 5
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  function getBudgetMode(){
    return document.querySelector('input[name="budget_mode"]:checked')?.value || "fixed";
  }
  // Уровень выбран, но сумма ещё не подставлена. Для валидации это
  // заданный бюджет: иначе кнопка «Рассчитать» блокируется, а подстановка
  // сумм висит на нажатии этой же кнопки — нажать становится нечем.
  function tierPending(){
    return !!el("budget-tier-btns")?.dataset?.pending;
  }
  function getScheduleType(){
  // если включен рваный график -- считаем это главным режимом расписания
  const weeklyOn = !!document.getElementById("weekdays-enabled")?.checked;
  if(weeklyOn) return "weekly";
  return document.querySelector('input[name="schedule"]:checked')?.value || "all_day";
}
  function getDates(){
    return { start: el("date-start")?.value || null, end: el("date-end")?.value || null };
  }

  function getFormatsSummary(){
    const auto = !!el("formats-auto")?.checked;
    if(auto) return "рекомендация";
    const set = window.PLANNER?.state?.selectedFormats;
    const arr = set ? Array.from(set) : [];
    return arr.length ? arr.join(", ") : "не выбраны";
  }

  function getScheduleSummary(){
    const t = getScheduleType();
    if(t === "all_day") return "Весь день (07:00\\u201322:00)";
    if(t === "peak") return "Часы пик (07:00\\u201310:00 / 17:00\\u201321:00)";
    if(t === "weekly") return "Рваный график (по дням недели)";
    if(t === "custom"){
      const f = el("time-from")?.value || "07:00";
      const to = el("time-to")?.value || "22:00";
      return \`Своё время (\${f}\\u2013\${to})\`;
    }
    return "\\u2014";
  }

  function getBudgetSummary(){
    const mode = getBudgetMode();

    if(mode === "recommendation") return "нужна рекомендация";

    if(mode === "goal_ots"){
      const g = Number(el("goal-ots")?.value || 0);
      return g > 0 ? (Math.floor(g).toLocaleString("ru-RU") + " OTS") : "не задан";
    }

    // fixed
    const v = Number(el("budget-input")?.value || 0);
    return v > 0 ? (Math.floor(v).toLocaleString("ru-RU") + " \\u20BD") : "не задан";
  }

  function renderAudienceSegments() {
    const wrap = el("audience-segment-wrap");
    const uiEl = el("audience-ui");
    const statusEl = el("audience-load-status");
    const groups = window.PLANNER?.AFFINITY_GROUPS;
    const stats = window.PLANNER?.state?.affinityStats;
    if (!wrap) return;
    if (!groups || !stats) {
      if (statusEl) statusEl.style.display = "block";
      if (uiEl) uiEl.style.display = "none";
      return;
    }
    if (statusEl) statusEl.style.display = "none";
    if (uiEl) uiEl.style.display = "block";

    // Все чипы нейтральные -- без цветового кодирования
    function chipColor() {
      return { bg: '#f8f9fb', border: 'rgba(15,23,42,.14)', text: '#374151' };
    }

    function makeChips(cols) {
      return cols.map(col => {
        const c = chipColor(col);
        const safe = col.replace(/&/g,'&amp;').replace(/"/g,'&quot;');
        return \`<label style="display:inline-flex;align-items:center;gap:4px;cursor:pointer;
          padding:4px 10px;border-radius:999px;font-size:12px;
          border:1px solid \${c.border};background:\${c.bg};color:\${c.text};
          transition:border-color .1s,background .1s;">
          <input type="checkbox" value="\${safe}"
            style="accent-color:#5b3ef5;width:12px;height:12px;margin:0;">
          \${col}
        </label>\`;
      }).join('');
    }

    // Separate named groups from interests
    const namedCols = new Set(Object.values(groups).flat());
    const interestCols = Object.keys(stats).filter(k => !namedCols.has(k)).sort();

    // Named groups
    const namedHtml = Object.entries(groups).map(([gname, cols]) => \`
      <div style="margin-bottom:10px;">
        <div style="font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px;">\${gname}</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">\${makeChips(cols)}</div>
      </div>
    \`).join('');

    // Интересы -- collapsible accordion with search
    const interestsHtml = interestCols.length ? \`
      <div style="margin-bottom:10px;">
        <button type="button" id="interests-toggle"
          style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:600;
            letter-spacing:.05em;text-transform:uppercase;color:#9ca3af;background:none;
            border:none;cursor:pointer;padding:0;margin-bottom:0;">
          <span>Интересы</span>
          <span id="interests-arrow" style="font-size:10px;">\\u25BC</span>
        </button>
        <div id="interests-body" style="display:block;margin-top:8px;">
          <input type="text" id="interests-search" placeholder="Поиск интереса\\u2026"
            style="width:100%;box-sizing:border-box;padding:5px 10px;border:1px solid #e0d9ff;
              border-radius:8px;font-size:12px;margin-bottom:8px;">
          <div id="interests-chips" style="display:flex;flex-wrap:wrap;gap:6px;">
            \${makeChips(interestCols)}
          </div>
        </div>
      </div>
    \` : '';

    wrap.innerHTML = namedHtml + interestsHtml;

    // Interests toggle
    const toggleBtn = wrap.querySelector('#interests-toggle');
    const interestsBody = wrap.querySelector('#interests-body');
    const arrow = wrap.querySelector('#interests-arrow');
    let interestsOpen = true;
    if (arrow) arrow.textContent = '\\u25B2';
    if (toggleBtn && interestsBody) {
      toggleBtn.addEventListener('click', () => {
        interestsOpen = !interestsOpen;
        interestsBody.style.display = interestsOpen ? 'block' : 'none';
        if (arrow) arrow.textContent = interestsOpen ? '\\u25B2' : '\\u25BC';
      });
    }

    // Interests search/filter
    const searchInput = wrap.querySelector('#interests-search');
    const chipsContainer = wrap.querySelector('#interests-chips');
    if (searchInput && chipsContainer) {
      searchInput.addEventListener('input', () => {
        const q = searchInput.value.toLowerCase();
        chipsContainer.querySelectorAll('label').forEach(lbl => {
          const val = lbl.querySelector('input')?.value?.toLowerCase() || '';
          lbl.style.display = (!q || val.includes(q)) ? '' : 'none';
        });
      });
    }

    // Re-attach listeners to all checkboxes
    wrap.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener("change", () => { updateAudienceCoverage(); renderProgress(); });
    });

    // Чекбоксы только что появились -- проставляем отложенный выбор из
    // черновика или из истории расчётов, если он был.
    window.PLANNER?.applyPendingAudienceSegments?.();

    updateAudienceCoverage();
  }

  function isGeoGidMode() {
    const b = el("geo-gids-block");
    return !!(b && b.style.display !== "none");
  }

  // В GID-режиме базой аффинити-фильтра служит сам GID-список (это и есть пул
  // расчёта), а не весь инвентарь ВК. Возвращаем Set найденных в инвентаре
  // GID-ов, либо null -- если список пуст или инвентарь ещё не загружен.
  function getGidPoolIds() {
    const ta = el("manual-gids");
    const parse = window.PLANNER?._parseManualGids;
    if (!ta || typeof parse !== "function") return null;
    const typed = parse(ta.value || "");
    if (!typed.size) return null;
    const all = window.PLANNER?.state?.screensAll?.length
      ? window.PLANNER.state.screensAll
      : (window.PLANNER?.state?.screens || []);
    if (!all.length) return null;
    const matched = new Set();
    all.forEach(s => {
      const sid = (s?.screen_id ?? s?.gid ?? s?.GID ?? s?.id ?? "").toString().trim();
      if (typed.has(sid)) matched.add(sid);
    });
    return matched.size ? matched : null;
  }

  function updateAudienceCoverage() {
    const coverageEl = el("audience-coverage");
    if (!coverageEl) return;
    const stats = window.PLANNER?.state?.affinityStats;
    const affinityMap = window.PLANNER?.state?.affinityMap;
    if (!stats || !affinityMap) return;

    const topPct = parseInt(el("audience-top-pct")?.value || "10", 10) / 100;

    const selected = [];
    document.querySelectorAll('#audience-segment-wrap input[type="checkbox"]:checked')
      .forEach(cb => selected.push(cb.value));

    if (!selected.length) {
      coverageEl.innerHTML = "";
      return;
    }

    // Score each screen = avg affinity across selected segments (0 if missing)
    const scoreOf = rec => rec
      ? selected.reduce((sum, seg) => sum + (rec[seg] ?? 0), 0) / selected.length
      : 0;

    const gidIds = isGeoGidMode() ? getGidPoolIds() : null;
    const recs = gidIds
      ? [...gidIds].map(id => affinityMap.get(id) || null)
      : [...affinityMap.values()];
    const total = recs.length;
    const keepN = Math.max(1, Math.ceil(total * topPct));

    let passing;
    if (gidIds) {
      // planner.js оставляет из пула ровно keepN экранов -- показываем то же число
      passing = Math.min(keepN, total);
    } else {
      const scored = recs.map(scoreOf).sort((a, b) => b - a);
      const cutoff = scored[keepN - 1] ?? 0;
      passing = recs.reduce((n, rec) => n + (scoreOf(rec) >= cutoff ? 1 : 0), 0);
    }
    const pct = total > 0 ? Math.round(passing / total * 100) : 0;
    const noData = gidIds ? recs.reduce((n, rec) => n + (rec ? 0 : 1), 0) : 0;

    // Сегменты чипами
    const segChips = selected.map(seg =>
      \`<span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;
        background:#ede9fe;color:#4c1d95;border:1px solid #c4b5fd;">\${seg}</span>\`
    ).join('');

    // В GID-режиме показываем базу отбора -- иначе непонятно, от чего считается %
    const baseNote = gidIds
      ? \`<div style="font-size:11px;color:#9ca3af;margin-top:6px;">
           База отбора: \${total.toLocaleString('ru-RU')} экр. из GID-списка\${noData ? ', без данных ВК: ' + noData.toLocaleString('ru-RU') + ' (отбираются последними)' : ''}
         </div>\`
      : '';

    coverageEl.innerHTML = \`
      <div style="padding:10px 12px;background:#f8f7ff;border:1px solid #ede9fe;border-radius:12px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:\${segChips ? '8px' : '0'};">
          <span style="font-size:12px;color:#667085;">В топ \${Math.round(topPct*100)}% по аффинити</span>
          <span style="font-size:16px;font-weight:700;color:#166534;">\${passing.toLocaleString('ru-RU')} <span style="font-size:12px;font-weight:500;">(\${pct}%)</span></span>
        </div>
        \${segChips ? \`<div style="border-top:1px solid #ede9fe;padding-top:8px;display:flex;flex-wrap:wrap;gap:4px;">\${segChips}</div>\` : ''}
        \${baseNote}
      </div>
    \`;
  }

  function getSelectionSummary(){
    const m = el("selection-mode")?.value || "city_even";
    const map = {
      city_even: "Равномерно по региону",
      near_address: "Рядом с адресом",
      manual_screens: "По GID-списку"
    };
    return map[m] || m;
  }

  function calcCompletion(){
    const regionsLabel = window.PLANNER_UI?.getSelectedRegionsLabel?.() || null;
    const dates = getDates();

    const budgetMode = getBudgetMode();
    const budgetVal = Number(el("budget-input")?.value || 0);
    const goalVal   = Number(el("goal-ots")?.value || 0);
    const goalPlaysVal = Number(el("goal-plays")?.value || 0);

    const budgetOk =
      (budgetMode === "recommendation") ||
      (budgetMode === "fixed"    && (budgetVal > 0 || tierPending())) ||
      (budgetMode === "goal_ots" && goalVal > 0) ||
      (budgetMode === "goal_plays" && goalPlaysVal > 0);

    const gidsBlock = el("geo-gids-block");
    const isGidMode = gidsBlock && gidsBlock.style.display !== "none";
    const gidsEntered = isGidMode && !!(el("manual-gids")?.value?.trim());
    const step1 = isGidMode ? gidsEntered : !!regionsLabel;
    const step2 = !!(dates.start && dates.end);
    const step3 = !!budgetOk;
    const step4 = true; // форматы опциональны: нет выбора = все форматы

    const done = [step1, step2, step3, step4].filter(Boolean).length;
    return { done, regionsLabel, dates };
  }

  function syncCustomTime(){
    const t = getScheduleType();
    const w = el("weekly-wrap");
    if(w){
      const show = (t === "weekly");
      w.style.display = show ? "block" : "none";
      if(show && typeof window.PLANNER_UI?.renderWeeklyUI === "function"){
        window.PLANNER_UI.renderWeeklyUI();
      }
    }
  }

  function syncGrp(){
    const wrap = el("grp-wrap");
    const on = !!el("grp-enabled")?.checked;
    if(wrap) wrap.style.display = on ? "block" : "none";
  }

  function renderProgress(){
    const p = calcCompletion();


    // --- Обновляем состояние чипов шагов (done / active) ---
    // Шаги отбора обязательными не являются (дефолты рабочие), поэтому их чип
    // зеленеет по факту визита либо после первого расчёта.
    const done = !!window.PLANNER?.lastCalc;
    const screensDone = !!(window._plannerScreensVisited || done);
    const programDone = !!(window._plannerProgramVisited || done);
    const _budgetOk = (()=>{ const bm = getBudgetMode(); const bv = Number(el("budget-input")?.value||0); const gv = Number(el("goal-ots")?.value||0); const gpv = Number(el("goal-plays")?.value||0); return bm==="recommendation"||(bm==="fixed"&&(bv>0||tierPending()))||(bm==="goal_ots"&&gv>0)||(bm==="goal_plays"&&gpv>0); })();
    const stepDoneMap = {
      "1": !!(Array.isArray(window.PLANNER?.state?.selectedRegions) && window.PLANNER.state.selectedRegions.length),
      "2": !!(p.dates.start && p.dates.end),
      "3": screensDone,
      "4": programDone,
      "5": p.done >= 2 && _budgetOk,
    };
    document.querySelectorAll("#wiz-steps .wiz-chip").forEach(chip => {
      const s = chip.dataset.step;
      chip.classList.toggle("done", !!stepDoneMap[s]);
    });

    const calcBtn = el("calc-btn");
    const hint    = el("calc-blocked-hint");
    if(calcBtn){
      // Пока идёт расчёт — кнопка заблокирована независимо от валидации.
      // Это второе место, управляющее кнопкой (первое — renderProgress в
      // planner.js); без проверки флага оно снимало бы замок на полпути.
      const busy = !!window.PLANNER?.state?._calcRunning;
      const blocked = (p.done !== 4);
      calcBtn.disabled = blocked || busy;
      if (!busy) calcBtn.style.opacity = blocked ? ".55" : "1";

      if(hint){
        if(blocked){
          const reasons = [];
          const st = window.PLANNER?.state;
          const regions = Array.isArray(st?.selectedRegions) ? st.selectedRegions : [];
          const _gidsBlockEl = el("geo-gids-block");
          const _isGidModeNow = _gidsBlockEl && _gidsBlockEl.style.display !== "none";
          if(!regions.length && !_isGidModeNow) reasons.push("не выбран регион");
          if(_isGidModeNow && !el("manual-gids")?.value?.trim()) reasons.push("не введены GID-ы");
          if(!p.dates.start || !p.dates.end) reasons.push("не указаны даты");
          const mode = getBudgetMode();
          const bval = mode === "goal_ots" ? el("goal-ots")?.value : el("budget-input")?.value;
          if((!bval || Number(bval) <= 0) && !(mode !== "goal_ots" && tierPending()))
            reasons.push("не задан бюджет");
          if(window.DSP_AUTH_ENABLED && !st?.dspInventoryWarmupDone)
            reasons.push("инвентарь ещё загружается");
          hint.textContent = reasons.length ? "Что блокирует: " + reasons.join(", ") : "";
          hint.style.display = reasons.length ? "block" : "none";
        } else {
          hint.style.display = "none";
        }
      }
    }
    renderApFrozenNote();
  }

  // Фиксация адрески — состояние неочевидное: расчёт молча идёт внутри
  // отобранных экранов, и добавленный в брифе регион в него не попадёт.
  // Поэтому говорим об этом прямо и рядом даём способ отпустить.
  function renderApFrozenNote(){
    const box = el("ap-frozen-note");
    if (!box) return;
    const size = window.PLANNER?.state?.apFrozenIds?.size || 0;
    if (!size){ box.style.display = "none"; box.innerHTML = ""; return; }
    box.style.display = "block";
    box.innerHTML = "<div class='ap-frozen'><span>Адреска зафиксирована: <b>"
      + size + "</b> экр. Пересчёт идёт внутри неё, новые регионы и форматы"
      + " в неё не попадут.</span>"
      + "<button type='button' class='ap-refreeze' id='ap-refreeze-btn'>"
      + "Пересобрать адреску</button></div>";
  }
  window.renderApFrozenNote = renderApFrozenNote;

  document.addEventListener("click", (e) => {
    if (!e.target.closest || !e.target.closest("#ap-refreeze-btn")) return;
    window.PLANNER?.unfreezeAp?.();
    renderApFrozenNote();
    // Уровни считаются долей от ёмкости базы, а база только что сменилась.
    if (typeof window.renderBudgetTiers === "function") window.renderBudgetTiers();
    if (typeof window.renderResultControls === "function") window.renderResultControls();
    renderProgress();
  });

  // делаем доступным другим скриптам (formats/и т.п.)
  window.renderProgress = renderProgress;

  function bindLive(){
    ["date-start","date-end","budget-input","goal-ots","formats-auto","selection-mode","time-from","time-to","grp-enabled","grp-min","grp-max","audience-enabled"]
      .forEach(id => {
        el(id)?.addEventListener("input", renderProgress);
        el(id)?.addEventListener("change", renderProgress);
      });

    document.querySelectorAll('input[name="budget_mode"]').forEach(r => r.addEventListener("change", renderProgress));
    // Selection mode chips
    document.querySelectorAll('#selection-mode-chips .sel-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#selection-mode-chips .sel-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const sel = el('selection-mode');
        const mode = chip.dataset.mode;
        // Re-clicking the already-active chip must be a no-op: dispatching "change"
        // unconditionally wipes the address list (renderSelectionExtra rebuilds it
        // from scratch), destroying anything the user already typed.
        if (sel && sel.value !== mode) { sel.value = mode; sel.dispatchEvent(new Event('change', { bubbles: true })); }
        renderProgress();
      });
    });

    // -- Geo mode tabs (step 1): По городам / По GID --------------------------
    function setGeoMode(mode) {
      const citiesBlock = el("geo-cities-block");
      const gidsBlock   = el("geo-gids-block");
      const tabCities   = el("geo-tab-cities");
      const tabGids     = el("geo-tab-gids");
      const selEl       = el("selection-mode");

      const isGid    = mode === "gids";
      const isCities = !isGid;

      if (citiesBlock) citiesBlock.style.display = isCities ? "" : "none";
      if (gidsBlock)   gidsBlock.style.display   = isGid    ? "" : "none";

      // Active tab style
      const _activeTab   = { background: "#5B3EF5", color: "#fff",    borderColor: "#5B3EF5" };
      const _inactiveTab = { background: "#faf8ff", color: "#5B3EF5", borderColor: "#e0d9fd" };
      [[tabCities, isCities], [tabGids, isGid]].forEach(([tab, active]) => {
        if (!tab) return;
        Object.assign(tab.style, active ? _activeTab : _inactiveTab);
      });

      // Sync selection-mode select — only dispatch when it actually changes,
      // otherwise renderSelectionExtra() wipes the typed address list for no reason.
      if (selEl) {
        const _prevMode = selEl.value;
        selEl.value = isGid ? "manual_screens" : (selEl.value === "manual_screens" ? "city_even" : selEl.value);
        if (selEl.value !== _prevMode) selEl.dispatchEvent(new Event("change", { bubbles: true }));
      }

      // При переходе в GID-режим: показать прогресс загрузки инвентаря, если ещё не загружен
      if (isGid && window.DSP_AUTH_ENABLED) {
        const progressEl = el("gid-inventory-progress");
        const progressText = el("gid-inventory-progress-text");
        const planner = window.PLANNER;
        const screensLoaded = (planner?.state?.screensAll?.length || planner?.state?.screens?.length || 0) > 0;
        if (!screensLoaded && progressEl) {
          progressEl.style.display = "flex";
          if (progressText) progressText.textContent = "Загружаю инвентарь \\u2014 подождите\\u2026";
        } else if (progressEl) {
          progressEl.style.display = "none";
        }
        // Hide progress when inventory finishes
        window.addEventListener("planner:screens-ready", function _hideGidProgress() {
          const p = el("gid-inventory-progress");
          if (p) p.style.display = "none";
          window.removeEventListener("planner:screens-ready", _hideGidProgress);
        });
      }

      // Attach GID counter once
      if (isGid) {
        const ta = el("manual-gids");
        const statusEl = el("manual-gids-status");
        if (ta && statusEl && !ta.dataset.counterBound) {
          ta.dataset.counterBound = "1";
          // Clear manual exclusions when user edits the GID list — new list = fresh start
          ta.addEventListener("input", () => {
            if (window.PLANNER?.clearManualExclusions) window.PLANNER.clearManualExclusions();
          }, { once: false });
          function _runGidCounter() {
            if (!window.PLANNER?._parseManualGids) return;
            const ids = window.PLANNER._parseManualGids(ta.value);
            if (!ids.size) {
              statusEl.textContent = "Введите GID-ы \\u2014 после расчёта будут использованы только эти экраны.";
              statusEl.style.color = "#667085";
            } else {
              // Prefer screensAll (full inventory), fallback to filtered screens
              const allScreens = window.PLANNER?.state?.screensAll?.length
                ? window.PLANNER.state.screensAll
                : (window.PLANNER?.state?.screens || []);
              if (!allScreens.length) {
                statusEl.textContent = ids.size + " GID-ов введено \\u2014 инвентарь ещё загружается\\u2026";
                statusEl.style.color = "#9ca3af";
              } else {
                // Deduplicate: one GID -> at most one match
                const seenSids = new Set();
                allScreens.forEach(s => {
                  const sid = (s?.screen_id ?? s?.gid ?? s?.GID ?? s?.id ?? "").toString().trim();
                  if (ids.has(sid)) seenSids.add(sid);
                });
                const matchedCount = seenSids.size;
                statusEl.textContent = "Найдено в инвентаре: " + matchedCount + " из " + ids.size + " указанных GID-ов";
                statusEl.style.color = matchedCount > 0 ? "#5b3ef5" : "#dc2626";
              }
            }
            // GID-список -- база аффинити-фильтра, пересчитываем покрытие ВК
            updateAudienceCoverage();
            renderProgress();
          }
          ta.addEventListener("input", _runGidCounter);
          // Re-run counter when inventory finishes loading
          window.addEventListener("planner:screens-ready", () => {
            const gidsBlockEl = el("geo-gids-block");
            if (gidsBlockEl && gidsBlockEl.style.display !== "none" && ta.value.trim()) {
              _runGidCounter();
            }
          });
        }
      }

      // База аффинити-фильтра разная в городском и GID-режиме -- пересчитываем
      updateAudienceCoverage();
      // Состав блоков на шагах отбора зависит от режима. Раньше это применялось
      // только при заходе на шаг «Настройки»: если переключить режим, уже побывав
      // там, набор блоков оставался от прошлого режима до следующего перехода.
      window.PLANNER_UI?.applyGidVisibility?.();
      renderProgress();
    }
    window.setGeoMode = setGeoMode;

    el("geo-tab-cities")?.addEventListener("click", () => setGeoMode("cities"));
    el("geo-tab-gids")?.addEventListener("click",   () => setGeoMode("gids"));

    // -- 2GIS card toggle ---------------------------------------------------
    (function(){
      // radius slider label sync
      const slider = el("poi-radius");
      const valEl  = el("poi-radius-val");
      if (slider && valEl) {
        slider.addEventListener("input", () => { valEl.textContent = slider.value; });
      }
    })();

    // -- Yandex Geo card toggle + density chips + finder --------------------
    (function(){
      const card = el("yandex-geo-card");
      const wrap = el("yandex-geo-wrap");
      if (!card || !wrap) return;
      card.addEventListener("click", () => {
        const active = card.classList.toggle("active");
        card.setAttribute("aria-checked", active ? "true" : "false");
        wrap.style.display = active ? "" : "none";
      });

      // radius slider label sync
      const ySlider = el("yandex-radius");
      const yValEl  = el("yandex-radius-val");
      if (ySlider && yValEl) {
        ySlider.addEventListener("input", () => { yValEl.textContent = ySlider.value; });
      }

      // Yandex GeoAnalytics finder
      el("yandex-find-btn")?.addEventListener("click", async () => {
        const btn      = el("yandex-find-btn");
        const statusEl = el("yandex-poi-status");
        const progWrap = el("yandex-poi-progress-wrap");
        const progBar  = el("yandex-poi-progress-bar");
        const progText = el("yandex-poi-progress-text");

        const category  = el("poi-category")?.value || "searches.pharmacy";
        const yRadius   = Number(el("yandex-radius")?.value || 500); // meters

        const screensAll = window.PLANNER?.state?.screensAll || [];
        if (!screensAll.length) {
          return (statusEl.textContent = "\\u0418\\u043d\\u0432\\u0435\\u043d\\u0442\\u0430\\u0440\\u044c \\u0435\\u0449\\u0451 \\u0437\\u0430\\u0433\\u0440\\u0443\\u0436\\u0430\\u0435\\u0442\\u0441\\u044f\\u2026");
        }

        const selectedRegions = window.PLANNER?.state?.selectedRegions || [];
        let screensPool = screensAll;
        if (selectedRegions.length) {
          const rset = new Set(selectedRegions);
          screensPool = screensAll.filter(s =>
            rset.has(String(s.region || "").trim()) || rset.has(String(s.city || "").trim())
          );
          if (!screensPool.length) screensPool = screensAll;
        }

        btn.disabled = true;
        btn.textContent = "\\u0418\\u0449\\u0443 \\u044d\\u043a\\u0440\\u0430\\u043d\\u044b\\u2026";
        statusEl.textContent = "";
        if (progWrap) progWrap.style.display = "block";
        if (progBar)  progBar.style.width = "0%";

        try {
          if (!window.h3) {
            statusEl.textContent = "\\u0417\\u0430\\u0433\\u0440\\u0443\\u0436\\u0430\\u044e H3\\u2026";
            await new Promise((resolve, reject) => {
              const s = document.createElement("script");
              s.src = "https://unpkg.com/h3-js@4.1.0/dist/h3-js.umd.js";
              s.onload = resolve; s.onerror = reject;
              document.head.appendChild(s);
            });
          }
          const h3Lib = window.h3;
          const TILE_Z = 8;
          const tileSet = new Set();
          screensPool.forEach(s => {
            const lat = Number(s.lat ?? s.latitude);
            const lon = Number(s.lon ?? s.lng ?? s.longitude);
            if (!isFinite(lat) || !isFinite(lon) || lat === 0 || lon === 0) return;
            const tx = Math.floor((lon + 180) / 360 * 256);
            const ty = Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 256);
            tileSet.add(tx + "," + ty);
          });
          const tiles = [...tileSet].map(k => { const [x,y] = k.split(",").map(Number); return {x,y}; });
          statusEl.textContent = "\\u0417\\u0430\\u0433\\u0440\\u0443\\u0436\\u0430\\u044e \\u0442\\u0430\\u0439\\u043b\\u044b: 0 / " + tiles.length;
          const hotCells = new Set();
          const BATCH = 25;
          let done = 0;
          const GEO_BASE = "https://silent-surf-cd5e.mochalova-kathrine-v.workers.dev";
          const GEO_VERSION = "2025-02-10T14%3A43%3A35Z";
          for (let i = 0; i < tiles.length; i += BATCH) {
            const batch = tiles.slice(i, i + BATCH);
            const results = await Promise.all(batch.map(({x, y}) =>
              fetch(GEO_BASE + "?version=" + GEO_VERSION + "&resolution=7&x=" + x + "&y=" + y + "&z=" + TILE_Z + "&layer=" + category)
                .then(r => r.ok ? r.json() : null).catch(() => null)
            ));
            results.forEach(data => {
              if (!data?.data?.items) return;
              // any density (>=1) counts — we filter by radius to screen later
              data.data.items.forEach(item => { if (item.color >= 1) hotCells.add(item.hex); });
            });
            done += batch.length;
            if (progBar)  progBar.style.width = Math.round(done / tiles.length * 100) + "%";
            if (progText) progText.textContent = done + " / " + tiles.length;
            statusEl.textContent = "\\u0422\\u0430\\u0439\\u043b\\u044b: " + done + " / " + tiles.length;
          }

          // Convert hot cells to [lat, lon] centers for distance check
          const hotCenters = [];
          hotCells.forEach(hexDec => {
            // hotCells stores decimal strings from API — convert to hex for h3
            try {
              const hexStr = BigInt(hexDec).toString(16).padStart(15, "0");
              const [clat, clon] = h3Lib.cellToLatLng(hexStr);
              hotCenters.push([clat, clon]);
            } catch(e) {}
          });

          // Haversine distance in meters
          function haversineM(lat1, lon1, lat2, lon2) {
            const R = 6371000;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat/2)*Math.sin(dLat/2) +
                      Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
                      Math.sin(dLon/2)*Math.sin(dLon/2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          }

          const matchingGids = [];
          const seenIds = new Set();
          screensPool.forEach(s => {
            const lat = Number(s.lat ?? s.latitude);
            const lon = Number(s.lon ?? s.lng ?? s.longitude);
            if (!isFinite(lat) || !isFinite(lon) || lat === 0 || lon === 0) return;
            // Include screen if any hot cell center is within yRadius meters
            const nearby = hotCenters.some(([clat, clon]) => haversineM(lat, lon, clat, clon) <= yRadius);
            if (!nearby) return;
            const gid = (s.screen_id ?? s.gid ?? s.GID ?? s.id ?? "").toString().trim();
            if (gid && !seenIds.has(gid)) { seenIds.add(gid); matchingGids.push(gid); }
          });
          if (progWrap) progWrap.style.display = "none";
          if (!matchingGids.length) {
            statusEl.textContent = "\\u041d\\u0435 \\u043d\\u0430\\u0439\\u0434\\u0435\\u043d\\u043e \\u044d\\u043a\\u0440\\u0430\\u043d\\u043e\\u0432. \\u0421\\u043d\\u0438\\u0437\\u044c\\u0442\\u0435 \\u043f\\u043b\\u043e\\u0442\\u043d\\u043e\\u0441\\u0442\\u044c.";
            statusEl.style.color = "#dc2626";
          } else {
            const ta = el("manual-gids");
            if (ta) { ta.value = matchingGids.join("\\n"); ta.dispatchEvent(new Event("input", { bubbles: true })); }
            const selEl = el("selection-mode");
            if (selEl) { selEl.value = "manual_screens"; selEl.dispatchEvent(new Event("change", { bubbles: true })); }
            statusEl.textContent = "\\u041d\\u0430\\u0439\\u0434\\u0435\\u043d\\u043e \\u044d\\u043a\\u0440\\u0430\\u043d\\u043e\\u0432: " + matchingGids.length + " \\u2014 \\u043d\\u0430\\u0436\\u043c\\u0438\\u0442\\u0435 \\u00AB\\u0420\\u0430\\u0441\\u0441\\u0447\\u0438\\u0442\\u0430\\u0442\\u044c\\u00BB";
            statusEl.style.color = "#fc3f1d";
            renderProgress();
          }
        } catch(err) {
          if (progWrap) progWrap.style.display = "none";
          statusEl.textContent = "\\u041e\\u0448\\u0438\\u0431\\u043a\\u0430: " + err.message;
          statusEl.style.color = "#dc2626";
        }
        btn.disabled = false;
        btn.textContent = "\\uD83D\\uDD0D \\u041d\\u0430\\u0439\\u0442\\u0438 \\u044d\\u043a\\u0440\\u0430\\u043d\\u044b";
      });
    })();

    // Schedule chips
    document.querySelectorAll('#schedule-chips .sch-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#schedule-chips .sch-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        const schVal = chip.dataset.sch;
        const radio = document.getElementById('sch-r-' + schVal);
        if (radio) radio.checked = true;
        if (schVal === 'custom') {
          const fromEl = el('time-from'), toEl = el('time-to');
          if (fromEl) fromEl.value = chip.dataset.from || '07:00';
          if (toEl)   toEl.value   = chip.dataset.to   || '22:00';
        }
        syncCustomTime();
        renderProgress();
      });
    });
    document.querySelectorAll('input[name="schedule"]').forEach(r => r.addEventListener("change", () => {
      syncCustomTime();
      renderProgress();
    }));
    el("grp-enabled")?.addEventListener("change", () => { syncGrp(); renderProgress(); });

    // Constructions chip toggle
    el("constructions-chip")?.addEventListener("click", () => {
      const chip = el("constructions-chip");
      const cb = el("constructions-enabled");
      const wrap = el("constructions-count-wrap");
      const active = chip.classList.toggle("active");
      chip.setAttribute("aria-checked", active ? "true" : "false");
      if (cb) { cb.checked = active; cb.dispatchEvent(new Event("change", { bubbles: true })); }
      if (wrap) wrap.style.display = active ? "block" : "none";
      renderProgress();
    });

    // Bid uplift chip toggle
    el("bid-uplift-chip")?.addEventListener("click", () => {
      const chip = el("bid-uplift-chip");
      const cb   = el("bid-uplift-enabled");
      const wrap = el("bid-uplift-wrap");
      const active = chip.classList.toggle("active");
      chip.setAttribute("aria-checked", active ? "true" : "false");
      if (cb) { cb.checked = active; cb.dispatchEvent(new Event("change", { bubbles: true })); }
      if (wrap) wrap.style.display = active ? "block" : "none";
      syncBidUplift();
      renderProgress();
    });

    function syncBidUplift() {
      const on   = !!el("bid-uplift-enabled")?.checked;
      const pct  = Math.max(0, Number(el("bid-uplift-pct")?.value || 0));
      const base = el("bid-mode-min")?.checked ? "минимальная" : "рекомендованная";
      const badge = el("bid-uplift-badge");
      if (badge) {
        badge.textContent = (on && pct > 0) ? "+" + pct + "%" : "";
        badge.dataset.val = (on && pct > 0) ? String(pct) : "";
      }
      const note = el("bid-uplift-note");
      if (note) {
        note.textContent = pct > 0
          ? "Ставка = " + base + " + " + pct + "%. Влияет на расчёт, медиаплан и передачу менеджеру."
          : "Укажите процент надбавки.";
      }
    }
    el("bid-uplift-pct")?.addEventListener("input", () => { syncBidUplift(); renderProgress(); });
    document.querySelectorAll('input[name="bid_mode"]').forEach(r =>
      r.addEventListener("change", syncBidUplift));
    syncBidUplift();

    // Sync badge on constructions count input
    el("constructions-count")?.addEventListener("input", () => {
      const badge = el("cns-chip-badge");
      const val = el("constructions-count")?.value;
      if (badge) { badge.textContent = val ? val + " шт." : ""; badge.dataset.val = val || ""; }
    });

    // VK affinity card toggle
    el("vk-affinity-card")?.addEventListener("click", () => {
      const card = el("vk-affinity-card");
      const cb = el("audience-enabled");
      const wrap = el("audience-wrap");
      const active = card.classList.toggle("active");
      card.setAttribute("aria-checked", active ? "true" : "false");
      if (cb) { cb.checked = active; cb.dispatchEvent(new Event("change", { bubbles: true })); }
      if (wrap) wrap.style.display = active ? "block" : "none";
      renderProgress();
    });

    // Per-city budget
    let _perCityMode = window._perCityMode || "abs"; // "abs" | "pct"
    let _lastPerCityRegionsSig = "";

    function setPerCityMode(mode) {
      _perCityMode = mode;
      window._perCityMode = mode;
      const btnAbs = el("per-city-mode-abs");
      const btnPct = el("per-city-mode-pct");
      if (btnAbs) {
        btnAbs.style.background = mode === "abs" ? "#5b3ef5" : "transparent";
        btnAbs.style.color = mode === "abs" ? "#fff" : "#667085";
      }
      if (btnPct) {
        btnPct.style.background = mode === "pct" ? "#5b3ef5" : "transparent";
        btnPct.style.color = mode === "pct" ? "#fff" : "#667085";
      }
      // Update placeholder and labels in existing rows
      document.querySelectorAll("#per-city-rows .per-city-row input").forEach(inp => {
        inp.placeholder = mode === "pct" ? "0" : "0";
        inp.step = mode === "pct" ? "1" : "1000";
        inp.max = mode === "pct" ? "100" : "";
      });
      document.querySelectorAll("#per-city-rows .per-city-row .per-city-unit").forEach(u => {
        u.textContent = mode === "pct" ? "%" : "\\u20BD";
      });
      // Show/hide the total budget input depending on mode
      const perCityOn = !!el("per-city-enabled")?.checked;
      if (perCityOn) {
        el("budget-input").style.display = mode === "pct" ? "block" : "none";
      }
      syncPerCityTotal();
    }

    el("per-city-mode-abs")?.addEventListener("click", () => setPerCityMode("abs"));
    el("per-city-mode-pct")?.addEventListener("click", () => setPerCityMode("pct"));

    // Восстановление из истории: строки по городам живут внутри этого блока и
    // пересобираются только при смене набора регионов, поэтому снаружи (из
    // restoreBriefToUI в planner.js) их не заполнить — отдаём точку входа.
    window.PLANNER = window.PLANNER || {};
    window.PLANNER.restorePerCityBudget = function(map) {
      const cb = el("per-city-enabled");
      if (!cb) return;
      const on = !!(map && Object.keys(map).length);
      cb.checked = on;
      syncPerCitySlider(on);
      setPerCityMode("abs");         // в истории лежат абсолютные суммы, не проценты
      _lastPerCityRegionsSig = "";   // форсируем пересборку строк под восстановленные регионы
      renderPerCityRows();
      if (!on) return;
      document.querySelectorAll("#per-city-rows .per-city-row").forEach(row => {
        const v = Number(map[row.dataset.region]);
        const inp = row.querySelector("input");
        if (inp && Number.isFinite(v) && v > 0) inp.value = Math.floor(v);
      });
      syncPerCityTotal();
    };
    function renderPerCityRows() {
      const regions = window.PLANNER?.state?.selectedRegions || [];
      const wrap = el("per-city-toggle-wrap");
      const enabled = el("per-city-enabled");
      const rowsEl = el("per-city-rows");
      if (!wrap) return;
      const isFixed = document.querySelector('input[name="budget_mode"]:checked')?.value === "fixed";
      wrap.style.display = (isFixed && regions.length >= 2) ? "block" : "none";
      if (!enabled?.checked) { el("per-city-budget-wrap").style.display = "none"; return; }
      el("per-city-budget-wrap").style.display = "block";
      el("budget-distrib-note").style.display = "none";
      // In % mode keep budget-input visible -- it holds the total RUB the percentages apply to.
      // In RUB absolute mode hide it -- the sum of per-city fields is the total.
      el("budget-input").style.display = _perCityMode === "pct" ? "block" : "none";
      // Only rebuild rows if regions changed -- avoids focus loss on interval tick
      const sig = regions.slice().sort().join("||");
      if (sig === _lastPerCityRegionsSig) return;
      _lastPerCityRegionsSig = sig;
      const existing = {};
      rowsEl.querySelectorAll(".per-city-row").forEach(r => {
        existing[r.dataset.region] = r.querySelector("input")?.value || "";
      });
      // Check if all existing values are empty (first open) -- pre-populate from budget-input
      const allEmpty = regions.every(r => !existing[r]);
      const currentBudget = Number(el("budget-input")?.value || 0);
      rowsEl.innerHTML = "";
      regions.forEach((region, idx) => {
        let defaultVal = existing[region] || "";
        if (allEmpty && currentBudget > 0) {
          if (_perCityMode === "pct") {
            // Distribute evenly in %
            const share = Math.floor(100 / regions.length);
            defaultVal = String(idx === regions.length - 1 ? 100 - share * (regions.length - 1) : share);
          } else {
            // Distribute evenly in RUB
            const share = Math.floor(currentBudget / regions.length);
            defaultVal = String(idx === regions.length - 1 ? currentBudget - share * (regions.length - 1) : share);
          }
        }
        const row = document.createElement("div");
        row.className = "per-city-row";
        row.dataset.region = region;
        const unit = _perCityMode === "pct" ? "%" : "\\u20BD";
        const step = _perCityMode === "pct" ? "1" : "1000";
        const maxAttr = _perCityMode === "pct" ? ' max="100"' : '';
        row.innerHTML = '<span class="per-city-row-label">' + region + '</span>'
          + '<div style="display:flex;align-items:center;gap:4px;">'
          + '<input type="number" class="ux-input" min="0" step="' + step + '" placeholder="0"' + maxAttr
          + ' value="' + defaultVal + '" style="width:110px;text-align:right;">'
          + '<span class="per-city-unit" style="font-size:13px;font-weight:600;color:#667085;min-width:14px;">' + unit + '</span>'
          + '</div>';
        row.querySelector("input").addEventListener("input", syncPerCityTotal);
        rowsEl.appendChild(row);
      });
      syncPerCityTotal();
    }

    function syncPerCityTotal() {
      let sum = 0;
      document.querySelectorAll("#per-city-rows .per-city-row input").forEach(inp => {
        sum += Number(inp.value || 0);
      });
      const totalEl = el("per-city-total-val");
      if (_perCityMode === "pct") {
        const pctOk = Math.abs(sum - 100) < 0.01;
        if (totalEl) {
          totalEl.textContent = sum.toFixed(0) + "%";
          totalEl.style.color = pctOk ? "#5b3ef5" : (sum > 100 ? "#dc2626" : "#f59e0b");
        }
        // Keep budget-input value unchanged (total entered before switching to %)
      } else {
        if (totalEl) { totalEl.textContent = Math.floor(sum).toLocaleString("ru-RU") + " \\u20BD"; totalEl.style.color = "#5b3ef5"; }
        const main = el("budget-input");
        if (main && sum > 0) {
          main.value = Math.floor(sum);
          // Programmatic .value= doesn't fire "input" — the НДС/комиссия live
          // preview (script block 21) only recomputes on that event, so without
          // this it freezes at the pre-edit amount after a per-city split.
          main.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }
      renderProgress();
    }

    function syncPerCitySlider(enabled) {
      const slider = el("per-city-slider");
      const knob   = el("per-city-knob");
      const row    = el("per-city-toggle-row");
      if (slider) slider.style.background = enabled ? "#5b3ef5" : "#d0d5dd";
      if (knob)   knob.style.left = enabled ? "19px" : "3px";
      if (row)  { row.style.borderColor = enabled ? "#5b3ef5" : "#e5e3f0";
                  row.setAttribute("aria-checked", enabled ? "true" : "false"); }
    }

    el("per-city-toggle-row")?.addEventListener("click", () => {
      const cb = el("per-city-enabled");
      if (!cb) return;
      cb.checked = !cb.checked;
      const enabled = cb.checked;
      syncPerCitySlider(enabled);
      if (!enabled) {
        el("per-city-budget-wrap").style.display = "none";
        el("budget-distrib-note").style.display = "block";
        el("budget-input").style.display = "block";
        _lastPerCityRegionsSig = "";
      }
      renderPerCityRows();
      renderProgress();
    });

    el("per-city-enabled")?.addEventListener("change", () => {
      syncPerCitySlider(el("per-city-enabled")?.checked);
    });

    document.querySelectorAll('input[name="budget_mode"]').forEach(r =>
      r.addEventListener("change", renderPerCityRows)
    );

    window._renderPerCityRows = renderPerCityRows;

    // poll planner state changes (regions/formats)
    let lastSig = "";
    setInterval(() => {
      const st = window.PLANNER?.state;
      const regions = (Array.isArray(st?.selectedRegions) ? st.selectedRegions : (st?.selectedRegion ? [st.selectedRegion] : []));
      const set = st?.selectedFormats;
      const fmt = set ? Array.from(set).sort().join("|") : "";

      const mode = getBudgetMode();
      const bval = (mode === "goal_ots")
        ? (el("goal-ots")?.value || "")
        : (mode === "goal_plays")
        ? (el("goal-plays")?.value || "")
        : (el("budget-input")?.value || "");

      const sig = regions.slice().sort().join("||") + "##" + fmt + "##" + mode + "##" + bval + "##" + getScheduleType();
      if(sig !== lastSig){
        lastSig = sig;
        renderProgress();
        renderPerCityRows();
      }
    }, 500);

    syncCustomTime();
    syncGrp();
    renderProgress();
  }

  // ===== AUDIENCE VK =====
  // Данные ВК (11,3 МБ) грузятся только здесь -- по включению тумблера,
  // а не на каждом открытии страницы.
  function kickAffinityLoad(){
    const statusEl = el("audience-load-status");
    const uiEl = el("audience-ui");
    const P = window.PLANNER;
    if (!P || typeof P.ensureAffinityLoaded !== "function") return;
    if (P.state?.affinityMap) { renderAudienceSegments(); return; }
    if (statusEl) {
      statusEl.style.display = "block";
      statusEl.textContent = "\\u23F3 Загружаю данные ВК (11 МБ), это займёт несколько секунд\\u2026";
      statusEl.style.color = "#667085";
    }
    if (uiEl) uiEl.style.display = "none";
    P.ensureAffinityLoaded().catch(() => {}); // сообщение покажет обработчик planner:affinity-failed
  }
  window.PLANNER_UI = window.PLANNER_UI || {};
  window.PLANNER_UI.kickAffinityLoad = kickAffinityLoad;

  const audienceEnabled = el("audience-enabled");
  if (audienceEnabled) {
    audienceEnabled.addEventListener("change", e => {
      const wrap = el("audience-wrap");
      if (wrap) wrap.style.display = e.target.checked ? "block" : "none";
      // База отбора зависит от режима шага 1 (города / GID-список) -- пересчитываем
      if (e.target.checked) { kickAffinityLoad(); updateAudienceCoverage(); }
      renderProgress();
    });
  }

  window.addEventListener("planner:affinity-failed", (e) => {
    const statusEl = el("audience-load-status");
    if (!statusEl) return;
    statusEl.style.display = "block";
    statusEl.style.color = "#dc2626";
    statusEl.textContent = "\\u26A0 Не удалось загрузить данные ВК ("
      + (e.detail?.message || "нет связи")
      + "). Выключите и включите тумблер, чтобы повторить.";
  });

  const topPctSlider = el("audience-top-pct");
  if (topPctSlider) {
    topPctSlider.addEventListener("input", e => {
      const lbl = el("audience-top-pct-val");
      if (lbl) lbl.textContent = e.target.value + "%";
      updateAudienceCoverage();
      renderProgress();
    });
  }

  window.addEventListener("planner:affinity-loaded", () => {
    const statusEl = el("audience-load-status");
    if (statusEl) {
      statusEl.style.color = "#667085";
      statusEl.textContent = "\\u2713 Данные загружены (" + (window.PLANNER?.state?.affinityMap?.size || 0).toLocaleString("ru-RU") + " экранов)";
    }
    renderAudienceSegments();
    renderProgress();
  });

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindLive);
  else bindLive();
})();
`);

  // Script block 6
  runScript(`
/* Loading progress indicator in Step 1 */
(function(){
  function el(id){ return document.getElementById(id); }

  function updateLoadingProgress(){
    const bar  = el("dsp-load-progress");
    if(!bar) return;
    const done = window.PLANNER?.state?.dspInventoryWarmupDone;
    const statusText = el("dsp-load-status-text");
    const progressBar = el("dsp-load-bar");
    if(done){
      bar.style.display = "none";
    } else if(window.DSP_AUTH_ENABLED){
      bar.style.display = "block";
      const loaded = window.PLANNER?.state?.screensAll?.length || 0;
      const total  = window.PLANNER?.state?.dspInventoryTotal || 0;
      if(statusText){
        if(loaded > 0 && total > 0){
          statusText.textContent = \`Загружаю инвентарь\\u2026 \${loaded.toLocaleString("ru-RU")} из \${total.toLocaleString("ru-RU")} экранов\`;
        } else if(loaded > 0){
          statusText.textContent = \`Загружаю инвентарь\\u2026 \${loaded.toLocaleString("ru-RU")} экранов\`;
        } else {
          statusText.textContent = "Загружаю инвентарь\\u2026";
        }
      }
      if(progressBar){
        const pct = (total > 0 && loaded > 0) ? Math.min(100, Math.round(loaded / total * 100)) : 0;
        progressBar.style.width = pct + "%";
      }
    } else {
      bar.style.display = "none";
    }
  }

  window.addEventListener("planner:screens-ready", updateLoadingProgress);
  setInterval(updateLoadingProgress, 800);

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", updateLoadingProgress);
  else updateLoadingProgress();
})();
`);

  // Script block 7
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function presetFormats(preset, allFormats){
    const A = new Set(allFormats);
    const STREET = new Set(["BILLBOARD","CITY_BOARD","CITY_FORMAT","MEDIAFACADE","SUPERSITE"]);
    const INDOOR = new Set(["OTHER","PVZ_SCREEN","METRO_LIGHTBOX","SKY_DIGITAL","CITY_FORMAT_RC","CITY_FORMAT_RD","CITY_FORMAT_WD"]);

    if(preset === "all") return A;
    if(preset === "clear") return new Set();
    if(preset === "street") return new Set([...A].filter(x => STREET.has(x)));
    if(preset === "indoor") return new Set([...A].filter(x => INDOOR.has(x)));
    if(preset === "max_reach"){
      const BIG = new Set(["SUPERSITE","MEDIAFACADE","BILLBOARD","CITY_BOARD","CITY_FORMAT"]);
      return new Set([...A].filter(x => BIG.has(x) || STREET.has(x)));
    }
    return new Set();
  }

  function ensureState(){
    const st = window.PLANNER?.state;
    if(!st) return null;
    if(!st.selectedFormats) st.selectedFormats = new Set();
    if(!Array.isArray(st.formatsAll)) st.formatsAll = [];
    window.PLANNER.ui = window.PLANNER.ui || {};
    if(typeof window.PLANNER.ui.formatsExpanded !== "boolean") window.PLANNER.ui.formatsExpanded = false;
    return st;
  }

  function getSelectedRegionsNow(){
    const st = window.PLANNER?.state;
    const arr = Array.isArray(st?.selectedRegions) ? st.selectedRegions : (st?.selectedRegion ? [st.selectedRegion] : []);
    return (arr || []).map(x => String(x || "").trim()).filter(Boolean);
  }

  function renderFormatsCards(){
    const st = ensureState();
    if(!st) return;

    const wrap = el("formats-wrap");
    if(!wrap) return;

    const toggleBtn = el("formats-toggle");
    const isAuto = !!el("formats-auto")?.checked;

    const regions = getSelectedRegionsNow();

    const allScreens = Array.isArray(st.screensAll) ? st.screensAll
                    : (Array.isArray(st.screens) ? st.screens : []);

    let pool = allScreens;
    if(regions.length){
      const rset = new Set(regions);
      // В DSP-режиме selectedRegions может содержать название ГОРОДА (из citiesAll),
      // а screensAll хранит region = mapped-регион (например "Татарстан" для "Казань").
      // Поэтому матчим и по region, и по city, и через dspRegionToCities.
      pool = allScreens.filter(s =>
        rset.has(String(s.region || "").trim()) ||
        rset.has(String(s.city   || "").trim())
      );
      // Если и так пусто -- ищем через карту регион->города
      if(!pool.length && st.dspRegionToCities){
        const citySet = new Set(
          regions.flatMap(r => st.dspRegionToCities[r] || [])
        );
        if(citySet.size){
          pool = allScreens.filter(s => citySet.has(String(s.city || "").trim()));
        }
      }
    }

    const counts = {};
    for(const s of pool){
      const f = String(s.format || "").trim();
      if(!f) continue;
      counts[f] = (counts[f] || 0) + 1;
    }

    const formatsAll = (Array.isArray(st.formatsAll) && st.formatsAll.length)
      ? st.formatsAll.map(x => String(x || "").trim()).filter(Boolean)
      : Object.keys(counts);

    const items = formatsAll.map(fmt => {
      const meta = window.FORMAT_LABELS?.[fmt] || window.PLANNER?.FORMAT_LABELS?.[fmt];
      return {
        fmt,
        count: counts[fmt] || 0,
        label: meta?.label || fmt,
        desc: meta?.desc || ""
      };
    }).sort((a,b)=>b.count-a.count);

    const COLLAPSE_LIMIT = 8;
    const expanded = !!window.PLANNER.ui.formatsExpanded;
    const visible = expanded ? items : items.slice(0, COLLAPSE_LIMIT);

    wrap.innerHTML = "";
    visible.forEach(({ fmt, count, label, desc }) => {
      const card = document.createElement("div");
      card.className = "fmt-card";
      card.setAttribute("role", "button");
      card.dataset.kbdClick = "";

      card.innerHTML = \`
        <div class="fmt-left">
          <div class="fmt-title">\${escapeHtml(label)}</div>
        </div>
        <div class="fmt-countline">\${count.toLocaleString("ru-RU")}</div>
        <button type="button"
          class="fmt-tip"
          data-title="\${escapeHtml(label)}"
          data-code="\${escapeHtml(fmt)}"
          data-desc="\${escapeHtml(desc)}"
          aria-label="Описание формата"
        >i</button>
      \`;

      const selected = !isAuto && st.selectedFormats?.has?.(fmt);
      if(selected) card.classList.add("is-selected");
      // В авторежиме форматы выбирает планировщик: клик по карточке ничего
      // не меняет, поэтому и в табуляцию её пускать незачем.
      card.setAttribute("aria-pressed", selected ? "true" : "false");
      card.setAttribute("aria-disabled", isAuto ? "true" : "false");
      card.tabIndex = isAuto ? -1 : 0;

      card.addEventListener("click", (e) => {
        if(e.target.closest(".fmt-tip")) return;
        if(isAuto) return;

        if(st.selectedFormats.has(fmt)) st.selectedFormats.delete(fmt);
        else st.selectedFormats.add(fmt);

        renderFormatsCards();
        if(typeof window.renderProgress === "function") window.renderProgress();
        window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      });

      wrap.appendChild(card);
    });

    if(toggleBtn){
      const needToggle = items.length > COLLAPSE_LIMIT;
      toggleBtn.style.display = needToggle ? "inline-flex" : "none";
      toggleBtn.textContent = expanded ? "Свернуть форматы" : "Показать все форматы";
      toggleBtn.onclick = (e) => {
        e.preventDefault();
        window.PLANNER.ui.formatsExpanded = !window.PLANNER.ui.formatsExpanded;
        renderFormatsCards();
      };
    }

    // Sync per-city section availability (needs formatsAll to be set)
    if(typeof window.renderCityFmtRows === "function") window.renderCityFmtRows();
  }

  window.renderFormatsCards = renderFormatsCards;

  function bindFormatPresets(){
    const st = ensureState();
    if(!st) return;

    const box = el("formats-presets");
    if(!box) return;

    box.querySelectorAll("button[data-preset]").forEach(btn => {
      btn.addEventListener("click", () => {
        if(!!el("formats-auto")?.checked) return;
        const preset = btn.dataset.preset;
        const next = presetFormats(preset, st.formatsAll || []);
        st.selectedFormats = new Set(next);
        renderFormatsCards();
        if(typeof window.renderProgress === "function") window.renderProgress();
        window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      });
    });
  }

  function bindFormatsAuto(){
    const st = ensureState();
    if(!st) return;

    const auto = el("formats-auto");
    if(!auto) return;

    auto.addEventListener("change", () => {
      if(auto.checked) st.selectedFormats.clear();
      renderFormatsCards();
      if(typeof window.renderProgress === "function") window.renderProgress();
      window.dispatchEvent(new CustomEvent("planner:filters-changed"));
    });
  }

  function init(){
    bindFormatPresets();
    bindFormatsAuto();

    window.addEventListener("planner:screens-ready", () => renderFormatsCards());
    setTimeout(() => renderFormatsCards(), 600);

    let lastRegionsSig = "";
    setInterval(() => {
      const sig = (window.PLANNER_UI?.getSelectedRegionsArr?.() || []).slice().sort().join("||");
      if(sig !== lastRegionsSig){
        lastRegionsSig = sig;
        renderFormatsCards();
      }
    }, 500);
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`);

  // Script block 7b — per-city formats
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  // Короткие подписи. Обрезка кода по шести буквам делала CITY_FORMAT_RC,
  // CITY_FORMAT_RD и CITY_FORMAT_WD неразличимыми — все три превращались
  // в «CITY_F». Пишем то, чем они друг от друга отличаются.
  const FMT_SHORT = {
    BILLBOARD: "ББ",
    SUPERSITE: "СС",
    CITY_BOARD: "СБ",
    CITY_FORMAT: "СФ",
    CITY_FORMAT_RC: "СФ \u00B7 МЦК",
    CITY_FORMAT_RD: "СФ \u00B7 вокзалы",
    CITY_FORMAT_WD: "СФ \u00B7 метро",
    RW_PLATFORM: "СФ \u00B7 МЦД",
    METRO_SCREEN_3X1: "Метро гориз.",
    METRO_LIGHTBOX: "Лайтбокс метро",
    MEDIAFACADE: "МФ",
    PVZ_SCREEN: "ПВЗ",
    SKY_DIGITAL: "Аэропорты",
    OTHER: "Indoor",
  };
  function fmtShort(f){
    const u = String(f||"").trim().toUpperCase();
    return FMT_SHORT[u] || (window.FORMAT_LABELS?.[u]?.label) || String(f||"");
  }

  // Сколько экранов этого формата стоит в этом городе. Считаем по тому же
  // инвентарю, что и карточки форматов, — иначе числа разойдутся.
  function countByRegion(){
    const st = window.PLANNER?.state;
    const all = Array.isArray(st?.screensAll) && st.screensAll.length
      ? st.screensAll : (Array.isArray(st?.screens) ? st.screens : []);
    const norm = (x) => String(x||"").trim().toLowerCase().replace(/\u0451/g, "\u0435");
    const map = new Map();
    for (const s of all) {
      const fmt = String(s.format||"").trim();
      if (!fmt) continue;
      // Экран числится и за своим городом, и за своим регионом; если это
      // одно и то же имя, Set схлопнет его в один ключ.
      for (const key of new Set([norm(s.city), norm(s.region)].filter(Boolean))) {
        let m = map.get(key);
        if (!m) { m = new Map(); map.set(key, m); }
        m.set(fmt, (m.get(fmt) || 0) + 1);
      }
    }
    return { map, norm };
  }

  function renderCityFmtRows(){
    const st = window.PLANNER?.state;
    if(!st) return;
    const regions = (Array.isArray(st.selectedRegions)?st.selectedRegions:[]).filter(Boolean);
    const fmts    = (Array.isArray(st.formatsAll)?st.formatsAll:[]).map(x=>String(x||"").trim()).filter(Boolean);
    const section = el("city-formats-section");
    const rowsWrap= el("city-formats-rows");
    if(!section||!rowsWrap) return;

    if(regions.length < 2 || !fmts.length){ section.style.display="none"; return; }
    section.style.display = "block";

    // Only update content when rows are visible
    if(rowsWrap.style.display==="none") return;

    if(!st.cityFormats) st.cityFormats = {};

    rowsWrap.innerHTML = "";
    const counts = countByRegion();
    for(const region of regions){
      const override = st.cityFormats[region] || null;
      const row = document.createElement("div");
      row.className = "city-fmt-row";

      const lbl = document.createElement("span");
      lbl.className = "city-fmt-lbl";
      lbl.title = region;
      lbl.textContent = region;
      row.appendChild(lbl);

      // Только те форматы, которые в этом городе действительно есть:
      // раньше в каждой строке стояли все четырнадцать, включая нулевые.
      const inCity = counts.map.get(counts.norm(region)) || new Map();
      const cityFmts = fmts.filter(f => (inCity.get(f) || 0) > 0);
      if (!cityFmts.length) {
        const none = document.createElement("span");
        none.className = "city-fmt-none";
        none.textContent = "нет данных по форматам";
        row.appendChild(none);
        rowsWrap.appendChild(row);
        continue;
      }

      for(const fmt of cityFmts){
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "city-fmt-chip" + (override&&override.has(fmt)?" on":"");
        chip.innerHTML = "";
        chip.appendChild(document.createTextNode(fmtShort(fmt)));
        const cnt = document.createElement("b");
        cnt.textContent = String(inCity.get(fmt));
        chip.appendChild(cnt);
        chip.title = (window.FORMAT_LABELS?.[fmt]?.label) || fmt;
        chip.addEventListener("click", ()=>{
          if(!st.cityFormats) st.cityFormats = {};
          if(!st.cityFormats[region]) st.cityFormats[region] = new Set();
          const s = st.cityFormats[region];
          if(s.has(fmt)) s.delete(fmt); else s.add(fmt);
          if(s.size===0) delete st.cityFormats[region];
          renderCityFmtRows();
        });
        row.appendChild(chip);
      }

      if(override && override.size > 0){
        const rst = document.createElement("button");
        rst.type = "button";
        rst.className = "city-fmt-reset";
        rst.textContent = "сбросить";
        rst.addEventListener("click", ()=>{
          delete st.cityFormats[region];
          renderCityFmtRows();
        });
        row.appendChild(rst);
      }

      rowsWrap.appendChild(row);
    }
  }

  el("city-formats-toggle")?.addEventListener("click", ()=>{
    const rows  = el("city-formats-rows");
    const arrow = el("city-formats-arrow");
    if(!rows) return;
    const open = rows.style.display !== "none";
    rows.style.display = open ? "none" : "flex";
    if(arrow) arrow.textContent = open ? "▶" : "▼";
    if(!open) renderCityFmtRows();
  });

  window.renderCityFmtRows = renderCityFmtRows;

  window.addEventListener("planner:screens-loaded",  renderCityFmtRows);
  window.addEventListener("planner:filters-changed", renderCityFmtRows);
  window.addEventListener("planner:regions-changed", renderCityFmtRows);
  renderCityFmtRows();
})();
`);

  // Script block 8
  runScript(`
(function(){
  const PAD = 12;
  let tt = null;
  let lastTip = null;

  function esc(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function ensurePortal(){
    if(tt) return tt;
    tt = document.createElement("div");
    tt.id = "fmt-tooltip-portal";
    tt.style.cssText = \`
      position: fixed;
      top: -9999px;
      left: -9999px;
      z-index: 2147483647;
      max-width: 320px;
      padding: 10px 12px;
      border-radius:12px;
      border: 1px solid rgba(15,23,42,.12);
      background: rgba(255,255,255,.95);
      box-shadow: 0 16px 46px rgba(15,23,42,.18);
      font-size: 12px;
      color: rgba(11,18,32,.86);
      pointer-events: none;
      opacity: 0;
      transform: translateY(2px);
      transition: opacity .12s ease, transform .12s ease;
    \`;
    document.body.appendChild(tt);
    return tt;
  }

  function setContent(tip){
    const title = tip.dataset.title || "";
    const code  = tip.dataset.code || "";
    const desc  = tip.dataset.desc || "";

    tt.innerHTML = \`
      <div style="font-weight:900; font-size:13px;">\${esc(title)}</div>
      \${desc ? \`<div style="margin-top:6px; color: rgba(11,18,32,.72); line-height:1.35;">\${esc(desc)}</div>\` : ""}
      \${code ? \`<div style="margin-top:8px; color: rgba(11,18,32,.55);">Код: <b>\${esc(code)}</b></div>\` : ""}
    \`;
  }

  function place(tip){
    const r = tip.getBoundingClientRect();
    tt.style.top = "-9999px";
    tt.style.left = "-9999px";
    tt.style.opacity = "0";
    tt.style.transform = "translateY(2px)";

    tt.style.opacity = "0";
    tt.style.pointerEvents = "none";
    tt.style.top = "0px";
    tt.style.left = "0px";

    const rect = tt.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const vw = window.innerWidth, vh = window.innerHeight;

    const candidates = [
      { left: r.right + 10, top: r.top + r.height/2 - h/2 },
      { left: r.left - w - 10, top: r.top + r.height/2 - h/2 },
      { left: r.left + r.width/2 - w/2, top: r.bottom + 10 },
      { left: r.left + r.width/2 - w/2, top: r.top - h - 10 },
    ];

    function clamp(v, min, max){ return Math.min(max, Math.max(min, v)); }

    let c = candidates.find(c => (
      c.left >= PAD && c.top >= PAD && c.left + w <= vw - PAD && c.top + h <= vh - PAD
    )) || candidates[0];

    c.left = clamp(c.left, PAD, vw - w - PAD);
    c.top  = clamp(c.top,  PAD, vh - h - PAD);

    tt.style.left = c.left + "px";
    tt.style.top  = c.top  + "px";
    tt.style.opacity = "1";
    tt.style.transform = "translateY(0px)";
  }

  function show(tip){
    ensurePortal();
    setContent(tip);
    lastTip = tip;
    place(tip);
  }

  function hide(){
    if(!tt) return;
    tt.style.opacity = "0";
    tt.style.transform = "translateY(2px)";
    tt.style.top = "-9999px";
    tt.style.left = "-9999px";
    lastTip = null;
  }

  document.addEventListener("mouseover", (e) => {
    const tip = e.target.closest(".fmt-tip");
    if(!tip) return;
    const canHover = window.matchMedia && window.matchMedia("(hover:hover)").matches;
    if(!canHover) return;
    show(tip);
  });

  document.addEventListener("mouseout", (e) => {
    const tip = e.target.closest(".fmt-tip");
    if(!tip) return;
    const canHover = window.matchMedia && window.matchMedia("(hover:hover)").matches;
    if(!canHover) return;
    hide();
  });

  document.addEventListener("click", (e) => {
    const tip = e.target.closest(".fmt-tip");
    if(!tip) return;
    e.preventDefault();
    e.stopPropagation();
    if(lastTip === tip) hide();
    else show(tip);
  });

  document.addEventListener("keydown", (e) => { if(e.key === "Escape") hide(); });
  window.addEventListener("scroll", () => { if(lastTip) place(lastTip); }, true);
  window.addEventListener("resize", () => { if(lastTip) place(lastTip); }, true);
})();
`);

  // Script block 9
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  let allowed = false;
  let lastItems = [];

  // По 24 карточки на страницу: на большой адресной программе их шестьсот,
  // и любая раскладка без страниц превращается в простыню.
  const PER_PAGE = 24;
  // Экраны по регионам — те же массивы, что отрисованы в карточках.
  // Обработчики делегированы на контейнер и достают экран отсюда по
  // data-region/data-idx, поэтому карточку можно перерисовать на месте.
  let byReg = new Map();
  // Массовый выбор общий на все города: заменить одного оператора приходится
  // сразу по всей программе, а не обходя каты по одному.
  const picked = new Set();
  // Что раскрыто, на какой странице и с какими фильтрами. Раньше этого не
  // помнили, и после «Заменить» кат закрывался, а место приходилось искать
  // заново — список перерисовывается целиком, состояние <details> терялось.
  const foldUi = new Map();
  // Своя перерисовка не должна прилетать обратно через planner:screens-edited.
  let _selfEdit = false;

  function getOwner(s){ return (s?.owner ?? s?.OWNER ?? s?.operator ?? s?.vendor ?? s?.network ?? "").toString().trim(); }
  function getAddr(s){ return (s?.address ?? s?.addr ?? s?.location ?? s?.place ?? "").toString().trim(); }
  function getGid(s){ return (s?.screen_id ?? s?.gid ?? s?.GID ?? s?.id ?? "").toString().trim(); }
  function getImg(s){ return (s?.image_url ?? s?.img_url ?? s?.image ?? s?.photo ?? "").toString().trim(); }
  function getRegion(s){ return (s?.region ?? s?.Region ?? s?.city ?? s?.CITY ?? "").toString().trim(); }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function openLightbox(items, startIdx){
    let idx = startIdx;

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:2147483647; display:flex; align-items:center; justify-content:center; padding:20px;";

    const modal = document.createElement("div");
    modal.style.cssText = "width:min(980px, 100%); background:#fff; border-radius:16px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,.25);";

    function close(){
      document.removeEventListener("keydown", onKey);
      overlay.remove();
    }

    function onKey(e){
      if(e.key === "Escape") close();
      if(e.key === "ArrowLeft"){ idx = (idx - 1 + items.length) % items.length; render(); }
      if(e.key === "ArrowRight"){ idx = (idx + 1) % items.length; render(); }
    }

    function render(){
      const s = items[idx];
      const url = getImg(s);

      modal.innerHTML = \`
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; border-bottom:1px solid #eee;">
          <div style="font-weight:800;">\${escapeHtml(getGid(s) || "Экран")}</div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button type="button" id="lb-prev" style="padding:8px 10px; border-radius:12px; border:1px solid #ddd; background:#fff; cursor:pointer;">\\u2190</button>
            <button type="button" id="lb-next" style="padding:8px 10px; border-radius:12px; border:1px solid #ddd; background:#fff; cursor:pointer;">\\u2192</button>
            <button type="button" id="lb-close" style="padding:8px 10px; border-radius:12px; border:1px solid #ddd; background:#fff; cursor:pointer;">\\u2715</button>
          </div>
        </div>
        <div style="background:#111; height:min(64vh, 520px); display:flex; align-items:center; justify-content:center;">
          <img src="\${escapeHtml(url)}" alt="Фото нет" style="max-width:100%; max-height:100%; object-fit:contain; color:#888; font-size:13px;">
        </div>
        <div style="padding:12px 14px;">
          <div style="font-size:13px;"><b>Оператор:</b> \${escapeHtml(getOwner(s) || "\\u2014")}</div>
          <div style="font-size:13px; margin-top:6px; color:#444;"><b>Адрес:</b> \${escapeHtml(getAddr(s) || "\\u2014")}</div>
          <div style="display:flex; align-items:center; gap:10px; margin-top:10px;">
            <div style="font-size:12px; color:#777;">\${idx+1}/\${items.length}</div>
            <div style="margin-left:auto; display:flex; gap:6px;">
              <button type="button" id="lb-remove" style="padding:6px 14px; border-radius:8px; border:1px solid #e04444; background:#fff5f5; color:#e04444; font-size:12px; cursor:pointer; font-weight:500;">Убрать</button>
              <button type="button" id="lb-replace" style="padding:6px 14px; border-radius:8px; border:1px solid #5B3EF5; background:#F4F1FF; color:#5B3EF5; font-size:12px; cursor:pointer; font-weight:500;">Заменить на похожий</button>
            </div>
          </div>
        </div>
      \`;

      modal.querySelector("#lb-prev").onclick = () => { idx = (idx - 1 + items.length) % items.length; render(); };
      modal.querySelector("#lb-next").onclick = () => { idx = (idx + 1) % items.length; render(); };
      modal.querySelector("#lb-close").onclick = close;

      const removeBtn = modal.querySelector("#lb-remove");
      if (removeBtn) removeBtn.onclick = () => {
        const sCur = items[idx];
        const sid = getGid(sCur);
        if (window.PLANNER?.removeScreen) window.PLANNER.removeScreen(sid);
        items.splice(idx, 1);
        window.dispatchEvent(new CustomEvent("planner:screens-edited"));
        if (!items.length) { close(); return; }
        if (idx >= items.length) idx = items.length - 1;
        render();
      };

      const replaceBtn = modal.querySelector("#lb-replace");
      if (replaceBtn) replaceBtn.onclick = () => {
        const sCur = items[idx];
        const sid = getGid(sCur);
        if (window.PLANNER?.replaceScreen) {
          const newScreen = window.PLANNER.replaceScreen(sid);
          if (newScreen) {
            items[idx] = newScreen;
            window.dispatchEvent(new CustomEvent("planner:screens-edited"));
            render();
          } else {
            replaceBtn.textContent = "Нет замены";
            replaceBtn.disabled = true;
            replaceBtn.style.opacity = "0.5";
          }
        }
      };
    }

    overlay.addEventListener("click", (e) => { if(e.target === overlay) close(); });
    document.addEventListener("keydown", onKey);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    render();
  }

  function groupByRegion(items){
    const map = new Map();
    for(const s of items){
      const r = getRegion(s) || "\\u2014";
      if(!map.has(r)) map.set(r, []);
      map.get(r).push(s);
    }
    return map;
  }

  function getSelectedRegionsFromState(){
    const st = window.PLANNER?.state;
    if(!st) return [];
    if(Array.isArray(st.selectedRegions) && st.selectedRegions.length) return st.selectedRegions;
    if(st.selectedRegion) return [st.selectedRegion];
    return [];
  }

  function renderPerRegion(items){
    const box = el("img-carousel");
    if(!box) return;

    if(!allowed){
      box.innerHTML = "";
      box.style.display = "none";
      return;
    }

    const allItems = Array.isArray(items) ? items : [];
    // Раньше карточки строились только по экранам с фото. Массовая замена по
    // такому списку молча пропускала бы часть программы, а фильтр «всё кроме
    // Russ» обязан находить каждый экран Russ. Показываем все; без фото — с
    // заглушкой вместо картинки.
    const arrAll = allItems.slice();
    const coordCount = allItems.filter(s => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon))).length;
    const mapBtn = "";

    if(arrAll.length === 0){
      box.innerHTML = \`
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-weight:700;">Фото экранов</div>
          \${mapBtn}
        </div>
        <div style="font-size:13px; color:#666;">В расчёте нет экранов.</div>
      \`;
      box.style.display = "block";
      el("carousel-map-download-btn")?.addEventListener("click", () => {
        if(window.PLANNER?.downloadMapHtml) window.PLANNER.downloadMapHtml();
      });
      return;
    }

    byReg = groupByRegion(arrAll);

    const selectedOrder = getSelectedRegionsFromState();
    const regionsOrdered = [
      ...selectedOrder.filter(r => byReg.has(r)),
      ...Array.from(byReg.keys()).filter(r => !selectedOrder.includes(r))
    ];

    const sectionsHtml = regionsOrdered.map(function(regionName){
      const regItems = (byReg.get(regionName) || []);

      // Сомнительные (аномально низкая ставка) — в начало списка: цель в том,
      // чтобы пользователь их увидел, а не искал в конце списка. Сортируем
      // массив на месте, а не копию: обработчики достают экран по data-idx
      // из byReg.get(region), и копия развалила бы это соответствие.
      regItems.sort(function(a, b){
        return (b._suspiciousBid ? 1 : 0) - (a._suspiciousBid ? 1 : 0);
      });

      const ui = foldUi.get(regionName) || {};
      const cards = regItems.map(function(s, idx){
        return cardHtml(s, regionName, idx);
      }).join("");

      return '<details class="ux-fold img-section"' + (ui.open ? " open" : "")
        + ' data-region="' + escapeHtml(regionName) + '"'
        + ' data-pages="' + Math.max(1, Math.ceil(regItems.length / PER_PAGE)) + '">'
        + '<summary class="ux-fold-sum">'
        +   '<span class="car">▶</span>'
        +   '<span class="ux-fold-t">Экраны программы — ' + escapeHtml(regionName) + '</span>'
        +   '<span class="ux-fold-v">' + regItems.length.toLocaleString("ru-RU") + ' шт</span>'
        + '</summary>'
        + '<div class="ux-fold-body">'
        +   filterBarHtml(regItems, ui)
        +   '<div class="ux-ph-head"></div>'
        +   '<div class="img-row" data-region="' + escapeHtml(regionName) + '" data-page="0">'
        +     cards
        +   '</div>'
        +   '<div class="ux-ph-note">Нажмите на карточку, чтобы открыть просмотр.'
        +     ' Галка на фото — выбор для массовой замены.</div>'
        + '</div>'
        + '</details>';
    }).join("");

    // Панель массовых действий живёт в отдельном контейнере: выбор экранов
    // её перерисовывает, а перерисовывать из-за галки весь список нельзя —
    // из полей фильтра пропадал бы фокус.
    box.innerHTML = '<div id="ph-bulk-host"></div>' + sectionsHtml;
    box.style.display = "block";
    syncBulkBar();

    if (!box._phBound) {
      box._phBound = true;
      box.addEventListener("click", onBoxClick);
      box.addEventListener("change", onBoxChange);
      box.addEventListener("input", onBoxInput);
      // toggle не всплывает — ловим на погружении: иначе состояние «раскрыт»
      // не сохранялось бы и кат закрывался после каждой правки программы.
      box.addEventListener("toggle", onBoxToggle, true);
    }

    // Пагинация, подсчёт найденного и скрытие непопавших под фильтр — всё в
    // одном месте, чтобы отрисовка и последующие правки шли одним путём.
    box.querySelectorAll("details.img-section").forEach(applyFilter);
  }

  // ── КАРТОЧКА ЭКРАНА ──────────────────────────────────────────────
  function money(v){
    return Number.isFinite(v)
      ? (Math.round(v * 100) / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽"
      : "—";
  }

  function cardHtml(s, regionName, idx){
    const url  = escapeHtml(getImg(s));
    const gid  = escapeHtml(getGid(s));
    const own  = escapeHtml(getOwner(s));
    const addr = escapeHtml(getAddr(s));
    const susp = !!s._suspiciousBid;
    const on   = picked.has(getGid(s));
    // Рядом с плашкой показываем саму ставку и медиану, иначе «Низкая ставка»
    // без цифр — утверждение, которое нечем проверить.
    const badge = susp
      ? '<div class="ph-susp">'
        + '<span class="ph-susp-tag">Низкая ставка</span>'
        + '<span class="ph-susp-bid" title="Медиана по своему формату и городу — '
        +   escapeHtml(money(s._suspiciousMedian)) + '">'
        +   escapeHtml(money(s._effectiveBid)) + '</span>'
        + '<span class="ph-susp-med">медиана ' + escapeHtml(money(s._suspiciousMedian)) + '</span>'
        + '</div>'
      : "";
    // Экраны без фото тоже в списке: массовая замена по списку «только с фото»
    // молча пропускала бы часть программы, а фильтр «всё кроме Russ» обязан
    // находить каждый экран Russ.
    const img = url
      ? '<img src="' + url + '" alt="' + gid + '" loading="lazy">'
      : '<span class="ph-noimg">без фото</span>';

    return '<div class="img-card' + (susp ? " is-susp" : "") + (on ? " is-picked" : "") + '"'
      + ' data-region="' + escapeHtml(regionName) + '" data-idx="' + idx + '"'
      + ' data-gid="' + gid + '" data-page="' + Math.floor(idx / PER_PAGE) + '">'
      + '<div class="ph-img">'
      +   '<input type="checkbox" class="ph-pick"' + (on ? " checked" : "")
      +     ' title="Выбрать для массовой замены">'
      +   img
      + '</div>'
      + '<div class="ph-meta">'
      +   '<div class="ph-gid">' + (gid || "—") + '</div>'
      +   badge
      +   '<div class="ph-own">' + (own || "—") + '</div>'
      +   '<div class="ph-adr">' + addr + '</div>'
      +   '<div class="ph-acts">'
      +     '<button type="button" class="card-remove-btn">Убрать</button>'
      +     '<button type="button" class="card-replace-btn">Заменить ▾</button>'
      +   '</div>'
      + '</div>'
      + '</div>';
  }

  // ── ФИЛЬТРЫ ПО КАТУ ──────────────────────────────────────────────
  function fmtLabel(f){
    const t = window.FORMAT_LABELS && window.FORMAT_LABELS[f];
    return (t && t.label) || f;
  }

  function filterBarHtml(regItems, f){
    const so = new Set(), sf = new Set();
    for (const s of regItems) {
      const o = getOwner(s);                     if (o) so.add(o);
      const m = String(s.format || "").trim();   if (m) sf.add(m);
    }
    const owners  = [...so].sort(function(a, b){ return a.localeCompare(b, "ru"); });
    const formats = [...sf].sort(function(a, b){ return a.localeCompare(b, "ru"); });

    const opt = function(list, cur, любой, label){
      let out = '<option value="">' + любой + '</option>';
      for (const v of list) {
        out += '<option value="' + escapeHtml(v) + '"' + (v === cur ? " selected" : "") + '>'
          + escapeHtml(label ? label(v) : v) + '</option>';
      }
      return out;
    };

    return '<div class="ph-filters">'
      + '<input type="text" class="ph-f-gid" placeholder="GID или адрес"'
      +   ' value="' + escapeHtml(f.q || "") + '">'
      + '<select class="ph-f-own">' + opt(owners, f.owner || "", "Все операторы") + '</select>'
      + '<select class="ph-f-fmt">' + opt(formats, f.format || "", "Все форматы", fmtLabel) + '</select>'
      + '<button type="button" class="ph-f-reset">Сбросить</button>'
      + '<button type="button" class="ph-f-all">Выбрать найденные</button>'
      + '<span class="ph-n"></span>'
      + '</div>';
  }

  function matchesFilter(s, f){
    if (f.owner  && getOwner(s) !== f.owner) return false;
    if (f.format && String(s.format || "").trim() !== f.format) return false;
    const q = String(f.q || "").trim().toLowerCase();
    if (!q) return true;
    const hay = (getGid(s) + " " + getAddr(s)).toLowerCase();
    // Пачку GID-ов вставляют через запятую — так их и разбираем, иначе поиск
    // по списку из десяти гидов не находит ни одного.
    const parts = q.split(",").join(" ").split(";").join(" ").split(" ").filter(Boolean);
    return parts.some(function(p){ return hay.indexOf(p) >= 0; });
  }

  function pgBtn(role, goto, disabled, label, cur){
    return "<button type=button data-goto=" + goto
      + (role ? " data-role=" + role : " aria-current=" + (cur ? "page" : "false"))
      + (disabled ? " disabled" : "") + ">" + label + "</button>";
  }

  function pagerHtml(total, page){
    const pages = Math.max(1, Math.ceil(total / PER_PAGE));
    let out = pgBtn("prev", page - 1, page === 0, "‹", false);
    for (let i = 0; i < pages; i++) out += pgBtn("", i, false, String(i + 1), i === page);
    out += pgBtn("next", page + 1, page >= pages - 1, "›", false);
    return "<span class='ux-pg'>" + out + "</span>";
  }

  // Раскладывает найденное по страницам и показывает нужную. Страница -1 —
  // «не прошло фильтр»: такую карточку не видно ни на одной странице.
  function applyFilter(section){
    const regionName = section.dataset.region || "";
    const regItems = byReg.get(regionName) || [];
    const f = foldUi.get(regionName) || {};
    const cards = section.querySelectorAll(".img-card");

    let vis = 0;
    for (const card of cards) {
      const s = regItems[Number(card.dataset.idx)];
      if (s && matchesFilter(s, f)) {
        card.dataset.page = String(Math.floor(vis / PER_PAGE));
        vis++;
      } else {
        card.dataset.page = "-1";
      }
    }

    const pages = Math.max(1, Math.ceil(vis / PER_PAGE));
    const page = Math.max(0, Math.min(pages - 1, Number(f.page) || 0));
    f.page = page;
    foldUi.set(regionName, f);
    section.dataset.pages = String(pages);

    // Видимость ставим свойством, а не правилом CSS по номеру страницы:
    // правил там ровно десять, а страниц на большой программе бывает больше.
    for (const card of cards) card.style.display = (Number(card.dataset.page) === page) ? "" : "none";

    const row = section.querySelector(".img-row");
    if (row) row.dataset.page = String(page);
    const head = section.querySelector(".ux-ph-head");
    if (head) head.innerHTML = (vis > PER_PAGE) ? pagerHtml(vis, page) : "";
    const nEl = section.querySelector(".ph-n");
    if (nEl) nEl.textContent = (vis === regItems.length)
      ? (regItems.length + " шт")
      : ("найдено " + vis + " из " + regItems.length);
  }

  let _fTimer = null;
  function readFilter(node){
    const section = node.closest("details.img-section");
    if (!section) return;
    const r = section.dataset.region || "";
    const f = foldUi.get(r) || {};
    const g = section.querySelector(".ph-f-gid");
    const o = section.querySelector(".ph-f-own");
    const m = section.querySelector(".ph-f-fmt");
    f.q = g ? g.value : "";
    f.owner = o ? o.value : "";
    f.format = m ? m.value : "";
    f.page = 0;
    foldUi.set(r, f);
    clearTimeout(_fTimer);
    _fTimer = setTimeout(function(){ applyFilter(section); }, 120);
  }

  // ── МАССОВЫЙ ВЫБОР ───────────────────────────────────────────────
  function bulkBarHtml(){
    if (!picked.size) return "";
    return '<div class="ph-bulk">'
      + '<span class="ph-bulk-t">Выбрано экранов: ' + picked.size + '</span>'
      + '<button type="button" class="ph-bulk-rep">Заменить ▾</button>'
      + '<button type="button" class="ph-bulk-del">Убрать</button>'
      + '<button type="button" class="ph-bulk-off">Снять выбор</button>'
      + '</div>';
  }

  function syncBulkBar(){
    const host = el("ph-bulk-host");
    if (host) host.innerHTML = bulkBarHtml();
  }

  function setPicked(card, on){
    const gid = card.dataset.gid;
    if (!gid) return;
    if (on) picked.add(gid); else picked.delete(gid);
    card.classList.toggle("is-picked", on);
    const cb = card.querySelector(".ph-pick");
    if (cb) cb.checked = on;
  }

  // ── ЗАМЕНА ───────────────────────────────────────────────────────
  // Пересобрать список по текущей адресной программе. Раскрытые каты,
  // страницы и фильтры остаются на месте — они живут в foldUi, а не в DOM.
  function refresh(){
    const chosen = (window.PLANNER && window.PLANNER.state && window.PLANNER.state.lastChosen) || [];
    lastItems = chosen;
    renderPerRegion(chosen);
    window.dispatchEvent(new CustomEvent("planner:screens-edited"));
  }

  function runReplace(gids, opts){
    const P = window.PLANNER;
    if (!P || !P.replaceScreen) return;
    let ok = 0, fail = 0;
    for (const gid of gids) {
      if (P.replaceScreen(gid, opts)) { ok++; picked.delete(gid); }
      else fail++;
    }
    if (P.toast) {
      if (!ok) P.toast(gids.length > 1
        ? "Под эти условия не нашлось замены ни для одного экрана."
        : "Нет подходящего экрана для замены.");
      else if (fail) P.toast("Заменено " + ok + ", без замены осталось " + fail + ".");
      else if (gids.length > 1) P.toast("Заменено экранов: " + ok + ".");
    }
    if (ok) refresh();
  }

  function closeMenu(){
    const m = document.querySelector(".ph-menu");
    if (m) m.remove();
    document.removeEventListener("click", onDocClickMenu, true);
  }

  function onDocClickMenu(e){
    if (!e.target.closest || !e.target.closest(".ph-menu")) closeMenu();
  }

  function openReplaceMenu(anchor, gids){
    closeMenu();
    if (!gids.length) return;
    const m = document.createElement("div");
    m.className = "ph-menu";
    m.innerHTML =
        '<button type="button" data-act="any">На любой похожий'
      +   '<span class="ph-menu-sub">Ближайший свободный экран того же формата</span></button>'
      + '<button type="button" data-act="pick">На конкретный…'
      +   '<span class="ph-menu-sub">Оператор, формат, длительность, GID</span></button>';
    document.body.appendChild(m);

    const r = anchor.getBoundingClientRect();
    const w = m.offsetWidth || 214, h = m.offsetHeight || 104;
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.left)) + "px";
    m.style.top = ((r.bottom + h + 8 > window.innerHeight)
      ? Math.max(8, r.top - h - 6) : r.bottom + 6) + "px";

    m.addEventListener("click", function(e){
      const b = e.target.closest("button[data-act]");
      if (!b) return;
      const act = b.dataset.act;
      closeMenu();
      if (act === "any") runReplace(gids, null);
      else openReplaceDialog(gids);
    });
    // Слушателя на документ вешаем следующим тиком, иначе этот же клик,
    // который открыл меню, тут же его и закроет.
    setTimeout(function(){ document.addEventListener("click", onDocClickMenu, true); }, 0);
  }

  function openReplaceDialog(gids){
    const P = window.PLANNER;
    if (!P || !P.replacementOptions) return;
    const opts = P.replacementOptions(gids);
    const ownFmts = new Set(opts.ownFormats || []);

    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed; inset:0; background:rgba(0,0,0,.45);"
      + " z-index:2147483647; display:flex; align-items:center; justify-content:center; padding:20px;";
    const modal = document.createElement("div");
    modal.style.cssText = "width:min(560px,100%); max-height:86vh; overflow:auto;"
      + " background:var(--ux-bg,#fff); border-radius:16px; box-shadow:0 30px 80px rgba(0,0,0,.25);";

    const grp = function(cls, list, checked, label){
      let out = "";
      for (const v of list) {
        out += '<label><input type="checkbox" class="' + cls + '" value="' + escapeHtml(String(v)) + '"'
          + (checked.has(v) ? " checked" : "") + '>'
          + '<span>' + escapeHtml(label ? label(v) : String(v)) + '</span></label>';
      }
      return out || '<div class="ph-noimg">нет вариантов</div>';
    };
    const durLabel = function(ms){ return Math.round(ms / 1000) + " сек"; };
    const btnCss = "font:inherit; font-size:13px; padding:8px 16px; border-radius:9px; cursor:pointer;";

    const title = (gids.length > 1)
      ? ("Заменить выбранные экраны (" + gids.length + ")")
      : ("Заменить экран " + escapeHtml(gids[0]));

    modal.innerHTML =
        '<div style="display:flex; align-items:center; justify-content:space-between; gap:12px;'
      +   ' padding:14px 16px; border-bottom:1px solid var(--ux-line,#e2e5ec);">'
      +   '<div style="font-weight:700; font-size:14px;">' + title + '</div>'
      +   '<button type="button" id="ph-rep-x" style="' + btnCss
      +     ' border:1px solid var(--ux-line,#e2e5ec); background:var(--ux-bg,#fff);">✕</button>'
      + '</div>'
      + '<div style="padding:14px 16px; display:flex; flex-direction:column; gap:14px;">'
      +   '<div><div class="ph-rep-lbl">Оператор'
      +     '<button type="button" data-set="own-all">все</button>'
      +     '<button type="button" data-set="own-none">никого</button></div>'
      +     '<div class="ph-rep-grp">' + grp("ph-rep-own", opts.owners, new Set(opts.owners)) + '</div></div>'
      +   '<div><div class="ph-rep-lbl">Формат'
      +     '<button type="button" data-set="fmt-all">все</button>'
      +     '<button type="button" data-set="fmt-none">никого</button></div>'
      +     '<div class="ph-rep-grp">'
      +       '<label style="border-bottom:1px solid var(--ux-line,#e2e5ec); padding-bottom:5px;'
      +         ' margin-bottom:4px;"><input type="checkbox" id="ph-rep-samefmt" checked>'
      +         '<span>как у заменяемого экрана</span></label>'
      +       grp("ph-rep-fmt", opts.formats, ownFmts, fmtLabel) + '</div></div>'
      +   '<div><div class="ph-rep-lbl">Доступная длительность</div>'
      +     '<div class="ph-rep-grp">' + grp("ph-rep-dur", opts.durations, new Set(), durLabel) + '</div>'
      +     '<div class="ph-noimg" style="margin-top:5px;">Ничего не отмечено — длительность не важна.'
      +       ' Отмеченные экран должен крутить все.</div></div>'
      +   '<div><div class="ph-rep-lbl">Конкретные GID-ы</div>'
      +     '<input type="text" id="ph-rep-gids" placeholder="через запятую, необязательно"'
      +       ' style="width:100%; box-sizing:border-box; font:inherit; font-size:13px; padding:8px 10px;'
      +       ' border:1px solid var(--ux-line,#e2e5ec); border-radius:8px;"></div>'
      + '</div>'
      + '<div style="display:flex; align-items:center; gap:10px; padding:12px 16px;'
      +   ' border-top:1px solid var(--ux-line,#e2e5ec);">'
      +   '<div id="ph-rep-n" style="font-size:12px; color:var(--ux-text3,#8a90a2);"></div>'
      +   '<div style="margin-left:auto; display:flex; gap:8px;">'
      +     '<button type="button" id="ph-rep-cancel" style="' + btnCss
      +       ' border:1px solid var(--ux-line,#e2e5ec); background:var(--ux-bg,#fff);">Отмена</button>'
      +     '<button type="button" id="ph-rep-go" style="' + btnCss
      +       ' border:1px solid var(--ux-accent,#4F2BE8); background:var(--ux-accent,#4F2BE8);'
      +       ' color:#fff; font-weight:600;">Заменить</button>'
      +   '</div>'
      + '</div>';

    const vals = function(cls){
      const out = [];
      modal.querySelectorAll("." + cls + ":checked").forEach(function(x){ out.push(x.value); });
      return out;
    };

    // Отмечены все варианты — это «любой», а не фильтр: сужать по полному
    // списку значит отсеять экран с оператором, которого в списке не было.
    function readOpts(){
      const o = {};
      const own = vals("ph-rep-own");
      if (own.length && own.length < opts.owners.length) o.owners = own;
      // Галка «как у заменяемого» главнее списка: пока она стоит, формат
      // каждого экрана сохраняется, что бы в списке ни было отмечено.
      const свой = modal.querySelector("#ph-rep-samefmt");
      if (!свой || !свой.checked) {
        const fmt = vals("ph-rep-fmt");
        if (fmt.length && fmt.length < opts.formats.length) o.formats = fmt;
        else if (fmt.length) o.sameFormat = false;
      }
      const dur = vals("ph-rep-dur").map(Number).filter(function(v){ return v > 0; });
      if (dur.length) o.durations = dur;
      const raw = (modal.querySelector("#ph-rep-gids").value || "")
        .split(",").join(" ").split(";").join(" ").split(" ").filter(Boolean);
      if (raw.length) o.gids = raw;
      return o;
    }

    function updateCount(){
      const nEl = modal.querySelector("#ph-rep-n");
      if (!nEl) return;
      if (gids.length > 1) {
        nEl.textContent = "Будет заменено экранов: " + gids.length;
        return;
      }
      const c = P.replacementCandidates ? P.replacementCandidates(gids[0], readOpts()) : [];
      nEl.textContent = c.length
        ? ("Подходит экранов: " + c.length)
        : "Под эти условия не подходит ни один экран";
    }

    function close(){
      document.removeEventListener("keydown", onKey);
      overlay.remove();
    }
    function onKey(e){ if (e.key === "Escape") close(); }

    modal.addEventListener("click", function(e){
      const set = e.target.closest("button[data-set]");
      if (set) {
        const parts = set.dataset.set.split("-");
        const on = parts[1] === "all";
        modal.querySelectorAll(".ph-rep-" + parts[0]).forEach(function(x){ x.checked = on; });
        updateCount();
        return;
      }
      if (e.target.closest("#ph-rep-x") || e.target.closest("#ph-rep-cancel")) { close(); return; }
      if (e.target.closest("#ph-rep-go")) {
        const o = readOpts();
        close();
        runReplace(gids, o);
      }
    });
    function syncFmtGroup(){
      const свой = modal.querySelector("#ph-rep-samefmt");
      const on = !!(свой && свой.checked);
      modal.querySelectorAll(".ph-rep-fmt").forEach(function(x){ x.disabled = on; });
      modal.querySelectorAll('[data-set^="fmt-"]').forEach(function(x){ x.disabled = on; });
    }
    modal.addEventListener("change", function(){ syncFmtGroup(); updateCount(); });
    modal.addEventListener("input", updateCount);
    overlay.addEventListener("click", function(e){ if (e.target === overlay) close(); });
    document.addEventListener("keydown", onKey);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    syncFmtGroup();
    updateCount();
  }

  // ── ОБРАБОТЧИКИ (делегированные) ─────────────────────────────────
  function onBoxToggle(e){
    const d = e.target;
    if (!d || !d.matches || !d.matches("details.img-section")) return;
    const r = d.dataset.region || "";
    const f = foldUi.get(r) || {};
    f.open = d.open;
    foldUi.set(r, f);
    if (d.open) applyFilter(d);
  }

  function onBoxChange(e){
    const t = e.target;
    if (!t.classList) return;
    if (t.classList.contains("ph-pick")) {
      const card = t.closest(".img-card");
      if (card) setPicked(card, t.checked);
      syncBulkBar();
      return;
    }
    if (t.classList.contains("ph-f-own") || t.classList.contains("ph-f-fmt")) readFilter(t);
  }

  function onBoxInput(e){
    if (e.target.classList && e.target.classList.contains("ph-f-gid")) readFilter(e.target);
  }

  function onBoxClick(e){
    const t = e.target;
    if (!t.closest) return;

    const pg = t.closest(".ux-pg button[data-goto]");
    if (pg) {
      const section = pg.closest("details.img-section");
      if (!section) return;
      const r = section.dataset.region || "";
      const f = foldUi.get(r) || {};
      f.page = Number(pg.dataset.goto) || 0;
      foldUi.set(r, f);
      applyFilter(section);
      section.scrollIntoView({ block: "nearest", behavior: "smooth" });
      return;
    }

    const reset = t.closest(".ph-f-reset");
    if (reset) {
      const section = reset.closest("details.img-section");
      if (!section) return;
      const g = section.querySelector(".ph-f-gid");
      const o = section.querySelector(".ph-f-own");
      const m = section.querySelector(".ph-f-fmt");
      if (g) g.value = "";
      if (o) o.value = "";
      if (m) m.value = "";
      readFilter(g || o || m);
      return;
    }

    const all = t.closest(".ph-f-all");
    if (all) {
      const section = all.closest("details.img-section");
      if (!section) return;
      // Берём всё, что прошло фильтр, а не только текущую страницу: иначе
      // «выбрать найденные» на десяти страницах выбирает двадцать четыре.
      section.querySelectorAll(".img-card").forEach(function(card){
        if (Number(card.dataset.page) >= 0) setPicked(card, true);
      });
      syncBulkBar();
      return;
    }

    if (t.closest(".ph-bulk-off")) {
      picked.clear();
      const box = el("img-carousel");
      if (box) box.querySelectorAll(".img-card.is-picked").forEach(function(card){
        setPicked(card, false);
      });
      syncBulkBar();
      return;
    }

    const bulkRep = t.closest(".ph-bulk-rep");
    if (bulkRep) { openReplaceMenu(bulkRep, [...picked]); return; }

    if (t.closest(".ph-bulk-del")) {
      const gids = [...picked];
      if (!gids.length) return;
      if (!window.confirm("Убрать из программы экранов: " + gids.length + "?")) return;
      const P = window.PLANNER;
      let ok = 0;
      for (const gid of gids) {
        if (P && P.removeScreen && P.removeScreen(gid)) ok++;
        picked.delete(gid);
      }
      if (ok) refresh(); else syncBulkBar();
      return;
    }

    const rem = t.closest(".card-remove-btn");
    if (rem) {
      e.stopPropagation();
      const card = rem.closest(".img-card");
      if (!card) return;
      const gid = card.dataset.gid;
      if (window.PLANNER && window.PLANNER.removeScreen) window.PLANNER.removeScreen(gid);
      picked.delete(gid);
      refresh();
      return;
    }

    const rep = t.closest(".card-replace-btn");
    if (rep) {
      e.stopPropagation();
      const card = rep.closest(".img-card");
      if (card) openReplaceMenu(rep, [card.dataset.gid]);
      return;
    }

    if (t.closest("button") || t.closest("input") || t.closest("select")) return;

    const card = t.closest(".img-card");
    if (!card) return;
    const regItems = byReg.get(card.dataset.region || "") || [];
    const s = regItems[Number(card.dataset.idx)];
    if (!s) return;

    if (window.PLANNER && window.PLANNER.focusScreenOnMap) window.PLANNER.focusScreenOnMap(s);
    window.dispatchEvent(new CustomEvent("planner:focus-screen", { detail: { screen: s } }));

    // В просмотр отдаём только найденное фильтром: листать стрелками сквозь
    // отфильтрованное — не то, чего ждёшь, отфильтровав список.
    const section = card.closest("details.img-section");
    const vis = [];
    let pos = 0;
    (section ? section.querySelectorAll(".img-card") : [card]).forEach(function(c){
      if (Number(c.dataset.page) < 0) return;
      if (c === card) pos = vis.length;
      const sv = regItems[Number(c.dataset.idx)];
      if (sv) vis.push(sv);
    });
    openLightbox(vis.length ? vis : [s], vis.length ? pos : 0);
  }

  function init(){
    const box = el("img-carousel");
    if(box){ box.style.display = "none"; box.innerHTML = ""; }

    window.addEventListener("planner:calc-done", (e) => {
      allowed = true;
      lastItems = (e?.detail && Array.isArray(e.detail.chosen)) ? e.detail.chosen : [];
      renderPerRegion(lastItems);
    });

    window.addEventListener("planner:filters-changed", () => {
      if(!allowed) return;
      renderPerRegion(lastItems);
    });

    // Программу правят и из просмотра, и из попапа на карте. Раньше здесь
    // только запоминался новый состав, а сетка карточек оставалась старой до
    // следующего расчёта.
    window.addEventListener("planner:screens-edited", () => {
      if(!allowed || _selfEdit) return;
      const chosen = window.PLANNER?.state?.lastChosen || [];
      lastItems = chosen;
      renderPerRegion(chosen);
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`);

  // Script block 10
  runScript(`
(function(){
  let map = null;
  let layer = null;
  let markersByGid = {};

  // История замен: gid текущего экрана -> Set gid-ов, которые уже были показаны
  // (чтобы каждый клик "Заменить" давал новый экран, не возвращаясь к старым)
  const _replaceTried = new Map();

  // Сбрасываем историю при новом расчёте
  window.addEventListener("planner:calc-done", () => _replaceTried.clear());

  function el(id){ return document.getElementById(id); }

  function getGid(s){ return (s?.screen_id ?? s?.gid ?? s?.GID ?? s?.id ?? "").toString().trim(); }
  function getOwner(s){ return (s?.owner ?? s?.OWNER ?? s?.operator ?? "").toString().trim(); }
  function getAddr(s){ return (s?.address ?? s?.addr ?? "").toString().trim(); }

  function esc(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function ensureMapHeader(){
    const head = el("planner-map-head");
    if (head) head.style.display = "flex";
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest && e.target.closest("#map-download-btn")) {
      if (window.PLANNER?.downloadMapHtml) window.PLANNER.downloadMapHtml();
    }
  });

  function ensureMap(){
    const box = el("planner-map");
    if(!box) return null;

    ensureMapHeader();
    box.style.display = "block";
    if(map) return map;

    if(!window.L){
      console.warn("[map] Leaflet not loaded");
      return null;
    }

    map = L.map(box, { scrollWheelZoom: false });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap"
    }).addTo(map);

    layer = L.layerGroup().addTo(map);
    return map;
  }

  // Убирает экран из выборки и перерисовывает карту
  function removeScreenFromChosen(gid) {
    const planner = window.PLANNER;
    if (!planner?.removeScreen) return;
    // removeScreen() removes from lastChosen AND adds to manuallyExcluded so recalc respects it
    planner.removeScreen(gid);
    renderChosenOnMap(planner.state?.lastChosen || []);
    window.dispatchEvent(new CustomEvent("planner:filters-changed"));
  }

  // Находит ближайший ещё-не-показанный экран того же формата и подставляет его.
  // При повторных кликах каждый раз выдаёт новый вариант (исключает уже попробованные).
  function replaceScreenInChosen(screenToReplace) {
    const planner = window.PLANNER;
    if (!planner?.state) return;
    const chosen = planner.state.lastChosen || [];
    const gid = getGid(screenToReplace);

    // Пул: все загруженные экраны
    const allScreens = planner.state.screens || planner.state.screensAll || [];
    const chosenGids = new Set(chosen.map(s => getGid(s)));

    const lat0 = Number(screenToReplace.lat);
    const lon0 = Number(screenToReplace.lon);
    const fmt  = screenToReplace.format;

    // GID-ы, которые уже предлагались для этого "слота"
    const triedGids = _replaceTried.get(gid) || new Set();

    // Кандидаты: тот же формат, не выбранные, с координатами, ещё не пробованные
    let candidates = allScreens.filter(s =>
      getGid(s) !== gid &&
      !chosenGids.has(getGid(s)) &&
      !triedGids.has(getGid(s)) &&
      s.format === fmt &&
      Number.isFinite(Number(s.lat)) &&
      Number.isFinite(Number(s.lon))
    );

    // Если все варианты исчерпаны -- сбрасываем историю и начинаем заново
    if (!candidates.length) {
      _replaceTried.delete(gid);
      candidates = allScreens.filter(s =>
        getGid(s) !== gid &&
        !chosenGids.has(getGid(s)) &&
        s.format === fmt &&
        Number.isFinite(Number(s.lat)) &&
        Number.isFinite(Number(s.lon))
      );
    }

    if (!candidates.length) {
      window.PLANNER?.toast?.("Нет свободных экранов того же формата для замены.");
      return;
    }

    // Выбираем ближайший из оставшихся кандидатов
    const haversine = window.GeoUtils?.haversineMeters;
    let best = null, bestDist = Infinity;
    for (const c of candidates) {
      const d = haversine
        ? haversine(lat0, lon0, Number(c.lat), Number(c.lon))
        : Math.hypot(lat0 - Number(c.lat), lon0 - Number(c.lon));
      if (d < bestDist) { bestDist = d; best = c; }
    }
    if (!best) return;

    const bestGid = getGid(best);
    const idx = chosen.findIndex(s => getGid(s) === gid);
    if (idx >= 0) chosen[idx] = best;
    else chosen.push(best);

    // Передаём историю попыток на новый экран: следующий Replace на bestGid
    // не вернётся ни к gid, ни к ранее показанным вариантам
    _replaceTried.set(bestGid, new Set([...triedGids, gid]));
    _replaceTried.delete(gid);

    renderChosenOnMap(chosen);
    window.dispatchEvent(new CustomEvent("planner:filters-changed"));
  }

  function renderChosenOnMap(chosen){
    const m = ensureMap();
    if(!m || !layer) return;

    layer.clearLayers();
    markersByGid = {};

    const pts = [];
    (chosen || []).forEach(s => {
      const lat = Number(s?.lat);
      const lon = Number(s?.lon);
      if(!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      pts.push([lat, lon]);
      const gid = getGid(s) || \`\${lat},\${lon}\`;

      const html = \`
        <div style="font-size:13px; min-width:220px;">
          <div style="font-weight:700;">\${esc(getGid(s) || "Экран")}</div>
          <div style="margin-top:4px;color:#555;">\${esc(s?.format || "")}</div>
          <div style="margin-top:4px;"><b>Оператор:</b> \${esc(getOwner(s) || "\\u2014")}</div>
          <div style="margin-top:4px;"><b>Адрес:</b> \${esc(getAddr(s) || "\\u2014")}</div>
          <div style="margin-top:10px;display:flex;gap:6px;">
            <button id="btn-remove-\${esc(gid)}"
              style="flex:1;padding:6px 8px;background:#fee2e2;border:none;border-radius:8px;cursor:pointer;font-size:12px;color:#991b1b;font-weight:600;">
              \\u2715 Убрать
            </button>
            <button id="btn-replace-\${esc(gid)}"
              style="flex:1;padding:6px 8px;background:#ede9fe;border:none;border-radius:8px;cursor:pointer;font-size:12px;color:#5b3ef5;font-weight:600;">
              \\u21C4 Заменить
            </button>
          </div>
        </div>
      \`;

      // Цвета — те же три, что обещает легенда над картой.
      const _fmt = String(s.format || "").toUpperCase();
      const _susp = !!s._suspiciousBid;
      const _color = _susp ? "#B3261E" : (_fmt === "MEDIAFACADE" ? "#8A5A00" : "#4F2BE8");
      const marker = L.circleMarker([lat, lon], {
        radius: _susp ? 7 : 6,
        color: "#fff", weight: 2,
        fillColor: _color, fillOpacity: 1,
      }).addTo(layer).bindPopup(html, { maxWidth: 300 });
      // Вешаем обработчики после открытия попапа
      marker.on("popupopen", () => {
        const sc = s; // capture screen object
        document.getElementById(\`btn-remove-\${gid}\`)?.addEventListener("click", () => {
          marker.closePopup();
          removeScreenFromChosen(gid);
        });
        document.getElementById(\`btn-replace-\${gid}\`)?.addEventListener("click", () => {
          marker.closePopup();
          replaceScreenInChosen(sc);
        });
      });

      markersByGid[gid] = marker;
    });

    setTimeout(() => {
      m.invalidateSize();

      if(pts.length === 1){
        m.setView(pts[0], 14);
      } else if(pts.length > 1){
        m.fitBounds(pts, { padding: [20, 20] });
      } else {
        m.setView([55.751244, 37.618423], 10);
      }
    }, 50);
  }

  window.PLANNER = window.PLANNER || {};
  window.PLANNER.focusScreenOnMap = function(screen){
    try{
      const s = screen;
      if(!s) return;

      const m = ensureMap();
      if(!m) return;

      const lat = Number(s?.lat);
      const lon = Number(s?.lon);
      if(!Number.isFinite(lat) || !Number.isFinite(lon)) return;

      setTimeout(() => m.invalidateSize(), 0);
      m.setView([lat, lon], 15, { animate: true });

      const gid = getGid(s) || \`\${lat},\${lon}\`;
      const marker = markersByGid[gid];

      if(marker) marker.openPopup();
      else L.popup().setLatLng([lat, lon]).setContent(\`<b>\${esc(gid)}</b>\`).openOn(m);
    } catch(e){
      console.warn("[map] focus failed", e);
    }
  };

  function init(){
    window.addEventListener("planner:calc-done", (e) => {
      const chosen = e?.detail?.chosen || window.PLANNER?.state?.lastChosen || [];
      renderChosenOnMap(chosen);
    });

    window.addEventListener("planner:focus-screen", (e) => {
      const s = e?.detail?.screen;
      if(!s) return;
      window.PLANNER.focusScreenOnMap(s);
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`);

  // Script block 11
  runScript(`
(function(){
  const el = id => document.getElementById(id);

  let polyMap    = null;
  let drawLayer   = null;   // L.FeatureGroup \\u2014 хранит нарисованные полигоны
  let dotsLayer   = null;   // L.FeatureGroup \\u2014 точки всех экранов
  let currentPolys = [];    // L.Polygon[] \\u2014 все завершённые полигоны
  let drawControl = null;

  // -- helpers ---------------------------------------------------------
  function getPoly()  { return window.PLANNER?.state?.polygonFilter || null; }
  function setPoly(p) {
    window.PLANNER = window.PLANNER || {};
    window.PLANNER.state = window.PLANNER.state || {};
    window.PLANNER.state.polygonFilter = p;
  }
  function getScreensAll() { return window.PLANNER?.state?.screensAll || []; }

  // Returns screens filtered by current region/format/owner selections
  function getMapScreens() {
    const st = window.PLANNER?.state;
    if (!st) return [];
    let pool = Array.isArray(st.screensAll) ? st.screensAll : [];

    const regions = Array.isArray(st.selectedRegions) ? st.selectedRegions : [];
    if (regions.length) {
      const rset = new Set(regions.map(r => String(r || "").trim()));
      let filtered = pool.filter(s =>
        rset.has(String(s.region || "").trim()) || rset.has(String(s.city || "").trim())
      );
      if (!filtered.length && st.dspRegionToCities) {
        const citySet = new Set(regions.flatMap(r => st.dspRegionToCities[r] || []));
        filtered = pool.filter(s => citySet.has(String(s.city || "").trim()));
      }
      pool = filtered;
    }

    if (st.selectedFormats && st.selectedFormats.size > 0) {
      pool = pool.filter(s => st.selectedFormats.has(String(s.format || "").trim()));
    }

    if (st.selectedOwners && st.selectedOwners.size > 0) {
      pool = pool.filter(s => {
        const own = String(s.owner ?? s.OWNER ?? s.operator ?? s.vendor ?? s.network ?? "").trim();
        return st.selectedOwners.has(own);
      });
    }

    return pool;
  }

  // countInside: accepts array of L.Polygon objects, counts only filtered screens
  function countInside(polys) {
    if (!polys || !polys.length) return 0;
    const fn = window.PLANNER?.pointInPolygon;
    if (!fn) return 0;
    return getMapScreens().filter(s => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return false;
      return polys.some(p => fn(s.lat, s.lon, p.getLatLngs()[0].map(ll => [ll.lat, ll.lng])));
    }).length;
  }

  // -- badge in step 4 -------------------------------------------------
  function updateBadge() {
    const poly = getPoly();
    const badge = el("poly-badge");
    const text  = el("poly-badge-text");
    const btn   = el("poly-draw-btn");
    if (!badge || !text) return;
    // Support both old flat format and new multi-polygon format
    const polys = poly && Array.isArray(poly[0]) && Array.isArray(poly[0][0])
      ? poly : (poly && poly.length >= 3 ? [poly] : null);
    if (polys && polys.length) {
      const fn = window.PLANNER?.pointInPolygon;
      const cnt = fn ? getMapScreens().filter(s =>
        Number.isFinite(s.lat) && Number.isFinite(s.lon) &&
        polys.some(p => fn(s.lat, s.lon, p))
      ).length : 0;
      const n = polys.length;
      const zonesLabel = n === 1 ? "зона" : n < 5 ? "зоны" : "зон";
      text.textContent = \`\${n} \${zonesLabel} \\u2014 \${cnt.toLocaleString("ru-RU")} экранов\`;
      badge.style.display = "flex";
      if (btn) btn.textContent = "\\u270F\\uFE0F Изменить зоны";
    } else {
      badge.style.display = "none";
      if (btn) btn.textContent = "\\uD83D\\uDDFA Нарисовать зону";
    }
  }

  // -- open modal -------------------------------------------------------
  // Кат «Зона на карте» переносит узел модалки внутрь себя и зовёт эти две.
  window.plannerOpenPolyMap  = () => openModal();
  window.plannerClosePolyMap = () => closeModal();

  function openModal() {
    const modal = el("poly-modal");
    if (!modal) return;
    modal.style.display = "flex";
    setTimeout(initPolyMap, 50); // дать время показаться
  }

  function closeModal() {
    const modal = el("poly-modal");
    if (modal) modal.style.display = "none";
    // stop any active drawing
    if (drawControl && polyMap) {
      try { drawControl.disable?.(); } catch(_) {}
    }
  }

  // -- init drawing map -------------------------------------------------
  function initPolyMap() {
    if (!window.L) { alert("Leaflet не загружен"); return; }
    const box = el("poly-map");
    if (!box) return;

    // Create map once
    if (!polyMap) {
      polyMap = L.map(box, { scrollWheelZoom: true, zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "\\u00A9 OpenStreetMap"
      }).addTo(polyMap);

      drawLayer = new L.FeatureGroup().addTo(polyMap);
      dotsLayer = new L.FeatureGroup().addTo(polyMap);
    }

    polyMap.invalidateSize();

    // Render existing polygons if any
    drawLayer.clearLayers();
    currentPolys = [];
    vertices = []; tempPolyline = null; tempMarkers = [];
    const existing = getPoly();
    const existingPolys = existing && Array.isArray(existing[0]) && Array.isArray(existing[0][0])
      ? existing : (existing && existing.length >= 3 ? [existing] : []);
    existingPolys.forEach(coords => {
      const p = L.polygon(coords.map(([la, lo]) => [la, lo]),
        { color: "#5B3EF5", fillOpacity: 0.15 }).addTo(drawLayer);
      currentPolys.push(p);
    });

    // Возвращаем на карту то, что уже в фильтре: иначе слой открывается
    // пустым, счётчик в шапке считает по состоянию, а внутри — по
    // нарисованному, и числа расходятся.
    if (!currentPolys.length) {
      const saved = getPoly();
      if (Array.isArray(saved) && saved.length) {
        for (const ring of saved) {
          if (!Array.isArray(ring) || ring.length < 3) continue;
          const poly = L.polygon(ring, { color: "#5B3EF5", fillOpacity: 0.15, weight: 2 }).addTo(drawLayer);
          currentPolys.push(poly);
          attachZoneDelete(poly);
        }
      }
    }

    // Render screens matching current region/format/owner filters
    dotsLayer.clearLayers();
    const screens = getMapScreens();
    const renderer = L.canvas({ padding: 0.5 });
    const bounds = [];
    screens.forEach(s => {
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return;
      L.circleMarker([s.lat, s.lon], {
        radius: 3, color: "#EC4899", fillColor: "#EC4899",
        fillOpacity: 0.5, weight: 0, renderer
      }).addTo(dotsLayer);
      bounds.push([s.lat, s.lon]);
    });

    // Fit to existing polygons or to all screens
    setTimeout(() => {
      polyMap.invalidateSize();
      if (currentPolys.length) {
        polyMap.fitBounds(L.featureGroup(currentPolys).getBounds(), { padding: [40, 40] });
      } else if (bounds.length) {
        polyMap.fitBounds(bounds, { padding: [20, 20] });
      }
    }, 80);

    setupDrawing();
    updateModalState();
  }

  // -- draw mode: "polygon" | "line" ------------------------------------
  let drawMode = "polygon";

  // Buffer a polyline (array of Leaflet LatLng) by radiusM meters → [[lat,lng],...] polygon
  function bufferPolyline(pts, radiusM) {
    if (!pts || pts.length < 2) return null;
    const n = pts.length;
    const STEPS = 8;

    function rightNorm(p1, p2) {
      const cosLat = Math.cos((p1.lat + p2.lat) / 2 * Math.PI / 180);
      const dLatM = (p2.lat - p1.lat) * 111320;
      const dLonM = (p2.lng - p1.lng) * 111320 * cosLat;
      const len = Math.hypot(dLatM, dLonM) || 1e-9;
      return [-dLonM / len * radiusM / 111320, dLatM / len * radiusM / (111320 * cosLat)];
    }

    const vNorms = [];
    for (let i = 0; i < n; i++) {
      let dLat = 0, dLng = 0, c = 0;
      if (i > 0)   { const nm = rightNorm(pts[i-1], pts[i]); dLat += nm[0]; dLng += nm[1]; c++; }
      if (i < n-1) { const nm = rightNorm(pts[i], pts[i+1]); dLat += nm[0]; dLng += nm[1]; c++; }
      vNorms.push([dLat/c, dLng/c]);
    }

    function arcPts(center, fromA, toA) {
      const cosC = Math.cos(center.lat * Math.PI / 180);
      const res = [];
      for (let i = 0; i <= STEPS; i++) {
        const a = fromA + (toA - fromA) * i / STEPS;
        res.push([center.lat + Math.sin(a) * radiusM / 111320, center.lng + Math.cos(a) * radiusM / (111320 * cosC)]);
      }
      return res;
    }

    function segAngle(p1, p2) {
      const cosLat = Math.cos((p1.lat + p2.lat) / 2 * Math.PI / 180);
      return Math.atan2((p2.lat - p1.lat) * 111320, (p2.lng - p1.lng) * 111320 * cosLat);
    }

    const PI = Math.PI;
    const aFirst = segAngle(pts[0], pts[1]);
    const aLast  = segAngle(pts[n-2], pts[n-1]);
    const poly = [];
    for (let i = 0; i < n; i++) poly.push([pts[i].lat + vNorms[i][0], pts[i].lng + vNorms[i][1]]);
    arcPts(pts[n-1], aLast - PI/2, aLast + PI/2).forEach(p => poly.push(p));
    for (let i = n-1; i >= 0; i--) poly.push([pts[i].lat - vNorms[i][0], pts[i].lng - vNorms[i][1]]);
    arcPts(pts[0], aFirst + PI/2, aFirst + PI/2 + PI).forEach(p => poly.push(p));
    return poly;
  }

  // -- setup click-to-draw polygon --------------------------------------
  let vertices = [];
  let tempPolyline = null;
  let tempMarkers  = [];

  function setupDrawing() {
    if (!polyMap) return;
    polyMap.off("click", onMapClick);
    vertices = [];
    tempPolyline = null;
    tempMarkers  = [];
    polyMap.on("click", onMapClick);
  }

  function onMapClick(e) {
    const latlng = e.latlng;
    vertices.push(latlng);

    // Draw vertex marker
    const isFirstPoly = vertices.length === 1 && drawMode === "polygon";
    const mColor = drawMode === "line" ? "#EC4899" : (isFirstPoly ? "#e84444" : "#5B3EF5");
    const m = L.circleMarker(latlng, {
      radius: isFirstPoly ? 7 : 5,
      color: mColor, fillColor: mColor, fillOpacity: 0.9, weight: 2
    }).addTo(drawLayer);
    if (isFirstPoly) {
      m.bindTooltip("Кликните сюда, чтобы замкнуть", { permanent: false, direction: "top" });
      m.on("click", (ev) => { L.DomEvent.stopPropagation(ev); finishPolygon(); });
    }
    tempMarkers.push(m);

    // Update polyline preview
    if (tempPolyline) { drawLayer.removeLayer(tempPolyline); tempPolyline = null; }
    if (vertices.length >= 2) {
      const lineOpts = drawMode === "line"
        ? { color: "#EC4899", weight: 3, opacity: 0.8 }
        : { color: "#5B3EF5", dashArray: "5,6", weight: 2 };
      tempPolyline = L.polyline(vertices, lineOpts).addTo(drawLayer);
    }

    // Show finish button
    const minVerts = drawMode === "line" ? 2 : 3;
    const finBtn = el("poly-finish-btn");
    if (finBtn) finBtn.style.display = vertices.length >= minVerts ? "block" : "none";

    updateModalState();
  }

  function finishPolygon() {
    const minVerts = drawMode === "line" ? 2 : 3;
    if (vertices.length < minVerts) return;

    // Remove temp drawing layers (keep finished polygons)
    if (tempPolyline) { drawLayer.removeLayer(tempPolyline); tempPolyline = null; }
    tempMarkers.forEach(m => drawLayer.removeLayer(m));
    tempMarkers = [];
    polyMap.off("click", onMapClick);

    if (drawMode === "line") {
      // Buffer the polyline by 100m → polygon
      const bufCoords = bufferPolyline(vertices, 100);
      if (bufCoords) {
        const poly = L.polygon(bufCoords, { color: "#5B3EF5", fillOpacity: 0.15, weight: 2 }).addTo(drawLayer);
        currentPolys.push(poly);
        attachZoneDelete(poly);
      }
    } else {
      const poly = L.polygon(vertices, { color: "#5B3EF5", fillOpacity: 0.15, weight: 2 }).addTo(drawLayer);
      currentPolys.push(poly);
      attachZoneDelete(poly);
    }

    vertices = [];
    const finBtn = el("poly-finish-btn");
    if (finBtn) finBtn.style.display = "none";

    applyPolys();
    updateModalState();

    // Re-enable drawing for the next zone
    polyMap.on("click", onMapClick);
  }

  function resetDraw() {
    // Clear all polygons and restart from scratch
    drawLayer.clearLayers();
    currentPolys = [];
    vertices = [];
    tempPolyline = null;
    tempMarkers = [];
    const finBtn = el("poly-finish-btn");
    if (finBtn) finBtn.style.display = "none";
    polyMap.on("click", onMapClick);
    applyPolys();   // стёрли всё — фильтр тоже пуст
    updateModalState();
  }

  // -- update modal UI state --------------------------------------------
  function updateModalState() {
    const resetBtn   = el("poly-modal-reset");
    const countBadge = el("poly-modal-count");
    const hint       = el("poly-hint");

    const minVerts = drawMode === "line" ? 2 : 3;
    const hasPolys = currentPolys.length > 0;
    const hasVerts = vertices.length >= minVerts;

    if (resetBtn)   resetBtn.style.display = (hasPolys || hasVerts) ? "block" : "none";

    // Update finish button text based on mode
    const finBtn = el("poly-finish-btn");
    if (finBtn) finBtn.textContent = drawMode === "line" ? "\\u2713 Завершить линию" : "\\u2713 Завершить полигон";

    if (hasPolys && countBadge) {
      const cnt = countInside(currentPolys);
      const n = currentPolys.length;
      const zonesLabel = n === 1 ? "зона" : n < 5 ? "зоны" : "зон";
      countBadge.textContent = \`\${n} \${zonesLabel} \\u00B7 \${cnt.toLocaleString("ru-RU")} экранов\`;
      countBadge.style.display = "block";
      const what = drawMode === "line" ? "линию" : "зону";
      const drawingMore = hasVerts
        ? \` Рисуете \${what} \${n + 1} \\u2014 добавлено \${vertices.length} точек.\`
        : " Зона уже в фильтре. Можно нарисовать ещё одну.";
      if (hint) hint.textContent = cnt > 0
        ? \`В \${n === 1 ? "зоне" : "зонах"} \${cnt.toLocaleString("ru-RU")} экранов.\${drawingMore}\`
        : \`В зонах нет экранов \\u2014 попробуйте перерисовать.\${drawingMore}\`;
    } else {
      if (countBadge) countBadge.style.display = "none";
      if (hint) hint.textContent = hasVerts
        ? \`Добавлено \${vertices.length} точек. \${drawMode === "line" ? "Нажмите \\u00ABЗавершить\\u00BB." : "Кликните на первую точку или нажмите \\u00ABЗавершить\\u00BB."}\`
        : (drawMode === "line"
          ? "Кликайте на карту, чтобы добавлять точки линии. Линия выберет всё в радиусе 100 м вокруг неё."
          : "Кликайте на карту, чтобы добавлять точки полигона. Замкните его \\u2014 кликните на первую точку или нажмите \\u00ABЗавершить\\u00BB.");
    }
  }

  // Клик по готовой зоне открывает корзинку: убрать одну зону, не
  // перерисовывая остальные. Всплытие гасим — иначе тот же клик уйдёт в
  // onMapClick и поставит первую точку новой зоны поверх существующей.
  let zoneSeq = 0;
  const zoneById = new Map();

  function attachZoneDelete(poly) {
    const id = "z" + (++zoneSeq);
    zoneById.set(id, poly);
    poly.bindPopup(
      "<div style='display:flex;align-items:center;gap:10px;font-size:12px;'>" +
      "<span style='color:#4C5368;'>Зона в фильтре</span>" +
      "<button type='button' class='zone-del' data-zone='" + id + "' " +
      "style='display:inline-flex;align-items:center;gap:5px;padding:4px 10px;" +
      "border:1px solid #EFD8A1;border-radius:8px;background:#FFF6E1;" +
      "color:#8A5A00;font:inherit;font-weight:600;cursor:pointer;'>" +
      "\u{1F5D1} Удалить зону</button></div>",
      { closeButton: false, className: "zone-popup" });
    poly.on("click", (e) => {
      if (e.originalEvent) L.DomEvent.stopPropagation(e.originalEvent);
      poly.openPopup(e.latlng);
    });
  }

  function deleteZone(id) {
    const poly = zoneById.get(id);
    if (!poly) return;
    zoneById.delete(id);
    poly.closePopup();
    drawLayer.removeLayer(poly);
    currentPolys = currentPolys.filter(x => x !== poly);
    applyPolys();
    updateModalState();
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest && e.target.closest(".zone-del");
    if (!b) return;
    e.preventDefault();
    deleteZone(b.dataset.zone);
  });

  // -- применяем нарисованное сразу, без отдельной кнопки ---------------
  function applyPolys() {
    setPoly(currentPolys.length
      ? currentPolys.map(p => p.getLatLngs()[0].map(ll => [ll.lat, ll.lng]))
      : null);
    updateBadge();
    window.dispatchEvent(new CustomEvent("planner:filters-changed"));
  }

  // -- clear all polygons -----------------------------------------------
  function clearPolygon() {
    setPoly(null);
    currentPolys = [];
    if (drawLayer) drawLayer.clearLayers();
    updateBadge();
    window.dispatchEvent(new CustomEvent("planner:filters-changed"));
  }

  // -- init event listeners ---------------------------------------------
  function init() {
    function setDrawMode(mode) {
      drawMode = mode;
      // Clear any in-progress drawing (don't wipe finished zones)
      if (vertices.length > 0) {
        vertices = [];
        if (tempPolyline && drawLayer) { drawLayer.removeLayer(tempPolyline); tempPolyline = null; }
        tempMarkers.forEach(m => drawLayer && drawLayer.removeLayer(m));
        tempMarkers = [];
        const finBtn = el("poly-finish-btn");
        if (finBtn) finBtn.style.display = "none";
      }
      // Toggle button styles
      const polyBtn = el("draw-mode-polygon");
      const lineBtn = el("draw-mode-line");
      if (polyBtn && lineBtn) {
        if (mode === "polygon") {
          polyBtn.style.cssText = "padding:5px 14px;border-radius:999px;border:1.5px solid #5B3EF5;background:#EDE9FD;color:#4930C7;font-size:12px;font-weight:600;cursor:pointer;";
          lineBtn.style.cssText = "padding:5px 14px;border-radius:999px;border:1.5px solid rgba(15,23,42,.14);background:#fff;color:#374151;font-size:12px;font-weight:500;cursor:pointer;";
        } else {
          lineBtn.style.cssText = "padding:5px 14px;border-radius:999px;border:1.5px solid #EC4899;background:#FDF2F8;color:#9D174D;font-size:12px;font-weight:600;cursor:pointer;";
          polyBtn.style.cssText = "padding:5px 14px;border-radius:999px;border:1.5px solid rgba(15,23,42,.14);background:#fff;color:#374151;font-size:12px;font-weight:500;cursor:pointer;";
        }
      }
      updateModalState();
    }

    el("draw-mode-polygon")?.addEventListener("click", () => setDrawMode("polygon"));
    el("draw-mode-line")?.addEventListener("click", () => setDrawMode("line"));

    el("poly-draw-btn")?.addEventListener("click", openModal);
    el("poly-modal-cancel")?.addEventListener("click", closeModal);
    el("poly-modal-reset")?.addEventListener("click", resetDraw);
    el("poly-clear-btn")?.addEventListener("click", clearPolygon);
    el("poly-finish-btn")?.addEventListener("click", finishPolygon);

    // Close on backdrop click
    el("poly-modal")?.addEventListener("click", (e) => {
      if (e.target === el("poly-modal")) closeModal();
    });

    // Re-render badge when screens load
    window.addEventListener("planner:screens-ready", updateBadge);
    window.addEventListener("planner:filters-changed", updateBadge);

    // only-active-bids toggle -> refresh pool preview counts
    document.getElementById("only-active-bids")?.addEventListener("change", () => {
      window.dispatchEvent(new CustomEvent("planner:filters-changed"));
    });

    // GID-режим: панель «Дополнительные экраны с карты»
    // gid-extra-zone-draw already opens the modal via its inline onclick (forwards
    // to poly-draw-btn.click()) — no separate listener here, or openModal() (which
    // synchronously rebuilds every screen marker on the map) fires twice per click.
    document.getElementById("gid-extra-zone-clear")?.addEventListener("click", () => { clearPolygon(); });
    document.getElementById("gid-extra-fmt-all")?.addEventListener("click", () => { _gidExtraSelectAll("formats"); });
    document.getElementById("gid-extra-fmt-clear")?.addEventListener("click", () => { _gidExtraClear("formats"); });
    document.getElementById("gid-extra-fmt-toggle")?.addEventListener("click", () => { _gidExtraToggleExpand("gidExtraFmtExpanded"); });
    document.getElementById("gid-extra-own-all")?.addEventListener("click", () => { _gidExtraSelectAll("owners"); });
    document.getElementById("gid-extra-own-clear")?.addEventListener("click", () => { _gidExtraClear("owners"); });
    document.getElementById("gid-extra-own-toggle")?.addEventListener("click", () => { _gidExtraToggleExpand("gidExtraOwnExpanded"); });
    window.addEventListener("planner:filters-changed", renderGidExtra);
    window.addEventListener("planner:screens-ready", renderGidExtra);

    updateBadge();
  }

  // ===== GID-режим: «Дополнительные экраны с карты» =====
  // База — типизированный GID-список (сохраняется всегда). Здесь считаем/рисуем
  // ТОЛЬКО добавляемые экраны: внутри нарисованной зоны + подходящие под выбранные
  // форматы/операторы. Выбор пишем в ОТДЕЛЬНЫЕ наборы state.gidExtraFormats /
  // state.gidExtraOwners (не в городские selectedFormats/selectedOwners — иначе
  // городские модули по planner:filters-changed сбрасывают выбор). Эти наборы читает
  // planner.js в режиме manual_screens (аддитивно к GID-списку).
  function _gidExtraTypedSet() {
    var ta = document.getElementById("manual-gids");
    var raw = (ta && ta.value) ? ta.value : "";
    var set = new Set();
    // Разделители как в planner.js: перевод строки / запятая / ; / таб / CR (НЕ пробел)
    raw.split(/[\\n,;\\r\\t]+/).forEach(function(t){ t = String(t || "").trim(); if (t) set.add(t); });
    return set;
  }
  function _gidExtraScreenId(s) {
    if (!s) return "";
    var v = (s.screen_id != null) ? s.screen_id
          : (s.gid != null) ? s.gid
          : (s.GID != null) ? s.GID
          : (s.id != null) ? s.id : "";
    return String(v).trim();
  }
  function _gidExtraOwnerOf(s) {
    if (!s) return "";
    var v = (s.owner != null) ? s.owner
          : (s.OWNER != null) ? s.OWNER
          : (s.operator != null) ? s.operator
          : (s.vendor != null) ? s.vendor
          : (s.network != null) ? s.network : "";
    return String(v).trim();
  }
  function _gidExtraZoneScreensRaw() {
    var poly = getPoly();
    if (!poly || !poly.length) return [];
    var list = (Array.isArray(poly[0]) && Array.isArray(poly[0][0]))
      ? poly : (poly.length >= 3 ? [poly] : []);
    if (!list.length) return [];
    var fn = window.PLANNER && window.PLANNER.pointInPolygon;
    if (!fn) return [];
    var all = (window.PLANNER && window.PLANNER.state && window.PLANNER.state.screensAll) || [];
    return all.filter(function(s){
      if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) return false;
      return list.some(function(p){ return fn(s.lat, s.lon, p); });
    });
  }
  var GID_EXTRA_COLLAPSE_LIMIT = 6;
  // Источник чипов: зона если нарисована, иначе весь инвентарь (можно выбрать заранее)
  function _gidExtraSource() {
    var zone = _gidExtraZoneScreensRaw();
    if (zone.length) return zone;
    var st = window.PLANNER && window.PLANNER.state;
    return (st && Array.isArray(st.screensAll)) ? st.screensAll : [];
  }
  function _gidExtraCounts(kind) {
    var typed = _gidExtraTypedSet();
    var source = _gidExtraSource();
    var counts = {};
    source.forEach(function(s){
      if (typed.has(_gidExtraScreenId(s))) return;
      var k = (kind === "owners") ? _gidExtraOwnerOf(s) : String(s.format || "").trim();
      if (k) counts[k] = (counts[k] || 0) + 1;
    });
    return counts;
  }
  function _gidExtraSelectAll(kind) {
    var st = window.PLANNER && window.PLANNER.state; if (!st) return;
    var set = (kind === "owners")
      ? (st.gidExtraOwners = st.gidExtraOwners || new Set())
      : (st.gidExtraFormats = st.gidExtraFormats || new Set());
    Object.keys(_gidExtraCounts(kind)).forEach(function(k){ set.add(k); });
    renderGidExtra();
  }
  function _gidExtraClear(kind) {
    var st = window.PLANNER && window.PLANNER.state; if (!st) return;
    var set = (kind === "owners") ? st.gidExtraOwners : st.gidExtraFormats;
    if (set) set.clear();
    renderGidExtra();
  }
  function _gidExtraToggleExpand(key) {
    window.PLANNER.ui = window.PLANNER.ui || {};
    window.PLANNER.ui[key] = !window.PLANNER.ui[key];
    renderGidExtra();
  }
  function renderGidExtra() {
    var block = document.getElementById("step4-gid-extra-block");
    if (!block) return;
    var st = window.PLANNER && window.PLANNER.state;
    if (!st) return;
    // Отдельные наборы для GID-режима — не пересекаются с городскими
    if (!st.gidExtraFormats) st.gidExtraFormats = new Set();
    if (!st.gidExtraOwners)  st.gidExtraOwners  = new Set();
    window.PLANNER.ui = window.PLANNER.ui || {};

    var zone = _gidExtraZoneScreensRaw();
    var hasZone = zone.length > 0;

    var badge = document.getElementById("gid-extra-zone-badge");
    var badgeText = document.getElementById("gid-extra-zone-text");
    var drawBtn = document.getElementById("gid-extra-zone-draw");
    var filtersWrap = document.getElementById("gid-extra-filters");
    var summary = document.getElementById("gid-extra-summary");

    if (badge) badge.style.display = hasZone ? "flex" : "none";
    if (drawBtn) drawBtn.textContent = hasZone ? "✏️ Изменить зону" : "🗺 Нарисовать зону на карте";
    // Пока зоны нет, добирать неоткуда, а чипы считались по всему инвентарю и
    // обещали «Russ Outdoor (25 997)» там, где не добавится ни один экран.
    if (filtersWrap) filtersWrap.style.display = hasZone ? "block" : "none";

    var typed = _gidExtraTypedSet();
    var selFmt = st.gidExtraFormats, selOwn = st.gidExtraOwners;

    var fmtCounts = _gidExtraCounts("formats");
    var ownCounts = _gidExtraCounts("owners");
    // Убираем из выбора то, чего больше нет в источнике (напр. после сужения зоны)
    selFmt.forEach(function(k){ if (!(k in fmtCounts)) selFmt.delete(k); });
    selOwn.forEach(function(k){ if (!(k in ownCounts)) selOwn.delete(k); });

    function renderChips(containerId, toggleId, countId, counts, selSet, expandKey, labelMore, labelLess) {
      var box = document.getElementById(containerId);
      if (!box) return;
      var keys = Object.keys(counts).sort(function(a,b){ return counts[b] - counts[a]; });
      var expanded = !!window.PLANNER.ui[expandKey];
      var visible = expanded ? keys : keys.slice(0, GID_EXTRA_COLLAPSE_LIMIT);
      box.innerHTML = "";
      if (!keys.length) box.innerHTML = "<span style=\\"font-size:12px;color:#98a2b3;\\">— нет данных —</span>";
      visible.forEach(function(key){
        var chip = document.createElement("button");
        chip.type = "button";
        var active = selSet.has(key);
        chip.textContent = key + " (" + counts[key].toLocaleString("ru-RU") + ")";
        chip.style.cssText = "padding:5px 12px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid " +
          (active ? "#5B3EF5;background:#EDE9FD;color:#4930C7;" : "rgba(15,23,42,.14);background:#fff;color:#374151;");
        chip.addEventListener("click", function(){
          if (selSet.has(key)) selSet.delete(key); else selSet.add(key);
          renderGidExtra();
        });
        box.appendChild(chip);
      });
      var tgl = document.getElementById(toggleId);
      if (tgl) {
        var need = keys.length > GID_EXTRA_COLLAPSE_LIMIT;
        tgl.style.display = need ? "inline-flex" : "none";
        if (need) tgl.textContent = expanded ? labelLess : (labelMore + " (" + keys.length + ")");
      }
      var cnt = document.getElementById(countId);
      if (cnt) cnt.textContent = String(selSet.size);
    }
    renderChips("gid-extra-formats", "gid-extra-fmt-toggle", "gid-extra-fmt-count",
      fmtCounts, selFmt, "gidExtraFmtExpanded", "Показать все форматы", "Свернуть форматы");
    renderChips("gid-extra-owners", "gid-extra-own-toggle", "gid-extra-own-count",
      ownCounts, selOwn, "gidExtraOwnExpanded", "Показать всех операторов", "Свернуть операторов");

    if (!hasZone) { if (summary) summary.textContent = ""; return; }

    // Итог: сколько экранов реально добавится (зона ∩ форматы ∩ операторы, без GID-ов)
    var added = 0;
    zone.forEach(function(s){
      if (typed.has(_gidExtraScreenId(s))) return;
      if (selFmt.size > 0 && !selFmt.has(String(s.format || "").trim())) return;
      if (selOwn.size > 0 && !selOwn.has(_gidExtraOwnerOf(s))) return;
      added++;
    });
    if (badgeText) badgeText.textContent = zone.length.toLocaleString("ru-RU") + " экранов в зоне";
    if (summary) summary.textContent = "Будет добавлено к GID-списку: " + added.toLocaleString("ru-RU") + " экранов";
  }
  window.renderGidExtra = renderGidExtra;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`);

  // Script block 12
  runScript(`
(function(){
  const IDS = {
    wrap: "owner-wrap",
    toggle: "owner-toggle",
    all: "owner-all",
    clear: "owner-clear",
    count: "owners-count"
  };

  const COLLAPSE_LIMIT = 6;

  function el(id){ return document.getElementById(id); }

  function ensureState(){
    window.PLANNER = window.PLANNER || {};
    window.PLANNER.state = window.PLANNER.state || {};
    window.PLANNER.ui = window.PLANNER.ui || {};
    const st = window.PLANNER.state;
    if(!st.selectedOwners) st.selectedOwners = new Set();
    if(typeof window.PLANNER.ui.ownersExpanded !== "boolean") window.PLANNER.ui.ownersExpanded = false;
    return st;
  }

  function getSelectedRegions(){
    const st = window.PLANNER?.state;
    if(!st) return [];
    const arr = Array.isArray(st.selectedRegions) ? st.selectedRegions
              : (st.selectedRegion ? [st.selectedRegion] : []);
    return (arr || []).map(x=>String(x||"").trim()).filter(Boolean);
  }

  function getScreensAll(){
    const st = window.PLANNER?.state;
    if(!st) return [];
    return Array.isArray(st.screensAll) ? st.screensAll
         : Array.isArray(st.screens) ? st.screens
         : [];
  }

  function getOwnerName(s){
    return String(s?.owner ?? s?.OWNER ?? s?.operator ?? s?.vendor ?? s?.network ?? "").trim();
  }
  function getRegion(s){
    return String(s?.region ?? s?.Region ?? s?.city ?? s?.CITY ?? "").trim();
  }

  function escapeHtml(s){
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function computeOwnersWithCounts(){
    const regions = getSelectedRegions();
    const screens = getScreensAll();
    const selectedFormats = window.PLANNER?.state?.selectedFormats;

    const pool = screens.filter(s => {
      if (regions.length && !regions.includes(getRegion(s))) return false;
      if (selectedFormats && selectedFormats.size > 0 && !selectedFormats.has(s.format)) return false;
      return true;
    });

    const map = new Map();
    for(const s of pool){
      const o = getOwnerName(s);
      if(!o) continue;
      map.set(o, (map.get(o) || 0) + 1);
    }

    return [...map.entries()]
      .map(([owner, count]) => ({ owner, count }))
      .sort((a,b)=> (b.count - a.count) || a.owner.localeCompare(b.owner,"ru"));
  }

  function updateChosenLabel(){
    const st = ensureState();
    const node = el(IDS.count);
    if(node) node.textContent = String(st.selectedOwners.size);
  }

  function showOwnerInfo(owner, count){
    // Справка, а не ошибка — модальное окно здесь было явно избыточным.
    window.PLANNER?.toast?.(\`\${owner} — \${count.toLocaleString("ru-RU")} экр. в выбранных регионах\`);
  }

  function renderOwners(){
    const st = ensureState();
    const wrap = el(IDS.wrap);
    if(!wrap) return;

    const list = computeOwnersWithCounts();
    const avail = new Set(list.map(x=>x.owner));

    for(const o of [...st.selectedOwners]){
      if(!avail.has(o)) st.selectedOwners.delete(o);
    }

    // Filter by search query
    const searchQ = (el("owner-search")?.value || "").trim().toLowerCase();
    const filtered = searchQ
      ? list.filter(x => x.owner.toLowerCase().includes(searchQ))
      : list;

    const expanded = !!window.PLANNER.ui.ownersExpanded || !!searchQ;
    const visible = expanded ? filtered : filtered.slice(0, COLLAPSE_LIMIT);

    wrap.innerHTML = "";

    visible.forEach(({ owner, count }) => {
      const card = document.createElement("div");
      card.className = "own-card";
      const ownSelected = st.selectedOwners.has(owner);
      if(ownSelected) card.classList.add("is-selected");
      card.setAttribute("role", "button");
      card.setAttribute("aria-pressed", ownSelected ? "true" : "false");
      card.tabIndex = 0;
      card.dataset.kbdClick = "";

      card.innerHTML = \`
        <div class="own-left">
          <div class="own-title">\${escapeHtml(owner)}</div>
          <div class="own-countline">\${count.toLocaleString("ru-RU")} экранов</div>
        </div>
        <button type="button" class="own-tip" aria-label="Информация об операторе">i</button>
      \`;

      card.querySelector(".own-tip").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        showOwnerInfo(owner, count);
      });

      card.addEventListener("click", () => {
        if(st.selectedOwners.has(owner)) st.selectedOwners.delete(owner);
        else st.selectedOwners.add(owner);

        renderOwners();
        updateChosenLabel();
        window.dispatchEvent(new CustomEvent("planner:filters-changed"));
        if(typeof window.renderProgress === "function") window.renderProgress();
      });

      wrap.appendChild(card);
    });

    const tgl = el(IDS.toggle);
    if(tgl){
      const need = !searchQ && filtered.length > COLLAPSE_LIMIT;
      tgl.style.display = need ? "inline-flex" : "none";
      tgl.textContent = expanded ? "Свернуть операторов" : "Показать всех операторов";
    }

    wrap.classList.toggle("owner-collapsed", !expanded);

    updateChosenLabel();
  }

  function bind(){
    const st = ensureState();

    // Owner search
    el("owner-search")?.addEventListener("input", () => renderOwners());

    el(IDS.all)?.addEventListener("click", () => {
      const list = computeOwnersWithCounts();
      st.selectedOwners = new Set(list.map(x=>x.owner));
      renderOwners();
      window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      if(typeof window.renderProgress === "function") window.renderProgress();
    });

    el(IDS.clear)?.addEventListener("click", () => {
      st.selectedOwners.clear();
      renderOwners();
      window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      if(typeof window.renderProgress === "function") window.renderProgress();
    });

    el(IDS.toggle)?.addEventListener("click", () => {
      window.PLANNER.ui.ownersExpanded = !window.PLANNER.ui.ownersExpanded;
      renderOwners();
    });

    window.addEventListener("planner:screens-ready", renderOwners);
    window.addEventListener("planner:filters-changed", renderOwners);

    let lastSig = "";
    setInterval(() => {
      const regionsSig = getSelectedRegions().slice().sort().join("||");
      const len = getScreensAll().length;
      const sig = regionsSig + "##" + len;
      if(sig !== lastSig){
        lastSig = sig;
        renderOwners();
      }
    }, 500);

    renderOwners();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
`);

  // Script block 13
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  const fmtInt = (n) => {
    const x = Number(n);
    return Number.isFinite(x) ? Math.round(x).toLocaleString("ru-RU") : "\\u2014";
  };
  const fmtMoney = (n) => {
    const x = Number(n);
    return (Number.isFinite(x) && x > 0) ? (Math.round(x).toLocaleString("ru-RU") + " \\u20BD") : "\\u2014";
  };
  const fmtRange = (n) => {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return "\\u2014";
    if (x >= 1_000_000) return (x / 1_000_000).toLocaleString("ru-RU", {maximumFractionDigits:1}) + "\\u202FМ\\u202F\\u20BD";
    if (x >= 1_000)     return Math.round(x / 1_000).toLocaleString("ru-RU") + "\\u202Fтыс.\\u202F\\u20BD";
    return Math.round(x).toLocaleString("ru-RU") + "\\u202F\\u20BD";
  };

  function hoursPerDayFromRaw(){
    const raw = el("summary")?.textContent || "";
    const m = raw.match(/часов\\/день:\\s*([0-9]+(\\.[0-9]+)?)/i);
    return m ? Number(m[1]) : null;
  }

  function daysFromRaw(){
    const raw = el("summary")?.textContent || "";
    const m = raw.match(/\\(дней:\\s*([0-9]+)\\)/i);
    return m ? Number(m[1]) : null;
  }

  function render(detail){
    const root = el("pretty-summary");
    if(!root) return;

    const perRegion = Array.isArray(detail?.perRegion) ? detail.perRegion : [];

    const spentBudget   = perRegion.reduce((a,r)=> a + (Number(r.budget)||0), 0);
    const targetBudget  = Number(detail?.brief?.budget?.amount) || spentBudget;
    // Показываем ОСВОЕННОЕ, а не заданное. Раньше здесь стояла заданная сумма,
    // и когда инвентарь не мог её освоить, страница показывала одно число, а
    // выгрузка — другое, меньшее. Заодно врали «стоимость выхода» и CPM: они
    // делят этот бюджет на выходы, которых на заданную сумму не набралось.
    // Предупреждение о неосвоенном есть, но только при разнице больше 10 %.
    const totalBudget   = spentBudget;
    const totalPlays   = perRegion.reduce((a,r)=> a + (Number(r.plays)||0), 0);
    const totalScreens = Array.isArray(detail?.chosen) ? detail.chosen.length
      : perRegion.reduce((a,r)=> a + (Number(r.screens)||0), 0);

    const days = daysFromRaw();
    const hpd  = hoursPerDayFromRaw();
    const playsPerDay  = (days && totalPlays) ? (totalPlays/days) : null;
    const playsPerHour = (days && hpd && totalPlays) ? (totalPlays/days/hpd) : null;

    const otsValid = perRegion
      .map(r => Number(r.ots))
      .filter(v => Number.isFinite(v) && v > 0);
    const otsTotal = otsValid.length ? otsValid.reduce((a,b)=>a+b,0) : null;

    // raw -- читаем summary text (теперь он уже записан ДО dispatchEvent)
    const raw = el("summary")?.textContent || "";
    // Warnings: prefer direct array from event detail, fallback to parsing raw text
    const warnArr = Array.isArray(detail?.warnings) && detail.warnings.length
      ? detail.warnings
      : raw.split("\\n").filter(l => l.trim().startsWith("\\u26A0\\uFE0F")).map(l => l.replace(/^\\u26A0\\uFE0F\\s*/, ""));

    const warnsHtml = warnArr.length
      ? \`<div class="ps-warn"><b class="ps-warn-h">Предупреждения</b>\${warnArr.map(x => \`<div class="ps-warn-item">\${x.replace(/^\\u26A0\\uFE0F\\s*/, "")}</div>\`).join("")}</div>\`
      : "";

    const regionCards = perRegion
      .slice()
      .sort((a,b)=> (Number(b.budget||0)-Number(a.budget||0)))
      .map(r => {
        const ots = (Number.isFinite(Number(r.ots)) && Number(r.ots)>0) ? fmtInt(r.ots) : "\\u2014";
        const note = String(r.note || "").trim();
        return \`
          <div class="ps-card">
            <div class="ps-region-top">
              <div>
                <div class="ps-region-name">\${r.region === "__gid_mode__" ? "По GID-списку" : String(r.region || "\\u2014")}</div>
                <div class="ps-sub">\${note || "Разбивка по региону"}</div>
              </div>
              <div class="ps-chip">\${fmtInt(r.screens)} экранов</div>
            </div>

            <div class="ps-mini">
              <span><b>Бюджет:</b> \${fmtMoney(r.budget)}</span>
              <span><b>Выходов:</b> \${fmtInt(r.plays)}</span>
              <span><b>OTS:</b> \${ots}</span>
              \${(days && hpd && r.plays > 0 && r.screens > 0) ? \`<span><b>Частота:</b> \${(r.plays / days / hpd / r.screens).toFixed(1).replace(".", ",")}/ч на экран</span>\` : ""}
            </div>
          </div>
        \`;
      }).join("");

    // Per-format breakdown
    const fs = detail?.formatStats || {};
    const fsByRegion = detail?.formatStatsByRegion || {};

    const esc = s => String(s||"").replace(/[&<>]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
    const DASH = String.fromCharCode(8212);
    const NBSP = String.fromCharCode(160);

    // Доля бюджета формата пропорциональна «экраны x стоимость выхода» —
    // тому же произведению, по которому бюджет и раскладывается в расчёте.
    function fmtRows(stats){
      const entries = Object.entries(stats).map(([fmtName, fd]) => ({
        fmtName, fd, w: (Number(fd.screens) || 0) * (Number(fd.costPerPlay) || 0)
      }));
      const wSum = entries.reduce((acc, x) => acc + x.w, 0);
      return entries
        .sort((x, y) => (y.w - x.w) || (y.fd.screens - x.fd.screens))
        .map(({ fmtName, fd, w }) => {
          // Слева форматы называются по-человечески (FORMAT_LABELS), а сюда
          // приходил сырой код из данных: «PVZ_SCREEN» вместо «Экраны в ПВЗ».
          const label = (window.FORMAT_LABELS?.[fmtName]?.label) || fmtName;
          const ots  = fd.otsPerPlay  != null ? fmtInt(fd.otsPerPlay) : DASH;
          const cost = fd.costPerPlay != null
            ? Number(fd.costPerPlay).toLocaleString("ru-RU", { maximumFractionDigits: 2 })
            : DASH;
          const share = wSum > 0 ? (w / wSum * 100) : 0;
          const shareTxt = share >= 1 ? Math.round(share) + NBSP + "%" : "<1" + NBSP + "%";
          const barW = Math.max(1, Math.round(share * 0.8));
          return "<tr><td>" + esc(label) + "</td>"
            + "<td>" + fmtInt(fd.screens) + "</td>"
            + "<td><span class='ux-bar' style='width:" + barW + "px'></span>" + shareTxt + "</td>"
            + "<td>" + cost + "</td>"
            + "<td>" + ots + "</td></tr>";
        }).join("");
    }

    // Итоговая строка: та же арифметика, что и в ленте метрик.
    function fmtFoot(label, screens, budget, plays, ots){
      const cost = (budget > 0 && plays > 0)
        ? (budget / plays).toLocaleString("ru-RU", { maximumFractionDigits: 2 }) : DASH;
      return "<tr><td>" + esc(label) + "</td><td>" + fmtInt(screens) + "</td>"
        + "<td>" + fmtMoney(budget) + "</td><td>" + cost + "</td>"
        + "<td>" + ((ots && plays) ? fmtInt(ots / plays) : DASH) + "</td></tr>";
    }

    const formatRows = fmtRows(fs);

    // Тот же вид, но по городам: клиент спрашивает не «сколько стоит
    // билборд вообще», а «сколько стоит билборд в Казани».
    const regionNames = Object.keys(fsByRegion);
    const formatRowsByRegion = regionNames.length < 2 ? "" : regionNames
      .sort((x, y) => (fsByRegion[y].budget || 0) - (fsByRegion[x].budget || 0))
      .map(rn => {
        const r = fsByRegion[rn];
        return "<tr class='ux-tbl-group'><td colspan=5>" + esc(rn)
          + "<span>" + fmtInt(r.screens) + " экр. " + String.fromCharCode(183) + " "
          + fmtMoney(r.budget) + "</span></td></tr>"
          + fmtRows(r.formats);
      }).join("");

    root.innerHTML = \`
      <div class="ps-wrap">
        <div class="ps-card">
          <div class="ps-head">
            <div>
              <div class="ps-title">Сводка кампании</div>
              <div class="ps-sub">Итоги и разбивка по регионам\${
                (targetBudget > spentBudget + 1)
                  ? " \u00B7 освоено " + Math.round(spentBudget).toLocaleString("ru-RU")
                    + "\u202F\u20BD из " + Math.round(targetBudget).toLocaleString("ru-RU")
                    + "\u202F\u20BD заданных"
                  : ""}</div>
            </div>

          </div>

          <div class="ps-grid ps-metrics">
            <div class="ps-metric"><div class="k">Экранов</div><div class="v">\${fmtInt(totalScreens)}</div></div>
            <div class="ps-metric"><div class="k">Выходов всего</div><div class="v">\${fmtInt(totalPlays)}</div></div>
            <div class="ps-metric"><div class="k">Стоимость выхода</div><div class="v">\${(totalBudget > 0 && totalPlays > 0) ? Math.round(totalBudget / totalPlays).toLocaleString("ru-RU") + "\u202f\\u20BD" : "\\u2014"}</div></div>
            <div class="ps-metric"><div class="k">OTS всего</div><div class="v">\${otsTotal == null ? "\\u2014" : fmtInt(otsTotal)}</div></div>
            <div class="ps-metric"><div class="k">Выходов / час на экран</div><div class="v">\${(playsPerHour != null && totalScreens > 0) ? (playsPerHour / totalScreens).toFixed(1).replace(".", ",") : "\\u2014"}</div></div>
            <div class="ps-metric"><div class="k">CPM (стоимость 1\u202f000 OTS)</div><div class="v">\${(totalBudget > 0 && otsTotal > 0) ? Math.round(totalBudget / otsTotal * 1000).toLocaleString("ru-RU") + "\u202f\\u20BD" : "\\u2014"}</div></div>
          </div>

          \${warnsHtml}
        </div>

        \${formatRows ? \`
        <div class="ps-card">
          <div class="ps-head">
            <div>
              <div class="ps-title">По форматам</div>
              <div class="ps-sub">Доля бюджета, стоимость выхода и охват</div>
            </div>
            \${formatRowsByRegion ? \`<div class="ux-seg" id="fmt-scope">
              <button type="button" data-scope="all" aria-pressed="true">Все города</button>
              <button type="button" data-scope="region" aria-pressed="false">По городам</button>
            </div>\` : ""}
          </div>
          <div class="ux-tbl-wrap" style="margin-top:12px;">
            <table class="ux-tbl" id="fmt-table" data-scope="all">
              <thead><tr>
                <th>Формат</th><th>Экр.</th><th>Доля бюджета</th>
                <th>Выход, \u20BD</th><th>OTS / выход</th>
              </tr></thead>
              <tbody class="scope-all">\${formatRows}</tbody>
              <tbody class="scope-region">\${formatRowsByRegion}</tbody>
              <tfoot class="scope-all">\${fmtFoot("Итого", totalScreens, totalBudget, totalPlays, otsTotal)}</tfoot>
            </table>
          </div>
        </div>\` : ""}

        <div class="ps-card">
          <details id="ps-regions-details" \${perRegion.length <= 3 ? "open" : ""}>
            <summary style="cursor:pointer; list-style:none; display:flex; align-items:center; justify-content:space-between; padding:2px 0;">
              <div>
                <div class="ps-title" style="display:inline;">По регионам</div>
                <span style="font-size:12px; color:#667085; margin-left:8px;">\${perRegion.length} \${perRegion.length===1?"регион":perRegion.length<5?"региона":"регионов"}</span>
              </div>
              <span class="ps-toggle-icon" style="font-size:18px; color:#5B3EF5; line-height:1;">\\u2304</span>
            </summary>
            <div class="ps-sub" style="margin-bottom:8px;">Бюджет / выходы / OTS по каждому выбранному региону</div>
            <div class="ps-regions">\${regionCards || \`<div class="ps-warn">Нет данных по регионам \\u2014 нажмите \\u00ABРассчитать\\u00BB.</div>\`}</div>
          </details>

          <details class="ps-details" style="margin-top:10px;">
            <summary>Техническая сводка (raw)</summary>
            <pre class="summary-pre" style="margin-top:10px;">\${raw.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}</pre>
          </details>
        </div>
      </div>
    \`;

    const pre = el("summary");
    if(pre) pre.style.display = "none";
  }

  function init(){
    const root = el("pretty-summary");
    if(root) root.innerHTML = \`<div class="ps-warn">Нажмите \\u00ABРассчитать\\u00BB, чтобы увидеть карточки по регионам.</div>\`;

    window.addEventListener("planner:calc-done", (e) => {
      render(e?.detail || {});
      if(window.PLANNER?.state) window.PLANNER.state.lastChosen = e?.detail?.chosen || [];
    });
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`);

  // Script block 14
  runScript(`
(function(){
  document.querySelectorAll('input[name="bid_mode"]').forEach(r => {
    r.addEventListener("change", () => {
      const isMin = document.getElementById("bid-mode-min")?.checked;
      const h1 = document.getElementById("bid-mode-hint-recommended");
      const h2 = document.getElementById("bid-mode-hint-min");
      if(h1) h1.style.display = isMin ? "none" : "block";
      if(h2) h2.style.display = isMin ? "block" : "none";
    });
  });
})();
`);

  // Script block 14b — «Длительность ролика»: чипы строятся из durationBidInfo,
  // ставка за выбранную длительность применяется через window.PLANNER.applySelectedDuration.
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }
  // Ноль приходит из инвентаря отдельной длительностью, но означает не
  // «ролик на ноль секунд», а «без привязки»: экран берётся по базовой ставке.
  function fmtSec(ms){ return ms > 0 ? Math.round(ms / 1000) + " сек" : "Любая"; }

  // Длительности, которые правда есть у экранов текущего пула (регионы либо
  // список GID-ов + выбранные форматы). Ноль добавляем всегда: «Любая» — это
  // не слот, а отказ от привязки, и он доступен на любом экране.
  function poolDurations(){
    var pool = window.PLANNER && typeof window.PLANNER.planningPoolScreens === "function"
      ? window.PLANNER.planningPoolScreens() : null;
    if (!Array.isArray(pool) || !pool.length) return null;
    var set = new Set();
    pool.forEach(function(s){
      if (!Array.isArray(s.durationBidInfo)) return;
      s.durationBidInfo.forEach(function(d){ if (Number.isFinite(d.duration)) set.add(d.duration); });
    });
    if (!set.size) return null;
    return set;
  }

  function collectDurations(){
    var st = window.PLANNER && window.PLANNER.state;
    // Канонический список с /inventories/available-durations — не зависит от того,
    // что уже успело подгрузиться в screensAll. Фолбэк — union из текущего инвентаря.
    var all;
    if (st && Array.isArray(st.availableDurationsMs) && st.availableDurationsMs.length) {
      all = st.availableDurationsMs.slice();
    } else {
      var screens = (st && Array.isArray(st.screensAll)) ? st.screensAll : [];
      var set = new Set();
      screens.forEach(function(s){
        if (!Array.isArray(s.durationBidInfo)) return;
        s.durationBidInfo.forEach(function(d){ if (Number.isFinite(d.duration)) set.add(d.duration); });
      });
      all = [...set];
    }
    // Сужаем до пула. Если пул пуст (инвентарь ещё грузится, регион не выбран) —
    // оставляем полный список: пустой блок хуже лишнего чипа.
    var есть = poolDurations();
    if (есть) {
      var сужено = all.filter(function(ms){ return ms === 0 || есть.has(ms); });
      if (сужено.length) all = сужено;
    }
    return all.sort(function(a,b){ return a - b; });
  }

  function renderDurationChips(){
    var block = el("duration-block");
    var wrap = el("duration-chips");
    if (!block || !wrap) return;
    var durations = collectDurations();
    if (!durations.length) { block.style.display = "none"; return; }
    block.style.display = "";

    var st = window.PLANNER.state;
    // Множественный выбор: экран, поддерживающий два выбранных ролика, для
    // расчёта ставки идёт как два, а в адресной программе остаётся одним.
    if (!Array.isArray(st.selectedDurationsMs)) st.selectedDurationsMs = [];
    st.selectedDurationsMs = st.selectedDurationsMs.filter(function(ms){ return durations.includes(ms); });
    if (!st.selectedDurationsMs.length) st.selectedDurationsMs = [durations[0]];

    function apply(){
      if (typeof window.PLANNER.applySelectedDurations === "function") {
        window.PLANNER.applySelectedDurations(st.selectedDurationsMs);
      }
    }

    wrap.innerHTML = "";
    durations.forEach(function(ms){
      var label = document.createElement("label");
      label.className = "str-chip";
      var active = st.selectedDurationsMs.includes(ms);
      label.innerHTML = "<input type=\\"checkbox\\" name=\\"duration_ms\\" value=\\"" + ms + "\\"" + (active ? " checked" : "") + ">" +
        "<div class=\\"str-chip-body\\"><div class=\\"str-chip-title\\">" + fmtSec(ms) + "</div></div>";
      label.querySelector("input").addEventListener("change", function(e){
        var on = e.target.checked;
        var next = st.selectedDurationsMs.filter(function(v){ return v !== ms; });
        if (on) next.push(ms);
        // «Любая» и конкретные длительности взаимоисключающи: смешивать
        // базовую ставку со ставками за ролик бессмысленно.
        if (on) next = (ms === 0) ? [0] : next.filter(function(v){ return v !== 0; });
        // Снять последнюю галку нельзя: без длительности ставку не посчитать.
        if (!next.length) {
          e.target.checked = true;
          window.PLANNER?.toast?.("Нужна хотя бы одна длительность.");
          return;
        }
        next.sort(function(a,b){ return a - b; });
        st.selectedDurationsMs = next;
        apply();
        renderDurationHint();
        window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      });
      wrap.appendChild(label);
    });
    // Применяем выбор сразу — на случай если инвентарь перезагрузился и minBid ещё «база»
    apply();
    renderDurationHint();
  }

  // ===== ДЛИТЕЛЬНОСТЬ ПО ФОРМАТАМ =====
  // Общий выбор задаёт длительность всем; здесь её можно переопределить
  // отдельному формату. Строка рисуется только для форматов, которые есть
  // в пуле, и только с теми длительностями, которые у них правда бывают.
  // Пул, из которого собирается план: те же экраны, что уйдут в расчёт.
  // Фолбэк на весь инвентарь — пока регион не выбран и пул пуст.
  function poolScreens(){
    const st = window.PLANNER?.state;
    const pool = (window.PLANNER && typeof window.PLANNER.planningPoolScreens === "function")
      ? window.PLANNER.planningPoolScreens() : null;
    if (Array.isArray(pool) && pool.length) return pool;
    return Array.isArray(st?.screensAll) && st.screensAll.length
      ? st.screensAll : (Array.isArray(st?.screens) ? st.screens : []);
  }

  function durationsOfFormat(fmt, pool){
    const all = pool || poolScreens();
    const set = new Set();
    for (const s of all){
      if (String(s.format||"").trim() !== fmt) continue;
      if (!Array.isArray(s.durationBidInfo)) continue;
      for (const d of s.durationBidInfo) if (Number.isFinite(d.duration)) set.add(d.duration);
    }
    return [...set].sort((a,b) => a - b);
  }

  function renderDurFmtRows(){
    const wrap = el("dur-fmt-rows");
    const block = el("duration-by-format");
    if (!wrap || !block) return;
    const st = window.PLANNER?.state;
    // Форматы берём из пула, а не из selectedFormats: в GID-режиме галок
    // форматов нет вовсе, а сузить список всё равно надо — до форматов
    // выбранных гидов. В обычном режиме пул уже отфильтрован по галкам,
    // так что результат тот же, только заодно отсекает форматы, которых
    // в выбранных регионах не оказалось.
    const pool = poolScreens();
    const order = (Array.isArray(st?.formatsAll) ? st.formatsAll : [])
      .map(x => String(x||"").trim()).filter(Boolean);
    const вПуле = new Set(pool.map(s => String(s.format||"").trim()).filter(Boolean));
    const fmts = order.filter(f => вПуле.has(f))
      .concat([...вПуле].filter(f => !order.includes(f)));
    if (!fmts.length){ block.style.display = "none"; return; }
    block.style.display = "";
    if (wrap.style.display === "none") return;

    if (!st.durationsByFormat) st.durationsByFormat = {};
    wrap.innerHTML = "";

    for (const fmt of fmts){
      const durs = durationsOfFormat(fmt, pool);
      if (durs.length < 2) continue;   // выбирать не из чего

      const row = document.createElement("div");
      row.className = "city-fmt-row";

      const lbl = document.createElement("span");
      lbl.className = "city-fmt-lbl";
      lbl.textContent = (window.FORMAT_LABELS?.[fmt]?.label) || fmt;
      lbl.title = fmt;
      row.appendChild(lbl);

      const own = st.durationsByFormat[fmt] || null;
      for (const ms of durs){
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "city-fmt-chip" + (own && own.includes(ms) ? " on" : "");
        chip.textContent = fmtSec(ms);
        chip.addEventListener("click", () => {
          const cur = st.durationsByFormat[fmt] ? [...st.durationsByFormat[fmt]] : [];
          const i = cur.indexOf(ms);
          if (i >= 0) cur.splice(i, 1); else cur.push(ms);
          // «Любая» и конкретные длительности взаимоисключающи — как и в общем выборе.
          const next = (ms === 0 && i < 0) ? [0] : cur.filter(v => v !== 0 || ms === 0);
          if (next.length) st.durationsByFormat[fmt] = next.sort((a,b) => a - b);
          else delete st.durationsByFormat[fmt];
          if (typeof window.PLANNER.applySelectedDurations === "function"){
            window.PLANNER.applySelectedDurations(st.selectedDurationsMs || []);
          }
          renderDurFmtRows();
          if (typeof window.refreshFoldValues === "function") window.refreshFoldValues();
          window.dispatchEvent(new CustomEvent("planner:filters-changed"));
        });
        row.appendChild(chip);
      }

      if (own && own.length){
        const rst = document.createElement("button");
        rst.type = "button";
        rst.className = "city-fmt-reset";
        rst.textContent = "по общему";
        rst.addEventListener("click", () => {
          delete st.durationsByFormat[fmt];
          if (typeof window.PLANNER.applySelectedDurations === "function"){
            window.PLANNER.applySelectedDurations(st.selectedDurationsMs || []);
          }
          renderDurFmtRows();
          if (typeof window.refreshFoldValues === "function") window.refreshFoldValues();
          window.dispatchEvent(new CustomEvent("planner:filters-changed"));
        });
        row.appendChild(rst);
      }

      wrap.appendChild(row);
    }

    if (!wrap.children.length){
      const none = document.createElement("div");
      none.className = "city-fmt-none";
      none.textContent = "У форматов в пуле по одной длительности — выбирать нечего.";
      wrap.appendChild(none);
    }
  }
  window.renderDurFmtRows = renderDurFmtRows;

  el("dur-fmt-toggle")?.addEventListener("click", () => {
    const wrap = el("dur-fmt-rows"), arr = el("dur-fmt-arrow");
    if (!wrap) return;
    const open = wrap.style.display === "none";
    wrap.style.display = open ? "flex" : "none";
    if (arr) arr.textContent = open ? "\u25BC" : "\u25B6";
    if (open) renderDurFmtRows();
  });

  window.addEventListener("planner:screens-ready", () => renderDurFmtRows());
  window.addEventListener("planner:filters-changed", () => renderDurFmtRows());

  // Подпись под чипами: при нескольких роликах правило неочевидно, и его надо
  // проговорить прямо в интерфейсе, а не оставлять на догадки.
  function renderDurationHint(){
    var block = el("duration-block");
    if (!block) return;
    var st = window.PLANNER && window.PLANNER.state;
    var n = (st && Array.isArray(st.selectedDurationsMs)) ? st.selectedDurationsMs.length : 0;
    var hint = el("duration-multi-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.id = "duration-multi-hint";
      hint.className = "planner-note";
      hint.style.marginTop = "8px";
      block.appendChild(hint);
    }
    if (n > 1) {
      hint.style.display = "";
      hint.textContent = "Выбрано роликов: " + n + ". Экран, на котором идут несколько роликов, "
        + "в расчёте ставки считается за столько же экранов, а в адресной программе остаётся одним.";
    } else {
      hint.style.display = "none";
    }
  }

  window.renderDurationChips = renderDurationChips;
  window.addEventListener("planner:screens-ready", renderDurationChips);
  window.addEventListener("planner:filters-changed", renderDurationChips);
  renderDurationChips();
})();
`);

  // Script block 14c — «Сторона экрана A/Б»: блок показываем только если у
  // инвентаря реально есть нормализованные значения side; чекбоксы пишут
  // выбор в state.selectedSides, который читает planner.js (onCalcClick + preview).
  runScript(`
(function(){
  function hasSideData(){
    var st = window.PLANNER && window.PLANNER.state;
    var screens = (st && Array.isArray(st.screensAll)) ? st.screensAll : [];
    return screens.some(function(s){ return s.side === "A" || s.side === "B"; });
  }

  // В GID-режиме сторона уже задана выбором конкретного экрана, фильтр по ней
  // не нужен. Блок лежит в GID_HIDDEN, но эта функция висит на
  // planner:filters-changed и возвращала его на экран после любой правки
  // длительности — она перекрывала решение applyGidVisibility.
  function isGidMode(){
    var b = document.getElementById("geo-gids-block");
    return !!(b && b.style.display !== "none");
  }

  function renderSideBlock(){
    var block = document.getElementById("side-block");
    if (!block) return;
    block.style.display = (!isGidMode() && hasSideData()) ? "" : "none";
  }

  // Сколько экранов в каждом состоянии — иначе непонятно, что даст фильтр.
  // Считаем по той же функции, что и расчёт, чтобы «Авто» старше полугода
  // попадало в «Нет» и здесь.
  function renderPhotoReportBlock(){
    var block = document.getElementById("photo-report-block");
    if (!block) return;
    var st = window.PLANNER && window.PLANNER.state;
    var all = (st && Array.isArray(st.screensAll)) ? st.screensAll : [];
    var fn = window.PLANNER && window.PLANNER.photoReportOf;
    if (isGidMode() || !all.length || !fn) { block.style.display = "none"; return; }
    var счёт = { YES: 0, AUTO: 0, NO: 0, "": 0 };
    for (var i = 0; i < all.length; i++) счёт[fn(all[i])]++;
    // Ни у одного экрана нет значения — фильтровать нечем, блок не показываем.
    if (!счёт.YES && !счёт.AUTO && !счёт.NO) { block.style.display = "none"; return; }
    block.style.display = "";
    var note = document.getElementById("photo-report-counts");
    if (note) note.textContent = "В инвентаре: да — " + счёт.YES.toLocaleString("ru-RU")
      + ", авто — " + счёт.AUTO.toLocaleString("ru-RU")
      + ", нет — " + счёт.NO.toLocaleString("ru-RU")
      + (счёт[""] ? ", без данных — " + счёт[""].toLocaleString("ru-RU") : "");
  }

  function bindPhotoReportCheckboxes(){
    var st = window.PLANNER && window.PLANNER.state;
    if (!st) return;
    if (!st.selectedPhotoReport) st.selectedPhotoReport = new Set();
    ["pr-yes", "pr-auto", "pr-no"].forEach(function(id){
      var cb = document.getElementById(id);
      if (!cb || cb._prBound) return;
      cb._prBound = true;
      cb.checked = st.selectedPhotoReport.has(cb.value);
      cb.addEventListener("change", function(){
        if (cb.checked) st.selectedPhotoReport.add(cb.value);
        else st.selectedPhotoReport.delete(cb.value);
        window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      });
    });
  }

  function bindSideCheckboxes(){
    var st = window.PLANNER && window.PLANNER.state;
    if (!st) return;
    if (!st.selectedSides) st.selectedSides = new Set();
    ["side-a", "side-b"].forEach(function(id){
      var cb = document.getElementById(id);
      if (!cb || cb._sideBound) return;
      cb._sideBound = true;
      cb.checked = st.selectedSides.has(cb.value);
      cb.addEventListener("change", function(){
        if (cb.checked) st.selectedSides.add(cb.value); else st.selectedSides.delete(cb.value);
        window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      });
    });
  }

  function init(){
    bindPhotoReportCheckboxes();
    renderPhotoReportBlock();
    bindSideCheckboxes();
    renderSideBlock();
  }

  window.addEventListener("planner:screens-ready", function(){
    bindPhotoReportCheckboxes(); renderPhotoReportBlock();
    bindSideCheckboxes(); renderSideBlock();
  });
  window.addEventListener("planner:filters-changed", function(){
    renderSideBlock(); renderPhotoReportBlock();
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
`);

  // Script block 15
  runScript(`
(function(){
  function fmtN(n){ return Math.round(n).toLocaleString("ru-RU"); }

  function updateMini(preview){
    const mini = document.getElementById("pool-mini-badge");
    const miniCnt = document.getElementById("pool-mini-count");
    const miniFilters = document.getElementById("pool-mini-filters");
    if(!mini) return;
    if(!preview || !preview.countFinal){
      mini.style.display = "none";
      return;
    }
    mini.style.display = "flex";
    if(miniCnt) miniCnt.textContent = fmtN(preview.countFinal);
    // Краткая подсказка о применённых фильтрах
    if(miniFilters){
      const parts = [];
      if(preview.hasGrpFilter) parts.push("GRP");
      if(preview.hasOwnerFilter) parts.push("операторы");
      if(preview.hasAffinityFilter) parts.push("VK");
      miniFilters.textContent = parts.length ? "(" + parts.join(", ") + ")" : "";
    }
  }

  function renderPoolPreview(){
    const box = document.getElementById("pool-preview-content");
    const badge = document.getElementById("pool-count-badge");
    if(!box) return;
    const preview = window.PLANNER?.computePoolPreview?.();

    if(!preview){
      box.innerHTML = '<span style="color:#667085">Укажите регионы, чтобы увидеть объём доступного инвентаря.</span>';
      if(badge) badge.textContent = "";
      updateMini(null);
      return;
    }

    const { countBase, countAfterGrp, countAfterOwners, countAfterAffinity, countFinal, hasGrpFilter, hasOwnerFilter, hasAffinityFilter } = preview;

    let html = \`<div class="pool-preview-row">\`;
    html += \`<span class="pool-preview-base">Базовый пул: \${fmtN(countBase)} экр.</span>\`;

    if(hasGrpFilter && countAfterGrp !== null){
      const drop = countBase - countAfterGrp;
      const pct = countBase > 0 ? Math.round(countAfterGrp / countBase * 100) : 0;
      html += \`<span class="pool-preview-arrow">\\u2192</span>\`;
      html += \`<span class="pool-preview-filter">GRP: <b>\${fmtN(countAfterGrp)}</b><span class="pool-preview-pct"> \\u2212\${fmtN(drop)} (\${pct}%)</span></span>\`;
    }

    if(hasOwnerFilter && countAfterOwners !== null){
      const base2 = hasGrpFilter && countAfterGrp !== null ? countAfterGrp : countBase;
      const drop = base2 - countAfterOwners;
      const pct = base2 > 0 ? Math.round(countAfterOwners / base2 * 100) : 0;
      html += \`<span class="pool-preview-arrow">\\u2192</span>\`;
      html += \`<span class="pool-preview-filter">Операторы: <b>\${fmtN(countAfterOwners)}</b><span class="pool-preview-pct"> \\u2212\${fmtN(drop)} (\${pct}%)</span></span>\`;
    }

    if(hasAffinityFilter && countAfterAffinity !== null){
      html += \`<span class="pool-preview-arrow">\\u2192</span>\`;
      html += \`<span class="pool-preview-filter">Аудитория (VK): <b>\${fmtN(countAfterAffinity)}</b></span>\`;
    }

    if(hasGrpFilter || hasOwnerFilter || hasAffinityFilter){
      html += \`<span class="pool-preview-arrow">\\u2192</span>\`;
      html += \`<span class="pool-preview-base">Итого: \${fmtN(countFinal)} экр.</span>\`;
    }

    html += \`</div>\`;

    // Предупреждение: заданное кол-во конструкций больше доступного пула
    const constrEnabled = document.getElementById("constructions-enabled")?.checked;
    const constrCount = parseInt(document.getElementById("constructions-count")?.value || "0", 10);
    if(constrEnabled && constrCount > 0 && countFinal < constrCount){
      html += \`<div style="margin-top:8px;padding:7px 10px;background:#fff3cd;border:1px solid #ffc107;border-radius:8px;font-size:12px;color:#856404;">
        \\u26A0\\uFE0F Доступно только <b>\${fmtN(countFinal)}</b> экранов с текущими фильтрами \\u2014 лимит <b>\${fmtN(constrCount)}</b> будет снижен автоматически.
      </div>\`;
    }

    box.innerHTML = html;
    if(badge) badge.textContent = preview.countFinal.toLocaleString("ru-RU");
    updateMini(preview);
  }

  // Обновлять при любом изменении фильтров
  window.addEventListener("planner:screens-ready", renderPoolPreview);
  window.addEventListener("planner:pool-updated", renderPoolPreview);
  window.addEventListener("planner:affinity-loaded", renderPoolPreview);
  // Клики по карточкам форматов и операторов диспатчат planner:filters-changed
  window.addEventListener("planner:filters-changed", () => setTimeout(renderPoolPreview, 50));

  // Делегируем на изменения фильтров через события
  document.addEventListener("change", (e) => {
    const t = e.target;
    if(!t) return;
    const id = t.id || "";
    const name = t.name || "";
    if(id === "grp-enabled" || id === "grp-min" || id === "grp-max" ||
       id === "constructions-enabled" || id === "constructions-count" ||
       id === "audience-enabled" || id === "audience-min-affinity" ||
       id === "manual-gids" ||
       name === "reach_mode" || name === "bid_mode" ||
       t.closest?.("#owner-wrap") || t.closest?.("#formats-wrap") ||
       t.closest?.("#audience-segment-wrap")){
      setTimeout(renderPoolPreview, 50);
    }
  });
  document.addEventListener("input", (e) => {
    const t = e.target;
    if(!t) return;
    const id = t.id || "";
    // manual-gids: в GID-режиме пул задаёт именно он. Без этого счётчик так и
    // висел с надписью «укажите регионы», хотя экраны уже были перечислены.
    if(id === "grp-min" || id === "grp-max" || id === "constructions-count" ||
       id === "manual-gids"){
      setTimeout(renderPoolPreview, 80);
    }
  });
  document.addEventListener("click", (e) => {
    const t = e.target;
    if(!t) return;
    // Карточки форматов, кнопки пресетов, операторы
    if(t.id === "owner-all" || t.id === "owner-clear" ||
       t.closest?.("#formats-presets") || t.closest?.("#owner-wrap") ||
       t.closest?.("#formats-wrap")){
      setTimeout(renderPoolPreview, 100);
    }
  });

  // Первый рендер при готовности
  if(window.PLANNER?.ready) renderPoolPreview();
})();
`);

  // Script block 16
  runScript(`
(function(){
  const el = (id) => document.getElementById(id);

  function getMode(){
    return document.querySelector('input[name="budget_mode"]:checked')?.value || "fixed";
  }

  function sync(){
    const mode = getMode();
    const budgetWrap = el("budget-input-wrap");
    const goalWrap = el("goal-ots-wrap");
    const recoHint = el("budget-reco-hint");

    if (budgetWrap) budgetWrap.style.display = (mode === "fixed") ? "block" : "none";
    if (goalWrap) goalWrap.style.display = (mode === "goal_ots") ? "block" : "none";
    if (recoHint) recoHint.style.display = (mode === "recommendation") ? "block" : "none";

    const playsWrap = el("goal-plays-wrap");
    if (playsWrap) playsWrap.style.display = (mode === "goal_plays") ? "block" : "none";

    if (mode === "goal_ots") {
      const inp = el("goal-ots");
      if (inp) setTimeout(() => inp.focus(), 50);
    }
  }

  document.querySelectorAll('input[name="budget_mode"]').forEach(r => r.addEventListener("change", sync));
  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync);
  else sync();
})();
`);


  // Script block 17
  runScript(`
(function(){
  if (typeof window.tierWeight === "function") return;

  window.tierWeight = function(tier){
    const t = String(tier ?? "").trim().toUpperCase();

    const mapABC = { "A": 1.35, "B": 1.15, "C": 1.00, "D": 0.90, "E": 0.80 };
    const mapNum = { "1": 1.35, "2": 1.15, "3": 1.00, "4": 0.90, "5": 0.80 };

    if (mapABC[t] != null) return mapABC[t];
    if (mapNum[t] != null) return mapNum[t];

    const m = t.match(/([1-5])/);
    if (m && mapNum[m[1]] != null) return mapNum[m[1]];

    return 1.0;
  };

  console.log("[shim] tierWeight installed");
})();
`);

  // Script block 18
  runScript(`
(function(){
  const el = (id)=>document.getElementById(id);

  function fmtInt(n){
    const x = Number(n||0);
    return x.toLocaleString("ru-RU");
  }
  function fmtMoney(n){
    const x = Number(n||0);
    return x.toLocaleString("ru-RU") + " \\u20BD";
  }

  function renderBars({ title, rows, valueKey, formatFn }){
    const max = Math.max(...rows.map(r => Number(r[valueKey]||0)), 1);

    const items = rows.map(r=>{
      const v = Number(r[valueKey]||0);
      const pct = Math.round((v / max) * 100);
      return \`
        <div class="bar-row">
          <div class="bar-lbl">\${r.label}</div>
          <div class="bar"><i style="width:\${pct}%"></i></div>
          <div class="bar-val">\${formatFn(v)}</div>
        </div>
      \`;
    }).join("");

    return \`
      <div class="chart-card">
        <div class="chart-title">\${title}</div>
        \${items}
      </div>
    \`;
  }

  function renderCharts(detail){
    const root = el("charts");
    if(!root) return;

    const byWeekday = Array.isArray(detail?.byWeekday) ? detail.byWeekday : [];
    const byDate    = Array.isArray(detail?.byDate) ? detail.byDate : [];

    if(!byWeekday.length && !byDate.length){
      root.innerHTML = "";
      return;
    }

    let html = "";

    if(byWeekday.length){
      html += renderBars({
        title: "По дням недели (бюджет)",
        rows: byWeekday,
        valueKey: "budget",
        formatFn: fmtMoney
      });
    }

    if(byDate.length){
      html += renderBars({
        title: "По датам (выходы)",
        rows: byDate.map(d => ({ label: d.label || d.date || "\\u2014", ...d })),
        valueKey: "plays",
        formatFn: fmtInt
      });
    }

    root.innerHTML = html;
  }

  window.addEventListener("planner:calc-done", (e)=>renderCharts(e?.detail || {}));
})();
`);

  // Script block 19
  runScript(`
(function(){
  const el = (id) => document.getElementById(id);

  // Дни недели со строковыми ключами (совпадают с planner.js)
  const DAYS = [
    { key: "mon", label: "Пн" },
    { key: "tue", label: "Вт" },
    { key: "wed", label: "Ср" },
    { key: "thu", label: "Чт" },
    { key: "fri", label: "Пт" },
    { key: "sat", label: "Сб" },
    { key: "sun", label: "Вс" },
  ];

  const BAR_FROM = "00:00";
  const BAR_TO   = "23:59";

  function ensureState(){
    window.PLANNER = window.PLANNER || {};
    window.PLANNER.state = window.PLANNER.state || {};
    const st = window.PLANNER.state;
    // Модель: блоки [{days:{mon,...}, times:[{from,to},...]}]
    if(!st.weeklyGroups){
      st.weeklyGroups = [
        { days:{mon:true,tue:true,wed:true,thu:true,fri:true,sat:false,sun:false},
          times:[{from:"07:00",to:"22:00"}] }
      ];
    }
    return st;
  }

  function timeToMin(t){
    const [h,m] = String(t||"00:00").split(":").map(Number);
    if(!Number.isFinite(h) || !Number.isFinite(m)) return 0;
    return h*60 + m;
  }

  function minToTime(min){
    const h = Math.floor(min/60);
    const m = min%60;
    return String(h).padStart(2,"0")+":"+String(m).padStart(2,"0");
  }

  function clamp(n, a, b){ return Math.min(b, Math.max(a, n)); }

  function normalizeIntervals(list){
    const arr = (Array.isArray(list) ? list : [])
      .map(x => ({ from: x.from, to: x.to }))
      .filter(x => x.from && x.to);

    const cleaned = arr
      .map(x => {
        let a = timeToMin(x.from);
        let b = timeToMin(x.to);
        if(b <= a) b = a + 15;
        return { from: minToTime(a), to: minToTime(b) };
      })
      .sort((x,y)=> timeToMin(x.from)-timeToMin(y.from));

    return cleaned;
  }

  function buildDaySubtitle(enabled, intervals){
    if(!enabled) return "выключено";
    const n = intervals.length;
    if(!n) return "нет интервалов";
    if(n === 1) return \`\${intervals[0].from}\\u2013\${intervals[0].to}\`;
    return \`\${n} интервала\`;
  }

  function renderBars(container, enabled, intervals){
    container.innerHTML = "";
    const hint = document.createElement("div");
    hint.className = "wd-barhint";
    hint.textContent = enabled ? \`Визуализация (шкала \${BAR_FROM}\\u2013\${BAR_TO})\` : "\\u2014";
    container.appendChild(hint);

    if(!enabled) return;

    const line = document.createElement("div");
    line.className = "wd-barline";
    container.appendChild(line);

    const baseA = timeToMin(BAR_FROM);
    const baseB = timeToMin(BAR_TO);
    const span = Math.max(1, baseB - baseA);

    intervals.forEach(intv => {
      const a = clamp(timeToMin(intv.from), baseA, baseB);
      const b = clamp(timeToMin(intv.to),   baseA, baseB);
      if(b <= a) return;

      const leftPct = ((a - baseA) / span) * 100;
      const widthPct = ((b - a) / span) * 100;

      const seg = document.createElement("div");
      seg.className = "wd-seg";
      seg.style.left = leftPct + "%";
      seg.style.width = widthPct + "%";
      line.appendChild(seg);
    });
  }

  function makeDayPills(grpIdx, grp, card){
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:5px;flex-wrap:wrap;margin-bottom:10px;";
    DAYS.forEach(d => {
      const lbl = document.createElement("label");
      const checked = !!grp.days[d.key];
      lbl.style.cssText = \`display:inline-flex;align-items:center;cursor:pointer;
        font-size:13px;padding:4px 10px;border-radius:8px;user-select:none;
        border:1.5px solid \${checked?"#5b3ef5":"#ddd"};
        background:\${checked?"#f4f1ff":"#fff"};\`;
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = checked; cb.style.display = "none";
      cb.addEventListener("change", () => {
        grp.days[d.key] = cb.checked;
        lbl.style.borderColor = cb.checked ? "#5b3ef5" : "#ddd";
        lbl.style.background   = cb.checked ? "#f4f1ff" : "#fff";
        refreshGroupBars(grpIdx, card);
        if(typeof window.renderProgress === "function") window.renderProgress();
      });
      lbl.addEventListener("click", () => { cb.checked = !cb.checked; cb.dispatchEvent(new Event("change")); });
      lbl.appendChild(cb);
      lbl.appendChild(document.createTextNode(d.label));
      row.appendChild(lbl);
    });
    return row;
  }

  function makeTimeRow(grpIdx, grp, tIdx, card){
    const t = grp.times[tIdx];
    const row = document.createElement("div");
    row.style.cssText = "display:flex;align-items:center;gap:6px;margin-bottom:6px;";
    row.innerHTML = \`
      <input type="time" class="ux-input wd-from" value="\${t.from}" style="width:105px;">
      <span style="color:#aaa;">\\u2014</span>
      <input type="time" class="ux-input wd-to"   value="\${t.to}"   style="width:105px;">
      <button type="button" class="wd-remove" style="margin-left:auto;font-size:18px;line-height:1;padding:0 6px;" title="Удалить время">\\u00D7</button>
    \`;
    row.querySelector(".wd-from").addEventListener("change", e => {
      grp.times[tIdx].from = e.target.value;
      refreshGroupBars(grpIdx, card);
      if(typeof window.renderProgress === "function") window.renderProgress();
    });
    row.querySelector(".wd-to").addEventListener("change", e => {
      grp.times[tIdx].to = e.target.value;
      refreshGroupBars(grpIdx, card);
      if(typeof window.renderProgress === "function") window.renderProgress();
    });
    row.querySelector(".wd-remove").addEventListener("click", () => {
      grp.times.splice(tIdx, 1);
      renderWeeklyUI();
      if(typeof window.renderProgress === "function") window.renderProgress();
    });
    return row;
  }

  function refreshGroupBars(grpIdx, card){
    const st = ensureState();
    const barsEl = card.querySelector(".wd-bars");
    if(barsEl) renderBars(barsEl, true, st.weeklyGroups[grpIdx].times);
  }

  function renderWeeklyUI(){
    const st = ensureState();
    const wrap = el("weekly-days");
    if(!wrap) return;
    wrap.innerHTML = "";

    st.weeklyGroups.forEach((grp, grpIdx) => {
      const card = document.createElement("div");
      card.className = "wd-card";
      card.style.marginBottom = "14px";

      // Header row: "Блок N" + удалить
      const hdr = document.createElement("div");
      hdr.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";
      hdr.innerHTML = \`
        <span style="font-size:12px;font-weight:600;color:#667085;text-transform:uppercase;letter-spacing:.5px;">
          Блок \${grpIdx + 1}
        </span>
        <button type="button" class="wd-remove" style="font-size:12px;padding:2px 8px;">Удалить блок</button>
      \`;
      hdr.querySelector(".wd-remove").addEventListener("click", () => {
        st.weeklyGroups.splice(grpIdx, 1);
        renderWeeklyUI();
        if(typeof window.renderProgress === "function") window.renderProgress();
      });
      card.appendChild(hdr);

      // Day pills
      card.appendChild(makeDayPills(grpIdx, grp, card));

      // Time rows
      const timesWrap = document.createElement("div");
      timesWrap.className = "wd-times-wrap";
      grp.times.forEach((_, tIdx) => timesWrap.appendChild(makeTimeRow(grpIdx, grp, tIdx, card)));
      card.appendChild(timesWrap);

      // Add time button
      const addTime = document.createElement("button");
      addTime.type = "button"; addTime.className = "wd-btn";
      addTime.style.cssText = "font-size:12px;padding:4px 12px;margin-top:4px;";
      addTime.textContent = "+ Добавить время";
      addTime.addEventListener("click", () => {
        const last = grp.times[grp.times.length - 1];
        const start = last ? clamp(timeToMin(last.to), timeToMin(BAR_FROM), timeToMin(BAR_TO)-15) : 7*60;
        grp.times.push({ from: minToTime(start), to: minToTime(clamp(start+60,start+15,timeToMin(BAR_TO))) });
        renderWeeklyUI();
        if(typeof window.renderProgress === "function") window.renderProgress();
      });
      card.appendChild(addTime);

      // Time bar
      const bars = document.createElement("div");
      bars.className = "wd-bars"; bars.style.marginTop = "8px";
      renderBars(bars, true, grp.times);
      card.appendChild(bars);

      wrap.appendChild(card);
    });

    // Add block button
    const addBlock = document.createElement("button");
    addBlock.type = "button"; addBlock.className = "wd-btn";
    addBlock.style.cssText = "width:100%;margin-top:4px;font-size:13px;padding:8px;";
    addBlock.textContent = "+ Добавить блок";
    addBlock.addEventListener("click", () => {
      st.weeklyGroups.push({
        days:{mon:false,tue:false,wed:false,thu:false,fri:false,sat:true,sun:true},
        times:[{from:"10:00",to:"20:00"}]
      });
      renderWeeklyUI();
      if(typeof window.renderProgress === "function") window.renderProgress();
    });
    wrap.appendChild(addBlock);
  }

  window.PLANNER_UI = window.PLANNER_UI || {};
  window.PLANNER_UI.renderWeeklyUI = renderWeeklyUI;

  window.PLANNER_UI.validateStep2Schedule = function(){
    const t = document.querySelector('input[name="schedule"]:checked')?.value || "all_day";
    if(t !== "weekly") return true;
    const st = ensureState();
    const groups = st.weeklyGroups || [];
    if(!groups.length) return false;
    for(const grp of groups){
      if(!grp.times?.length) return false;
      if(!DAYS.some(d => grp.days?.[d.key])) return false;
      for(const t of grp.times){
        if(!t.from || !t.to) return false;
        if(timeToMin(t.to) <= timeToMin(t.from)) return false;
      }
    }
    return true;
  };

  function syncScheduleVisibility(){
    const t = document.querySelector('input[name="schedule"]:checked')?.value || "all_day";
    const weekly = document.getElementById("weekly-wrap");
    if(weekly){
      const show = (t === "weekly");
      weekly.style.display = show ? "block" : "none";
      if(show) renderWeeklyUI();
    }
  }

  function bind(){
    document.querySelectorAll('input[name="schedule"]').forEach(r => {
      r.addEventListener("change", () => {
        syncScheduleVisibility();
        if(typeof window.renderProgress === "function") window.renderProgress();
      });
    });
    syncScheduleVisibility();
  }

  if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();
})();
`);

  // Script block 20
  runScript(`
(function(){
  const startEl = document.getElementById("date-start");
  const endEl   = document.getElementById("date-end");
  if(!startEl || !endEl) return;

  const errorNode = document.createElement("div");
  errorNode.className = "date-error";
  errorNode.textContent = "Дата окончания не может быть раньше даты начала.";
  endEl.closest(".planner-block")?.appendChild(errorNode);

  function clearError(){
    endEl.classList.remove("is-invalid");
    errorNode.style.display = "none";
  }

  function showError(){
    endEl.classList.add("is-invalid");
    errorNode.style.display = "block";
  }

  function syncMin(){
    const s = startEl.value;
    if(!s){
      endEl.min = "";
      clearError();
      return;
    }

    endEl.min = s;

    if(endEl.value && endEl.value < s){
      endEl.value = s;
      showError();
    } else {
      clearError();
    }

    if(typeof window.renderProgress === "function") window.renderProgress();
  }

  function validateEnd(){
    const s = startEl.value;
    const e = endEl.value;
    if(!s || !e){
      clearError();
      return;
    }

    if(e < s){
      endEl.value = s;
      showError();
    } else {
      clearError();
    }

    if(typeof window.renderProgress === "function") window.renderProgress();
  }

  startEl.addEventListener("change", syncMin);
  startEl.addEventListener("input", syncMin);

  endEl.addEventListener("change", validateEnd);
  endEl.addEventListener("input", syncMin);

  syncMin();
  window.addEventListener("pageshow", syncMin);
})();
`);

  // Script block 21 — НДС + комиссия
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }

  function fmtMoney(v){
    return Math.round(v).toLocaleString("ru-RU") + "\u202f\\u20BD";
  }

  function getActiveBudget(){
    const mode = document.querySelector('input[name="budget_mode"]:checked')?.value || "fixed";
    if(mode === "fixed")      return Number(el("budget-input")?.value  || 0);
    if(mode === "goal_ots")   return Number(el("goal-ots")?.value      || 0);
    if(mode === "goal_plays") return Number(el("goal-plays")?.value    || 0);
    return 0;
  }

  function update(){
    const budget = getActiveBudget();

    // --- НДС ---
    const vatOn   = !!el("vat-enabled")?.checked;
    const vatWrap = el("vat-rate-wrap");
    const vatDisp = el("vat-display");
    if(vatWrap) vatWrap.style.display = vatOn ? "flex" : "none";
    if(vatDisp){
      if(vatOn && budget > 0){
        const rate   = Math.max(0, Number(el("vat-rate")?.value ?? 22));
        const withVat = budget * (1 + rate / 100);
        vatDisp.style.display = "block";
        vatDisp.textContent   = "С НДС " + rate + "%: " + fmtMoney(withVat);
      } else {
        vatDisp.style.display = "none";
      }
    }

    // --- Комиссия ---
    const commOn   = !!el("commission-enabled")?.checked;
    const commWrap = el("commission-rate-wrap");
    const commDisp = el("commission-display");
    if(commWrap) commWrap.style.display = commOn ? "flex" : "none";
    if(commDisp){
      if(commOn && budget > 0){
        const rate = Math.max(0, Number(el("commission-rate")?.value || 0));
        if(rate > 0){
          const placement  = budget / (1 + rate / 100);
          const commission = budget - placement;
          commDisp.style.display = "block";
          commDisp.innerHTML =
            "Стоимость размещения: <b>" + fmtMoney(placement) + "</b>" +
            " &nbsp;/&nbsp; Комиссия: <b>" + fmtMoney(commission) + "</b>";
        } else {
          commDisp.style.display = "none";
        }
      } else {
        commDisp.style.display = "none";
      }
    }

    // --- Надбавка на клиента ---
    const markupRate = Math.max(0, Number(el("client-markup-rate")?.value || 0));
    const markupDisp = el("client-markup-display");
    if(markupDisp){
      if(markupRate > 0 && budget > 0){
        const clientBudget = budget * (1 + markupRate / 100);
        markupDisp.style.display = "block";
        markupDisp.innerHTML = "Клиентский бюджет: <b>" + fmtMoney(clientBudget) + "</b>";
      } else {
        markupDisp.style.display = "none";
      }
    }
  }

  ["vat-enabled","vat-rate","commission-enabled","commission-rate","client-markup-rate"].forEach(id => {
    el(id)?.addEventListener("change", update);
    el(id)?.addEventListener("input",  update);
  });

  el("budget-input")?.addEventListener("input", update);
  el("goal-ots")?.addEventListener("input", update);

  document.querySelectorAll('input[name="budget_mode"]').forEach(r =>
    r.addEventListener("change", update)
  );
})();
`);

  // Script block 21b — Send plan button
  runScript(`
(function(){
  const SEND_URL = "https://dsp-rag-telegram-bot-production.up.railway.app/send_plan";

  const btn   = document.getElementById("send-plan-btn");
  const popup = document.getElementById("send-plan-popup");
  const close = document.getElementById("send-plan-popup-close");
  if (!btn || !popup) return;

  window.addEventListener("planner:calc-done", () => {
    btn.style.display = "block";
  });

  close.addEventListener("click", () => popup.classList.remove("active"));
  popup.addEventListener("click", e => { if (e.target === popup) popup.classList.remove("active"); });

  btn.addEventListener("click", async () => {
    const calc = window.PLANNER?.lastCalc;
    if (!calc) return;

    btn.disabled = true;
    btn.textContent = "Отправляю\\u2026";

    const brief   = calc.brief || {};
    const meta    = calc.meta  || {};
    const email   = sessionStorage.getItem("dsp_user_email") || "";
    const formats = brief.formats?.selected?.length
      ? brief.formats.selected
      : (brief.formats?.mode === "auto" ? ["auto"] : []);

    const payload = {
      user_email:     email,
      regions:        brief.geo?.regions || [],
      date_start:     brief.dates?.start,
      date_end:       brief.dates?.end,
      budget:         meta.totalBudget,
      screens:        calc.chosen?.length ?? 0,
      plays:          meta.totalPlays,
      ots:            meta.totalOts,
      formats:        formats,
      selection_mode: brief.selection?.mode || "",
      bid_mode:       brief.bidMode || "",
      bid_uplift_pct: Number(brief.bidUpliftPct || 0),
      duration_sec:   Number.isFinite(Number(brief.duration?.ms)) && Number(brief.duration?.ms) > 0
                        ? Math.round(Number(brief.duration.ms) / 1000)
                        : null,
    };

    try {
      const form = new FormData();
      form.append("data", JSON.stringify(payload));

      if (typeof window.PLANNER?.buildMediaPlanBlob === "function") {
        try {
          const { blob, filename } = await window.PLANNER.buildMediaPlanBlob();
          form.append("file", blob, filename);
        } catch(e) { console.warn("Could not build xlsx for send:", e); }
      }

      const res  = await fetch(SEND_URL, { method: "POST", body: form });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || res.status);
      popup.classList.add("active");
    } catch(err) {
      alert("Не удалось отправить план: " + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "\\uD83D\\uDE80 Передать менеджеру";
    }
  });
})();
`);

  // Script block 21c — Per-region constructions (count + ppm) + per-format count
  runScript(`
(function(){
  let _lastRegionSig = "";
  let _lastFormatSig = "";

  function getRegions(){
    return Array.isArray(window.PLANNER?.state?.selectedRegions)
      ? window.PLANNER.state.selectedRegions.filter(Boolean) : [];
  }

  function getFormats(){
    const screens = window.PLANNER?.state?.screensAll || [];
    const fmts = [...new Set(screens.map(s => String(s.format || "").trim()).filter(Boolean))].sort();
    return fmts;
  }

  function renderRows(containerId, inputClass, keyAttr, unit, min, max, step, items) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const existing = {};
    container.querySelectorAll("." + inputClass).forEach(inp => {
      const k = inp.dataset[keyAttr]; if (k && inp.value) existing[k] = inp.value;
    });
    container.innerHTML = items.map(r => {
      const v = existing[r] || "";
      return \`<div class="cns-per-region-row">
        <span class="cns-per-region-label">\${r}</span>
        <input type="number" class="ux-input \${inputClass}" data-\${keyAttr}="\${r}"
          min="\${min}" max="\${max}" step="\${step}" placeholder="\\u2014" value="\${v}">
        <span class="cns-per-region-unit">\${unit}</span>
      </div>\`;
    }).join("");
  }

  const _opens = { cnt: false, ppm: false, fmt: false };

  function refreshVisibility(forceRender) {
    const regions   = getRegions();
    const formats   = getFormats();
    const regSig    = regions.join("|");
    const fmtSig    = formats.join("|");
    const multiReg  = regions.length >= 2;
    const multiFmt  = formats.length >= 2;
    const cnsActive = document.getElementById("constructions-enabled")?.checked;

    const showReg = multiReg && cnsActive;
    const showFmt = multiFmt && cnsActive;
    document.getElementById("cns-region-count-wrap").style.display = showReg ? "block" : "none";
    document.getElementById("cns-region-ppm-wrap").style.display   = showReg ? "block" : "none";
    document.getElementById("cns-format-count-wrap").style.display = showFmt ? "block" : "none";

    if (showReg && (regSig !== _lastRegionSig || forceRender)) {
      _lastRegionSig = regSig;
      if (_opens.cnt) renderRows("cns-region-count-rows", "cns-region-count-input", "region", "экр.", 1, 99999, 1, regions);
      if (_opens.ppm) renderRows("cns-region-ppm-rows",   "cns-region-ppm-input",   "region", "/ч",   1,    60, 1, regions);
    }
    if (!showReg) _lastRegionSig = "";

    if (showFmt && (fmtSig !== _lastFormatSig || forceRender)) {
      _lastFormatSig = fmtSig;
      if (_opens.fmt) renderRows("cns-format-count-rows", "cns-format-count-input", "format", "экр.", 0, 99999, 1, formats);
    }
    if (!showFmt) _lastFormatSig = "";
  }

  function makeToggle(btnId, arrowId, rowsId, openKey, inputClass, keyAttr, unit, min, max, getItems) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener("click", () => {
      _opens[openKey] = !_opens[openKey];
      const rows  = document.getElementById(rowsId);
      const arrow = document.getElementById(arrowId);
      if (rows)  rows.style.display  = _opens[openKey] ? "flex" : "none";
      if (arrow) arrow.textContent   = _opens[openKey] ? "\\u25BC" : "\\u25B6";
      if (_opens[openKey]) renderRows(rowsId, inputClass, keyAttr, unit, 1, max, 1, getItems());
    });
  }

  makeToggle("cns-region-count-toggle", "cns-region-count-arrow", "cns-region-count-rows", "cnt", "cns-region-count-input", "region", "экр.", 1, 99999, getRegions);
  makeToggle("cns-region-ppm-toggle",   "cns-region-ppm-arrow",   "cns-region-ppm-rows",   "ppm", "cns-region-ppm-input",   "region", "/ч",   1, 60,    getRegions);
  makeToggle("cns-format-count-toggle", "cns-format-count-arrow", "cns-format-count-rows", "fmt", "cns-format-count-input", "format", "экр.", 0, 99999, getFormats);

  document.getElementById("constructions-enabled")?.addEventListener("change", () => refreshVisibility(false));
  document.getElementById("constructions-chip")?.addEventListener("click", () => setTimeout(() => refreshVisibility(false), 50));
  window.addEventListener("planner:filters-changed", () => refreshVisibility(false));
  window.addEventListener("planner:screens-ready",   () => refreshVisibility(false));
  setInterval(() => refreshVisibility(false), 1500);
})();
`);

  // Script block 22a — Calc history panel
  runScript(`
(function(){
  const panel  = document.getElementById("calc-history-panel");
  const toggle = document.getElementById("calc-history-toggle");
  const list   = document.getElementById("calc-history-list");
  const arrow  = document.getElementById("calc-history-arrow");
  if (!panel || !toggle || !list) return;

  let expanded = false;

  function historyKey() {
    const email = sessionStorage.getItem("dsp_user_email") || "";
    if (!email) return null;
    return "planner_history_" + email.toLowerCase().replace(/[^a-z0-9._@-]/g, "_");
  }

  function fmtDate(iso) {
    if (!iso) return "";
    try {
      const d = new Date(iso);
      return d.toLocaleDateString("ru-RU", { day:"2-digit", month:"2-digit" })
           + " " + d.toLocaleTimeString("ru-RU", { hour:"2-digit", minute:"2-digit" });
    } catch(e) { return iso; }
  }

  function getHistory() {
    const key = historyKey();
    if (!key) return null;
    try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch(e) { return []; }
  }

  function renderList() {
    const history = getHistory();
    if (!history || !history.length) { list.innerHTML = ""; return; }
    list.innerHTML = history.map((entry, i) => {
      const s = entry.summary || {};
      const regions = (s.regions || entry.brief?.geo?.regions || []).join(", ") || "\\u2014";
      const budget  = s.totalBudget ? Math.floor(s.totalBudget).toLocaleString("ru-RU") + "\\u202F\\u20BD" : "\\u2014";
      const screens = s.screens != null ? s.screens + "\\u202Fэкр." : "";
      const plays   = s.totalPlays ? Math.floor(s.totalPlays).toLocaleString("ru-RU") + "\\u202Fвыходов" : "";
      const meta    = [screens, plays].filter(Boolean).join(" \\u00B7 ");
      const dates   = [s.dateStart, s.dateEnd].filter(Boolean).join(" \\u2192 ");
      return \`<div class="calc-history-item" data-idx="\${i}">
        <div class="calc-history-date">\${fmtDate(entry.ts)}</div>
        <div class="calc-history-title">\${regions}\${dates ? " \\u00B7 " + dates : ""}</div>
        <div class="calc-history-meta">\${budget}\${meta ? " \\u00B7 " + meta : ""}</div>
      </div>\`;
    }).join("");
    list.querySelectorAll(".calc-history-item").forEach(item => {
      item.addEventListener("click", () => {
        const history2 = getHistory();
        const entry = history2 && history2[Number(item.dataset.idx)];
        if (entry?.brief && typeof window.PLANNER?.restoreBriefToUI === "function") {
          window.PLANNER.restoreBriefToUI(entry.brief);
        }
      });
    });
  }

  function refreshVisibility() {
    const history = getHistory();
    const hasItems = Array.isArray(history) && history.length > 0;
    panel.style.display = hasItems ? "block" : "none";
    if (expanded && hasItems) renderList();
  }

  toggle.addEventListener("click", () => {
    expanded = !expanded;
    toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
    list.style.display = expanded ? "flex" : "none";
    if (arrow) arrow.textContent = expanded ? "\\u25BC" : "\\u25B6";
    if (expanded) renderList();
  });

  window.addEventListener("planner:history-updated", refreshVisibility);
  window.addEventListener("planner:calc-done", refreshVisibility);
  window.addEventListener("planner:screens-ready", refreshVisibility);
  setTimeout(refreshVisibility, 1500);
})();
`);

  // Script block 22 — Floating "Пересчитать" button
  runScript(`
(function(){
  const floatBtn = el("planner-recalc-float");
  const calcBtn  = el("calc-btn");
  if (!floatBtn || !calcBtn) return;

  let hideTimer = null;
  // Есть несохранённые правки брифа. Пока их нет, плавающей кнопке
  // показываться не с чем.
  let pending = false;

  // Основная кнопка на экране — плавающая была бы её дублем в двух
  // сантиметрах. Именно на это и жаловались.
  function calcBtnOnScreen() {
    const r = calcBtn.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    return r.bottom > 0 && r.top < window.innerHeight;
  }

  function showFloat(targetEl) {
    if (!window.PLANNER?.lastCalc) return; // только после первого расчёта
    pending = true;

    // Позиционируем по Y-центру изменённого элемента, прижимаем к правому краю
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const y = rect.top + rect.height / 2;
      // Держим кнопку в видимой зоне экрана
      const clampedY = Math.max(60, Math.min(window.innerHeight - 60, y));
      floatBtn.style.top = clampedY + "px";
    }
    sync();
  }

  // Решение о видимости в одном месте: его пересматривает и правка брифа,
  // и прокрутка — основная кнопка уезжает с экрана и возвращается.
  function sync() {
    if (pending && !calcBtnOnScreen()) {
      clearTimeout(hideTimer);
      floatBtn.style.display = "flex";
      floatBtn.style.opacity = "1";
    } else {
      hideFloat();
    }
  }

  function hideFloat() {
    if (floatBtn.style.display === "none") return;
    floatBtn.style.opacity = "0";
    hideTimer = setTimeout(() => { floatBtn.style.display = "none"; }, 200);
  }

  window.addEventListener("scroll", sync, { passive: true });
  window.addEventListener("resize", sync);

  // Слушаем любые изменения внутри виджета
  const widget = document.getElementById("planner-widget");
  if (widget) {
    widget.addEventListener("input",  (e) => showFloat(e.target));
    widget.addEventListener("change", (e) => showFloat(e.target));
  }

  // Форматы и операторы меняются через кастомный ивент (не input/change)
  window.addEventListener("planner:filters-changed", () => showFloat(null));

  // Клик по плавающей кнопке -- запускаем расчёт
  floatBtn.addEventListener("click", () => {
    pending = false;
    hideFloat();
    calcBtn.click();
  });

  // После завершения расчёта -- скрываем кнопку
  window.addEventListener("planner:calc-done", () => { pending = false; hideFloat(); });
})();
`);

  // Script block 22b — Manual exclusions bar
  runScript(`
(function(){
  const bar       = el("planner-exclusions-bar");
  const countEl   = el("planner-exclusions-count");
  const resetBtn  = el("planner-exclusions-reset");
  if (!bar || !countEl || !resetBtn) return;

  function updateBar() {
    const n = window.PLANNER?.state?.manuallyExcluded?.size || 0;
    if (n > 0) {
      countEl.textContent = n;
      bar.style.display = "block";
    } else {
      bar.style.display = "none";
    }
  }

  window.addEventListener("planner:screen-removed",   updateBar);
  window.addEventListener("planner:exclusions-cleared", updateBar);
  window.addEventListener("planner:calc-done",          updateBar);

  resetBtn.addEventListener("click", () => {
    if (window.PLANNER?.clearManualExclusions) window.PLANNER.clearManualExclusions();
    updateBar();
    // Trigger recalc so results reflect cleared exclusions
    const calcBtn = el("calc-btn");
    if (calcBtn && window.PLANNER?.lastCalc) calcBtn.click();
  });

  // GID-mode ppm slider label sync
  const gidPpm = el("gid-ppm");
  const gidPpmVal = el("gid-ppm-val");
  if (gidPpm && gidPpmVal) {
    gidPpm.addEventListener("input", () => {
      gidPpmVal.textContent = gidPpm.value;
      // Метка для уровней бюджета: дальше они этой частоте противоречат.
      gidPpm.dataset.touched = "1";
    });
  }
})();
`);

  // Script block 23 — Download settings gear popup
  runScript(`
(function(){
  const gearBtn = document.getElementById("dl-settings-btn");
  const popup   = document.getElementById("dl-settings-popup");
  const planBtn = document.getElementById("download-plan-xlsx");
  if (!gearBtn || !popup) return;

  // Persist checkbox settings to localStorage
  const DL_STORAGE_KEY = "dsp_dl_settings";
  const chkIds = ["dl-show-commission", "dl-show-vat", "dl-split-operator", "dl-download-map"];

  function loadDlSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(DL_STORAGE_KEY) || "{}");
      for (const id of chkIds) {
        const chk = document.getElementById(id);
        if (!chk) continue;
        if (id in saved) chk.checked = saved[id];
      }
    } catch(e) {}
  }

  function saveDlSettings() {
    try {
      const out = {};
      for (const id of chkIds) {
        const chk = document.getElementById(id);
        if (chk) out[id] = chk.checked;
      }
      localStorage.setItem(DL_STORAGE_KEY, JSON.stringify(out));
    } catch(e) {}
  }

  loadDlSettings();
  for (const id of chkIds) {
    const chk = document.getElementById(id);
    if (chk) chk.addEventListener("change", saveDlSettings);
  }

  gearBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const open = popup.style.display !== "none";
    popup.style.display = open ? "none" : "block";
  });

  document.addEventListener("click", (e) => {
    if (!popup.contains(e.target) && e.target !== gearBtn) {
      popup.style.display = "none";
    }
  });

  // Mirror disabled state from plan button
  const observer = new MutationObserver(() => {
    gearBtn.disabled = !!planBtn?.disabled;
  });
  if (planBtn) observer.observe(planBtn, { attributes: true, attributeFilter: ["disabled"] });
  gearBtn.disabled = !!planBtn?.disabled;
})();
`);

  // Script block: Download full pool GIDs
  runScript(`
(function(){
  const btn = document.getElementById("download-pool-gids");
  if (!btn) return;

  // Show button after first calc when there's a full pool to export
  window.addEventListener("planner:calc-done", () => {
    const all = window.PLANNER?.state?.screensAll || [];
    const chosen = window.PLANNER?.state?.lastChosen || [];
    // Show only if pool is larger than chosen (user missed some due to budget)
    if (all.length > 0 && chosen.length > 0) btn.style.display = "inline-flex";
    // Update title with counts
    btn.title = "\\u0421\\u043a\\u0430\\u0447\\u0430\\u0442\\u044c \\u0432\\u0441\\u0435 " + chosen.length + " GID (" + all.length + " \\u0432 \\u0438\\u043d\\u0432\\u0435\\u043d\\u0442\\u0430\\u0440\\u0435)";
  });

  btn.addEventListener("click", () => {
    const st = window.PLANNER?.state;
    const selectedRegions = st?.selectedRegions || [];
    const screensAll = st?.screensAll || [];

    // Build pool: all screens filtered by selected regions (same logic as planner)
    let pool = screensAll;
    if (selectedRegions.length) {
      const rset = new Set(selectedRegions);
      const filtered = screensAll.filter(s =>
        rset.has(String(s.region || "").trim()) ||
        rset.has(String(s.city   || "").trim())
      );
      if (filtered.length > 0) pool = filtered;
    }

    if (!pool.length) return window.PLANNER?.toast?.("\\u0412 \\u043f\\u0443\\u043b\\u0435 \\u043d\\u0435\\u0442 \\u044d\\u043a\\u0440\\u0430\\u043d\\u043e\\u0432 \\u2014 \\u0441\\u043a\\u0430\\u0447\\u0438\\u0432\\u0430\\u0442\\u044c \\u043d\\u0435\\u0447\\u0435\\u0433\\u043e.");

    const lines = ["GID,\\u0413\\u043e\\u0440\\u043e\\u0434,\\u041e\\u043f\\u0435\\u0440\\u0430\\u0442\\u043e\\u0440,\\u0410\\u0434\\u0440\\u0435\\u0441,\\u0424\\u043e\\u0440\\u043c\\u0430\\u0442"];
    pool.forEach(s => {
      const gid  = String(s.screen_id ?? s.gid ?? s.GID ?? s.id ?? "").trim();
      const city = String(s.city || "").replace(/,/g, ";");
      const own  = String(s.owner || "").replace(/,/g, ";");
      const addr = String(s.address || "").replace(/,/g, ";");
      const fmt  = String(s.format || "");
      if (gid) lines.push([gid, city, own, addr, fmt].join(","));
    });

    const blob = new Blob([lines.join("\\n")], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "pool_" + pool.length + "_screens.csv";
    a.click();
    URL.revokeObjectURL(url);
  });
})();
`);

  // Script block: черновик брифа (автосохранение + предложение восстановить)
  runScript(`
(function(){
  function el(id){ return document.getElementById(id); }
  const P = () => window.PLANNER;

  // ---- автосохранение ----
  // Слушаем всё, что происходит внутри виджета: прямые правки полей плюс
  // события, которыми обмениваются блоки (форматы, операторы и зона на карте
  // не рождают input/change на видимых контролах).
  const widget = el("planner-widget");
  if (widget) {
    widget.addEventListener("input",  () => P()?.scheduleDraftSave?.());
    widget.addEventListener("change", () => P()?.scheduleDraftSave?.());
  }
  ["planner:filters-changed", "planner:polygon-changed", "planner:calc-done", "planner:pool-updated"]
    .forEach(ev => window.addEventListener(ev, () => P()?.scheduleDraftSave?.()));

  // ---- баннер восстановления ----
  function fmtWhen(iso){
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (sameDay) return "сегодня в " + hh + ":" + mm;
    const dd = String(d.getDate()).padStart(2, "0");
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    return dd + "." + mo + " в " + hh + ":" + mm;
  }

  function describe(brief){
    const parts = [];
    const regions = brief?.geo?.regions || [];
    if (regions.length === 1) parts.push(regions[0]);
    else if (regions.length > 1) parts.push(regions[0] + " и ещё " + (regions.length - 1));
    const gids = brief?.selection?.manual_gids || [];
    if (!regions.length && gids.length) parts.push(gids.length + " GID-ов");
    if (brief?.dates?.start && brief?.dates?.end) {
      const f = s => s.split("-").reverse().join(".");
      parts.push(f(brief.dates.start) + " \\u2014 " + f(brief.dates.end));
    }
    return parts.join(", ");
  }

  let shown = false;
  function offerRestore(){
    if (shown) return;
    const draft = P()?.loadDraft?.();
    if (!draft) return;
    // Если пользователь уже что-то выбрал сам, не лезем со старым черновиком.
    if ((P()?.state?.selectedRegions || []).length) return;
    shown = true;

    const host = el("wiz-steps");
    if (!host || !host.parentNode) return;

    const bar = document.createElement("div");
    bar.id = "planner-draft-bar";
    bar.style.cssText =
      "display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px;" +
      "padding:10px 14px;background:#f4f1ff;border:1px solid #d9cfff;border-radius:12px;" +
      "font-size:13px;color:#3a2bb5;";
    const what = describe(draft.brief);
    bar.innerHTML =
      '<span style="font-size:15px;">\\u21BA</span>' +
      '<span style="flex:1;min-width:180px;">Есть незавершённый бриф от ' + fmtWhen(draft.ts) +
        (what ? ' <span style="color:#6b5bd0;">(' + what.replace(/</g, "&lt;") + ')</span>' : '') +
      '</span>' +
      '<button type="button" id="draft-restore" style="padding:6px 14px;border:none;border-radius:8px;' +
        'background:#5b3ef5;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">Восстановить</button>' +
      '<button type="button" id="draft-discard" style="padding:6px 12px;border:1px solid #d9cfff;' +
        'border-radius:8px;background:#fff;color:#6b5bd0;font-size:12px;cursor:pointer;">Начать заново</button>';

    host.parentNode.insertBefore(bar, host);

    el("draft-restore").addEventListener("click", async () => {
      const btn = el("draft-restore");
      btn.disabled = true; btn.textContent = "Восстанавливаю\\u2026";
      try { await P()?.restoreDraft?.(draft); } catch(e){ console.warn("[draft]", e); }
      bar.remove();
    });
    el("draft-discard").addEventListener("click", () => {
      P()?.clearDraft?.();
      bar.remove();
    });
  }

  // Показываем, когда инвентарь уже приехал: восстановление дёргает
  // renderFormats и превью пула, а им нужны загруженные экраны.
  window.addEventListener("planner:screens-ready", () => setTimeout(offerRestore, 0));
})();
`);

  // Script block: авто-скролл к сводке после расчёта
  runScript(`
(function(){
  // Кнопка «Рассчитать» стоит внизу левой колонки, а сводка рендерится в правой —
  // на десктопе к моменту клика она уже уехала вверх за экран, на мобиле лежит
  // ниже всей формы. После calc-done подтягиваем её в вид.
  // window.scrollTo, а не scrollIntoView: в Tilda виджет лежит во вложенных
  // скролл-контейнерах, и scrollIntoView промахивается (см. setStep выше).
  // Автоскролл нужен был, потому что сводка жила в правой колонке и к моменту
  // клика уезжала за экран. Теперь фаза результата открывается на всю ширину и
  // сама прокручивает к началу виджета — этот обработчик оставлен как запасной
  // на случай, если фаза почему-то не переключилась.
  window.addEventListener("planner:calc-done", () => {
    const w = document.getElementById("planner-widget");
    if (w && w.dataset.phase === "result") return;
    const target = document.querySelector("#planner-widget .planner-right");
    if (!target) return;
    // Ждём, пока остальные calc-done подписчики дорисуют сводку и графики,
    // иначе прокручиваем к ещё пустому блоку и промахиваемся по высоте.
    setTimeout(() => {
      const top = target.getBoundingClientRect().top + window.scrollY - 20;
      window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    }, 80);
  });
})();
`);

  // Script block: живые суммы рекомендованного бюджета
  runScript(`
(function(){
  const el = (id) => document.getElementById(id);
  const wrap = el("budget-reco-hint");
  if (!wrap) return;
  const sums = [...wrap.querySelectorAll("[data-sum]")];
  if (!sums.length) return;

  let timer = null;
  let lastSig = "";

  // Блок виден только в режиме «подскажите бюджет» — в остальных считать незачем.
  const visible = () => wrap.offsetParent !== null;

  // Подпись адресной программы: всё, от чего зависят суммы. Пересчёт дорогой
  // (фильтрация всего инвентаря по каждому региону), а planner:pool-updated
  // прилетает почти на каждый ввод, поэтому сверяем подпись и не считаем зря.
  function apSignature() {
    const st = window.PLANNER?.state || {};
    const fmts = st.selectedFormats ? [...st.selectedFormats].sort().join(",") : "";
    return [
      (st.selectedRegions || []).join("|"),
      el("date-start")?.value || "",
      el("date-end")?.value || "",
      el("formats-auto")?.checked ? "auto" : fmts,
      document.querySelector('input[name="bid_mode"]:checked')?.value || "",
      el("bid-uplift-enabled")?.checked ? (el("bid-uplift-pct")?.value || "") : "",
      el("only-active-bids")?.checked ? "1" : "0",
      st.screensAll?.length || 0,
      (Array.isArray(st.selectedDurationsMs) ? st.selectedDurationsMs.join(",") : (st.selectedDurationMs || ""))
    ].join("~");
  }

  const fmtMoney = (v) => Math.round(v).toLocaleString("ru-RU") + " \u20BD";

  function showSkeleton() {
    sums.forEach(n => { n.classList.add("rtb-skel"); n.textContent = "0"; });
  }
  // \u041f\u043e\u0434\u043f\u0438\u0441\u044c \u043f\u0440\u043e \u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u0446\u0438\u0444\u0440: \u0440\u0430\u043d\u044c\u0448\u0435 \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0438\u044f \u043f\u0440\u0438\u0445\u043e\u0434\u0438\u043b\u0430 \u0438\u0437 \u0441\u0442\u0430\u0442\u0438\u0447\u0435\u0441\u043a\u043e\u0433\u043e
  // \u0441\u043f\u0440\u0430\u0432\u043e\u0447\u043d\u0438\u043a\u0430 \u0438 \u0432\u044b\u0433\u043b\u044f\u0434\u0435\u043b\u0430 \u043a\u0430\u043a \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442 \u0440\u0430\u0441\u0447\u0451\u0442\u0430. \u041f\u0443\u0441\u0442\u044c \u0431\u0443\u0434\u0435\u0442 \u0432\u0438\u0434\u043d\u043e, \u043e\u0442\u043a\u0443\u0434\u0430 \u043e\u043d\u0430.
  function sourceNote(){
    let n = el("reco-tiers-source");
    if (!n) {
      const host = el("reco-tier-btns");
      if (!host) return null;
      n = document.createElement("div");
      n.id = "reco-tiers-source";
      n.style.cssText = "margin-top:8px;font-size:11px;color:#98a2b3;line-height:1.45;";
      host.parentNode.insertBefore(n, host.nextSibling);
    }
    return n;
  }

  function showValues(tiers) {
    sums.forEach(n => {
      n.classList.remove("rtb-skel");
      const v = tiers ? Number(tiers[n.dataset.sum]) : NaN;
      n.textContent = (Number.isFinite(v) && v > 0) ? fmtMoney(v) : "\u2014";
    });
    const note = sourceNote();
    if (note) {
      note.textContent = tiers
        ? "\u041e\u0446\u0435\u043d\u043a\u0430 \u043f\u043e \u043e\u0431\u044a\u0451\u043c\u0443 \u0438\u043d\u0432\u0435\u043d\u0442\u0430\u0440\u044f \u0432 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0445 \u0440\u0435\u0433\u0438\u043e\u043d\u0430\u0445 ("
          + (window.PLANNER?.getTiersSourceLabel?.() || "\u0438\u0441\u0442\u043e\u0447\u043d\u0438\u043a \u043d\u0435\u0438\u0437\u0432\u0435\u0441\u0442\u0435\u043d")
          + "), \u0441\u0432\u0435\u0440\u0445\u0443 \u043e\u0433\u0440\u0430\u043d\u0438\u0447\u0435\u043d\u0430 \u0451\u043c\u043a\u043e\u0441\u0442\u044c\u044e \u0440\u0430\u0437\u043c\u0435\u0449\u0435\u043d\u0438\u044f \u0437\u0430 \u0432\u044b\u0431\u0440\u0430\u043d\u043d\u044b\u0439 \u043f\u0435\u0440\u0438\u043e\u0434."
        : "";
    }
  }

  function recompute(force) {
    if (!visible()) return;

    // До расчёта отобранной адресной программы ещё нет, и ёмкость пришлось бы
    // считать по всему пулу города — для Москвы это 230 млн против 15 млн после
    // расчёта, разница в пятнадцать раз на одном и том же плане. Показывать
    // такие суммы как рекомендацию нельзя: вместо них ставим прочерки и
    // предупреждение, а настоящие цифры появляются в сводке.
    if (!window.PLANNER?.lastCalc) {
      sums.forEach(n => { n.classList.remove("rtb-skel"); n.textContent = "—"; });
      const note = sourceNote();
      if (note) note.textContent = "Суммы по вариантам появятся после расчёта — они считаются от ёмкости подобранной адресной программы.";
      lastSig = "";
      return;
    }

    const sig = apSignature();
    if (!force && sig === lastSig) return;
    lastSig = sig;
    showSkeleton();
    // Считаем следующим тиком: computeRecoBudgetTiers синхронно перебирает весь
    // инвентарь, и без паузы скелетон не успевает отрисоваться.
    setTimeout(() => {
      let tiers = null;
      try { tiers = window.PLANNER?.computeRecoBudgetTiers?.() || null; }
      catch (e) { console.warn("[reco-tiers]", e); }
      showValues(tiers);
    }, 30);
  }

  function schedule() {
    if (!visible()) return;
    clearTimeout(timer);
    timer = setTimeout(() => recompute(false), 300);
  }

  ["planner:pool-updated", "planner:filters-changed", "planner:screens-ready"]
    .forEach(ev => window.addEventListener(ev, schedule));

  // Плюс прямая подписка на поля, от которых зависит адресная программа:
  // события выше приходят как побочный эффект чужих обработчиков, полагаться
  // только на них — значит молча отставать, если тот обработчик не отработал.
  ["date-start", "date-end", "formats-auto", "only-active-bids",
   "bid-uplift-enabled", "bid-uplift-pct"].forEach(id => {
    const n = el(id);
    if (!n) return;
    n.addEventListener("input", schedule);
    n.addEventListener("change", schedule);
  });
  document.querySelectorAll('input[name="bid_mode"]').forEach(r =>
    r.addEventListener("change", schedule));

  // Смена режима бюджета показывает/прячет блок — считаем сразу, без дебаунса.
  document.querySelectorAll('input[name="budget_mode"]').forEach(r =>
    r.addEventListener("change", () => setTimeout(() => recompute(true), 0)));

  recompute(true);
  // После расчёта появляется АП — только тогда суммы вообще имеют смысл.
  window.addEventListener("planner:calc-done", () => setTimeout(() => recompute(true), 0));
})();
`);

})().catch(e => console.error("[widget-init]", e));
