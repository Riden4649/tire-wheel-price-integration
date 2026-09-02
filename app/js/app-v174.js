(() => {
  "use strict";
  const stamp = "20260902-ai-team-v193";
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = `css/ui-v193.css?v=${stamp}`;
  document.head.appendChild(css);

  function load(src, done) {
    const script = document.createElement("script");
    script.src = `${src}?v=${stamp}`;
    script.async = false;
    if (done) script.addEventListener("load", done, { once: true });
    document.head.appendChild(script);
  }

  load("js/app-v174-core.js", () => load("js/ui-v193.js"));
})();