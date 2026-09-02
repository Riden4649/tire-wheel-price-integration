(() => {
  "use strict";

  const SNAPSHOT_KEY = "integrated-main-master-snapshot-v1";
  const META_KEY = "integrated-main-master-meta-v1";
  const TARGETS = {
    "data/vehicles_2012_2026.json": "fitment",
    "data/jp_vehicle_search_master_2000_2026_v1.json": "search",
    "data/vehicle_service_specs.json": "service"
  };
  const nativeFetch = window.fetch.bind(window);

  function readSnapshot() {
    try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY) || "null"); }
    catch { return null; }
  }

  function countRecords(payload, fallbackKey) {
    if (Array.isArray(payload)) return payload.length;
    if (Array.isArray(payload?.vehicles)) return payload.vehicles.length;
    if (Array.isArray(payload?.records)) return payload.records.length;
    if (fallbackKey && Array.isArray(payload?.[fallbackKey])) return payload[fallbackKey].length;
    return 0;
  }

  function validateSnapshot(snapshot) {
    const fitmentCount = countRecords(snapshot.fitment, "vehicles");
    const searchCount = countRecords(snapshot.search, "vehicles");
    if (fitmentCount < 1 || searchCount < 1) throw new Error("車両マスターの件数検証に失敗しました。");
    return {
      fitmentCount,
      searchCount,
      serviceCount: countRecords(snapshot.service, "records")
    };
  }

  window.fetch = async function masterAwareFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const path = url.replace(location.origin + location.pathname.replace(/[^/]*$/, ""), "").split("?")[0];
    const key = TARGETS[path] || TARGETS[url.split("?")[0]];
    const snapshot = key ? readSnapshot() : null;
    if (key && snapshot?.[key]) {
      return new Response(JSON.stringify(snapshot[key]), {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Master-Source": "device-snapshot" }
      });
    }
    return nativeFetch(input, init);
  };

  async function fetchJson(path) {
    const response = await nativeFetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }

  async function replaceMaster(status, badge, button) {
    if (!navigator.onLine) {
      status.textContent = "オフラインです。端末保存済みのメインデータをそのまま使用します。";
      return;
    }
    const oldText = button.textContent;
    button.disabled = true;
    button.textContent = "更新中…";
    status.textContent = "最新メインデータ一式を取得しています…";
    try {
      const [fitment, search, service] = await Promise.all([
        fetchJson("data/vehicles_2012_2026.json"),
        fetchJson("data/jp_vehicle_search_master_2000_2026_v1.json"),
        fetchJson("data/vehicle_service_specs.json").catch(() => ({ records: [] }))
      ]);
      const snapshot = { fitment, search, service, updatedAt: new Date().toISOString(), schemaVersion: 1 };
      const counts = validateSnapshot(snapshot);
      const serialized = JSON.stringify(snapshot);
      JSON.parse(serialized);
      localStorage.setItem(SNAPSHOT_KEY, serialized);
      localStorage.setItem(META_KEY, JSON.stringify({ updatedAt: snapshot.updatedAt, ...counts }));
      status.textContent = `更新完了：詳細適合 ${counts.fitmentCount}件 / 車種検索 ${counts.searchCount}件 / 整備情報 ${counts.serviceCount}件。再読込します。`;
      badge.textContent = "最新一式 保存済み";
      window.setTimeout(() => location.reload(), 350);
    } catch (error) {
      console.error("main master replacement failed", error);
      status.textContent = `更新失敗：${error.message}。現在の端末データは変更していません。`;
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function formatMeta() {
    try {
      const meta = JSON.parse(localStorage.getItem(META_KEY) || "null");
      if (!meta?.updatedAt) return "未更新";
      const date = new Date(meta.updatedAt);
      return `${date.toLocaleString("ja-JP", { hour12: false })} / 詳細${meta.fitmentCount || 0}件・検索${meta.searchCount || 0}件`;
    } catch { return "未更新"; }
  }

  function setupUi() {
    const button = document.querySelector("#checkVehicleUpdates");
    const status = document.querySelector("#vehicleMasterStatus");
    const badge = document.querySelector("#vehicleMasterBadge");
    if (!button || !status || !badge) return;

    const card = button.closest(".import-card");
    card?.querySelector(".import-card-head strong")?.replaceChildren("メインデータ更新");
    button.textContent = "メインデータ更新";
    button.classList.remove("secondary");
    button.classList.add("primary");

    const exportButton = document.querySelector("#exportVehicleDelta");
    if (exportButton) exportButton.hidden = true;
    const fileInput = document.querySelector("#vehicleMasterFile");
    if (fileInput?.closest("label")) fileInput.closest("label").hidden = true;

    const metaText = formatMeta();
    status.textContent = `GitHubの最新メインデータ一式と端末データをそっくり入れ替えます。未登録車候補は別保存のため消えません。最終更新：${metaText}`;
    badge.textContent = readSnapshot() ? "端末一式 保存済み" : "初回未更新";

    button.addEventListener("click", event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      replaceMaster(status, badge, button);
    }, true);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setupUi, { once: true });
  else setupUi();
})();
