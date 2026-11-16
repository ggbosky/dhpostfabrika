// JavaScript, který aplikace vloží do webové fabriky (WebView) ještě před jejím načtením.
// Webová fabrika stahuje obrázky a videa přes <a download href="blob:…"> – to WebView v telefonu sám neumí.
// Most soubor přečte a pošle aplikaci po kouscích (base64), aplikace ho uloží do paměti telefonu.
// Stejně tak kopírování do schránky jde přes aplikaci (spolehlivější než ve WebView).
export const MOST_JS = `(function () {
  if (window.__dhMost) return;
  window.__dhMost = true;
  window.__dhAplikace = true;
  function posli(o) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
  var KUS = 3 * 256 * 1024; // násobek 3 bajtů → kousky base64 jdou bez problémů za sebe
  function naBase64(blob) {
    return new Promise(function (ok, chyba) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = chyba;
      r.readAsDataURL(blob);
    });
  }
  async function odesliBlob(blob, nazev) {
    var id = Date.now() + '-' + Math.random().toString(36).slice(2);
    posli({ typ: 'start', id: id, nazev: nazev, mime: blob.type || '', velikost: blob.size });
    for (var i = 0; i < blob.size; i += KUS) {
      posli({ typ: 'kus', id: id, data: await naBase64(blob.slice(i, i + KUS)) });
    }
    posli({ typ: 'konec', id: id });
  }
  async function stahni(href, nazev) {
    try {
      var blob = await (await fetch(href)).blob();
      await odesliBlob(blob, nazev || 'soubor');
    } catch (e) {
      posli({ typ: 'chyba', zprava: String((e && e.message) || e) });
    }
  }
  var puvodniClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.hasAttribute('download') && /^(blob|data):/.test(this.href)) { stahni(this.href, this.getAttribute('download')); return; }
    return puvodniClick.call(this);
  };
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[download]') : null;
    if (a && /^(blob|data):/.test(a.href)) { e.preventDefault(); e.stopPropagation(); stahni(a.href, a.getAttribute('download')); }
  }, true);
  try {
    if (navigator.clipboard) {
      var puvodni = navigator.clipboard.writeText ? navigator.clipboard.writeText.bind(navigator.clipboard) : null;
      navigator.clipboard.writeText = function (t) {
        posli({ typ: 'schranka', text: String(t) });
        return puvodni ? puvodni(t).catch(function () {}) : Promise.resolve();
      };
    }
  } catch (e) {}
  true;
})();`;

// Zprávy, které most posílá do aplikace.
export type ZpravaMostu =
  | { typ: "start"; id: string; nazev: string; mime: string; velikost: number }
  | { typ: "kus"; id: string; data: string }
  | { typ: "konec"; id: string }
  | { typ: "chyba"; zprava: string }
  | { typ: "schranka"; text: string };
