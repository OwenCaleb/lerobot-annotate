// Compatibility loader for AI UI.
// If your index.html already loads /static/ai/ai_ui.js, this file does nothing.
// If your index.html loads /static/ai_plugin.js (old patches), this file will load the new UI.

(function () {
  if (window.__AI_UI_LOADED__) return;

  function ensureCss(href) {
    const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .some((l) => (l.getAttribute('href') || '') === href);
    if (exists) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }

  function ensureScript(src) {
    const exists = Array.from(document.querySelectorAll('script'))
      .some((s) => (s.getAttribute('src') || '') === src);
    if (exists) return;
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    document.head.appendChild(script);
  }

  ensureCss('/static/ai/ai_ui.css');
  ensureScript('/static/ai/ai_ui.js');
})();