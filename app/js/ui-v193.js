(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function isVisible(el) {
    return Boolean(el && !el.hidden && getComputedStyle(el).display !== "none");
  }

  function decorateTabs() {
    const labels = {
      tire: "タイヤ",
      wheel: "アルミホイール",
      estimate: "セット見積",
      settings: "管理"
    };
    $$(".tab[data-tab]").forEach(button => {
      const key = button.dataset.tab;
      if (!labels[key]) return;
      button.dataset.shortLabel = labels[key];
      button.setAttribute("aria-label", labels[key]);
    });
  }

  function updateVersionBadge() {
    const version = document.querySelector(".status-stack small");
    if (version) version.textContent = "Ver1.9.3";
  }

  function keepSearchOnlyNoticeUseful() {
    const notice = $("#searchOnlyVehicleNotice");
    const text = $("#searchOnlyVehicleText");
    if (!isVisible(notice) || !text) return false;

    text.textContent = text.textContent
      .replace("タイヤ・アルミ候補は表示しません。", "アルミホイール候補は価格確認用として表示します。装着適合は未確認です。")
      .replace("アルミ候補は表示しません。", "アルミホイール候補は価格確認用として表示します。装着適合は未確認です。");
    return true;
  }

  function showUnverifiedWheelCandidates() {
    const noticeActive = keepSearchOnlyNoticeUseful();
    const wheelPanel = $("#tab-wheel");
    if (!noticeActive || !wheelPanel?.classList.contains("active")) return;

    const vehicleMode = $('[data-wheel-search-mode="vehicle"]');
    const wheelMode = $('[data-wheel-search-mode="wheel"]');
    if (vehicleMode?.classList.contains("active") && wheelMode) {
      wheelMode.click();
    }

    const warning = $("#wheelFitmentWarning");
    if (warning) {
      warning.hidden = false;
      warning.textContent = "この車両はアルミ適合情報が未確認です。表示中の候補は価格確認用で、装着適合を示しません。販売前にホイールメーカーの最新公式情報と現車で確認してください。";
    }

    const results = $("#wheelResults");
    if (results) results.classList.add("reference-only-results");
  }

  function clearReferenceModeWhenVerified() {
    if (isVisible($("#searchOnlyVehicleNotice"))) return;
    $("#wheelResults")?.classList.remove("reference-only-results");
  }

  function syncVehicleCarryoverLabel() {
    const summary = $("#sharedVehicleSummary");
    if (!summary) return;
    const selected = summary.textContent && !/車両未選択/.test(summary.textContent);
    document.body.classList.toggle("has-shared-vehicle", Boolean(selected));
  }

  function enhance() {
    document.documentElement.classList.add("ai-team-v193");
    decorateTabs();
    updateVersionBadge();
    keepSearchOnlyNoticeUseful();
    syncVehicleCarryoverLabel();
    clearReferenceModeWhenVerified();
    showUnverifiedWheelCandidates();
  }

  document.addEventListener("click", event => {
    if (event.target.closest(".tab, [data-vehicle-filter], #clearVehicleSelection, #clearVehicleModelSearch, [data-wheel-search-mode]")) {
      setTimeout(enhance, 0);
      setTimeout(enhance, 80);
    }
  }, true);

  const observer = new MutationObserver(() => {
    requestAnimationFrame(enhance);
  });

  function start() {
    enhance();
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();