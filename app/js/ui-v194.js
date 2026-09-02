(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  let queued = false;

  function visible(el){ return Boolean(el && !el.hidden && getComputedStyle(el).display !== "none"); }

  function version(){
    const v = $(".status-stack small");
    if(v && v.textContent !== "Ver1.9.4") v.textContent = "Ver1.9.4";
  }

  function labels(){
    const map={tire:"タイヤ",wheel:"アルミホイール",estimate:"セット見積",settings:"管理"};
    $$(".tab[data-tab]").forEach(b=>{ const t=map[b.dataset.tab]; if(t && b.textContent!==t)b.textContent=t; });
  }

  function keepTireControlsOpen(){
    const details=$("#tireSearchDetails");
    if(details && !details.open) details.open=true;
  }

  function placeVehicleSearch(){
    const vehicle=$("#sharedVehicleSearch");
    const active=$(".panel.active");
    if(!vehicle || !active) return;
    if(active.id === "tab-tire"){
      const search=$("#tireSearchDetails");
      if(search && vehicle.parentElement===active && search.nextElementSibling===vehicle) return;
      if(search) search.insertAdjacentElement("afterend",vehicle);
      return;
    }
    const head=active.querySelector(".section-head");
    if(vehicle.parentElement===active && (!head || head.nextElementSibling===vehicle)) return;
    if(head) head.insertAdjacentElement("afterend",vehicle); else active.prepend(vehicle);
  }

  function notice(){
    const box=$("#searchOnlyVehicleNotice"), text=$("#searchOnlyVehicleText");
    if(!visible(box)||!text) return false;
    const next=text.textContent
      .replace("タイヤ・アルミ候補は表示しません。","アルミホイール候補は価格確認用として表示します。装着適合は未確認です。")
      .replace("アルミ候補は表示しません。","アルミホイール候補は価格確認用として表示します。装着適合は未確認です。");
    if(next!==text.textContent) text.textContent=next;
    return true;
  }

  function unverifiedWheels(){
    const wheel=$("#tab-wheel");
    if(!notice() || !wheel?.classList.contains("active")) return;
    const vehicleMode=$("[data-wheel-search-mode=\"vehicle\"]"), wheelMode=$("[data-wheel-search-mode=\"wheel\"]");
    if(vehicleMode?.classList.contains("active") && wheelMode){ wheelMode.click(); return; }
    const warning=$("#wheelFitmentWarning");
    const t="この車両はアルミ適合情報が未確認です。表示中の候補は価格確認用で、装着適合を示しません。販売前にホイールメーカーの最新公式情報と現車で確認してください。";
    if(warning){ if(warning.hidden) warning.hidden=false; if(warning.textContent!==t) warning.textContent=t; }
    $("#wheelResults")?.classList.add("reference-only-results");
  }

  function clearReference(){ if(!visible($("#searchOnlyVehicleNotice"))) $("#wheelResults")?.classList.remove("reference-only-results"); }

  function qaGuards(){
    const summary=$("#vehicleSummary");
    if(summary?.hidden) summary.style.removeProperty("display");
    const search=$("#tireSearchDetails");
    if(search && search.hidden) search.hidden=false;
  }

  function apply(){
    queued=false;
    document.documentElement.classList.add("ai-team-v193","ai-team-v194");
    labels(); version(); keepTireControlsOpen(); placeVehicleSearch(); qaGuards(); notice(); clearReference(); unverifiedWheels();
  }
  function schedule(){ if(queued)return; queued=true; requestAnimationFrame(apply); }

  document.addEventListener("click",e=>{ if(e.target.closest(".tab,#sharedVehicleSearch,#tireSearchDetails,[data-wheel-search-mode],#clearVehicleSelection")){ setTimeout(schedule,0); setTimeout(schedule,80); } },true);
  const observer=new MutationObserver(schedule);
  function start(){ schedule(); observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden","open"]}); }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start,{once:true}); else start();
})();