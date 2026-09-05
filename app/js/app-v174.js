(() => {
  "use strict";
  const stamp = "20260905-v210-auto-missing-vehicle";

  function style(href, key) {
    if (document.querySelector(`link[data-ui-style="${key}"]`)) return;
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${href}?v=${stamp}`;
    css.dataset.uiStyle = key;
    document.head.appendChild(css);
  }

  style("css/consultation.css", "v200");

  function load(src, done) {
    const script = document.createElement("script");
    script.src = `${src}?v=${stamp}`;
    script.async = false;
    if (done) script.addEventListener("load", done, { once: true });
    document.head.appendChild(script);
  }

  load("js/master-db-update-v197.js", () => {
    Promise.resolve(window.MasterBundle?.ready).then(() => {
      load("js/consultation-model.js", () => load("js/app-v174-core.js", () => load("js/consultation.js")));
    });
  });
})();
