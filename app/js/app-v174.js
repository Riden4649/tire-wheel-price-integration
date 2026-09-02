(() => {
  "use strict";
  const stamp = "20260902-ai-team-v194";

  function style(href, key) {
    if (document.querySelector(`link[data-ui-style="${key}"]`)) return;
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${href}?v=${stamp}`;
    css.dataset.uiStyle = key;
    document.head.appendChild(css);
  }

  style("css/ui-v193.css", "v193-base");
  style("css/ui-v194.css", "v194");
  style("css/ui-v194-qa.css", "v194-qa");

  function load(src, done) {
    const script = document.createElement("script");
    script.src = `${src}?v=${stamp}`;
    script.async = false;
    if (done) script.addEventListener("load", done, { once: true });
    document.head.appendChild(script);
  }

  load("js/app-v174-core.js", () => load("js/ui-v194.js"));
})();