(() => {
  "use strict";
  const app = window.IntegratedApp, state = app.state, model = window.ConsultationModel;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const escape = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const yen = n => `¥${Math.round(n || 0).toLocaleString("ja-JP")}`;
  const KEY = "integrated-consultation-v2";
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch {}
  let comparisons = Array.isArray(saved.comparisons) ? saved.comparisons.slice(0, 4) : [];
  let selectedComparison = Number.isInteger(saved.selectedComparison) && saved.selectedComparison >= 0 && saved.selectedComparison < comparisons.length ? saved.selectedComparison : -1;
  let history = Array.isArray(saved.history) ? saved.history.slice(0, 30) : [];
  let activeTab = "home", restoring = false;
  function status(message) { $("#dealStatus").textContent = message; }
  function persist() {
    if (restoring) return;
    try { localStorage.setItem(KEY, JSON.stringify({ draft: snapshot(), comparisons, history, selectedComparison })); }
    catch { status("端末保存に失敗しました。空き容量を確認してください。現在の商談は画面内で継続できます。"); }
  }
  function snapshot() {
    return model.snapshot(state, app.currentEstimateParts(), app.vehicleContext(), $("#printSheet").outerHTML);
  }
  function restore(quote, restoreSettings = true) {
    if (!quote || quote.schemaVersion !== 1) return;
    restoring = true;
    state.selectedTire = model.clone(quote.tire); state.selectedWheel = model.clone(quote.wheel);
    if (!restoreSettings) {
      state.selectedTire = [...state.summerTireData, ...state.winterTireData].find(item => item.id === quote.tire?.id) || state.selectedTire;
      state.selectedWheel = [...state.bsWheelData, ...state.otherWheelData].find(item => item.id === quote.wheel?.id) || state.selectedWheel;
    }
    state.vehicleSelection = model.clone(quote.vehicleSelection || state.vehicleSelection);
    state.manualMode = Boolean(quote.manualMode); state.manualVehicle = model.clone(quote.manualVehicle || {});
    if (restoreSettings) {
      // Only quote-related pricing/fees: never replace shop details, display options or import metadata.
      for (const key of ["taxRate", "rounding", "tireAddition", "defaultRate", "wheelMarkup", "wheelPricingMode", "wheelBrandDiscounts", "setDiscountRate", "laborCategories", "estimateCosts", "defaultCosts"])
        if (quote.settings?.[key] != null) state.settings[key] = model.clone(quote.settings[key]);
      app.applySettingsToInputs();
    }
    fillManual();
    if (state.manualMode) $("#tireSize").value = state.manualVehicle.oem_tire || "";
    app.refresh(); restoring = false;
  }

  document.documentElement.classList.add("consultation-app");
  document.title = "商談価格ナビ 統合版 Ver2.0.0";
  $(".status-stack small").textContent = "Ver2.0.0";
  const workspace = document.createElement("div"); workspace.id = "dealWorkspace";
  $(".shell").insertBefore(workspace, $("#tab-tire"));
  workspace.append($("#tab-tire"), $("#tab-wheel"), $("#tab-estimate"));
  const estimate = $("#tab-estimate");
  const summary = document.createElement("section"); summary.className = "deal-summary";
  summary.innerHTML = `<span id="dealType">見積</span><span class="total-label">税込総額 / 4本</span><strong id="dealTotal">¥0</strong>
    <div id="dealSelections"></div><div class="product-switches"><button id="toggleTire" class="secondary">＋タイヤを追加</button><button id="toggleWheel" class="secondary">＋アルミホイールを追加</button></div>
    <dl id="dealBreakdown"></dl><p id="dealWarnings" role="status"></p><button id="addComparison" class="primary">比較に保存（最大4案）</button>`;
  estimate.insertBefore(summary, estimate.querySelector(".estimate-layout"));
  const preview = document.createElement("details"); preview.id = "quotePreview";
  preview.innerHTML = "<summary>見積書プレビュー</summary>";
  estimate.append(preview); preview.append($("#printSheet"));
  const comparison = document.createElement("section"); comparison.id = "comparisonPanel";
  comparison.innerHTML = `<div class="comparison-head"><h2>比較 <span id="comparisonCount">0 / 4</span></h2><button id="printComparison" class="secondary">比較印刷</button></div><div id="comparisonCards"></div>
    <details><summary>商談履歴（端末保存・最新30件）</summary><div id="quoteHistory"></div></details>`;
  estimate.insertBefore(comparison, estimate.querySelector(".estimate-control-layout"));
  $("#tireSearchDetails").open = true;
  $("#wheelSearchDetails").open = true;
  $("#tab-tire h1").textContent = "タイヤ一覧";
  $("#tab-wheel h1").textContent = "アルミホイール一覧";
  $("[data-wheel-search-mode=vehicle]").textContent = "適合候補を優先";
  $("[data-wheel-search-mode=wheel]").textContent = "全商品を見る";
  $("#wheelSearchDetails").before($(".search-mode-switch"));
  const wheelMode = $("[data-wheel-search-mode=wheel]");
  wheelMode.addEventListener("click", () => {
    for (const selector of ["#wheelMaker", "#wheelBrand", "#wheelPattern", "#wheelInch", "#wheelPcd", "#wheelSize", "#wheelColor"]) $(selector).value = "";
    app.renderWheels();
  });

  function showTab(tab) {
    activeTab = tab;
    const dealing = ["tire", "wheel", "estimate"].includes(tab);
    workspace.hidden = !dealing;
    workspace.classList.toggle("estimate-only", tab === "estimate");
    $("#consultationHeader").hidden = !dealing;
    $("#tireSeasonSwitch").hidden = tab !== "tire";
    $("#sharedVehicleSearch").hidden = !dealing;
    if (dealing) estimate.classList.add("active");
    $$('[data-step]').forEach(button => {
      const step = button.dataset.step;
      const done = step === "vehicle" ? !!(state.vehicleSelection.tire || state.manualVehicle.oem_tire) : step === "tire" ? !!state.selectedTire : step === "wheel" ? !!state.selectedWheel : !!(state.selectedTire || state.selectedWheel);
      button.classList.toggle("done", done);
      if (step === tab) button.setAttribute("aria-current", "step"); else button.removeAttribute("aria-current");
    });
  }
  document.addEventListener("consultation:tab", e => showTab(e.detail));
  $("#newConsultation").addEventListener("click", () => {
    if (!window.confirm("新しい商談を作成しますか？\n現在の選択商品・車種／サイズ・費用調整・比較案をクリアします。\n商品データ・基本設定・保存履歴は残ります。")) return;
    restoring = true;
    try {
      comparisons = []; selectedComparison = -1;
      app.resetConsultation(); fillManual(); renderComparisons();
      $("#manualVehicleDetails").open = false;
      $("#sharedVehicleSearch").open = true;
      $("#tireSearchDetails").open = true;
      $("#wheelSearchDetails").open = true;
      preview.open = false;
      $("#quoteHistory").parentElement.open = false;
      status(""); app.switchTab("home");
    } finally { restoring = false; }
    render();
    $("#newConsultationStatus").textContent = "商談と比較案をクリアしました。車種またはサイズから新しい商談を始められます。";
  });
  $$('[data-start]').forEach(button => button.addEventListener("click", () => {
    $("#newConsultationStatus").textContent = "";
    app.switchTab("tire");
    $("#sharedVehicleSearch").open = button.dataset.start === "vehicle";
    if (button.dataset.start === "size") {
      if (!state.manualMode) state.manualVehicle = { ...app.vehicleContext(), oem_tire: state.vehicleSelection.tire };
      state.manualMode = true; fillManual(); $("#manualVehicleDetails").open = true;
      $("#manualTireSize").focus(); app.refresh();
    } else { $("#vehicleModelSearch").focus(); }
  }));
  $$('[data-step]').forEach(button => button.addEventListener("click", () => {
    if (button.dataset.step === "vehicle") { $("#sharedVehicleSearch").open = true; $("#vehicleModelSearch").focus(); }
    else app.switchTab(button.dataset.step);
  }));
  $("#toggleTire").addEventListener("click", () => {
    if (state.selectedTire) app.removeProduct("tire"); else app.switchTab("tire");
  });
  $("#toggleWheel").addEventListener("click", () => {
    if (state.selectedWheel) app.removeProduct("wheel"); else app.switchTab("wheel");
  });
  const manualFields = { manualModel: "model", manualYear: "year", manualTireSize: "oem_tire", manualPcd: "pcd", manualHoles: "holes", manualHub: "hub_bore", manualFastener: "fastener", manualTorque: "wheel_torque_nm" };
  function fillManual() {
    const vehicle = state.manualMode ? state.manualVehicle : app.currentVehicle() || state.vehicleSelection;
    for (const [id, field] of Object.entries(manualFields)) $("#" + id).value = field === "oem_tire" ? (state.manualMode ? vehicle.oem_tire : state.vehicleSelection.tire) || "" : vehicle[field] ?? "";
  }
  $("#manualSelection").addEventListener("click", () => {
    if (!state.manualMode) { fillManual(); state.manualVehicle = { ...app.vehicleContext(), oem_tire: state.vehicleSelection.tire }; }
    state.manualMode = true; $("#manualVehicleDetails").open = true; $("#sharedVehicleSearch").open = false;
    app.refresh(); status("手動選択に切り替えました。商品と工賃は保持しています。");
  });
  $("#applyManualVehicle").addEventListener("click", () => {
    state.manualMode = true;
    state.manualVehicle = Object.fromEntries(Object.entries(manualFields).map(([id, field]) => [field, $("#" + id).value.trim()]));
    state.manualVehicle.confidence = "D";
    $("#tireSize").value = state.manualVehicle.oem_tire; state.tireInch = "";
    $("#tireProduct").value = ""; $("#tireBrand").value = "";
    $("#manualVehicleDetails").open = false; $("#sharedVehicleSearch").open = false;
    $("#tireSearchDetails").open = false;
    app.refresh(); status("手動条件を反映しました。適合は未確認です。");
  });
  $("#recordManualVehicle").addEventListener("click", async () => {
    try {
      if (!$("#manualModel").value.trim()) throw new Error("候補保存には車種名を入力してください。");
      await window.VehicleStore.recordMissing({ maker: state.vehicleSelection.maker || "その他", model: $("#manualModel").value, year: $("#manualYear").value, tire_size: $("#manualTireSize").value,
        memo: Object.entries(manualFields).map(([id, name]) => `${name}: ${$("#" + id).value}`).join(" / ") });
      status("未登録候補として端末に保存しました。確認後にDBへ追加できます。");
    } catch (error) { status(error.message); }
  });

  function render() {
    const parts = app.currentEstimateParts(), kind = model.type(state.selectedTire, state.selectedWheel), vehicle = app.vehicleContext();
    $("#dealType").textContent = model.title(state.selectedTire, state.selectedWheel);
    $("#dealTotal").textContent = kind === "empty" ? "—" : yen(parts.total);
    $("#dealSelections").textContent = [state.selectedTire && `${state.selectedTire.subbrand} ${state.selectedTire.size}`, state.selectedWheel && `${state.selectedWheel.brandName || ''} ${state.selectedWheel.patternName} ${state.selectedWheel.sizeText}`].filter(Boolean).join(" / ") || "商品未選択";
    $("#toggleTire").textContent = state.selectedTire ? "タイヤを外す" : "＋タイヤを追加";
    $("#toggleWheel").textContent = state.selectedWheel ? "アルミホイールを外す" : "＋アルミホイールを追加";
    const lines = [["タイヤ（4本）", parts.tireSingle * 4], ["アルミホイール（4本）", parts.wheelSingle * 4], ...parts.costLines.filter(x => x.enabled).map(x => [x.label, x.total])];
    $("#dealBreakdown").innerHTML = lines.map(([label, amount]) => `<dt>${escape(label)}</dt><dd>${yen(amount)}</dd>`).join("");
    $("#dealWarnings").textContent = kind === "empty" ? "商品未選択のため見積作成できません。" : app.quoteWarnings().join(" / ");
    $("#addComparison").disabled = kind === "empty" || comparisons.length >= 4;
    $("#dealVehicleLabel").textContent = [vehicle.maker, vehicle.model || "車種未選択", state.manualMode ? vehicle.year : state.vehicleSelection.year, state.manualMode ? vehicle.oem_tire : state.vehicleSelection.tire,
      vehicle.pcd && `PCD ${vehicle.pcd}`, vehicle.holes && `${vehicle.holes}穴`, vehicle.hub_bore && `ハブ ${vehicle.hub_bore}mm`, vehicle.fastener,
      vehicle.wheel_torque_nm && `締付 ${vehicle.wheel_torque_nm} N・m`, state.manualMode && "手動・未確認"].filter(Boolean).join(" / ");
    $("#homeDataStatus").textContent = `端末データ：タイヤ ${state.tireProducts.length}件 / アルミ ${state.wheelProducts.length}件。${navigator.onLine ? 'オフラインでも保存データで商談できます。' : 'オフラインで動作中。'}`;
    showTab(activeTab); persist();
  }
  function renderComparisons() {
    $("#comparisonCount").textContent = `${comparisons.length} / 4`;
    $("#printComparison").disabled = !comparisons.length;
    $("#comparisonCards").innerHTML = comparisons.map((quote, i) => `<article class="comparison-card" data-comparison-index="${i}"><h3>第${i + 1}案 · ${escape(model.title(quote.tire, quote.wheel))}</h3><strong>${yen(quote.parts.total)}</strong><p>${escape([quote.tire?.subbrand, quote.wheel?.patternName, quote.vehicle?.model].filter(Boolean).join(" / "))}</p><small>${escape(new Date(quote.savedAt).toLocaleString("ja-JP"))} 時点の価格</small><div class="action-row"><button data-restore="${i}" aria-label="第${i + 1}案を選択して編集">この案を選択</button><button data-remove="${i}">比較から外す</button></div></article>`).join("") || "比較する案を保存してください。";
    updateComparisonSelection();
    $("#quoteHistory").innerHTML = history.map((quote, i) => `<button data-history="${i}">${escape(new Date(quote.savedAt).toLocaleString("ja-JP"))} · ${escape(quote.tire?.subbrand || quote.wheel?.patternName)} · ${yen(quote.parts.total)}</button>`).join("") || "保存履歴はありません。";
  }
  function updateComparisonSelection() {
    $$("[data-comparison-index]").forEach(card => {
      const selected = Number(card.dataset.comparisonIndex) === selectedComparison;
      card.classList.toggle("selected", selected);
      const button = card.querySelector("[data-restore]");
      button.setAttribute("aria-pressed", String(selected));
      button.textContent = selected ? "選択中" : "この案を選択";
    });
  }
  function selectComparison(index) {
    const quote = comparisons[index]; if (!quote) return;
    selectedComparison = index;
    restore(quote); app.switchTab("estimate"); updateComparisonSelection(); render();
    status("比較案を選択しました。商品・工賃を呼び出して編集できます。保存済みの比較案は変更されません。");
  }
  $("#addComparison").addEventListener("click", () => {
    try { const quote = snapshot(); comparisons = model.addComparison(comparisons, quote); selectedComparison = comparisons.length - 1; history = [quote, ...history].slice(0, 30); renderComparisons(); render(); status("比較に保存しました。保存時の価格・工賃を保持します。"); }
    catch (error) { status(error.message); }
  });
  comparison.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (button?.dataset.remove != null) {
      const index = Number(button.dataset.remove);
      comparisons.splice(index, 1);
      if (selectedComparison === index) selectedComparison = -1;
      else if (selectedComparison > index) selectedComparison--;
      renderComparisons(); render(); return;
    }
    if (button?.dataset.history != null) {
      const quote = history[Number(button.dataset.history)];
      if (quote) { selectedComparison = -1; restore(quote); app.switchTab("estimate"); updateComparisonSelection(); render(); status("保存案を復元しました。商品データは保存時点、金額は復元した計算条件で表示しています。"); }
      return;
    }
    const card = event.target.closest("[data-comparison-index]");
    if (card) selectComparison(Number(card.dataset.comparisonIndex));
  });
  $("#printComparison").addEventListener("click", () => {
    if (!comparisons.length) return;
    // Saved sheets use the existing A4 layout; one proposal per page preserves readability.
    const html = comparisons.map((quote, index) => {
      const template = document.createElement("template"); template.innerHTML = quote.sheetHtml;
      template.content.querySelector(".print-heading span").textContent = `比較 第${index + 1}案 / 全${comparisons.length}案`;
      return template.innerHTML;
    }).join("");
    app.showPrintPreview(html);
  });
  document.addEventListener("consultation:change", render);
  // Repaint vehicle context after search/clear without observing or moving the DOM repeatedly.
  $("#vehicleModelSearch").addEventListener("input", render);
  $("#clearVehicleSelection").addEventListener("click", render);
  if (saved.draft) restore(saved.draft, false);
  renderComparisons(); app.switchTab("home"); render();
})();
