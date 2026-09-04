(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.VehicleSearchMaster = Object.freeze(api);
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const text = value => String(value ?? "").trim();
  const unique = values => [...new Set(values.filter(Boolean))];
  const normalize = value => text(value).normalize("NFKC").toLowerCase()
    .replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s\-‐‑‒–—―・_/]/g, "");

  const OFFICIAL_SEARCH_ADDITIONS = [
    ["トヨタ","アバロン",[]],["トヨタ","ルーミー",[]],["トヨタ","エスティマ・エミーナ ルシーダ",["エスティマエミーナ","エスティマルシーダ","エミーナ","ルシーダ"]],["トヨタ","クラウンコンフォート",[]],["トヨタ","コンフォート",[]],["トヨタ","コムス",[]],["トヨタ","ハイエースコミューター",[]],
    ["日産","e-NV200バネット",["e-NV200","eNV200","e-NV200 バネット"]],["日産","サニー",[]],["日産","ローレル",[]],
    ["ホンダ","オルティア",[]],["ホンダ","ロゴ",[]],["ホンダ","シビックフェリオ",["シビック フェリオ"]],
    ["マツダ","カペラ",[]],["マツダ","カペラワゴン",[]],
    ["SUBARU","インプレッサアネシス",["インプレッサ アネシス"]],["SUBARU","インプレッサスポーツワゴン",["インプレッサ スポーツワゴン"]],["SUBARU","サンバーディアス",["サンバー ディアス"]],["SUBARU","デックス",[]],["SUBARU","ルクラ",["ルクラカスタム","ルクラ カスタム"]],
    ["スズキ","SX-4セダン",["SX4セダン","SX-4 セダン"]],["スズキ","エブリイプラス",["エブリープラス","エブリ-プラス"]],["スズキ","エブリイランディ",["エブリーランディ","エブリ-ランディ"]],["スズキ","カルタス",[]],["スズキ","カルタスワゴン",[]],["スズキ","キザシ",[]],["スズキ","シボレーMW",[]],["スズキ","シボレークルーズ",[]],["スズキ","ジムニーワイド",["ジムニー ワイド","ジムニ-ワイド"]],["スズキ","スペーシアベース",["スペーシア ベース"]],["スズキ","パレットSW",["パレット SW"]],["スズキ","バレーノ",[]],["スズキ","ワゴンRプラス",["ワゴンR プラス"]],
    ["ダイハツ","テリオスルキア",[]],["ダイハツ","デルタワゴン",[]],["ダイハツ","パイザー",[]],["ダイハツ","ハイゼットグランカーゴ",["ハイゼット グランカーゴ"]],["ダイハツ","ミラカスタム",[]],["ダイハツ","ミラジーノ1000",["ミラジーノ 1000"]],["ダイハツ","ミラトコット",[]],["ダイハツ","ムーヴラテ",["ムーブラテ"]],
    ["三菱","アスパイア",[]],["三菱","eKクラッシー",["ekクラッシー","EKクラッシー"]],["三菱","eKスポーツ",["ekスポーツ","EKスポーツ"]],["三菱","FTO",[]],["三菱","タウンボックスワイド",["タウンボックス ワイド"]],["三菱","ディアマンテワゴン",[]],["三菱","デリカスペースギア",["デリカ スペースギア"]],["三菱","トッポBJワイド",["トッポBJ ワイド"]],["三菱","ミニキャブ-MiEV",["ミニキャブMiEV","ミニキャブ ミーブ"]],["三菱","ミニキャブ-MiEVトラック",["ミニキャブMiEVトラック","ミニキャブ MiEV トラック"]],["三菱","ミラージュディンゴ",[]],["三菱","ランサーワゴン",[]],["三菱","レグナム",[]]
  ].map(([maker, model, aliases]) => ({
    search_id: `${maker}:${model}`,
    maker,
    model,
    aliases,
    market: "JP",
    search_enabled: true,
    fitment_ready: false,
    fitment_status: "official_source_fitment_pending",
    fitment_note: "2026-09-03受領の公式扱いマッチング資料で車種存在を確認。型式単位の適合データとの紐付け完了までは適合判定に使用しない。"
  }));

  function normalizeDataset(payload) {
    const baseRecords = Array.isArray(payload) ? payload : (Array.isArray(payload?.vehicles) ? payload.vehicles : []);
    const seen = new Set();
    return [...baseRecords, ...OFFICIAL_SEARCH_ADDITIONS]
      .filter(record => record && record.search_enabled !== false && text(record.search_id) && text(record.maker) && text(record.model))
      .filter(record => {
        const key = `${normalize(record.maker)}|${normalize(record.model)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map(record => ({
        search_id: text(record.search_id), maker: text(record.maker), model: text(record.model), aliases: unique(Array.isArray(record.aliases) ? record.aliases.map(text) : []),
        market: text(record.market), fitment_ready: record.fitment_ready === true, fitment_status: text(record.fitment_status), fitment_note: text(record.fitment_note)
      }));
  }

  function modelVariants(model) {
    const known = {
      "ノア/ヴォクシー": ["ノア", "ヴォクシー"], "ノア/ヴォクシー/エスクァイア": ["ノア", "ヴォクシー", "エスクァイア"],
      "アルファード/ヴェルファイア": ["アルファード", "ヴェルファイア"], "カローラ/ツーリング/スポーツ": ["カローラ", "カローラツーリング", "カローラスポーツ"],
      "カローラ/フィールダー/アクシオ": ["カローラ", "カローラフィールダー", "カローラアクシオ"], "デミオ/MAZDA2": ["デミオ", "MAZDA2"],
      "eKワゴン/eKクロス": ["eKワゴン", "eKクロス"], "eKワゴン/eKカスタム": ["eKワゴン", "eKカスタム"]
    };
    return known[model] || [model, ...text(model).split(/[\/／]/)];
  }

  function names(record) { return unique([...modelVariants(record.model), ...(record.aliases || [])]).map(normalize); }

  function matchingVehicles(record, vehicles) {
    const recordNames = new Set(names(record));
    return vehicles.filter(vehicle => normalize(vehicle.maker) === normalize(record.maker) && names(vehicle).some(name => recordNames.has(name)));
  }

  function merge(vehicles, searchRecords) {
    const verified = (Array.isArray(vehicles) ? vehicles : []).map(vehicle => ({ ...vehicle, aliases: [...(vehicle.aliases || [])] }));
    const records = normalizeDataset(searchRecords).map(record => {
      const matches = matchingVehicles(record, verified);
      matches.forEach(vehicle => { vehicle.aliases = unique([...(vehicle.aliases || []), record.model, ...record.aliases]); });
      return { ...record, linked_vehicle_ids: matches.map(vehicle => vehicle.vehicle_id), has_verified_fitment: matches.length > 0 };
    });
    return { vehicles: verified, searchRecords: records, linkedCount: records.filter(record => record.has_verified_fitment).length };
  }

  return { normalize, normalizeDataset, matchingVehicles, merge };
});
