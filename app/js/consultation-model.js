(function (root) {
  "use strict";
  const clone = value => JSON.parse(JSON.stringify(value));
  const type = (tire, wheel) => tire && wheel ? "set" : tire ? "tire" : wheel ? "wheel" : "empty";
  const titles = { tire: "タイヤ お見積り", wheel: "アルミホイール お見積り", set: "タイヤ・アルミホイールセット お見積り", empty: "商品を選択してください" };
  root.ConsultationModel = Object.freeze({
    clone, type, title: (tire, wheel) => titles[type(tire, wheel)],
    snapshot(state, parts, vehicle, sheetHtml) {
      return clone({ schemaVersion: 1, savedAt: new Date().toISOString(), type: type(state.selectedTire, state.selectedWheel),
        tire: state.selectedTire, wheel: state.selectedWheel, vehicle, vehicleSelection: state.vehicleSelection,
        manualVehicle: state.manualVehicle, manualMode: state.manualMode, settings: state.settings, parts, sheetHtml });
    },
    addComparison(items, quote) {
      if (quote.type === "empty") throw new Error("商品を選択してください。");
      if (items.length >= 4) throw new Error("比較は最大4案です。不要な案を外してから追加してください。");
      return [...items, clone(quote)];
    }
  });
})(typeof window === "undefined" ? globalThis : window);
