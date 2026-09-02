(() => {
  "use strict";

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function isVisible(el) {
    return Boolean(el && !el.hidden && getComputedStyle(el).display !== "none");
  }

  function decorateTabs() {
    const labels = { tire: "タイヤ", wheel: "アルミホイール", estimate: "セット見積", settings: "管理" };
    $$(".tab[data-tab]").forEach(button => {
      const label = labels[button.dataset.tab];
      if (!label) return;
      if (button.dataset.shortLabel !== label) button.dataset.shortLabel = label;
      if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
    });
  }

  function updateVersionBadge() {
    const version = $(".status-stack small");
    if (version && version.textContent !== "Ver1.9.3") version.textContent = "Ver1.9.3";
  }

  function keepSearchOnlyNoticeUseful() {
    const notice = $("#searchOnlyVehicleNotice");
    const text = $("#searchOnlyVehicleText");
    if (!isVisible(notice) || !text) return false;
    const next = text.textContent
      .replace("タイヤ・アルミ候補は表示しません。", "アルミホイール候補は価格確認用として表示します。装着適合は未確認です。")
      .replace("アルミ候補は表示しません。", "アルミホイール候補は価格確認用として表示します。装着適合は未確認です。");
    if (next !== text.textContent) text.textContent = next;
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
      return;
    }

    const warning = $("#wheelFitmentWarning");
    const warningText = "この車両はアルミ適合情報が未確認です。表示中の候補は価格確認用で、装着適合を示しません。販売前にホイールメーカーの最新公式情報と現車で確認してください。";
    if (warning) {
      if (warning.hidden) warning.hidden = false;
      if (warning.textContent !== warningText) warning.textContent = warningText;
    }

    $("#wheelResults")?.classList.add("reference-only-results");
  }

  function clearReferenceModeWhenVerified() {
    if (isVisible($("#searchOnlyVehicleNotice"))) return;
    $("#wheelResults")?.classList.remove("reference-only-results");
  }

  function syncVehicleCarryoverLabel() {
    const summary = $("#sharedVehicleSummary");
    if (!summary) return;
    const selected = Boolean(summary.textContent && !/車両未選択/.test(summary.textContent));
    document.body.classList.toggle("has-shared-vehicle", selected);
  }

  let queued = false;
  function enhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      document.documentElement.classList.add("ai-team-v193");
      decorateTabs();
      updateVersionBadge();
      keepSearchOnlyNoticeUseful();
      syncVehicleCarryoverLabel();
      clearReferenceModeWhenVerified();
      showUnverifiedWheelCandidates();
    });
  }

  document.addEventListener("click", event => {
    if (event.target.closest(".tab, [data-vehicle-filter], #clearVehicleSelection, #clearVehicleModelSearch, [data-wheel-search-mode]")) {
      setTimeout(enhance, 0);
      setTimeout(enhance, 80);
    }
  }, true);

  const observer = new MutationObserver(enhance);

  function start() {
    enhance();
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class", "hidden"] });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();