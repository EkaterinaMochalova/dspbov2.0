// DSP auth enabled by default (set false before loading this script to disable)
if (window.DSP_AUTH_ENABLED === undefined) window.DSP_AUTH_ENABLED = true;

(async function() {
  const root = document.getElementById("planner-root");
  if (!root) { console.error("[widget-init] #planner-root not found"); return; }

  function loadCSS(href) {
    const l = document.createElement("link");
    l.rel = "stylesheet"; l.href = href;
    document.head.appendChild(l);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = false;
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
  loadCSS("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");
  loadCSS("https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css");

  // 2. Inject all inline CSS from widget.html
  const style = document.createElement("style");
  style.textContent = `

#planner-widget .chart-card{
  background:#fff;
  border:1px solid #eee;
  border-radius:16px;
  padding:14px;
  margin-top:12px;
  box-shadow: 0 10px 30px rgba(15,23,42,.06);
}

#planner-widget .chart-title{
  font-weight:700;
  font-size:14px;
  color:#111827;
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
  color:#667085;
  font-weight:700;
  white-space:nowrap;
}

#planner-widget .bar{
  height:10px;
  background:#eef2f6;
  border-radius:999px;
  overflow:hidden;
}

#planner-widget .bar > i{
  display:block;
  height:100%;
  width:0%;
  background:#2563eb;
  border-radius:999px;
}

#planner-widget .bar-val{
  font-size:12px;
  color:#111827;
  text-align:right;
  white-space:nowrap;
}


  #planner-widget.planner-root{ max-width:980px; margin:0 auto; font-family: Inter, Arial, sans-serif; }
  /* Font inheritance reset — browsers don't inherit font into button/input by default */
  #planner-widget button, #planner-widget input, #planner-widget select, #planner-widget textarea{
    font-family: inherit;
    font-size: inherit;
  }
  #planner-widget .planner-title{ margin:0 0 12px 0; }
  #planner-widget .planner-grid{ display:grid; grid-template-columns: 1fr 1fr; gap:16px; }
  @media (max-width: 920px){ #planner-widget .planner-grid{ grid-template-columns:1fr; } }

  #planner-widget .planner-kicker{ font-weight:700; margin-bottom:6px; }
  #planner-widget .planner-sub{ font-size:14px; color:rgba(11,18,32,.62); margin-bottom:12px; }
  #planner-widget .planner-block{ margin-bottom:12px; }
  #planner-widget .planner-label{ font-weight:600; margin-bottom:8px; }
  #planner-widget .planner-note{ font-size:12px; color:rgba(11,18,32,.62); margin-top:8px; }

  /* Разделитель "Дополнительные ограничения" */
  #planner-widget .additional-filters-divider{
    display:flex; align-items:center; gap:8px;
    margin:18px 0 10px;
    font-size:12px; font-weight:600; letter-spacing:.06em; text-transform:uppercase;
    color:rgba(11,18,32,.4);
  }
  #planner-widget .additional-filters-divider::before,
  #planner-widget .additional-filters-divider::after{
    content:''; flex:1; height:1px; background:rgba(11,18,32,.1);
  }

  /* Превью пула */
  #planner-widget .pool-preview-block{ background:#f8f9fb; border-radius:12px; padding:12px 14px; }
  #planner-widget .pool-preview-row{
    display:flex; flex-wrap:wrap; align-items:center; gap:6px 12px; font-size:14px;
  }
  #planner-widget .pool-preview-base{ font-weight:600; color:#0b1220; }
  #planner-widget .pool-preview-arrow{ color:rgba(11,18,32,.35); font-size:12px; }
  #planner-widget .pool-preview-filter{ color:#667085; }
  #planner-widget .pool-preview-filter b{ color:#0b1220; }
  #planner-widget .pool-preview-pct{ font-size:12px; color:#e04444; margin-left:2px; }

  /* Мини-бейдж на шаге 1 */
  #pool-mini-badge{ transition: opacity .2s; }

  #planner-widget .ux-input{ width:100%; box-sizing:border-box; }
  #planner-widget .row-2{ display:flex; gap:10px; }
  #planner-widget .row-2 > *{ flex:1; min-width:0; }

  #planner-widget .radio-row{ display:block; margin-bottom:6px; }
  #planner-widget .radio-inline{ display:flex; gap:14px; flex-wrap:wrap; }
  #planner-widget .check-row{ display:flex; gap:8px; align-items:center; margin:0; }
  #planner-widget .hint{ font-size:12px; color:rgba(11,18,32,.58); margin-top:6px; }

  #planner-widget .city-suggestions{ margin-top:8px; display:flex; flex-wrap:wrap; gap:8px; }
  #planner-widget .city-selected{ margin-top:10px; }

  #planner-widget .summary-pre{
    white-space: pre-wrap;
    background: rgba(255,255,255,.55);
    border: 1px solid rgba(15,23,42,.10);
    padding: 12px;
    border-radius: 12px;
    min-height: 180px;
    margin: 0;
  }

  #planner-widget .download-row{ margin-top:12px; display:flex; gap:10px; flex-wrap:wrap; align-items:center; }
  #planner-widget .dl-settings-gear{
    display:inline-flex;align-items:center;justify-content:center;
    width:32px;height:32px;border-radius:8px;border:1.5px solid #e0d9fd;
    background:#f7f5ff;color:#5b3ef5;cursor:pointer;transition:background .15s;flex-shrink:0;
    padding:0;
  }
  #planner-widget .dl-settings-gear:hover{ background:#ede9ff; }
  #planner-widget .dl-settings-gear:disabled{ opacity:.4;cursor:default; }
  #planner-widget .dl-settings-popup{
    position:absolute;top:calc(100% + 8px);left:0;z-index:9999;
    background:#fff;border:1.5px solid #e0d9fd;border-radius:14px;
    box-shadow:0 8px 32px rgba(91,62,245,.12);padding:14px 16px;
    min-width:280px;
  }
  #planner-widget .dl-settings-title{
    font-size:12px;font-weight:700;color:#5b3ef5;text-transform:uppercase;
    letter-spacing:.5px;margin-bottom:10px;
  }
  #planner-widget .dl-settings-row{
    display:flex;align-items:flex-start;gap:8px;cursor:pointer;
    font-size:13px;color:#374151;margin-bottom:8px;line-height:1.4;
  }
  #planner-widget .dl-settings-row:last-child{ margin-bottom:0; }
  #planner-widget .dl-settings-row input{ margin-top:2px;accent-color:#5b3ef5;flex-shrink:0; }
  #planner-widget .planner-status{ margin-top:10px; font-size:14px; color:rgba(11,18,32,.62); }
  #planner-map.planner-map{ height:420px; width:100%; border-radius:14px; overflow:hidden; border:1px solid rgba(15,23,42,.10); font-family: Inter, Arial, sans-serif; }

  #planner-widget .wiz-step{ display:none; }
  #planner-widget .wiz-step.active{ display:block; }

  /* Pretty summary */
  #planner-widget .ps-wrap{ display:flex; flex-direction:column; gap:12px; }
  #planner-widget .ps-card{
    background: rgba(255,255,255,.62);
    border: 1px solid rgba(15,23,42,.10);
    border-radius: 16px;
    padding: 14px;
    box-shadow: 0 10px 30px rgba(15,23,42,.06);
  }
  #planner-widget .ps-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  #planner-widget .ps-title{ font-weight:700; font-size:16px; margin:0; }
  #planner-widget .ps-sub{ font-size:12px; color: rgba(11,18,32,.62); margin-top:4px; }

  #planner-widget .ps-badges{ display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  #planner-widget .ps-badge{
    display:inline-flex; align-items:center; gap:8px;
    padding: 8px 10px;
    border-radius: 999px;
    border: 1px solid rgba(15,23,42,.10);
    background: rgba(255,255,255,.55);
    font-size: 12px;
    white-space: nowrap;
  }

  #planner-widget .ps-grid{ display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap:10px; margin-top:12px; }
  @media (max-width: 920px){ #planner-widget .ps-grid{ grid-template-columns:1fr; } }

  #planner-widget .ps-metric{
    border: 1px solid rgba(15,23,42,.08);
    background: rgba(255,255,255,.50);
    border-radius: 14px;
    padding: 12px;
  }
  #planner-widget .ps-metric .k{ font-size:12px; color: rgba(11,18,32,.62); }
  #planner-widget .ps-metric .v{ margin-top:6px; font-weight:700; font-size:16px; }

  #planner-widget .ps-region{
    border: 1px solid rgba(15,23,42,.08);
    background: rgba(255,255,255,.50);
    border-radius: 16px;
    padding: 12px;
  }
  #planner-widget .ps-region-top{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  #planner-widget .ps-region-name{ font-weight:700; font-size:16px; }
  #planner-widget .ps-region-chip{
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid rgba(15,23,42,.10);
    background: rgba(255,255,255,.55);
    font-size: 12px;
    white-space: nowrap;
  }
  #planner-widget .ps-formats{ display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
  #planner-widget .ps-fmt{
    padding: 7px 10px;
    border-radius: 999px;
    border: 1px solid rgba(15,23,42,.10);
    background: rgba(255,255,255,.55);
    font-size: 12px;
  }

  #planner-widget .ps-warn{
    margin-top:10px;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid rgba(245,158,11,.25);
    background: rgba(245,158,11,.08);
    font-size: 12px;
    color: rgba(11,18,32,.72);
  }

  #planner-widget .ps-details{
    margin-top:10px;
    background: rgba(255,255,255,.45);
    border: 1px solid rgba(15,23,42,.10);
    border-radius: 16px;
    padding: 10px 12px;
  }
  #planner-widget .ps-details summary{ cursor:pointer; font-weight:700; list-style:none; }
  #planner-widget .ps-details summary::-webkit-details-marker{ display:none; }
  #planner-widget .ps-details .hint{ font-size:12px; color: rgba(11,18,32,.58); margin-top:6px; }


  .ps-wrap{display:grid;gap:12px;}
  .ps-card{
    background:#fff;border:1px solid #eee;border-radius:16px;
    padding:14px; box-shadow:0 10px 30px rgba(15,23,42,.06);
  }
  .ps-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap;}
  .ps-title{font-weight:700;font-size:16px;line-height:1.2;}
  .ps-sub{color:#667085;font-size:12px;margin-top:4px;}
  .ps-badges{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  .ps-badge{font-size:12px;padding:6px 10px;border-radius:999px;background:#F2F4F7;color:#111827;}
  .ps-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px;}
  @media (max-width: 980px){ .ps-grid{grid-template-columns:repeat(2,minmax(0,1fr));} }
  .ps-metric{border:1px solid #eef2f6;border-radius:14px;padding:10px 12px;background:#fcfcfd;}
  .ps-metric .k{font-size:12px;color:#667085;}
  .ps-metric .v{font-size:16px;font-weight:700;margin-top:6px;color:#111827;}
  .ps-regions{display:grid;gap:10px;margin-top:12px;}
  .ps-region-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}
  .ps-region-name{font-weight:700;font-size:14px;}
  .ps-chip{font-size:12px;padding:6px 10px;border-radius:999px;background:#EEF4FF;color:#1D4ED8;}
  .ps-mini{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;}
  .ps-mini span{font-size:12px;padding:6px 10px;border-radius:12px;background:#F8FAFC;border:1px solid #EEF2F6;color:#111827;}
  .ps-warn{border:1px solid #FDE68A;background:#FFFBEB;color:#92400E;border-radius:14px;padding:10px 12px;font-size:12px;line-height:1.35;}
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
  color: #374151;
  background: rgba(255,255,255,0.85);
  border: 1px solid rgba(229,231,235,0.9);
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
  .ux-chip{ display:inline-flex; gap:8px; align-items:center; padding:8px 10px; border:1px solid rgba(15,23,42,.12); border-radius:999px; background:#fff; font-size:12px; cursor:pointer; }
  .ux-chip input{ margin:0; }

  #planner-widget .weekly-days{ display: grid; gap: 10px; margin-top: 10px; }

  #planner-widget .wd-card{
    border: 1px solid rgba(15,23,42,.10);
    background: rgba(255,255,255,.55);
    border-radius: 16px;
    padding: 12px;
  }

  #planner-widget .wd-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px; }
  #planner-widget .wd-left{ display:flex; align-items:center; gap:10px; min-width: 0; }
  #planner-widget .wd-title{ font-weight: 700; font-size: 14px; white-space: nowrap; }
  #planner-widget .wd-sub{ font-size: 12px; color: rgba(11,18,32,.62); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width: 360px; }
  #planner-widget .wd-actions{ display:flex; gap:8px; align-items:center; }
  #planner-widget .wd-btn{ padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(17, 23, 42, .14); background: rgba(255,255,255,.92); cursor: pointer; font-weight: 600; font-size: 12px; }
  #planner-widget .wd-btn:disabled{ opacity: .5; cursor: not-allowed; }
  #planner-widget .wd-rows{ display: grid; gap: 8px; }
  #planner-widget .wd-row{ display:flex; gap:10px; align-items:center; flex-wrap: wrap; }
  #planner-widget .wd-row .ux-input{ width: 160px; max-width: 42vw; }
  #planner-widget .wd-remove{ padding: 8px 10px; border-radius: 12px; border: 1px solid rgba(239,68,68,.25); background: rgba(239,68,68,.06); cursor: pointer; font-weight: 700; font-size: 12px; }
  #planner-widget .wd-bars{ margin-top: 10px; display:flex; flex-direction: column; gap: 6px; }
  #planner-widget .wd-barline{ height: 10px; border-radius: 999px; background: rgba(15,23,42,.06); position: relative; overflow: hidden; }
  #planner-widget .wd-seg{ position:absolute; top:0; bottom:0; border-radius: 999px; background: rgba(47,98,255,.35); }
  #planner-widget .wd-barhint{ font-size: 12px; color: rgba(11,18,32,.62); }

  #planner-widget #owner-wrap{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-top: 8px; }
  @media (max-width: 560px){ #planner-widget #owner-wrap{ grid-template-columns: 1fr; } }

  #planner-widget .own-card{
    display:flex; align-items:center; justify-content:space-between; gap:12px;
    padding: 14px 14px; border-radius: 18px;
    border: 1px solid rgba(15,23,42,.10); background: rgba(255,255,255,.70);
    box-shadow: 0 10px 30px rgba(15,23,42,.06);
    cursor:pointer; user-select:none;
    transition: transform .12s ease, box-shadow .12s ease, background-color .12s ease, border-color .12s ease;
  }
  #planner-widget .own-card:hover{ transform: translateY(-1px); box-shadow: 0 14px 36px rgba(15,23,42,.10); background: rgba(255,255,255,.92); }
  #planner-widget .own-card:active{ transform: translateY(0px); box-shadow: 0 10px 30px rgba(15,23,42,.06); }
  #planner-widget .own-left{ min-width:0; }
  #planner-widget .own-title{ font-weight: 700; font-size: 16px; color:#111827; line-height: 1.2; white-space: nowrap; overflow:hidden; text-overflow: ellipsis; max-width: 100%; }
  #planner-widget .own-countline{ margin-top: 6px; font-size: 14px; color:#667085; font-weight: 600; }
  #planner-widget .own-tip{ flex: 0 0 auto; width: 28px; height: 28px; border-radius: 999px; border: 1px solid rgba(15,23,42,.12); background: rgba(255,255,255,.85); color: rgba(11,18,32,.72); font-weight: 700; cursor: pointer; display:flex; align-items:center; justify-content:center; box-shadow: 0 6px 18px rgba(15,23,42,.06); }
  #planner-widget .own-card.is-selected{ border-color: rgba(37,99,235,.55); box-shadow: 0 14px 40px rgba(37,99,235,.12); background: rgba(37,99,235,.06); }
  #planner-widget .own-card.is-selected .own-title{ color:#1D4ED8; }

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
  #planner-widget .ux-input.is-invalid{ border-color:#DC2626 !important; box-shadow:0 0 0 3px rgba(220,38,38,.12); }

  /* ===== PANELS ===== */
  #planner-widget .ux-panel{
    background: rgba(255,255,255,.72);
    border: 1px solid rgba(15,23,42,.10);
    border-radius: 20px;
    padding: 20px;
    box-shadow: 0 10px 30px rgba(15,23,42,.06);
    min-width: 0;
  }

  /* ===== WIZARD CHIPS (step tabs) ===== */
  #planner-widget .wiz-steps{
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: 16px;
    position: sticky;
    top: 12px;
    z-index: 20;
    background: rgba(255,255,255,0.94);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    padding: 6px 0 8px;
    border-radius: 10px;
  }
  #planner-widget .wiz-chip{
    padding: 6px 14px;
    border: 1px solid rgba(15,23,42,.14);
    border-radius: 999px;
    background: rgba(255,255,255,.85);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    color: rgba(11,18,32,.70);
    transition: background .12s ease, border-color .12s ease, color .12s ease;
  }
  #planner-widget .wiz-chip:hover{
    background: #fff;
    border-color: rgba(15,23,42,.22);
  }
  #planner-widget .wiz-chip.active{
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
  }
  #planner-widget .wiz-chip.done{
    background: #f0fdf4;
    border-color: #86efac;
    color: #166534;
  }
  #planner-widget .wiz-chip.done.active{
    background: #2563eb;
    border-color: #2563eb;
    color: #fff;
  }

  /* ===== PROGRESS BAR ROW ===== */
  #planner-widget .wiz-progress{
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 10px;
  }
  #planner-widget .wiz-progress .bar{ flex: 1; }
  #planner-widget .wiz-progress .meta{
    font-size: 12px;
    color: rgba(11,18,32,.55);
    white-space: nowrap;
    min-width: 32px;
    text-align: right;
  }

  /* ===== SCHEDULE CHIPS ===== */
  #planner-widget .sch-chip{
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:8px 14px; min-width:76px; text-align:center;
    border:1.5px solid rgba(15,23,42,.14); border-radius:12px;
    background:#fff; cursor:pointer;
    transition:border-color .12s, background .12s, box-shadow .12s;
  }
  #planner-widget .sch-chip:hover{
    border-color:rgba(91,62,245,.4); background:#faf8ff;
  }
  #planner-widget .sch-chip.active{
    border-color:#5b3ef5; background:#f0eeff; color:#3a1dcc;
  }
  #planner-widget .sch-chip-name{ font-size:13px; font-weight:600; }
  #planner-widget .sch-chip-time{ font-size:11px; color:rgba(11,18,32,.45); margin-top:2px; }
  #planner-widget .sch-chip.active .sch-chip-time{ color:rgba(91,62,245,.65); }
  #planner-widget .pct-chip{
    padding:6px 14px; font-size:13px; font-weight:600;
    border:1.5px solid rgba(15,23,42,.14); border-radius:12px;
    background:#fff; cursor:pointer; color:inherit;
    transition:border-color .12s, background .12s;
  }
  #planner-widget .pct-chip:hover{ border-color:rgba(91,62,245,.4); background:#faf8ff; }
  #planner-widget .pct-chip.active{ border-color:#5b3ef5; background:#f0eeff; color:#3a1dcc; }

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
    border: 1px solid #2563eb;
    background: #2563eb;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: background .14s ease, box-shadow .14s ease, transform .12s ease;
    white-space: nowrap;
    user-select: none;
  }
  #planner-widget .wiz-btn:hover{
    background: #1d4ed8;
    border-color: #1d4ed8;
    box-shadow: 0 6px 18px rgba(37,99,235,.25);
  }
  #planner-widget .wiz-btn:active{ transform: translateY(1px); }
  #planner-widget .wiz-btn.ghost{
    background: rgba(255,255,255,.92);
    border-color: rgba(15,23,42,.14);
    color: rgba(11,18,32,.80);
  }
  #planner-widget .wiz-btn.ghost:hover{
    background: #fff;
    border-color: rgba(15,23,42,.28);
    box-shadow: 0 4px 12px rgba(15,23,42,.08);
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
    padding:10px 12px;border:1.5px solid #e5e3f0;border-radius:12px;
    background:#fff;cursor:pointer;font-size:12px;font-weight:500;color:#555;
    transition:all 0.12s;min-width:76px;text-align:center;
  }
  #planner-widget .sel-chip:hover{border-color:#5b3ef5;background:#f5f3ff;}
  #planner-widget .sel-chip.active{border-color:#5b3ef5;background:#ede9fd;color:#4930c7;font-weight:600;}
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
    padding:10px 12px;border:1.5px solid #e5e3f0;border-radius:12px;
    background:#fff;transition:all 0.12s;
  }
  #planner-widget .str-chip:hover .str-chip-body{border-color:#5b3ef5;background:#f5f3ff;}
  #planner-widget .str-chip input:checked + .str-chip-body{border-color:#5b3ef5;background:#ede9fd;color:#4930c7;}
  #planner-widget .str-chip-title{font-weight:600;font-size:13px;}
  #planner-widget .str-chip-desc{font-size:11px;color:#888;margin-top:2px;}
  #planner-widget .str-chip input:checked + .str-chip-body .str-chip-desc{color:#7059c7;}

  /* ===== CONSTRUCTIONS CHIP ===== */
  #planner-widget .cns-chip{
    padding:10px 14px;border:1.5px solid #e5e3f0;border-radius:12px;
    background:#fff;cursor:pointer;transition:all 0.12s;
    display:flex;align-items:center;gap:10px;margin-top:8px;
  }
  #planner-widget .cns-chip:hover{border-color:#5b3ef5;background:#f5f3ff;}
  #planner-widget .cns-chip.active{border-color:#5b3ef5;background:#ede9fd;color:#4930c7;}
  #planner-widget .cns-chip.active .str-chip-desc{color:#7059c7;}
  #planner-widget .cns-chip-ico{font-size:18px;line-height:1;flex-shrink:0;}
  #planner-widget .cns-chip-body{flex:1;}
  #planner-widget .cns-chip-badge{
    font-size:12px;font-weight:700;color:#5b3ef5;
    background:#e0d9ff;border-radius:20px;padding:2px 8px;
    display:none;
  }
  #planner-widget .cns-chip.active .cns-chip-badge[data-val]{display:inline;}

  /* ===== VK AFFINITY CARD ===== */
  #planner-widget .vk-card{
    display:flex;align-items:center;gap:12px;
    padding:12px 14px;border:1.5px solid #e5e3f0;border-radius:12px;
    background:#fff;cursor:pointer;transition:all 0.12s;
  }
  #planner-widget .vk-card:hover{border-color:#5b3ef5;background:#f5f3ff;}
  #planner-widget .vk-card.active{border-color:#5b3ef5;background:#ede9fd;}
  #planner-widget .vk-card-icon{
    width:38px;height:38px;border-radius:10px;
    background:#0077ff;color:#fff;
    display:flex;align-items:center;justify-content:center;
    font-weight:800;font-size:15px;letter-spacing:-0.5px;flex-shrink:0;
  }
  #planner-widget .vk-card-body{flex:1;}
  #planner-widget .vk-card-title{font-weight:600;font-size:13px;color:#0b1220;}
  #planner-widget .vk-card-desc{font-size:11px;color:#888;margin-top:2px;}
  #planner-widget .vk-card.active .vk-card-desc{color:#7059c7;}
  #planner-widget .vk-toggle{
    width:38px;height:22px;border-radius:11px;
    background:#d0d5dd;transition:background 0.15s;flex-shrink:0;position:relative;
  }
  #planner-widget .vk-card.active .vk-toggle{background:#5b3ef5;}
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
    flex:1;font-size:13px;font-weight:500;color:#344054;min-width:0;
    white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
  }
  #planner-widget .per-city-row .ux-input{
    width:130px;flex-shrink:0;text-align:right;
  }

  /* ===== BUDGET EXTRAS (НДС / commission) ===== */
  #planner-widget .ux-toggle-track{
    position:relative;display:inline-block;width:36px;height:20px;
    background:#d1d5db;border-radius:999px;transition:background .2s;flex-shrink:0;
  }
  #planner-widget .ux-toggle-input{ position:absolute;opacity:0;width:0;height:0; }
  #planner-widget .ux-toggle-thumb{
    position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;
    background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .2s;
    pointer-events:none;
  }
  #planner-widget .ux-toggle-input:checked ~ .ux-toggle-thumb{ transform:translateX(16px); }
  #planner-widget .ux-toggle-input:checked + .ux-toggle-thumb{ transform:translateX(16px); }
  #planner-widget .ux-toggle-track:has(.ux-toggle-input:checked){ background:#5b3ef5; }
  #planner-widget .reco-tier-btn{
    display:inline-flex;align-items:center;gap:6px;padding:6px 14px;
    border-radius:10px;border:1.5px solid #e0d9fd;background:#f7f5ff;
    cursor:pointer;font-size:13px;font-weight:600;color:#5b3ef5;
    transition:background .15s,border-color .15s;
  }
  #planner-widget .reco-tier-btn input{ display:none; }
  #planner-widget .reco-tier-btn:has(input:checked){ background:#5b3ef5;color:#fff;border-color:#5b3ef5; }
  #planner-widget .reco-tier-btn{ flex-direction:column;align-items:flex-start;gap:1px;padding:7px 12px; }
  #planner-widget .rtb-label{ font-size:10px;font-weight:500;color:#8b83c5;text-transform:uppercase;letter-spacing:.4px; }
  #planner-widget .reco-tier-btn:has(input:checked) .rtb-label{ color:#d9d0ff; }
  #planner-widget .rtb-sum{ font-size:13px;font-weight:700;white-space:nowrap; }
  /* Скелетон на месте суммы, пока идёт пересчёт по адресной программе */
  #planner-widget .rtb-sum.rtb-skel{
    display:inline-block;min-width:78px;height:14px;border-radius:4px;color:transparent;
    background:linear-gradient(90deg,#e6e0ff 25%,#f4f1ff 50%,#e6e0ff 75%);
    background-size:200% 100%;animation:rtbShimmer 1.1s ease-in-out infinite;
  }
  #planner-widget .reco-tier-btn:has(input:checked) .rtb-sum.rtb-skel{
    background:linear-gradient(90deg,#7a63f7 25%,#a795fb 50%,#7a63f7 75%);
    background-size:200% 100%;
  }
  @keyframes rtbShimmer{ 0%{background-position:200% 0;} 100%{background-position:-200% 0;} }
  #planner-widget .budget-tier-chip{
    display:inline-flex;flex-direction:column;align-items:flex-start;
    gap:1px;padding:7px 12px;border-radius:10px;border:1.5px solid #e0d9fd;
    background:#f7f5ff;cursor:pointer;transition:background .15s,border-color .15s;
    font-size:11px;color:#5b3ef5;font-weight:600;line-height:1.3;
  }
  #planner-widget .budget-tier-chip:hover{ background:#ede9ff;border-color:#b9a8f8; }
  #planner-widget .budget-tier-chip .btc-label{ font-size:10px;font-weight:500;color:#8b83c5;text-transform:uppercase;letter-spacing:.4px; }
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
    border: 1px solid rgba(15,23,42,.14);
    border-radius: 8px;
    font-size: 13px;
    box-sizing: border-box;
  }
  #planner-widget .budget-extra-hint{
    display: none;
    margin-top: 4px;
    font-size: 12px;
    color: #667085;
    padding: 6px 10px;
    background: rgba(37,99,235,.05);
    border: 1px solid rgba(37,99,235,.12);
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
    background: #5B3EF5;
    color: #fff;
    border: none;
    border-radius: 24px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(91,62,245,.45);
    transition: top .15s, opacity .2s;
    white-space: nowrap;
  }
  #planner-recalc-float:hover { background: #4730d4; }
  #planner-recalc-float .rf-icon { font-size: 16px; line-height: 1; }

  /* ===== PER-REGION CONSTRUCTIONS ===== */
  #planner-widget .cns-per-region-toggle{
    display:inline-flex; align-items:center; gap:5px;
    font-size:12px; font-weight:600; color:#5B3EF5;
    cursor:pointer; padding:4px 0; user-select:none;
    background:none; border:none;
  }
  #planner-widget .cns-per-region-rows{ display:flex; flex-direction:column; gap:6px; margin-top:6px; }
  #planner-widget .cns-per-region-row{
    display:flex; align-items:center; gap:8px;
  }
  #planner-widget .cns-per-region-label{
    flex:1; font-size:12px; color:#344054; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  #planner-widget .cns-per-region-row .ux-input{
    width:80px; flex:none; font-size:13px; padding:5px 8px;
  }
  #planner-widget .cns-per-region-unit{
    font-size:12px; color:#667085; min-width:24px;
  }

  /* ===== PER-CITY FORMATS ===== */
  #planner-widget .city-fmt-rows{ display:flex; flex-direction:column; gap:4px; margin-top:6px; }
  #planner-widget .city-fmt-row{ display:flex; align-items:center; gap:5px; flex-wrap:wrap; padding:3px 0; border-bottom:1px solid rgba(15,23,42,.05); }
  #planner-widget .city-fmt-row:last-child{ border-bottom:none; }
  #planner-widget .city-fmt-lbl{ font-size:12px; font-weight:600; color:#344054; min-width:72px; max-width:130px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex-shrink:0; }
  #planner-widget .city-fmt-chip{ padding:2px 8px; border-radius:999px; border:1px solid rgba(15,23,42,.14); background:#fff; font-size:11px; cursor:pointer; white-space:nowrap; transition:background .1s,border-color .1s; }
  #planner-widget .city-fmt-chip.on{ border-color:rgba(37,99,235,.5); background:rgba(37,99,235,.10); color:#1D4ED8; font-weight:600; }
  #planner-widget .city-fmt-reset{ font-size:11px; color:#9ca3af; cursor:pointer; padding:2px 4px; border:none; background:none; white-space:nowrap; }
  #planner-widget .city-fmt-reset:hover{ color:#ef4444; }

  /* ===== SEND PLAN BUTTON ===== */
  #planner-widget #send-plan-btn{
    background:#22c55e; color:#fff; border:1.5px solid #16a34a;
    padding:8px 18px; border-radius:10px;
    font-size:13px; font-weight:600; cursor:pointer;
    display:none;
    transition:background 0.15s, opacity 0.15s;
  }
  #planner-widget #send-plan-btn:hover{ background:#16a34a; }
  #planner-widget #send-plan-btn:disabled{ opacity:0.6; cursor:default; }

  /* ===== SEND PLAN POPUP ===== */
  #send-plan-popup{
    display:none; position:fixed; inset:0; z-index:999999;
    background:rgba(11,18,32,0.55); backdrop-filter:blur(6px);
    align-items:center; justify-content:center;
  }
  #send-plan-popup.active{ display:flex; }
  #send-plan-popup .spp-card{
    background:#fff; border-radius:24px; padding:40px 40px 36px;
    max-width:380px; width:90%; text-align:center;
    box-shadow:0 24px 64px rgba(91,62,245,0.18), 0 2px 8px rgba(11,18,32,0.08);
    animation:spp-in 0.22s cubic-bezier(.34,1.36,.64,1);
  }
  @keyframes spp-in{
    from{ transform:scale(0.82) translateY(12px); opacity:0; }
    to  { transform:scale(1)    translateY(0);    opacity:1; }
  }
  #send-plan-popup .spp-icon{
    width:64px; height:64px; border-radius:50%;
    background:linear-gradient(135deg,#7c5cfc,#5B3EF5);
    display:flex; align-items:center; justify-content:center;
    margin:0 auto 20px; box-shadow:0 8px 24px rgba(91,62,245,0.35);
  }
  #send-plan-popup .spp-icon svg{ width:30px; height:30px; }
  #send-plan-popup .spp-title{
    font-size:19px; font-weight:700; color:#0b1220;
    margin-bottom:8px; letter-spacing:-0.2px;
  }
  #send-plan-popup .spp-sub{
    font-size:13.5px; color:#667085; line-height:1.55;
    margin-bottom:28px;
  }
  #send-plan-popup .spp-close{
    background:#5B3EF5; color:#fff; border:none;
    padding:12px 36px; border-radius:12px;
    font-size:14px; font-weight:600; cursor:pointer;
    transition:background 0.15s, box-shadow 0.15s;
    box-shadow:0 4px 14px rgba(91,62,245,0.35);
  }
  #send-plan-popup .spp-close:hover{
    background:#4730d4;
    box-shadow:0 6px 20px rgba(91,62,245,0.45);
  }

  /* ===== CALC HISTORY ===== */
  #planner-widget .calc-history-toggle{
    display:inline-flex; align-items:center; gap:6px;
    font-size:13px; font-weight:600; color:#5B3EF5;
    cursor:pointer; padding:4px 0; user-select:none;
  }
  #planner-widget .calc-history-list{
    display:flex; flex-direction:column; gap:6px; margin-top:8px;
  }
  #planner-widget .calc-history-item{
    background:#f8f8ff; border:1.5px solid #e0d9ff;
    border-radius:10px; padding:8px 12px;
    cursor:pointer; font-size:13px;
    transition:border-color 0.15s, background 0.15s;
  }
  #planner-widget .calc-history-item:hover{
    background:#eee9ff; border-color:#a78bfa;
  }
  #planner-widget .calc-history-date{ font-size:11px; color:#888; margin-bottom:2px; }
  #planner-widget .calc-history-title{ font-weight:600; color:#0b1220; }
  #planner-widget .calc-history-meta{ font-size:11px; color:#667085; margin-top:2px; }
`;
  document.head.appendChild(style);

  // 3. Load external scripts sequentially
  await loadScript("https://cdn.jsdelivr.net/npm/papaparse@5.4.1/papaparse.min.js");
  await loadScript("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js");
  await loadScript("https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js");
  await loadScript("https://unpkg.com/leaflet@1.9.4/dist/leaflet.js");
  await loadScript("https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js");
  await loadScript("https://rawcdn.githack.com/EkaterinaMochalova/dspbov2.0/e38e8d05a826dc5b94b8eccd28fbc19559bcb9dc/geo.js");
  await loadScript("https://rawcdn.githack.com/EkaterinaMochalova/dspbov2.0/bcb84354344ead8f8abe04bcdc2738a27e10fcd0/planner.js");

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
<br><br><br><br>  <h2 class="planner-title">Расчёт размещения</h2>
  <div id="dsp-user-bar" style="display:none; font-size:12px; color:#888; margin:-8px 0 10px;"></div>
  <div id="calc-history-panel" style="display:none; margin-bottom:12px;">
    <div id="calc-history-toggle" class="calc-history-toggle">
      <span id="calc-history-arrow">▶</span> История расчётов
    </div>
    <div id="calc-history-list" class="calc-history-list" style="display:none; flex-direction:column;"></div>
  </div>
  <div class="wiz-progress" id="wiz-progress">
    <div class="bar"><i id="wiz-bar"></i></div>
    <div class="meta" id="wiz-meta">0/4</div>
  </div>
  <div id="progress-checklist" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;"></div>
  <div class="planner-grid">
  <!-- Left -->
  <div class="ux-panel planner-left">
    <div class="planner-kicker">План размещения</div>
    <div class="planner-sub">Ответь на несколько вопросов — и мы соберём программу.</div>
    <div class="wiz-steps" id="wiz-steps">
      <button type="button" class="wiz-chip active" data-step="1">1. География</button>
      <button type="button" class="wiz-chip" data-step="2">2. Период</button>
      <button type="button" class="wiz-chip" data-step="3">3. Настройки</button>
      <button type="button" class="wiz-chip" data-step="4">4. Цели</button>
    </div>
    <!-- STEP 1 -->
    <div class="wiz-step active" id="wiz-step-1">
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
            <label style="display:inline-flex; align-items:center; gap:6px; padding:7px 14px;
                   border:1.5px dashed #c4b5fd; border-radius:10px; background:#faf8ff;
                   color:#5B3EF5; font-size:13px; cursor:pointer; font-weight:500;">
              ↓ Импорт городов из файла
              <input type="file" id="region-file-input" accept=".xlsx,.csv,.txt" style="display:none;">
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
                     font-family:inherit; box-sizing:border-box; outline:none;"></textarea>
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
          <span style="font-size:12px;color:#9ca3af;">экраны с известной ставкой</span>
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
                   font-size:13px; resize:vertical; box-sizing:border-box; font-family:monospace; outline:none;"></textarea>
          <div id="manual-gids-status" style="font-size:12px; color:#667085; margin-top:6px;">
            Введите GID-ы — после расчёта будут использованы только эти экраны.
          </div>
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
  <div class="planner-block">
    <div class="planner-label">Даты</div>
    <div class="row-2">
      <input id="date-start" type="date" class="ux-input" />
      <input id="date-end" type="date" class="ux-input" />
    </div>
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
        <div class="planner-block">
          <div class="planner-label">Бюджет</div>
<div class="strategy-chips" style="flex-direction:column;gap:6px;">
  <label class="str-chip">
    <input type="radio" name="budget_mode" value="fixed" checked>
    <div class="str-chip-body">
      <div class="str-chip-title">💰 Есть бюджет</div>
      <div class="str-chip-desc">Укажу сумму — подберёте программу</div>
    </div>
  </label>
  <label class="str-chip">
    <input type="radio" name="budget_mode" value="recommendation">
    <div class="str-chip-body">
      <div class="str-chip-title">✨ Подскажите бюджет</div>
      <div class="str-chip-desc">Планировщик рассчитает оптимальную сумму</div>
    </div>
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
  <input id="budget-input" type="number" class="ux-input" placeholder="Введите бюджет, ₽" min="0" step="1000">
  <input id="budget-total-abs" type="number" style="display:none;">
  <div class="planner-note" style="margin-top:6px;" id="budget-distrib-note">
    Распределим сумму по выбранным регионам.
  </div>
  <!-- per-city toggle (shown when 2+ regions selected) -->
  <div id="per-city-toggle-wrap" style="display:none; margin-top:12px;">
    <div id="per-city-toggle-row" style="display:flex;align-items:center;justify-content:space-between;
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
        <button id="calc-btn" class="ux-primary" disabled>Рассчитать</button>
        <div id="calc-blocked-hint" style="display:none; margin-top:8px; font-size:12px; color:#e84444; padding:6px 10px; background:#fff5f5; border-radius:8px;"></div>
        <div id="status" class="planner-status"></div>
        <div class="wiz-nav" style="margin-top:12px;">
          <button type="button" class="wiz-btn ghost" id="wiz-back-3">← Настройки</button>
        </div>
      </div>
      <!-- STEP 4 -->
<div class="wiz-step" id="wiz-step-4">
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
          <div class="str-chip-desc">Максимум экранов</div>
        </div>
      </label>
      <label class="str-chip">
        <input type="radio" name="reach_mode" value="balanced">
        <div class="str-chip-body">
          <div class="str-chip-title">⚖ Баланс</div>
          <div class="str-chip-desc">Охват + частота</div>
        </div>
      </label>
      <label class="str-chip">
        <input type="radio" name="reach_mode" value="max_freq">
        <div class="str-chip-body">
          <div class="str-chip-title">🔁 Частота</div>
          <div class="str-chip-desc">Меньше экранов</div>
        </div>
      </label>
    </div>
    <!-- Конструкции — независимый toggle-чип -->
    <div class="cns-chip" id="constructions-chip">
      <span class="cns-chip-ico">🏗</span>
      <div class="cns-chip-body">
        <div class="str-chip-title">Конструкции</div>
        <div class="str-chip-desc">Задать точное число экранов</div>
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
      <div style="margin-top:12px;">
        <div style="font-size:12px; font-weight:600; margin-bottom:6px; color:#0b1220;">
          Выходов в час на экран: <span id="constructions-ppm-val" style="color:#5b3ef5;">10</span>
        </div>
        <input type="range" id="constructions-ppm" min="1" max="60" value="10" style="width:100%; accent-color:#5b3ef5;">
        <div style="display:flex; justify-content:space-between; font-size:11px; color:#aaa; margin-top:2px;">
          <span>1 / час</span><span>60 / час</span>
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
    </div>
  </div>
  <!-- Выходов в час (только GID-режим) -->
  <div class="planner-block" id="step4-gid-ppm-block" style="display:none;">
    <div class="planner-label">Выходов в час на экран</div>
    <div style="display:flex; align-items:center; gap:10px; margin-top:4px;">
      <input type="range" id="gid-ppm" min="1" max="60" value="10" style="flex:1; accent-color:#5b3ef5;">
      <span id="gid-ppm-val" style="font-weight:700; color:#5b3ef5; min-width:28px; text-align:right;">10</span>
    </div>
    <div style="display:flex; justify-content:space-between; font-size:11px; color:#aaa; margin-top:2px;">
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
    <div class="cns-chip" id="bid-uplift-chip">
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
  </div>
  <!-- ===== АУДИТОРИЯ VK ===== -->
    <div class="planner-block" id="audience-block">
      <div class="vk-card" id="vk-affinity-card">
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
            <div style="display:flex; justify-content:space-between; font-size:11px; color:#aaa; margin-top:2px;">
              <span>5%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>
          <!-- Coverage result -->
          <div id="audience-coverage" style="margin-top:10px;"></div>
        </div>
      </div>
    </div>
  <!-- ===== 2ГИС РЯДОМ С ОБЪЕКТАМИ ===== -->
  <div class="planner-block" id="geo2gis-block">
    <div class="vk-card" id="geo2gis-card">
      <div class="vk-card-icon" style="background:#1DB244; font-size:11px; font-weight:800; letter-spacing:-0.5px;">2ГИС</div>
      <div class="vk-card-body">
        <div class="vk-card-title">Рядом с объектами</div>
        <div class="vk-card-desc" id="geo2gis-card-desc">Найти экраны рядом с категорией бизнеса</div>
      </div>
      <div class="vk-toggle"></div>
    </div>
    <div id="geo2gis-wrap" style="display:none; margin-top:14px;">
      <div style="margin-bottom:10px;">
        <div class="planner-label" style="margin-bottom:6px;">Название бренда или объекта</div>
        <input type="text" id="poi-brand" placeholder="Напр.: Пятёрочка, Магнит, McDonald's"
          style="width:100%; padding:9px 12px; border:1.5px solid #c4b5fd; border-radius:10px;
                 font-size:13px; color:#0b1220; background:#fff; outline:none; box-sizing:border-box;">
      </div>
      <div style="margin-bottom:14px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px;">
          <div class="planner-label" style="margin:0;">Радиус поиска</div>
          <span style="font-weight:700; color:#5b3ef5; font-size:13px;"><span id="poi-radius-val">500</span> м</span>
        </div>
        <input type="range" id="poi-radius" min="100" max="2000" step="50" value="500"
               style="width:100%; accent-color:#5b3ef5;">
        <div style="display:flex; justify-content:space-between; font-size:11px; color:#aaa; margin-top:2px;">
          <span>100 м</span><span>500 м</span><span>1 км</span><span>2 км</span>
        </div>
      </div>
      <button id="poi-find-btn" type="button"
        style="padding:11px 24px; background:#5B3EF5; color:#fff; border:none;
               border-radius:12px; font-size:14px; font-weight:700; cursor:pointer; width:100%;">
        🔍 Найти экраны
      </button>
      <div id="poi-status" style="font-size:13px; color:#667085; margin-top:10px; min-height:20px;"></div>
      <div id="poi-progress-wrap" style="display:none; margin-top:8px;">
        <div style="height:6px; background:rgba(91,62,245,0.12); border-radius:3px; overflow:hidden;">
          <div id="poi-progress-bar" style="height:100%; width:0%; background:#5B3EF5; border-radius:3px; transition:width 0.2s;"></div>
        </div>
        <div id="poi-progress-text" style="font-size:11px; color:#9b8aff; margin-top:4px;"></div>
      </div>
    </div>
  </div>
  <!-- ===== ЯНДЕКС ГЕОАНАЛИТИКА ===== -->
  <div class="planner-block" id="yandex-geo-block">
    <div class="vk-card" id="yandex-geo-card">
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
            border-radius:10px; font-size:13px; color:#0b1220; background:#fff; outline:none; cursor:pointer;">
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
          <span style="font-weight:700; color:#fc3f1d; font-size:13px;"><span id="yandex-radius-val">500</span> м</span>
        </div>
        <input type="range" id="yandex-radius" min="100" max="2000" step="50" value="500"
               style="width:100%; accent-color:#fc3f1d;">
        <div style="display:flex; justify-content:space-between; font-size:11px; color:#aaa; margin-top:2px;">
          <span>100 м</span><span>500 м</span><span>1 км</span><span>2 км</span>
        </div>
      </div>
      <button id="yandex-find-btn" type="button"
        style="padding:11px 24px; background:#fc3f1d; color:#fff; border:none;
               border-radius:12px; font-size:14px; font-weight:700; cursor:pointer; width:100%;">
        🔍 Найти экраны
      </button>
      <div id="yandex-poi-status" style="font-size:13px; color:#667085; margin-top:10px; min-height:20px;"></div>
      <div id="yandex-poi-progress-wrap" style="display:none; margin-top:8px;">
        <div style="height:6px; background:rgba(252,63,29,0.12); border-radius:3px; overflow:hidden;">
          <div id="yandex-poi-progress-bar" style="height:100%; width:0%; background:#fc3f1d; border-radius:3px; transition:width 0.2s;"></div>
        </div>
        <div id="yandex-poi-progress-text" style="font-size:11px; color:#fc3f1d; margin-top:4px;"></div>
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
  <!-- Разделитель -->
  <div class="additional-filters-divider">
    <span>Дополнительные ограничения</span>
  </div>
  <!-- Операторы -->
  <div class="planner-block">
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
  <div class="planner-block">
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
    <button type="button" class="wiz-btn" id="wiz-next-4">Цели →</button>
  </div>
</div>
  </div>
    <!-- Right -->
    <div class="ux-panel planner-right">
      <div class="planner-kicker" style="margin-bottom:10px;">Сводка</div>
      <!-- raw summary from planner.js (оставляем как источник истины) -->
<pre id="summary" class="summary-pre"></pre>
<!-- КРАСИВАЯ СВОДКА (карточки) -->
<div id="pretty-summary" style="margin-top:12px;"></div>
<!-- CHARTS -->
<div id="charts" style="margin-top:12px;"></div>
<div class="download-row">
  <button id="download-csv" class="wiz-btn">Скачать GIDы</button>
  <button id="download-pool-gids" class="wiz-btn ghost" style="display:none;" title="Скачать все экраны пула (до ограничений бюджета)">Скачать все экраны пула</button>
  <div style="position:relative;display:inline-flex;align-items:center;gap:4px;">
    <button id="download-plan-xlsx" class="wiz-btn ghost" disabled>Скачать план</button>
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
  <button id="download-poi-csv" class="wiz-btn ghost" disabled>Скачать POI (CSV)</button>
  <button id="download-poi-xlsx" class="wiz-btn ghost" disabled>Скачать POI (XLSX)</button>
  <button id="send-plan-btn">🚀 Передать менеджеру</button>
</div>
<div id="poi-results" style="margin-top:12px;"></div>
<!-- это твоя таблица "первые 10 экранов" — оставляем -->
<div id="results" style="margin-top:14px;"></div>
<div id="img-carousel" style="margin-top:16px;"></div>
<div id="planner-map" class="planner-map" style="display:none; margin-top:14px;"></div>
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
        <button id="poly-modal-confirm" type="button" class="ux-primary" disabled>Применить</button>
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
<link
  rel="stylesheet"
  href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
  crossorigin=""
/>
<link rel="stylesheet" href="https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css"/>
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
  console.log("after include:", "GeoUtils?", !!window.GeoUtils, "Papa?", !!window.Papa, "XLSX?", !!window.XLSX);
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

  // Порядок шагов: 1=География(div1), 2=Период(div2), 3=Настройки(div4), 4=Цели(div3).
  // Цели идут последними: к этому моменту адресная программа уже собрана, и
  // рекомендация бюджета считается от реального пула, а не от пустого набора.
  const STEP_TO_DIV = { 1: 1, 2: 2, 3: 4, 4: 3 };
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

  // Отмечаем посещение «Настроек» -- чтобы чип не был зелёным до первого визита
  const _origSetStep = setStep;
  window.setStep = function(step) {
    if (step === 3) window._plannerSettingsVisited = true; // логический шаг 3 = Настройки (физический div 4)
    _origSetStep(step);
    if (step === 3) { // Настройки
      // В GID-режиме скрываем лишнее -- только кнопка "Рассчитать" + "Назад".
      // «Аудитория VK» (audience-block) НЕ скрывается: фильтр по данным ВК
      // работает и по GID-списку (сужает введённый набор до топ-X% по аффинити).
      const gidsBlock = el("geo-gids-block");
      const isGidMode = gidsBlock && gidsBlock.style.display !== "none";
      const d = isGidMode ? "none" : "";
      [
        "step4-formats-block", "step4-strategy-block",
        "step4-map-zone-block", "step4-selection-block",
        "pool-preview-block"
      ].forEach(id => { const n = el(id); if (n) n.style.display = d; });
      document.querySelectorAll("#wiz-step-4 .additional-filters-divider").forEach(n => n.style.display = d);
      // Операторы и GRP по label (у них нет ID)
      document.querySelectorAll("#wiz-step-4 .planner-block").forEach(block => {
        const lbl = block.querySelector(".planner-label")?.textContent?.trim() || "";
        if (lbl === "Операторы" || lbl === "GRP") block.style.display = d;
      });
      // В GID-режиме показываем слайдер выходов в час
      const gidPpmBlock = el("step4-gid-ppm-block");
      if (gidPpmBlock) gidPpmBlock.style.display = isGidMode ? "" : "none";
      // В GID-режиме показываем блок «Дополнительные экраны с карты»
      const gidExtraBlock = el("step4-gid-extra-block");
      if (gidExtraBlock) gidExtraBlock.style.display = isGidMode ? "" : "none";
      if (isGidMode && typeof window.renderGidExtra === "function") window.renderGidExtra();
    }
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

  function updateNext1Btn(){
    const btn = el("wiz-next-1");
    if(!btn) return;
    const loading = window.DSP_AUTH_ENABLED && !window.PLANNER?.state?.dspInventoryWarmupDone;
    btn.textContent = loading ? "Загружаю экраны\\u2026" : "Дальше";
    btn.style.opacity = loading ? "0.6" : "";
    btn.style.cursor  = loading ? "default" : "";
  }
  window.addEventListener("planner:screens-ready", updateNext1Btn);
  setInterval(updateNext1Btn, 1000);

  el("wiz-next-1")?.addEventListener("click", () => {
    const gidsBlockEl = el("geo-gids-block");
    const isGidMode   = gidsBlockEl && gidsBlockEl.style.display !== "none";
    if (isGidMode) {
      if (!el("manual-gids")?.value?.trim()) return alert("Введите хотя бы один GID экрана.");
    } else {
      const regions = window.PLANNER_UI.getSelectedRegionsArr();
      if(!regions.length) return alert("Выберите регион, чтобы продолжить.");
    }
    if(window.DSP_AUTH_ENABLED && !window.PLANNER?.state?.dspInventoryWarmupDone){
      return alert("Инвентарь ещё загружается, подождите немного.");
    }
    window.setStep(2);
  });

  // wiz-step-2 (Период, шаг 2) → проверяем даты → Настройки (шаг 3)
  el("wiz-next-2")?.addEventListener("click", () => {
    if(!hasDates()) return alert("Выберите даты начала и окончания.");
    if(window.PLANNER_UI?.validateStep2Schedule && !window.PLANNER_UI.validateStep2Schedule()){
      return alert("Проверьте рваный график: включите хотя бы один день и задайте корректные интервалы времени.");
    }
    window.setStep(3);
  });

  el("wiz-next-4")?.addEventListener("click", () => window.setStep(4)); // Настройки → Цели

  el("wiz-back-2")?.addEventListener("click", () => window.setStep(1)); // Период → География
  el("wiz-back-3")?.addEventListener("click", () => window.setStep(3)); // Цели → Настройки
  el("wiz-back-4")?.addEventListener("click", () => window.setStep(2)); // Настройки → Период

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
              border-radius:8px;font-size:12px;margin-bottom:8px;outline:none;">
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
      (budgetMode === "fixed"    && budgetVal > 0) ||
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
    const pct = Math.round((p.done / 4) * 100);

    const bar = el("wiz-bar");
    const meta = el("wiz-meta");
    if(bar) bar.style.width = pct + "%";
    if(meta) meta.textContent = \`\${p.done}/4\`;

    // --- Прогресс-чеклист ---
    const chkEl = el("progress-checklist");
    if(chkEl){
      const steps = [
        { label: "Регион",    ok: !!(Array.isArray(window.PLANNER?.state?.selectedRegions) && window.PLANNER.state.selectedRegions.length) },
        { label: "Даты",      ok: !!(p.dates.start && p.dates.end) },
        { label: "Бюджет/цель", ok: p.done >= 2 && (()=>{ const bm = getBudgetMode(); const bv = Number(el("budget-input")?.value||0); const gv = Number(el("goal-ots")?.value||0); const gpv = Number(el("goal-plays")?.value||0); return bm==="recommendation"||(bm==="fixed"&&bv>0)||(bm==="goal_ots"&&gv>0)||(bm==="goal_plays"&&gpv>0); })() },
        { label: "Форматы",   ok: true }, // опциональны \\u2014 нет выбора = все форматы
      ];
      chkEl.innerHTML = steps.map(s => \`
        <span style="display:inline-flex;align-items:center;gap:4px;font-size:12px;padding:3px 9px;border-radius:999px;
          background:\${s.ok?"#f0fdf4":"#f8f9fb"};
          border:1px solid \${s.ok?"#86efac":"#e5e7eb"};
          color:\${s.ok?"#166534":"#9ca3af"};">
          \${s.ok?"\\u2713":"\\u25CB"} \${s.label}
        </span>
      \`).join("");
    }

    // --- Обновляем состояние чипов шагов (done / active) ---
    // Шаг 4 "выполнен" только если пользователь его посещал или уже был расчёт
    const settingsDone = !!(window._plannerSettingsVisited || window.PLANNER?.lastCalc);
    const _budgetOk = (()=>{ const bm = getBudgetMode(); const bv = Number(el("budget-input")?.value||0); const gv = Number(el("goal-ots")?.value||0); return bm==="recommendation"||(bm==="fixed"&&bv>0)||(bm==="goal_ots"&&gv>0); })();
    const stepDoneMap = { "1": !!(Array.isArray(window.PLANNER?.state?.selectedRegions) && window.PLANNER.state.selectedRegions.length), "2": !!(p.dates.start && p.dates.end), "3": settingsDone, "4": p.done >= 2 && _budgetOk };
    document.querySelectorAll("#wiz-steps .wiz-chip").forEach(chip => {
      const s = chip.dataset.step;
      chip.classList.toggle("done", !!stepDoneMap[s]);
    });

    const calcBtn = el("calc-btn");
    const hint    = el("calc-blocked-hint");
    if(calcBtn){
      const blocked = (p.done !== 4);
      calcBtn.disabled = blocked;
      calcBtn.style.opacity = blocked ? ".55" : "1";

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
          if(!bval || Number(bval) <= 0) reasons.push("не задан бюджет");
          if(window.DSP_AUTH_ENABLED && !st?.dspInventoryWarmupDone)
            reasons.push("инвентарь ещё загружается");
          hint.textContent = reasons.length ? "Что блокирует: " + reasons.join(", ") : "";
          hint.style.display = reasons.length ? "block" : "none";
        } else {
          hint.style.display = "none";
        }
      }
    }
  }

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
      renderProgress();
    }
    window.setGeoMode = setGeoMode;

    el("geo-tab-cities")?.addEventListener("click", () => setGeoMode("cities"));
    el("geo-tab-gids")?.addEventListener("click",   () => setGeoMode("gids"));

    // -- 2GIS card toggle ---------------------------------------------------
    (function(){
      const card = el("geo2gis-card");
      const wrap = el("geo2gis-wrap");
      if (!card || !wrap) return;
      card.addEventListener("click", () => {
        const active = card.classList.toggle("active");
        wrap.style.display = active ? "" : "none";
      });
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

    // -- 2GIS POI screen finder -----------------------------------------------
    el("poi-find-btn")?.addEventListener("click", async () => {
      const btn      = el("poi-find-btn");
      const statusEl = el("poi-status");
      const progWrap = el("poi-progress-wrap");
      const progBar  = el("poi-progress-bar");
      const progText = el("poi-progress-text");

      const searchQuery = (el("poi-brand")?.value || "").trim();
      if (!searchQuery) {
        return (statusEl.textContent = "\\u0412\\u0432\\u0435\\u0434\\u0438\\u0442\\u0435 \\u043d\\u0430\\u0437\\u0432\\u0430\\u043d\\u0438\\u0435 \\u0431\\u0440\\u0435\\u043d\\u0434\\u0430.");
      }
      const radius = Number(el("poi-radius")?.value || 500);

      const screensAll = window.PLANNER?.state?.screensAll || [];
      if (!screensAll.length) {
        return (statusEl.textContent = "Инвентарь ещё загружается, подождите.");
      }

      // Filter screens by selected regions/cities (same logic as rest of planner)
      const selectedRegions = window.PLANNER?.state?.selectedRegions || [];
      let screensPool = screensAll;
      if (selectedRegions.length) {
        const rset = new Set(selectedRegions);
        screensPool = screensAll.filter(s =>
          rset.has(String(s.region || "").trim()) ||
          rset.has(String(s.city   || "").trim())
        );
        const pst = window.PLANNER?.state;
        if (!screensPool.length && pst?.dspRegionToCities) {
          const citySet = new Set(selectedRegions.flatMap(r => pst.dspRegionToCities[r] || []));
          if (citySet.size) {
            screensPool = screensAll.filter(s => citySet.has(String(s.city || "").trim()));
          }
        }
        if (!screensPool.length) screensPool = screensAll;
      }

      btn.disabled = true;
      btn.textContent = "Ищу экраны\\u2026";
      statusEl.textContent = "";
      if (progWrap) progWrap.style.display = "block";
      if (progBar)  progBar.style.width = "0%";

      try {
        // Optimised approach: fetch ALL POIs of the given brand across the city/region
        // using paginated 2GIS search (radius = city-wide ~50 km), then match screens
        // locally by distance. O(pages) requests instead of O(screens).
        const GEO2GIS_KEY = "ba3c806e-746b-40b7-a1c8-4fc79c1a9667";

        // Local haversine distance in metres
        function distM(lat1, lon1, lat2, lon2) {
          const R = 6371000, toR = Math.PI / 180;
          const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
          const a = Math.sin(dLat/2)**2 + Math.cos(lat1*toR)*Math.cos(lat2*toR)*Math.sin(dLon/2)**2;
          return R * 2 * Math.asin(Math.sqrt(a));
        }

        // Compute centroid of the screen pool to use as city-wide search centre
        const validScreens = screensPool.filter(s => {
          const la = Number(s.lat ?? s.latitude), lo = Number(s.lon ?? s.lng ?? s.longitude);
          return isFinite(la) && isFinite(lo) && la !== 0 && lo !== 0;
        });
        if (!validScreens.length) throw new Error("Нет экранов с координатами.");

        const avgLat = validScreens.reduce((a,s) => a + Number(s.lat ?? s.latitude), 0) / validScreens.length;
        const avgLon = validScreens.reduce((a,s) => a + Number(s.lon ?? s.lng ?? s.longitude), 0) / validScreens.length;

        // Fetch all POI pages (max 50 per page) for the brand in a 50 km city-wide radius
        const PAGE_SIZE = 50, CITY_RADIUS = 50000;
        const allPois = []; // [{lat, lon}]
        let page = 1, totalPages = 1;
        statusEl.textContent = "Загружаю объекты 2GIS…";

        while (page <= totalPages && page <= 40) { // safety cap: 40 pages × 50 = 2000 POIs
          const url = "https://silent-surf-cd5e.mochalova-kathrine-v.workers.dev/2gis?q=" +
            encodeURIComponent(searchQuery) +
            "&location=" + avgLon + "," + avgLat +
            "&radius=" + CITY_RADIUS +
            "&page=" + page +
            "&page_size=" + PAGE_SIZE +
            "&fields=items.point" +
            "&key=" + GEO2GIS_KEY;
          const data = await fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
          if (!data?.result) break;
          const items = data.result.items || [];
          items.forEach(item => {
            const pt = item.point;
            if (pt?.lat && pt?.lon) allPois.push({ lat: Number(pt.lat), lon: Number(pt.lon) });
          });
          const total2 = data.result.total || 0;
          totalPages = Math.ceil(total2 / PAGE_SIZE);
          if (progBar)  progBar.style.width = Math.round(page / totalPages * 60) + "%";
          if (progText) progText.textContent = "POI: " + allPois.length + " / " + total2;
          statusEl.textContent = "Загружаю POI: " + allPois.length + " из " + total2;
          page++;
          if (!items.length) break;
        }

        if (!allPois.length) {
          if (progWrap) progWrap.style.display = "none";
          statusEl.textContent = "2GIS не нашёл «" + searchQuery + "» в этом городе.";
          statusEl.style.color = "#dc2626";
          btn.disabled = false; btn.textContent = "🔍 Найти экраны";
          return;
        }

        // Local match: screen is included if any POI is within radius
        statusEl.textContent = "Сопоставляю экраны…";
        const matchingGids = [];
        const seenIds = new Set();
        validScreens.forEach(s => {
          const sLat = Number(s.lat ?? s.latitude), sLon = Number(s.lon ?? s.lng ?? s.longitude);
          const near = allPois.some(p => distM(sLat, sLon, p.lat, p.lon) <= radius);
          if (!near) return;
          const gid = (s.screen_id ?? s.gid ?? s.GID ?? s.id ?? "").toString().trim();
          if (gid && !seenIds.has(gid)) { seenIds.add(gid); matchingGids.push(gid); }
        });

        if (progBar)  progBar.style.width = "100%";
        if (progText) progText.textContent = "Готово";

        if (progWrap) progWrap.style.display = "none";

        if (!matchingGids.length) {
          statusEl.textContent = "\\u041d\\u0435 \\u043d\\u0430\\u0439\\u0434\\u0435\\u043d\\u043e \\u044d\\u043a\\u0440\\u0430\\u043d\\u043e\\u0432. \\u0423\\u0432\\u0435\\u043b\\u0438\\u0447\\u044c\\u0442\\u0435 \\u0440\\u0430\\u0434\\u0438\\u0443\\u0441.";
          statusEl.style.color = "#dc2626";
        } else {
          const ta = el("manual-gids");
          if (ta) { ta.value = matchingGids.join("\\n"); ta.dispatchEvent(new Event("input", { bubbles: true })); }
          const selEl = el("selection-mode");
          if (selEl) {
            selEl.value = "manual_screens";
            selEl.dispatchEvent(new Event("change", { bubbles: true }));
          }
          statusEl.textContent = "\\u041d\\u0430\\u0439\\u0434\\u0435\\u043d\\u043e \\u044d\\u043a\\u0440\\u0430\\u043d\\u043e\\u0432: " + matchingGids.length + " \\u2014 \\u043d\\u0430\\u0436\\u043c\\u0438\\u0442\\u0435 \\u00AB\\u0420\\u0430\\u0441\\u0441\\u0447\\u0438\\u0442\\u0430\\u0442\\u044c\\u00BB";
          statusEl.style.color = "#5b3ef5";
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
      if (row)    row.style.borderColor = enabled ? "#5b3ef5" : "#e5e3f0";
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
  const audienceEnabled = el("audience-enabled");
  if (audienceEnabled) {
    audienceEnabled.addEventListener("change", e => {
      const wrap = el("audience-wrap");
      if (wrap) wrap.style.display = e.target.checked ? "block" : "none";
      // База отбора зависит от режима шага 1 (города / GID-список) -- пересчитываем
      if (e.target.checked) updateAudienceCoverage();
      renderProgress();
    });
  }

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
    if (statusEl) statusEl.textContent = "\\u2713 Данные загружены (" + (window.PLANNER?.state?.affinityMap?.size || 0).toLocaleString("ru-RU") + " экранов)";
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

    const COLLAPSE_LIMIT = 6;
    const expanded = !!window.PLANNER.ui.formatsExpanded;
    const visible = expanded ? items : items.slice(0, COLLAPSE_LIMIT);

    wrap.innerHTML = "";
    visible.forEach(({ fmt, count, label, desc }) => {
      const card = document.createElement("div");
      card.className = "fmt-card";

      card.innerHTML = \`
        <div class="fmt-left">
          <div class="fmt-title">\${escapeHtml(label)}</div>
          <div class="fmt-countline">\${count.toLocaleString("ru-RU")} экранов</div>
        </div>
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

  function fmtShort(f){
    const u = String(f||"").toUpperCase();
    if(u==="MEDIAFACADE"||u==="MF") return "MF";
    if(u==="BILLBOARD"  ||u==="BB") return "BB";
    if(u==="SUPERSITE"  ||u==="SS") return "SS";
    if(u==="CITY_BOARD" ||u==="CB"||u==="CITYBOARD") return "CB";
    if(u==="CITY_FORMAT"||u==="CF") return "CF";
    if(u==="PVZ_SCREEN" ||u==="PVZ") return "PVZ";
    return String(f||"").slice(0,6);
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
    for(const region of regions){
      const override = st.cityFormats[region] || null;
      const row = document.createElement("div");
      row.className = "city-fmt-row";

      const lbl = document.createElement("span");
      lbl.className = "city-fmt-lbl";
      lbl.title = region;
      lbl.textContent = region;
      row.appendChild(lbl);

      for(const fmt of fmts){
        const chip = document.createElement("button");
        chip.type = "button";
        chip.className = "city-fmt-chip" + (override&&override.has(fmt)?" on":"");
        chip.textContent = fmtShort(fmt);
        chip.title = fmt;
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
      border-radius: 14px;
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
          <img src="\${escapeHtml(url)}" alt="" style="max-width:100%; max-height:100%; object-fit:contain;">
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
    const arrAll = allItems.filter(s => !!getImg(s));
    const coordCount = allItems.filter(s => Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon))).length;
    const mapBtn = "";

    if(arrAll.length === 0){
      box.innerHTML = \`
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          <div style="font-weight:700;">Фото экранов</div>
          \${mapBtn}
        </div>
        <div style="font-size:13px; color:#666;">Нет изображений (image_url) у выбранных экранов.</div>
      \`;
      box.style.display = "block";
      el("carousel-map-download-btn")?.addEventListener("click", () => {
        if(window.PLANNER?.downloadMapHtml) window.PLANNER.downloadMapHtml();
      });
      return;
    }

    const byReg = groupByRegion(arrAll);

    const selectedOrder = getSelectedRegionsFromState();
    const regionsOrdered = [
      ...selectedOrder.filter(r => byReg.has(r)),
      ...Array.from(byReg.keys()).filter(r => !selectedOrder.includes(r))
    ];

    const sectionsHtml = regionsOrdered.map(regionName => {
      const regItems = (byReg.get(regionName) || []);

      // Сомнительные (аномально низкая ставка) — в начало списка: цель в том,
      // чтобы пользователь их увидел, а не искал в конце горизонтальной прокрутки.
      // Сортируем массив на месте, а не копию: обработчик клика ниже достаёт экран
      // по data-idx из byReg.get(region), и копия развалила бы это соответствие.
      regItems.sort((a, b) => (b._suspiciousBid ? 1 : 0) - (a._suspiciousBid ? 1 : 0));

      const cards = regItems.map((s, idx) => {
        const url = escapeHtml(getImg(s));
        const gid = escapeHtml(getGid(s));
        const own = escapeHtml(getOwner(s));
        const addr = escapeHtml(getAddr(s));
        const susp = !!s._suspiciousBid;
        const suspStyle = susp
          ? "border:2px solid #e04444; box-shadow:0 0 0 3px rgba(224,68,68,.10);"
          : "border:1px solid rgba(15,23,42,.10);";
        const suspBadge = susp
          ? \`<div style="margin-top:6px; display:inline-block; padding:2px 7px; border-radius:6px;
                 background:#fff1f1; color:#c62828; font-size:10px; font-weight:700;"
                 title="Ставка ниже 40% медианы по своему формату и городу">
               Низкая ставка
             </div>\`
          : "";

        return \`
          <div class="img-card" data-region="\${escapeHtml(regionName)}" data-idx="\${idx}" data-gid="\${gid}"
               style="min-width:220px; max-width:220px; \${suspStyle} border-radius:14px; overflow:hidden; background:#fff; cursor:pointer;">
            <div style="height:140px; background:#f2f4f8; display:flex; align-items:center; justify-content:center;">
              <img src="\${url}" alt="\${gid}" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
            </div>
            <div style="padding:10px;">
              <div style="font-weight:800; font-size:13px; line-height:1.2;">\${gid || "\\u2014"}</div>
              \${suspBadge}
              <div style="font-size:12px; color:#555; margin-top:4px;">\${own || "\\u2014"}</div>
              <div style="font-size:12px; color:#777; margin-top:4px; line-height:1.25; max-height:2.5em; overflow:hidden;">\${addr || ""}</div>
              <div style="display:flex; gap:6px; margin-top:8px;">
                <button type="button" class="card-remove-btn" data-gid="\${gid}" style="flex:1; padding:4px 6px; border-radius:6px; border:1px solid #e04444; background:#fff5f5; color:#e04444; font-size:11px; cursor:pointer; font-weight:500;">Убрать</button>
                <button type="button" class="card-replace-btn" data-gid="\${gid}" style="flex:1; padding:4px 6px; border-radius:6px; border:1px solid #5B3EF5; background:#F4F1FF; color:#5B3EF5; font-size:11px; cursor:pointer; font-weight:500;">Заменить</button>
              </div>
            </div>
          </div>
        \`;
      }).join("");

      return \`
        <div class="img-section" style="margin-top:14px;">
          <div style="display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin-bottom:8px;">
            <div style="font-weight:800;">Фото экранов \\u2014 \${escapeHtml(regionName)}</div>
            <div style="font-size:12px; color:#666;">Всего: \${regItems.length.toLocaleString("ru-RU")}</div>
          </div>
          <div class="img-row" data-region="\${escapeHtml(regionName)}"
               style="display:flex; gap:12px; overflow-x:auto; overflow-y:hidden; padding-bottom:6px; max-width:100%;">
            \${cards}
          </div>
          <div style="font-size:12px; color:#666; margin-top:6px;">
            Пролистайте вправо, чтобы увидеть больше. Нажмите на карточку, чтобы открыть просмотр.
          </div>
        </div>
      \`;
    }).join("");

    box.innerHTML = \`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
      <div style="font-weight:700;font-size:14px;color:#111827;">Фото экранов</div>
      \${mapBtn}
    </div>\` + sectionsHtml;
    box.style.display = "block";

    el("carousel-map-download-btn")?.addEventListener("click", () => {
      if(window.PLANNER?.downloadMapHtml) window.PLANNER.downloadMapHtml();
    });

    box.querySelectorAll(".img-section").forEach(section => {
      const regionName = section.querySelector(".img-row")?.dataset?.region || "";
      const regItems = (byReg.get(regionName) || []);

      section.querySelectorAll(".img-card").forEach(card => {
        card.style.scrollSnapAlign = "start";
        card.addEventListener("click", (e) => {
          if (e.target.closest("button")) return;
          const idx = Number(card.dataset.idx || 0);
          const s = regItems[idx];

          if (window.PLANNER?.focusScreenOnMap) window.PLANNER.focusScreenOnMap(s);
          window.dispatchEvent(new CustomEvent("planner:focus-screen", { detail: { screen: s } }));

          openLightbox(regItems, idx);
        });
      });

      section.querySelectorAll(".card-remove-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const gid = btn.dataset.gid;
          if (window.PLANNER?.removeScreen) window.PLANNER.removeScreen(gid);
          const chosen = window.PLANNER?.state?.lastChosen || [];
          lastItems = chosen;
          renderPerRegion(chosen);
          window.dispatchEvent(new CustomEvent("planner:screens-edited"));
        });
      });

      section.querySelectorAll(".card-replace-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const gid = btn.dataset.gid;
          if (window.PLANNER?.replaceScreen) {
            const newScreen = window.PLANNER.replaceScreen(gid);
            if (newScreen) {
              const chosen = window.PLANNER?.state?.lastChosen || [];
              lastItems = chosen;
              renderPerRegion(chosen);
              window.dispatchEvent(new CustomEvent("planner:screens-edited"));
            } else {
              btn.textContent = "Нет замены";
              btn.disabled = true;
              btn.style.opacity = "0.5";
            }
          }
        });
      });
    });
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

    window.addEventListener("planner:screens-edited", () => {
      if(!allowed) return;
      const chosen = window.PLANNER?.state?.lastChosen || [];
      lastItems = chosen;
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
    const existing = el("planner-map-header");
    if(existing){ existing.style.display = "flex"; return; }

    const box = el("planner-map");
    if(!box) return;

    const header = document.createElement("div");
    header.id = "planner-map-header";
    header.style.cssText = "display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;";
    header.innerHTML = \`
      <div style="font-weight:700;font-size:14px;color:#111827;">Карта экранов</div>
    \`;
    box.parentNode.insertBefore(header, box);
  }

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
      alert("Нет доступных экранов того же формата для замены.");
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

      const marker = L.marker([lat, lon]).addTo(layer).bindPopup(html, { maxWidth: 300 });
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
      }
    } else {
      const poly = L.polygon(vertices, { color: "#5B3EF5", fillOpacity: 0.15, weight: 2 }).addTo(drawLayer);
      currentPolys.push(poly);
    }

    vertices = [];
    const finBtn = el("poly-finish-btn");
    if (finBtn) finBtn.style.display = "none";

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
    updateModalState();
  }

  // -- update modal UI state --------------------------------------------
  function updateModalState() {
    const confirmBtn = el("poly-modal-confirm");
    const resetBtn   = el("poly-modal-reset");
    const countBadge = el("poly-modal-count");
    const hint       = el("poly-hint");

    const minVerts = drawMode === "line" ? 2 : 3;
    const hasPolys = currentPolys.length > 0;
    const hasVerts = vertices.length >= minVerts;

    if (confirmBtn) confirmBtn.disabled = !hasPolys;
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
        : " Нажмите \\u00ABПрименить\\u00BB или нарисуйте ещё зону.";
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

  // -- confirm: save all polygons to state -----------------------------
  function confirmPolygon() {
    if (!currentPolys.length) return;
    // Save as array of polygon coordinate arrays
    setPoly(currentPolys.map(p => p.getLatLngs()[0].map(ll => [ll.lat, ll.lng])));
    closeModal();
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
    el("poly-modal-confirm")?.addEventListener("click", confirmPolygon);
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
    // Форматы/операторы показываем всегда — можно выбрать до рисования зоны
    if (filtersWrap) filtersWrap.style.display = "block";

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
    alert(\`\${owner}\\nЭкраны в выбранных регионах: \${count.toLocaleString("ru-RU")}\`);
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
      if(st.selectedOwners.has(owner)) card.classList.add("is-selected");

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
    const totalBudget   = targetBudget; // badge shows target; unspent is shown via warning
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
      ? \`<div class="ps-warn"><b>Предупреждения:</b><br>\${warnArr.map(x => x.replace(/^\\u26A0\\uFE0F\\s*/, "")).join("<br>")}</div>\`
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
              \${(days && hpd && r.plays > 0 && r.screens > 0) ? \`<span><b>Частота:</b> \${(r.plays / days / hpd / r.screens).toFixed(1)}/ч на экран</span>\` : ""}
            </div>
          </div>
        \`;
      }).join("");

    // Per-format breakdown
    const fs = detail?.formatStats || {};

    const formatRows = Object.entries(fs)
      .sort((a,b) => b[1].screens - a[1].screens)
      .map(([fmtName, fd]) => {
        const otsPerPlay  = fd.otsPerPlay  != null
          ? fmtInt(fd.otsPerPlay)  + "\u202fOTS" : "\\u2014";
        const costPerPlay = fd.costPerPlay != null
          ? fmtInt(fd.costPerPlay) + "\u202f\\u20BD"   : "\\u2014";
        const esc = s => String(s||"").replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
        return \`<div class="ps-metric">
          <div class="k">\${esc(fmtName)}</div>
          <div class="v" style="font-size:15px;">\${fmtInt(fd.screens)}\u202f<span style="font-size:12px;font-weight:500;color:#667085;">экр.</span></div>
          <div style="margin-top:6px;font-size:12px;color:#667085;line-height:1.5;">
            OTS/выход:&nbsp;<b style="color:#0b1220;">\${otsPerPlay}</b><br>
            Стоимость выхода:&nbsp;<b style="color:#0b1220;">\${costPerPlay}</b>
          </div>
        </div>\`;
      }).join("");

    root.innerHTML = \`
      <div class="ps-wrap">
        <div class="ps-card">
          <div class="ps-head">
            <div>
              <div class="ps-title">Сводка кампании</div>
              <div class="ps-sub">Итоги и разбивка по регионам</div>
            </div>
            <div class="ps-badges">
              <span class="ps-badge"><b>Экраны:</b> \${fmtInt(totalScreens)}</span>
              <span class="ps-badge"><b>Бюджет:</b> \${fmtMoney(totalBudget)}</span>
            </div>
          </div>

          <div class="ps-grid">
            <div class="ps-metric"><div class="k">Выходов всего</div><div class="v">\${fmtInt(totalPlays)}</div></div>
            <div class="ps-metric"><div class="k">Стоимость выхода</div><div class="v">\${(totalBudget > 0 && totalPlays > 0) ? Math.round(totalBudget / totalPlays).toLocaleString("ru-RU") + "\u202f\\u20BD" : "\\u2014"}</div></div>
            <div class="ps-metric"><div class="k">Выходов в день</div><div class="v">\${playsPerDay == null ? "\\u2014" : fmtInt(playsPerDay)}</div></div>
            <div class="ps-metric"><div class="k">OTS всего</div><div class="v">\${otsTotal == null ? "\\u2014" : fmtInt(otsTotal)}</div></div>
            <div class="ps-metric"><div class="k">Выходов / час на экран</div><div class="v">\${(playsPerHour != null && totalScreens > 0) ? (playsPerHour / totalScreens).toFixed(1) : "\\u2014"}</div></div>
            <div class="ps-metric"><div class="k">CPM (стоимость 1\u202f000 OTS)</div><div class="v">\${(totalBudget > 0 && otsTotal > 0) ? Math.round(totalBudget / otsTotal * 1000).toLocaleString("ru-RU") + "\u202f\\u20BD" : "\\u2014"}</div></div>
          </div>

          \${warnsHtml}
        </div>

        \${formatRows ? \`
        <div class="ps-card">
          <div class="ps-title">По форматам</div>
          <div class="ps-sub">Экраны, OTS за выход и средняя ставка по каждому формату</div>
          <div class="ps-grid" style="margin-top:12px;">\${formatRows}</div>
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
  function fmtSec(ms){ return Math.round(ms / 1000) + " сек"; }

  function collectDurations(){
    var st = window.PLANNER && window.PLANNER.state;
    // Канонический список с /inventories/available-durations — не зависит от того,
    // что уже успело подгрузиться в screensAll. Фолбэк — union из текущего инвентаря.
    if (st && Array.isArray(st.availableDurationsMs) && st.availableDurationsMs.length) {
      return st.availableDurationsMs.slice().sort(function(a,b){ return a - b; });
    }
    var screens = (st && Array.isArray(st.screensAll)) ? st.screensAll : [];
    var set = new Set();
    screens.forEach(function(s){
      if (!Array.isArray(s.durationBidInfo)) return;
      s.durationBidInfo.forEach(function(d){ if (Number.isFinite(d.duration)) set.add(d.duration); });
    });
    return [...set].sort(function(a,b){ return a - b; });
  }

  function renderDurationChips(){
    var block = el("duration-block");
    var wrap = el("duration-chips");
    if (!block || !wrap) return;
    var durations = collectDurations();
    if (!durations.length) { block.style.display = "none"; return; }
    block.style.display = "";

    var st = window.PLANNER.state;
    if (!durations.includes(st.selectedDurationMs)) st.selectedDurationMs = durations[0];

    wrap.innerHTML = "";
    durations.forEach(function(ms){
      var label = document.createElement("label");
      label.className = "str-chip";
      var active = ms === st.selectedDurationMs;
      label.innerHTML = "<input type=\\"radio\\" name=\\"duration_ms\\" value=\\"" + ms + "\\"" + (active ? " checked" : "") + ">" +
        "<div class=\\"str-chip-body\\"><div class=\\"str-chip-title\\">" + fmtSec(ms) + "</div></div>";
      label.querySelector("input").addEventListener("change", function(){
        st.selectedDurationMs = ms;
        if (typeof window.PLANNER.applySelectedDuration === "function") window.PLANNER.applySelectedDuration(ms);
        window.dispatchEvent(new CustomEvent("planner:filters-changed"));
      });
      wrap.appendChild(label);
    });
    // Применяем выбор сразу — на случай если инвентарь перезагрузился и minBid ещё «база»
    if (typeof window.PLANNER.applySelectedDuration === "function") window.PLANNER.applySelectedDuration(st.selectedDurationMs);
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

  function renderSideBlock(){
    var block = document.getElementById("side-block");
    if (!block) return;
    block.style.display = hasSideData() ? "" : "none";
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
    bindSideCheckboxes();
    renderSideBlock();
  }

  window.addEventListener("planner:screens-ready", function(){ bindSideCheckboxes(); renderSideBlock(); });
  window.addEventListener("planner:filters-changed", renderSideBlock);
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
    if(id === "grp-min" || id === "grp-max" || id === "constructions-count"){
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

  function showFloat(targetEl) {
    if (!window.PLANNER?.lastCalc) return; // только после первого расчёта
    clearTimeout(hideTimer);

    // Позиционируем по Y-центру изменённого элемента, прижимаем к правому краю
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      const y = rect.top + rect.height / 2;
      // Держим кнопку в видимой зоне экрана
      const clampedY = Math.max(60, Math.min(window.innerHeight - 60, y));
      floatBtn.style.top = clampedY + "px";
    }

    floatBtn.style.display = "flex";
    floatBtn.style.opacity = "1";
  }

  function hideFloat() {
    floatBtn.style.opacity = "0";
    hideTimer = setTimeout(() => { floatBtn.style.display = "none"; }, 200);
  }

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
    hideFloat();
    calcBtn.click();
  });

  // После завершения расчёта -- скрываем кнопку
  window.addEventListener("planner:calc-done", hideFloat);
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

    if (!pool.length) return alert("\\u041d\\u0435\\u0442 \\u044d\\u043a\\u0440\\u0430\\u043d\\u043e\\u0432 \\u0432 \\u043f\\u0443\\u043b\\u0435.");

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

  // Script block: авто-скролл к сводке после расчёта
  runScript(`
(function(){
  // Кнопка «Рассчитать» стоит внизу левой колонки, а сводка рендерится в правой —
  // на десктопе к моменту клика она уже уехала вверх за экран, на мобиле лежит
  // ниже всей формы. После calc-done подтягиваем её в вид.
  // window.scrollTo, а не scrollIntoView: в Tilda виджет лежит во вложенных
  // скролл-контейнерах, и scrollIntoView промахивается (см. setStep выше).
  window.addEventListener("planner:calc-done", () => {
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
      st.selectedDurationMs || ""
    ].join("~");
  }

  const fmtMoney = (v) => Math.round(v).toLocaleString("ru-RU") + " \u20BD";

  function showSkeleton() {
    sums.forEach(n => { n.classList.add("rtb-skel"); n.textContent = "0"; });
  }
  function showValues(tiers) {
    sums.forEach(n => {
      n.classList.remove("rtb-skel");
      const v = tiers ? Number(tiers[n.dataset.sum]) : NaN;
      n.textContent = (Number.isFinite(v) && v > 0) ? fmtMoney(v) : "\u2014";
    });
  }

  function recompute(force) {
    if (!visible()) return;
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
})();
`);

})().catch(e => console.error("[widget-init]", e));
