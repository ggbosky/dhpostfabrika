// YouTube Studio & Growth Factory: připojení kanálu, knihovna videí, publikace (video → SEO → miniatura →
// nastavení → nahrání → miniatura → playlist → ověření), playlisty, komentáře a historie publikací.
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const Y = () => window.DHYouTube;
const AI = () => window.DHAI;
const U = () => window.DHYtUloziste;
const toast = (t, d) => window.DHToast?.(t, d);

const NAVRH_PLAYLISTU = ["Hokejové legendy", "Historie NHL", "Český hokej", "Hokejové rekordy", "Legendární momenty", "Hokejové zajímavosti"];
const TYPY_TITULU = { A: "Zvědavost", B: "Dokument", C: "Emoce", D: "SEO", E: "Krátký a silný" };
const KROKY = [["kanal", "Kanál & videa"], ["publikovat", "Publikovat"], ["playlisty", "Playlisty"], ["komentare", "Komentáře"], ["historie", "Historie"], ["pripojeni", "⚙ Připojení"]];

let krok = "kanal";
let kanal = null, videa = [], seznamPlaylistu = null, kategorie = null;
let pub = null;             // rozpracovaná publikace
let souborVidea = null;     // File/Blob (soubory se do úložiště nekopírují)
let razeni = "publikovano";
let ukladani = null;

const cislo = (n) => (Number.isFinite(n) ? n.toLocaleString("cs-CZ") : "–");
const cas = (s) => (s == null ? "–" : `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)}:` : ""}${String(Math.floor((s % 3600) / 60)).padStart(Math.floor(s / 3600) ? 2 : 1, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`);
const bajty = (s) => new TextEncoder().encode(s || "").length;
// YouTube počítá délku tagů: čárky mezi tagy + tag s mezerou jako by byl v uvozovkách.
const delkaTagu = (tagy) => tagy.reduce((a, t) => a + t.length + (/\s/.test(t) ? 2 : 0), 0) + Math.max(0, tagy.length - 1);

function zprava(t, druh = "", id = "#ysZprava") {
  const el = $(id);
  if (!el) return;
  el.innerHTML = t; el.className = `zprava ${druh}`; el.hidden = !t;
}

// ------------------------------------------------------------------ kostra --

function kostra() {
  $("#youtubeObsah").innerHTML = `
    <div class="card ys-kanal" id="ysKanal"></div>
    <nav class="r-kroky ys-kroky">${KROKY.map(([k, n]) => `<button type="button" class="r-krok" data-ys-krok="${k}">${n}</button>`).join("")}</nav>
    <div class="zprava" id="ysZprava" hidden></div>
    ${KROKY.map(([k]) => `<div data-ys-panel="${k}" hidden></div>`).join("")}`;
}

function vykresliVse() {
  if (!$("#youtubeObsah [data-ys-panel]")) kostra();
  vykresliKanal();
  $$("[data-ys-krok]").forEach((b) => b.classList.toggle("on", b.dataset.ysKrok === krok));
  $$("[data-ys-panel]").forEach((d) => { d.hidden = d.dataset.ysPanel !== krok; });
  ({ kanal: vykresliVidea, publikovat: vykresliPublikaci, playlisty: vykresliPlaylisty, komentare: vykresliKomentare, historie: vykresliHistorii, pripojeni: vykresliPripojeni })[krok]?.();
}

function vykresliKanal() {
  const el = $("#ysKanal");
  if (!el) return;
  if (Y().pripojeno() && kanal) {
    el.innerHTML = `<div class="ys-profil">${kanal.avatar ? `<img src="${esc(kanal.avatar)}" alt="">` : ""}
      <div><b>${esc(kanal.nazev)}</b><small class="muted">${esc(kanal.vlastniUrl)} · <span class="st-zive"><i></i> připojeno</span></small></div></div>
      <div class="ys-cisla"><div><span>Odběratelé</span><b>${kanal.odberatele == null ? "skryto" : cislo(kanal.odberatele)}</b></div>
        <div><span>Zhlédnutí celkem</span><b>${cislo(kanal.zhlednuti)}</b></div><div><span>Videí</span><b>${cislo(kanal.videi)}</b></div></div>
      <div class="radek" style="gap:6px"><button type="button" class="btn small ghost" data-ys="obnovit">↻ Obnovit</button><button type="button" class="btn small ghost" data-ys="odpojit">Odpojit</button></div>`;
    return;
  }
  const minule = Y().posledniKanal();
  el.innerHTML = `<div class="ys-profil">${minule?.avatar ? `<img src="${esc(minule.avatar)}" alt="" style="opacity:.5">` : ""}
    <div><b>YouTube není připojený</b><small class="muted">${minule ? `Naposledy: ${esc(minule.nazev)} – přihlášení platí jen do zavření stránky (bezpečnost).` : "Připoj kanál Deník hokeje přes Google (OAuth). Heslo se nikam nezadává."}</small></div></div>
    <div class="radek" style="gap:6px">${Y().clientId() ? `<button type="button" class="btn small" data-ys="pripojit">▶ Připojit YouTube</button>` : `<button type="button" class="btn small" data-ys-krok="pripojeni">⚙ Nastavit připojení</button>`}</div>`;
}

async function pripojit() {
  try {
    await Y().prihlas(["cteni"]);
    kanal = await Y().kanal();
    toast(`YouTube připojen ✓ ${esc(kanal.nazev)}`);
    videa = [];
    if (krok === "pripojeni") krok = "kanal";
    vykresliVse();
  } catch (e) { zprava(esc(e.message), "chyba"); }
}

// ------------------------------------------------------------ připojení --

function vykresliPripojeni() {
  const el = $('[data-ys-panel="pripojeni"]');
  const origin = location.origin;
  el.innerHTML = `
    <div class="mt-mrizka">
      <div class="card">
        <h2>Připojení YouTube (jednorázové nastavení)</h2>
        <ol class="ys-navod">
          <li>Otevři <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noopener">Google Cloud Console</a> a vytvoř projekt (např. „Deník hokeje Studio“).</li>
          <li><b>APIs & Services → Library</b>: zapni <b>YouTube Data API v3</b> a <b>YouTube Analytics API</b>.</li>
          <li><b>Google Auth Platform → Branding / Audience</b> (dřív „OAuth consent screen“): typ <b>External</b>, vyplň název a e-mail,
            v <b>Audience → Test users</b> přidej svůj Google účet, pod kterým je kanál.</li>
          <li><b>Data Access → Add or remove scopes</b>: <code>youtube.readonly</code>, <code>youtube.upload</code>, <code>youtube</code>,
            <code>youtube.force-ssl</code> (komentáře), <code>yt-analytics.readonly</code>.</li>
          <li><b>Clients → Create client → Web application</b>. Do <b>Authorized JavaScript origins</b> vlož přesně:
            <code>${esc(origin)}</code> (Redirect URI není potřeba). Zkopíruj <b>Client ID</b> (končí <code>.apps.googleusercontent.com</code>).</li>
          <li>Vlož ho sem a klikni <b>Připojit YouTube</b>. Google ukáže okno pro přihlášení – vyber účet s kanálem Deník hokeje.</li>
        </ol>
        <label>OAuth Client ID<input id="ysClient" value="${esc(Y().clientId())}" placeholder="123456-abc.apps.googleusercontent.com" autocomplete="off"></label>
        <div class="akce"><button type="button" class="btn" data-ys="ulozit-client">Uložit a připojit</button>
          ${Y().clientId() ? `<button type="button" class="btn ghost" data-ys="smazat-client">Smazat Client ID</button>` : ""}</div>
      </div>
      <div class="card">
        <h2>Co je dobré vědět</h2>
        <ul class="ys-info">
          <li><b>Bezpečnost:</b> heslo k Googlu aplikace nikdy nevidí. Client ID je veřejný identifikátor (tajemství klienta se nepoužívá),
            přístupový token drží aplikace jen v paměti (~1 hodinu) a nikam ho neukládá. Po zavření stránky se připojíš jedním kliknutím znovu.</li>
          <li><b>Proč bez serveru:</b> aplikace běží na GitHub Pages (žádný backend). Používá oficiální postup Googlu pro webové aplikace
            („token model“). Trvalé přihlášení s obnovovacím tokenem by vyžadovalo vlastní server (např. Cloudflare Worker) – dá se doplnit.</li>
          <li><b>Testovací režim:</b> dokud aplikaci v Google Cloud neodešleš k ověření, Google při přihlášení ukáže varování
            „Google tuto aplikaci neověřil“ → <i>Pokračovat</i>. Pro vlastní kanál to stačí (max. 100 testovacích uživatelů).</li>
          <li><b>Kvóta:</b> YouTube Data API má 10 000 jednotek denně; nahrání videa má vlastní limit (~100 nahrání/den), běžná čtení stojí 1 jednotku.</li>
          <li><b>Vlastní miniatury</b> vyžadují kanál s ověřeným telefonem (youtube.com/verify).</li>
          <li><b>Imprese a CTR miniatur</b> YouTube API nevydává – jen YouTube Studio. Proto se zapisují ručně u miniatur (A/B záznamy).</li>
        </ul>
      </div>
    </div>`;
}

// ------------------------------------------------------------ knihovna --

async function nactiVidea() {
  if (!kanal) kanal = await Y().kanal();
  videa = await Y().videa(kanal.uploads, 100);
  try { localStorage.setItem("dhpf_yt_naplanovana", JSON.stringify(videa.filter((v) => v.naplanovano && new Date(v.naplanovano) > new Date()).map((v) => ({ id: v.id, nazev: v.nazev, cas: v.naplanovano })))); } catch { /* nic */ }
  document.dispatchEvent(new CustomEvent("dh:youtube-videa"));
}

async function vykresliVidea() {
  const el = $('[data-ys-panel="kanal"]');
  if (!Y().pripojeno()) { el.innerHTML = `<div class="card"><p class="muted" style="margin:0">Pro knihovnu videí připoj YouTube (tlačítko nahoře).</p></div>`; return; }
  if (!videa.length) {
    el.innerHTML = `<div class="card"><p class="muted" style="margin:0">Načítám videa…</p></div>`;
    try { await nactiVidea(); } catch (e) { el.innerHTML = `<div class="card"><p class="zprava chyba">${esc(e.message)}</p></div>`; return; }
  }
  const raz = {
    publikovano: (a, b) => new Date(b.naplanovano || b.publikovano) - new Date(a.naplanovano || a.publikovano),
    zhlednuti: (a, b) => (b.zhlednuti || 0) - (a.zhlednuti || 0),
    lajky: (a, b) => (b.lajky || 0) - (a.lajky || 0),
    komentare: (a, b) => (b.komentare || 0) - (a.komentare || 0),
  }[razeni];
  const VID = { public: "Veřejné", unlisted: "Neveřejné", private: "Soukromé" };
  el.innerHTML = `<div class="card">
    <div class="st-hlava"><h2>Videa <span class="muted">${videa.length}</span></h2>
      <label class="radek" style="flex-direction:row;align-items:center;gap:8px;margin-left:auto">Řadit
        <select id="ysRazeni" style="width:auto">${[["publikovano", "Nejnovější"], ["zhlednuti", "Zhlédnutí"], ["lajky", "To se mi líbí"], ["komentare", "Komentáře"]].map(([k, n]) => `<option value="${k}" ${k === razeni ? "selected" : ""}>${n}</option>`).join("")}</select></label></div>
    <p class="muted" style="font-size:12.5px;margin-top:0">Čísla: YouTube Data API (celkem za celou dobu). Sledovanost za období, doba sledování a udržení jsou v záložce <a href="#ytstats" data-jdi="ytstats">YT Analytics</a>.</p>
    <div class="ys-videa">${[...videa].sort(raz).map((v) => `<article class="ys-video">
      <a href="https://youtu.be/${esc(v.id)}" target="_blank" rel="noopener" class="ys-nahled">${v.nahled ? `<img src="${esc(v.nahled)}" alt="" loading="lazy">` : ""}<em>${cas(v.delka)}</em></a>
      <div class="ys-video-info"><b>${esc(v.nazev)}</b>
        <small class="muted">${v.naplanovano && new Date(v.naplanovano) > new Date() ? `📅 naplánováno ${new Date(v.naplanovano).toLocaleString("cs-CZ")}` : new Date(v.publikovano).toLocaleDateString("cs-CZ")} · ${VID[v.viditelnost] || v.viditelnost}${v.zpracovani && v.zpracovani !== "succeeded" ? ` · zpracování: ${esc(v.zpracovani)}` : ""}</small>
        <small>👁 ${cislo(v.zhlednuti)} · 👍 ${cislo(v.lajky)} · 💬 ${cislo(v.komentare)}</small>
        <div class="radek" style="gap:6px;margin-top:4px">
          <button type="button" class="btn small ghost" data-ys-meta="${esc(v.id)}">✎ Metadata / SEO</button>
          <button type="button" class="btn small ghost" data-ys-mini="${esc(v.id)}">🖼 Miniatura</button>
          <button type="button" class="btn small ghost" data-ys-kom="${esc(v.id)}">💬 Komentáře</button>
        </div></div></article>`).join("")}</div></div>`;
}

// Úprava metadat existujícího videa (SEO generátor nad hotovým videem).
async function upravMetadata(id) {
  const v = videa.find((x) => x.id === id);
  if (!v) return;
  pub = novaPublikace();
  pub.existujici = id;
  pub.seo.titul = v.nazev; pub.seo.popis = v.popis; pub.seo.tagy = v.tagy;
  pub.nastaveni.kategorie = v.kategorie || "17";
  pub.zdroj = { typ: "youtube", nazev: v.nazev, delka: v.delka };
  krok = "publikovat";
  vykresliVse();
}

async function miniaturaKVideu(id) {
  const finalni = await window.DHMiniatury?.finalniMiniatury?.() || [];
  if (!finalni.length) { toast("Zatím nemáš exportovanou miniaturu – vytvoř ji v Thumbnail Factory.", "info"); window.DHShell?.jdi("miniatury"); return; }
  const volba = prompt(`Kterou miniaturu nastavit? Napiš číslo:\n${finalni.slice(0, 9).map((f, i) => `${i + 1}. ${f.nazev}`).join("\n")}`, "1");
  const f = finalni[Number(volba) - 1];
  if (!f) return;
  if (!confirm(`Nastavit miniaturu „${f.nazev}“ u videa? Původní miniatura se nahradí.`)) return;
  try {
    await Y().nastavMiniaturu(id, await U().obrazekBlob(f.obrazekId));
    toast("Miniatura nastavená ✓ (na YouTube se může projevit až za pár minut)");
  } catch (e) { zprava(esc(e.message), "chyba"); }
}

// ------------------------------------------------------------ publikace --

function novaPublikace() {
  return {
    id: U().noveId("pub"), vytvoreno: Date.now(), upraveno: Date.now(), existujici: null,
    zdroj: null, scenar: "", fakta: "",
    seo: { tituly: [], titul: "", popis: "", hashtagy: [], tagy: [], kapitoly: [], playlistNavrh: "", poznamka: "" },
    miniatura: null,
    nastaveni: { kategorie: "17", playlistId: "", novyPlaylist: "", jazyk: "cs", viditelnost: "private", naplanovat: false, datum: "", cas: "18:00",
      licence: "youtube", embed: true, verejneStatistiky: true, proDeti: null, syntetika: null, placenaPropagace: false, datumNahravani: "", notifikace: true },
    stav: { relace: null, videoId: null, kroky: {}, url: null, dokonceno: false },
  };
}
function ulozPub() {
  clearTimeout(ukladani);
  ukladani = setTimeout(() => { if (pub) { pub.upraveno = Date.now(); U().uloz("publikace", pub).catch(() => {}); } }, 400);
}

async function reelyKVyberu() {
  const R = window.DHReelsUloziste;
  if (!R) return [];
  try { return (await R.vsechny("rendery")).sort((a, b) => b.cas - a.cas); } catch { return []; }
}

async function vykresliPublikaci() {
  const el = $('[data-ys-panel="publikovat"]');
  pub = pub || novaPublikace();
  const n = pub.nastaveni, s = pub.seo;
  const reely = await reelyKVyberu();
  const finalni = (await window.DHMiniatury?.finalniMiniatury?.()) || [];
  const tagDelka = delkaTagu(s.tagy);
  const vybraneHashtagy = s.hashtagy.filter((h) => h.vybran).map((h) => h.tag);
  const naplan = n.viditelnost === "private" && n.naplanovat && n.datum;
  el.innerHTML = `
    ${pub.existujici ? `<div class="zprava varovani">Upravuješ metadata existujícího videa <b>${esc(s.titul)}</b>. Uložením se změní na YouTube. <button type="button" class="btn small ghost" data-ys="nova-pub">Nová publikace</button></div>` : ""}
    <div class="ys-kroky-pub">
      ${pub.existujici ? "" : `<section class="card"><h2><span class="ys-c">1</span> Video</h2>
        <div class="filtry">
          <label>Hotové video z Reels Factory<select id="ysReel"><option value="">– vyber –</option>${reely.map((r) => `<option value="${esc(r.id)}" ${pub.zdroj?.reelRender === r.id ? "selected" : ""}>${esc(r.nazev)} · ${cas(r.delka)} · ${(r.velikost / 1048576).toFixed(1)} MB</option>`).join("")}</select></label>
          <div class="ys-soubor"><span class="ys-popisek">…nebo soubor z počítače</span><label class="btn small ghost">📁 Vybrat video<input type="file" id="ysSoubor" accept="video/*"></label></div>
        </div>
        ${pub.zdroj ? `<p class="r-prirazeno">✔ ${esc(pub.zdroj.nazev)}${pub.zdroj.delka ? ` · ${cas(pub.zdroj.delka)}` : ""}${pub.zdroj.velikost ? ` · ${(pub.zdroj.velikost / 1048576).toFixed(1)} MB` : ""}${pub.zdroj.typ === "soubor" && !souborVidea ? ` <span class="bez-zdroje">– po obnovení stránky soubor vyber znovu</span>` : ""}</p>` : ""}
      </section>`}

      <section class="card"><h2><span class="ys-c">2</span> SEO od AI</h2>
        <label>Scénář / obsah videa (AI z něj píše titulky, popis a kapitoly; u reelu se vyplní sám)<textarea id="ysScenar" rows="5" placeholder="Vlož scénář nebo stručný obsah. Časové značky (0:00 Úvod…) se použijí pro kapitoly.">${esc(pub.scenar)}</textarea></label>
        <label style="margin-top:10px">Ověřené zdroje / fakta (nepovinné – mohou jít do popisu)<textarea id="ysFakta" rows="2">${esc(pub.fakta)}</textarea></label>
        <div class="akce"><button type="button" class="btn" data-ys="seo">✨ Vygenerovat titulky, popis, tagy a kapitoly</button></div>
        <div id="ysSeoZprava" class="zprava" hidden></div>
        ${s.tituly.length ? `<h3 class="st-h3">10 návrhů titulku – vyber</h3><div class="ys-tituly">${s.tituly.map((t, i) => `<label class="ys-titul ${t.text === s.titul ? "on" : ""}">
          <input type="radio" name="ysTitul" value="${i}" ${t.text === s.titul ? "checked" : ""}><span><b>${esc(t.text)}</b>
          <small class="muted">${TYPY_TITULU[t.typ] || t.typ} · ${t.text.length} znaků · skóre ${t.skore}/10 – ${esc(t.proc)}</small></span></label>`).join("")}</div>` : ""}
        <label style="margin-top:12px">Titulek videa <small class="${s.titul.length > 100 ? "bez-zdroje" : "muted"}">${s.titul.length}/100</small><input id="ysTitul" value="${esc(s.titul)}" maxlength="100"></label>
        <label style="margin-top:10px">Popis <small class="${bajty(s.popis) > 5000 ? "bez-zdroje" : "muted"}">${bajty(s.popis)}/5000 bajtů</small><textarea id="ysPopis" rows="10">${esc(s.popis)}</textarea></label>
        ${s.hashtagy.length ? `<h3 class="st-h3">Hashtagy (do popisu, doporučeno 3–5)</h3><div class="ys-chipy">${s.hashtagy.map((h, i) => `<button type="button" class="chip ${h.vybran ? "on" : ""}" data-ys-hashtag="${i}">${esc(h.tag)}</button>`).join("")}</div>` : ""}
        <label style="margin-top:10px">Tagy (oddělené čárkou) <small class="${tagDelka > 500 ? "bez-zdroje" : "muted"}">${tagDelka}/500 znaků</small><textarea id="ysTagy" rows="3">${esc(s.tagy.join(", "))}</textarea></label>
        <div class="radek" style="gap:6px;margin-top:6px"><button type="button" class="btn small ghost" data-ys="kopirovat-tagy">📋 Kopírovat tagy</button>
          <span class="muted" style="font-size:12.5px">Tagy mají na vyhledávání malý vliv – rozhoduje relevance, ne počet.</span></div>
        ${s.kapitoly.length ? `<h3 class="st-h3">Kapitoly (v popisu)</h3><pre class="ys-kapitoly">${esc(s.kapitoly.map((k) => `${k.cas} ${k.nazev}`).join("\n"))}</pre>` : s.tituly.length ? `<p class="muted" style="font-size:13px">Kapitoly: ${esc(s.poznamka || "bez kapitol – video nemá dost dlouhé části se známými časy.")}</p>` : ""}
      </section>

      <section class="card"><h2><span class="ys-c">3</span> Miniatura</h2>
        <div class="ys-miniatury">${[...(pub.miniatura?.zdroj === "soubor" ? [{ obrazekId: pub.miniatura.obrazekId, nazev: "Vlastní soubor" }] : []), ...finalni.slice(0, 8)].map((f) => `<button type="button" class="ys-mini ${pub.miniatura?.obrazekId === f.obrazekId ? "on" : ""}" data-ys-vyber-mini="${esc(f.obrazekId)}" title="${esc(f.nazev)}"><span data-ys-mini-img="${esc(f.obrazekId)}"></span><small>${esc(f.nazev || "")}</small></button>`).join("") || `<p class="muted" style="margin:0">Zatím žádná hotová miniatura.</p>`}</div>
        <div class="radek" style="gap:8px;margin-top:10px">
          <button type="button" class="btn small ghost" data-ys="do-miniatur">🎨 Vytvořit v Thumbnail Factory</button>
          <label class="btn small ghost">📥 Nahrát vlastní<input type="file" id="ysMiniSoubor" accept="image/jpeg,image/png"></label>
          ${pub.miniatura ? `<button type="button" class="btn small ghost" data-ys="bez-miniatury">Bez miniatury</button>` : ""}
        </div>
      </section>

      <section class="card"><h2><span class="ys-c">4</span> Nastavení</h2>
        <div class="filtry">
          <label>Kategorie<select id="ysKategorie">${(kategorie || [{ id: "17", nazev: "Sport" }, { id: "27", nazev: "Vzdělávání" }, { id: "22", nazev: "Lidé a blogy" }, { id: "24", nazev: "Zábava" }]).map((k) => `<option value="${k.id}" ${n.kategorie === k.id ? "selected" : ""}>${esc(k.nazev)}</option>`).join("")}</select></label>
          <label>Playlist<select id="ysPlaylist"><option value="">– žádný –</option>${(seznamPlaylistu || []).map((x) => `<option value="${x.id}" ${n.playlistId === x.id ? "selected" : ""}>${esc(x.nazev)}</option>`).join("")}<option value="__novy" ${n.playlistId === "__novy" ? "selected" : ""}>＋ Nový playlist…</option></select>
            ${s.playlistNavrh ? `<small class="muted">AI navrhuje: ${esc(s.playlistNavrh)}</small>` : ""}</label>
          ${n.playlistId === "__novy" ? `<label class="cela">Název nového playlistu<input id="ysNovyPlaylist" value="${esc(n.novyPlaylist || s.playlistNavrh)}"></label>` : ""}
          <label>Jazyk videa<select id="ysJazyk"><option value="cs" ${n.jazyk === "cs" ? "selected" : ""}>Čeština</option><option value="sk" ${n.jazyk === "sk" ? "selected" : ""}>Slovenština</option><option value="en" ${n.jazyk === "en" ? "selected" : ""}>Angličtina</option></select></label>
          <label>Licence<select id="ysLicence"><option value="youtube">Standardní licence YouTube</option><option value="creativeCommon" ${n.licence === "creativeCommon" ? "selected" : ""}>Creative Commons – Uveďte autora</option></select></label>
          <label>Datum natáčení (nepovinné)<input type="date" id="ysDatumNahr" value="${esc(n.datumNahravani)}"></label>
        </div>
        <h3 class="st-h3">Viditelnost</h3>
        <div class="ys-volby">${[["private", "🔒 Soukromé", "výchozí – uvidíš jen ty"], ["unlisted", "🔗 Neveřejné", "kdo má odkaz"], ["public", "🌍 Veřejné", "hned všichni"]].map(([v, t, d]) => `<label class="ys-volba ${n.viditelnost === v ? "on" : ""}"><input type="radio" name="ysVid" value="${v}" ${n.viditelnost === v ? "checked" : ""}><b>${t}</b><small>${d}</small></label>`).join("")}</div>
        ${n.viditelnost === "private" ? `<label class="check" style="margin-top:10px"><input type="checkbox" id="ysNaplan" ${n.naplanovat ? "checked" : ""}> Naplánovat zveřejnění (YouTube video sám zveřejní v daný čas)</label>
          ${n.naplanovat ? `<div class="filtry" style="margin-top:8px"><label>Datum<input type="date" id="ysDatum" value="${esc(n.datum)}"></label><label>Čas<input type="time" id="ysCas" value="${esc(n.cas)}"></label></div>` : ""}` : ""}
        <h3 class="st-h3">Povinné prohlášení</h3>
        <div class="ys-otazka"><span>Je video <b>určené pro děti</b>? (zákon COPPA – rozhoduješ ty)</span>
          <label class="check"><input type="radio" name="ysDeti" value="ne" ${n.proDeti === false ? "checked" : ""}> Ne</label>
          <label class="check"><input type="radio" name="ysDeti" value="ano" ${n.proDeti === true ? "checked" : ""}> Ano</label></div>
        <div class="ys-otazka"><span>Obsahuje video <b>realisticky upravený nebo syntetický obsah</b> (AI hlas, AI obraz skutečných lidí/událostí)?</span>
          <label class="check"><input type="radio" name="ysSynt" value="ne" ${n.syntetika === false ? "checked" : ""}> Ne</label>
          <label class="check"><input type="radio" name="ysSynt" value="ano" ${n.syntetika === true ? "checked" : ""}> Ano</label></div>
        <label class="check" style="margin-top:8px"><input type="checkbox" id="ysPlacena" ${n.placenaPropagace ? "checked" : ""}> Video obsahuje placenou propagaci (product placement, sponzor)</label>
        <label class="check"><input type="checkbox" id="ysEmbed" ${n.embed ? "checked" : ""}> Povolit vkládání na jiné weby</label>
        <label class="check"><input type="checkbox" id="ysNotif" ${n.notifikace ? "checked" : ""}> Upozornit odběratele</label>
      </section>

      <section class="card ai-karta"><h2><span class="ys-c">5</span> Kontrola a nahrání</h2>
        <ul class="mt-kontroly" id="ysKontroly"></ul>
        ${n.viditelnost !== "private" || naplan ? `<label class="check ys-potvrzeni"><input type="checkbox" id="ysPotvrzuji"> Potvrzuji: video bude ${naplan ? `<b>naplánované na ${esc(new Date(`${n.datum}T${n.cas || "18:00"}`).toLocaleString("cs-CZ"))}</b> a pak automaticky veřejné` : n.viditelnost === "public" ? "<b>hned veřejné</b>" : "<b>neveřejné</b> (kdo má odkaz)"}.</label>` : ""}
        <div class="akce"><button type="button" class="btn" data-ys="publikovat" id="ysPublikovat">${pub.existujici ? "💾 Uložit změny na YouTube" : "⬆️ Nahrát na YouTube"}</button></div>
        <div id="ysPrubeh"></div>
      </section>
    </div>`;
  for (const box of $$("[data-ys-mini-img]")) {
    try { box.innerHTML = `<img src="${(await U().obrazekImg(box.dataset.ysMiniImg)).src}" alt="">`; } catch { /* nic */ }
  }
  vykresliKontroly();
  vykresliPrubeh();
  if (Y().pripojeno() && (!seznamPlaylistu || !kategorie)) {
    try {
      [seznamPlaylistu, kategorie] = await Promise.all([seznamPlaylistu || Y().playlisty(), kategorie || Y().kategorie()]);
      if (krok === "publikovat") vykresliPublikaci();
    } catch { /* zobrazí se výchozí */ }
  }
}

function kontroly() {
  const s = pub.seo, n = pub.nastaveni;
  const out = [
    [!!pub.existujici || !!(souborVidea || pub.zdroj?.typ === "reel"), pub.existujici ? "Existující video" : souborVidea || pub.zdroj?.typ === "reel" ? `Video: ${pub.zdroj?.nazev}` : "Vyber video (krok 1)"],
    [s.titul.trim().length > 0 && s.titul.length <= 100 && !/[<>]/.test(s.titul), s.titul.trim() ? `Titulek: ${s.titul.length}/100 znaků${/[<>]/.test(s.titul) ? " – nesmí obsahovat < >" : ""}` : "Chybí titulek"],
    [bajty(s.popis) <= 5000 && !/[<>]/.test(s.popis), `Popis: ${bajty(s.popis)}/5000 bajtů${/[<>]/.test(s.popis) ? " – nesmí obsahovat < >" : ""}`],
    [delkaTagu(s.tagy) <= 500, `Tagy: ${delkaTagu(s.tagy)}/500 znaků`],
    [n.proDeti !== null, n.proDeti === null ? "Odpověz, jestli je video určené pro děti" : `Pro děti: ${n.proDeti ? "ano" : "ne"}`],
    [n.syntetika !== null, n.syntetika === null ? "Odpověz na otázku o syntetickém obsahu" : `Syntetický obsah: ${n.syntetika ? "ano" : "ne"}`],
    [!(n.viditelnost === "private" && n.naplanovat) || (n.datum && new Date(`${n.datum}T${n.cas || "18:00"}`) > new Date(Date.now() + 15 * 60e3)), n.naplanovat ? "Čas zveřejnění musí být aspoň 15 min v budoucnu" : "Bez plánování"],
    [true, pub.miniatura ? "Miniatura vybraná" : "Bez vlastní miniatury (YouTube vybere snímek)"],
    [Y().pripojeno(), Y().pripojeno() ? "YouTube připojený" : "Připoj YouTube (nahoře)"],
  ];
  return out;
}
function vykresliKontroly() {
  const el = $("#ysKontroly");
  if (el) el.innerHTML = kontroly().map(([ok, t]) => `<li class="${ok ? "ok" : "warn"}">${ok ? "✓" : "!"} ${esc(t)}</li>`).join("");
}

function popisSHashtagy() {
  const s = pub.seo;
  let popis = s.popis.trim();
  const tagy = s.hashtagy.filter((h) => h.vybran).map((h) => h.tag);
  const chybi = tagy.filter((t) => !popis.toLowerCase().includes(t.toLowerCase()));
  if (chybi.length) popis += `\n\n${chybi.join(" ")}`;
  return popis;
}

function metadata() {
  const s = pub.seo, n = pub.nastaveni;
  const status = {
    privacyStatus: n.viditelnost, license: n.licence, embeddable: !!n.embed, publicStatsViewable: !!n.verejneStatistiky,
    selfDeclaredMadeForKids: n.proDeti === true, containsSyntheticMedia: n.syntetika === true,
  };
  if (n.viditelnost === "private" && n.naplanovat && n.datum) status.publishAt = new Date(`${n.datum}T${n.cas || "18:00"}`).toISOString();
  const m = {
    snippet: { title: s.titul.trim(), description: popisSHashtagy(), tags: s.tagy, categoryId: n.kategorie, defaultLanguage: n.jazyk, defaultAudioLanguage: n.jazyk },
    status,
  };
  if (n.datumNahravani) m.recordingDetails = { recordingDate: new Date(`${n.datumNahravani}T12:00:00Z`).toISOString() };
  if (n.placenaPropagace) m.paidProductPlacementDetails = { hasPaidProductPlacement: true };
  return m;
}

function vykresliPrubeh() {
  const el = $("#ysPrubeh");
  if (!el || !pub) return;
  const k = pub.stav.kroky;
  const R = { ceka: "⏳", bezi: "⏳", ok: "✅", chyba: "❌", preskoceno: "➖" };
  const radky = [["nahrani", pub.existujici ? "Uložení metadat" : "Nahrání videa"], ["miniatura", "Miniatura"], ["playlist", "Playlist"], ["overeni", "Ověření na YouTube"]]
    .filter(([x]) => k[x]).map(([x, n]) => `<li class="${k[x].stav === "chyba" ? "warn" : "ok"}">${R[k[x].stav] || "•"} <b>${n}</b> ${esc(k[x].text || "")}</li>`);
  el.innerHTML = `${pub.stav.pokrok != null && !pub.stav.dokonceno ? `<div class="ys-pokrok"><i style="width:${pub.stav.pokrok}%"></i><span>${pub.stav.pokrok.toFixed(0)} %</span></div>` : ""}
    ${radky.length ? `<ul class="mt-kontroly">${radky.join("")}</ul>` : ""}
    ${pub.stav.url ? `<p class="zprava ok">Hotovo: <a href="${esc(pub.stav.url)}" target="_blank" rel="noopener">${esc(pub.stav.url)}</a> · <a href="https://studio.youtube.com/video/${esc(pub.stav.videoId)}/edit" target="_blank" rel="noopener">otevřít v YouTube Studiu</a></p>` : ""}`;
}

async function publikuj() {
  const chyby = kontroly().filter(([ok]) => !ok);
  if (chyby.length) { toast(`Ještě chybí: ${esc(chyby[0][1])}`, "chyba"); return; }
  const n = pub.nastaveni;
  const verejne = n.viditelnost !== "private" || (n.naplanovat && n.datum);
  if (verejne && !$("#ysPotvrzuji")?.checked) { toast("Zaškrtni potvrzení viditelnosti / plánování.", "chyba"); return; }
  const b = $("#ysPublikovat");
  b.disabled = true;
  const k = pub.stav.kroky = {};
  const krokStav = (x, stav, text = "") => { k[x] = { stav, text }; ulozPub(); vykresliPrubeh(); };
  try {
    let videoId = pub.existujici;
    if (pub.existujici) {
      krokStav("nahrani", "bezi", "ukládám…");
      const m = metadata();
      await Y().upravVideo(videoId, { snippet: m.snippet, status: m.status });
      krokStav("nahrani", "ok", "metadata uložená");
    } else {
      let soubor = souborVidea;
      if (!soubor && pub.zdroj?.typ === "reel") soubor = (await window.DHReelsUloziste.nacti("rendery", pub.zdroj.reelRender))?.blob;
      if (!soubor) throw new Error("Video soubor není k dispozici – vyber ho znovu.");
      krokStav("nahrani", "bezi", "zahajuji…");
      const m = metadata();
      const parts = ["snippet", "status", m.recordingDetails && "recordingDetails", m.paidProductPlacementDetails && "paidProductPlacementDetails"].filter(Boolean).join(",");
      const video = await Y().nahrajVideo({
        soubor, metadata: m, part: parts, notifikace: n.notifikace, relace: pub.stav.relace,
        ulozRelaci: (u) => { pub.stav.relace = u; ulozPub(); },
        onPokrok: (hotovo, celkem) => { pub.stav.pokrok = (hotovo / celkem) * 100; const t = `${(hotovo / 1048576).toFixed(1)} / ${(celkem / 1048576).toFixed(1)} MB`; k.nahrani = { stav: "bezi", text: t }; vykresliPrubeh(); },
      });
      videoId = video.id;
      pub.stav.videoId = videoId; pub.stav.relace = null; pub.stav.pokrok = 100;
      krokStav("nahrani", "ok", `ID ${videoId}`);
    }
    pub.stav.videoId = videoId;
    if (pub.miniatura) {
      krokStav("miniatura", "bezi", "nahrávám…");
      try { await Y().nastavMiniaturu(videoId, await U().obrazekBlob(pub.miniatura.obrazekId)); krokStav("miniatura", "ok", "nastavená"); }
      catch (e) { krokStav("miniatura", "chyba", e.message); }
    } else krokStav("miniatura", "preskoceno", "bez vlastní miniatury");
    if (n.playlistId) {
      krokStav("playlist", "bezi", "přidávám…");
      try {
        let pid = n.playlistId;
        if (pid === "__novy") {
          const nazev = (n.novyPlaylist || pub.seo.playlistNavrh || "").trim();
          const existuje = (seznamPlaylistu || []).find((x) => x.nazev.toLowerCase() === nazev.toLowerCase());
          if (existuje) pid = existuje.id;
          else if (nazev && confirm(`Vytvořit nový playlist „${nazev}“?`)) { const pl = await Y().vytvorPlaylist(nazev); pid = pl.id; seznamPlaylistu = null; }
          else pid = null;
        }
        if (pid) { await Y().pridejDoPlaylistu(pid, videoId); krokStav("playlist", "ok", "přidáno"); } else krokStav("playlist", "preskoceno", "bez playlistu");
      } catch (e) { krokStav("playlist", "chyba", e.message); }
    } else krokStav("playlist", "preskoceno", "bez playlistu");
    krokStav("overeni", "bezi", "kontroluji…");
    const [v] = await Y().videaPodleId([videoId]);
    const m = metadata();
    const rozdily = [];
    if (v.nazev !== m.snippet.title) rozdily.push("titulek");
    if (v.viditelnost !== m.status.privacyStatus) rozdily.push(`viditelnost (${v.viditelnost})`);
    if (m.status.publishAt && !v.naplanovano) rozdily.push("plánování");
    krokStav("overeni", rozdily.length ? "chyba" : "ok", rozdily.length ? `nesedí: ${rozdily.join(", ")}` : `uloženo · zpracování: ${v.zpracovani || "probíhá"} · ${v.viditelnost}${v.naplanovano ? ` · zveřejní se ${new Date(v.naplanovano).toLocaleString("cs-CZ")}` : ""}`);
    pub.stav.url = `https://youtu.be/${videoId}`;
    pub.stav.dokonceno = true;
    ulozPub(); vykresliPrubeh();
    videa = [];
    if (!pub.existujici) {
      window.DHPlan?.pridej({ nazev: m.snippet.title, format: "youtube", stav: m.status.publishAt ? "hotovo" : "publikovano",
        datum: (m.status.publishAt ? new Date(m.status.publishAt) : new Date()).toISOString().slice(0, 10), zadani: pub.stav.url });
    }
    toast(`Hotovo ✓ <a href="${esc(pub.stav.url)}" target="_blank" rel="noopener">${esc(pub.stav.url)}</a>`, "ok", 8000);
  } catch (e) {
    const x = Object.keys(k).find((y) => k[y].stav === "bezi") || "nahrani";
    krokStav(x, "chyba", e.message);
    zprava(`${esc(e.message)}${pub.stav.relace ? " – rozdělané nahrání se dá navázat: klikni znovu na Nahrát." : ""}`, "chyba");
  } finally { b.disabled = false; }
}

// ------------------------------------------------------------------- SEO --

const SCHEMA_SEO = {
  type: "object",
  properties: {
    tituly: { type: "array", items: { type: "object", properties: { text: { type: "string" }, typ: { type: "string", enum: ["A", "B", "C", "D", "E"] }, skore: { type: "integer" }, proc: { type: "string" } }, required: ["text", "typ", "skore", "proc"] } },
    popis: { type: "string" },
    hashtagy: { type: "array", items: { type: "string" } },
    doporucene_hashtagy: { type: "array", items: { type: "string" } },
    tagy: { type: "array", items: { type: "string" } },
    kapitoly: { type: "array", items: { type: "object", properties: { od_sekundy: { type: "integer" }, nazev: { type: "string" } }, required: ["od_sekundy", "nazev"] } },
    kapitoly_poznamka: { type: "string" },
    playlist: { type: "string" },
  },
  required: ["tituly", "popis", "hashtagy", "doporucene_hashtagy", "tagy", "kapitoly", "kapitoly_poznamka", "playlist"],
};

// Kapitoly jen ze skutečných časů: scény reelu (časová osa renderu) nebo časové značky ve scénáři.
function znameCasy() {
  const casy = [];
  if (pub.zdroj?.sceny) pub.zdroj.sceny.forEach((s) => casy.push({ od: Math.round(s.od), text: s.text }));
  for (const m of pub.scenar.matchAll(/^\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+(.+)$/gm)) casy.push({ od: (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3], text: m[4] });
  return casy.sort((a, b) => a.od - b.od);
}

async function generujSEO() {
  if (!AI().maKlic()) { zprava('SEO generátor potřebuje AI klíč. <a href="#" data-jdi-na-ai>Nastavit</a>', "chyba", "#ysSeoZprava"); return; }
  if (!pub.scenar.trim() && !pub.seo.titul.trim()) { zprava("Vlož scénář nebo aspoň pracovní název.", "chyba", "#ysSeoZprava"); return; }
  zprava("AI píše titulky, popis, hashtagy a tagy… (obvykle do 30 s)", "", "#ysSeoZprava");
  const casy = znameCasy();
  const delka = pub.zdroj?.delka || null;
  try {
    const r = await AI().gemini({
      system: `Jsi YouTube SEO stratég a copywriter kanálu Deník hokeje (česká hokejová historie, legendy, rekordy). Píšeš přirozenou češtinou, bez AI frází,
bez zavádějícího clickbaitu a bez hromadění klíčových slov. Nevymýšlej fakta ani zdroje – vycházej jen ze scénáře a zadaných faktů.

TITULKY: přesně 10, max. 100 znaků, po dvou z každého typu: A zvědavost · B dokument · C emoce · D SEO (hledaný výraz na začátku) · E krátký a silný.
Každý ohodnoť 1–10 a jednou větou napiš, proč může fungovat. Příklady stylu: „Jak pět Rusů změnilo NHL navždy“, „Gretzkyho rekord, který možná nikdo nepřekoná“.
POPIS (max. 4500 znaků): 1) poutavý úvod (2 věty, které se zobrazí ve vyhledávání), 2) o čem video je, 3) historický kontext,
4) důležitá jména a události, 5) přirozeně zapracovaná hledaná slova, 6) krátce o kanálu Deník hokeje, 7) výzva k odběru.
Hashtagy do popisu NEPIŠ (přidají se zvlášť). Pokud jsou zadané zdroje, můžeš je uvést v sekci „Zdroje“. Nepoužívej znaky < a >.
HASHTAGY: 5–8 relevantních (česky i mezinárodně), doporucene_hashtagy = 3 nejlepší z nich. Žádné obecné trendy.
TAGY: 10–20 hledaných frází (jména hráčů, kluby, události, česky i anglicky), celkem do 450 znaků.
KAPITOLY: jen pokud jsou zadané skutečné časy a video má aspoň 3 smysluplné části po ≥10 s; první 0. Časy ber POUZE ze zadaných (od_sekundy = jeden ze zadaných časů).
Jinak kapitoly prázdné a do kapitoly_poznamka napiš proč.
PLAYLIST: vyber nejvhodnější z: ${NAVRH_PLAYLISTU.join(", ")}${seznamPlaylistu?.length ? ` nebo z existujících: ${seznamPlaylistu.map((x) => x.nazev).join(", ")}` : ""}.`,
      zadani: `PRACOVNÍ NÁZEV: ${pub.seo.titul || pub.zdroj?.nazev || ""}
DÉLKA VIDEA: ${delka ? `${Math.round(delka)} s` : "neznámá"}
SCÉNÁŘ / OBSAH:
${pub.scenar.slice(0, 12000)}
OVĚŘENÁ FAKTA / ZDROJE: ${pub.fakta || "(nezadané)"}
ZNÁMÉ ČASY ČÁSTÍ VIDEA: ${casy.length ? casy.map((c) => `${c.od} s: ${c.text.slice(0, 80)}`).join(" | ") : "žádné"}`,
      schema: SCHEMA_SEO,
    });
    const povolene = new Set(casy.map((c) => c.od));
    let kapitoly = (r.kapitoly || []).filter((k) => povolene.has(k.od_sekundy)).sort((a, b) => a.od_sekundy - b.od_sekundy);
    const platne = kapitoly.length >= 3 && kapitoly[0].od_sekundy === 0 && kapitoly.every((k, i) => i === 0 || k.od_sekundy - kapitoly[i - 1].od_sekundy >= 10) && (!delka || delka - kapitoly.at(-1).od_sekundy >= 10);
    if (!platne) kapitoly = [];
    const s = pub.seo;
    s.tituly = (r.tituly || []).filter((t) => t.text && t.text.length <= 100).slice(0, 10);
    s.titul = s.tituly.slice().sort((a, b) => b.skore - a.skore)[0]?.text || s.titul;
    s.kapitoly = kapitoly.map((k) => ({ cas: cas(k.od_sekundy), nazev: k.nazev }));
    s.poznamka = platne ? "" : (r.kapitoly_poznamka || "video nemá aspoň 3 části se známými časy");
    s.popis = String(r.popis || "").replace(/[<>]/g, "") + (s.kapitoly.length ? `\n\nKapitoly:\n${s.kapitoly.map((k) => `${k.cas} ${k.nazev}`).join("\n")}` : "");
    const dop = new Set((r.doporucene_hashtagy || []).map((h) => h.toLowerCase()));
    s.hashtagy = [...new Set((r.hashtagy || []).map((h) => `#${String(h).replace(/^#/, "").replace(/\s+/g, "")}`))].map((tag) => ({ tag, vybran: dop.has(tag.toLowerCase()) || dop.has(tag.slice(1).toLowerCase()) }));
    let tagy = [...new Set((r.tagy || []).map((t) => String(t).replace(/[<>,]/g, "").trim()).filter(Boolean))];
    while (delkaTagu(tagy) > 500) tagy.pop();
    s.tagy = tagy;
    s.playlistNavrh = r.playlist || "";
    const existujici = (seznamPlaylistu || []).find((x) => x.nazev.toLowerCase() === s.playlistNavrh.toLowerCase());
    if (existujici && !pub.nastaveni.playlistId) pub.nastaveni.playlistId = existujici.id;
    ulozPub();
    vykresliPublikaci();
    toast("SEO hotové ✓ Vyber titulek a projdi popis.");
  } catch (e) { zprava(esc(e.message), "chyba", "#ysSeoZprava"); }
}

// ------------------------------------------------------------ playlisty --

async function vykresliPlaylisty() {
  const el = $('[data-ys-panel="playlisty"]');
  if (!Y().pripojeno()) { el.innerHTML = `<div class="card"><p class="muted" style="margin:0">Pro playlisty připoj YouTube.</p></div>`; return; }
  if (!seznamPlaylistu) {
    el.innerHTML = `<div class="card"><p class="muted">Načítám…</p></div>`;
    try { seznamPlaylistu = await Y().playlisty(); } catch (e) { el.innerHTML = `<div class="card"><p class="zprava chyba">${esc(e.message)}</p></div>`; return; }
  }
  const existuje = (n) => seznamPlaylistu.some((x) => x.nazev.toLowerCase() === n.toLowerCase());
  el.innerHTML = `<div class="mt-mrizka">
    <div class="card"><h2>Playlisty <span class="muted">${seznamPlaylistu.length}</span></h2>
      <div class="ys-playlisty">${seznamPlaylistu.map((x) => `<article class="ys-pl"><b>${esc(x.nazev)}</b><small class="muted">${x.pocet} videí · ${esc(x.viditelnost || "")}</small>
        <textarea data-ys-pl-popis="${x.id}" rows="2" placeholder="Popis playlistu">${esc(x.popis)}</textarea>
        <div class="radek" style="gap:6px"><button type="button" class="btn small ghost" data-ys-pl-uloz="${x.id}">💾 Uložit popis</button>
        <a class="btn small ghost" href="https://www.youtube.com/playlist?list=${esc(x.id)}" target="_blank" rel="noopener">Otevřít ↗</a></div></article>`).join("") || `<p class="muted">Zatím žádné.</p>`}</div></div>
    <div class="card"><h2>Navržené rubriky</h2>
      <p class="muted" style="margin-top:0">Vytvoří se jen ty, které ještě nemáš (bez duplicit).</p>
      <div class="ys-chipy">${NAVRH_PLAYLISTU.map((n) => `<button type="button" class="chip ${existuje(n) ? "on" : ""}" data-ys-pl-novy="${esc(n)}" ${existuje(n) ? "disabled" : ""}>${existuje(n) ? "✓ " : "＋ "}${esc(n)}</button>`).join("")}</div>
      <label style="margin-top:14px">Vlastní název<input id="ysPlNazev" placeholder="např. Zlaté Nagano"></label>
      <div class="akce"><button type="button" class="btn small" data-ys="pl-vlastni">＋ Vytvořit playlist</button></div></div></div>`;
}

async function vytvorPlaylist(nazev) {
  nazev = (nazev || "").trim();
  if (!nazev) return;
  if (seznamPlaylistu?.some((x) => x.nazev.toLowerCase() === nazev.toLowerCase())) { toast(`Playlist „${esc(nazev)}“ už existuje.`, "info"); return; }
  if (!confirm(`Vytvořit na YouTube veřejný playlist „${nazev}“?`)) return;
  try { await Y().vytvorPlaylist(nazev); seznamPlaylistu = null; toast(`Playlist „${esc(nazev)}“ vytvořen ✓`); vykresliPlaylisty(); } catch (e) { zprava(esc(e.message), "chyba"); }
}

// ------------------------------------------------------------ komentáře --

let komentareVideo = "", komentareData = [], komentareAnalyza = null;
async function vykresliKomentare() {
  const el = $('[data-ys-panel="komentare"]');
  if (!Y().pripojeno()) { el.innerHTML = `<div class="card"><p class="muted" style="margin:0">Pro komentáře připoj YouTube.</p></div>`; return; }
  el.innerHTML = `<div class="card">
    <div class="st-hlava"><h2>Komentáře</h2>
      <select id="ysKomVideo" style="width:auto;max-width:380px"><option value="">Všechna videa (nejnovější)</option>${videa.map((v) => `<option value="${esc(v.id)}" ${komentareVideo === v.id ? "selected" : ""}>${esc(v.nazev.slice(0, 60))}</option>`).join("")}</select>
      <button type="button" class="btn small" data-ys="kom-nacti">Načíst</button>
      <button type="button" class="btn small ghost" data-ys="kom-ai" ${komentareData.length ? "" : "disabled"}>✨ Analyzovat a navrhnout odpovědi</button></div>
    <p class="muted" style="font-size:12.5px;margin-top:0">Nic se neodesílá ani nemaže samo – každou odpověď potvrzuješ. Připnout komentář přes API nejde (jen v YouTube Studiu), návrh připnutého komentáře si zkopíruj.</p>
    ${komentareAnalyza ? `<div class="st-ai"><div><h3 class="st-h3">Co lidi píšou</h3><ul>${komentareAnalyza.reakce.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>
      <div><h3 class="st-h3">Časté otázky</h3><ul>${komentareAnalyza.otazky.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div></div>
      <h3 class="st-h3">Návrh připnutého komentáře</h3><textarea rows="3" id="ysPripnuty">${esc(komentareAnalyza.pripnuty)}</textarea>` : ""}
    <div class="ys-komentare">${komentareData.map((c, i) => `<article class="ys-kom"><b>${esc(c.autor)}</b> <small class="muted">${new Date(c.cas).toLocaleDateString("cs-CZ")} · 👍 ${c.lajky} · ${c.odpovedi} odpovědí</small>
      <p>${esc(c.text)}</p>
      ${komentareAnalyza?.odpovedi?.[c.id] ? `<textarea rows="2" data-ys-odp="${i}">${esc(komentareAnalyza.odpovedi[c.id])}</textarea>
        <div class="radek" style="gap:6px"><button type="button" class="btn small" data-ys-odeslat="${i}">Odeslat odpověď</button></div>` : ""}</article>`).join("") || `<p class="muted">Klikni na Načíst.</p>`}</div></div>`;
}

async function analyzujKomentare() {
  if (!AI().maKlic()) { toast("Potřebuje AI klíč.", "chyba"); return; }
  zprava("AI čte komentáře…");
  try {
    const r = await AI().gemini({
      system: `Jsi komunitní manažer kanálu Deník hokeje. Shrň reakce diváků, najdi časté otázky a navrhni krátké, přátelské a věcné odpovědi česky
(bez emoji spamu, bez slibů, které kanál nemusí splnit; u faktických otázek odpovídej jen tím, co je jisté, jinak poděkuj a slib ověření).
Odpovědi navrhni jen u komentářů, kde má odpověď smysl (otázky, podněty, chvála od aktivních diváků). Hate a spam ignoruj.`,
      zadani: komentareData.slice(0, 60).map((c) => `[${c.id}] ${c.autor}: ${c.text.slice(0, 400)}`).join("\n"),
      schema: { type: "object", properties: { reakce: { type: "array", items: { type: "string" } }, otazky: { type: "array", items: { type: "string" } }, pripnuty: { type: "string" },
        odpovedi: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"] } } }, required: ["reakce", "otazky", "pripnuty", "odpovedi"] },
    });
    komentareAnalyza = { ...r, odpovedi: Object.fromEntries((r.odpovedi || []).map((o) => [o.id, o.text])) };
    zprava("");
    vykresliKomentare();
  } catch (e) { zprava(esc(e.message), "chyba"); }
}

// ------------------------------------------------------------- historie --

async function vykresliHistorii() {
  const el = $('[data-ys-panel="historie"]');
  let vse = [];
  try { vse = (await U().vsechny("publikace")).sort((a, b) => b.upraveno - a.upraveno); } catch { /* nic */ }
  el.innerHTML = `<div class="card"><h2>Historie publikací <span class="muted">${vse.length}</span></h2>
    <div class="ys-historie">${vse.map((x) => `<article class="ys-hist"><b>${esc(x.seo?.titul || x.zdroj?.nazev || "Bez názvu")}</b>
      <small class="muted">${new Date(x.upraveno).toLocaleString("cs-CZ")} · ${x.stav?.dokonceno ? (x.existujici ? "✔ metadata upravena" : "✔ nahráno") : x.stav?.relace ? "⏸ přerušené nahrávání" : "rozpracováno"} · ${esc(x.nastaveni?.viditelnost || "")}${x.nastaveni?.naplanovat && x.nastaveni?.datum ? ` · 📅 ${esc(x.nastaveni.datum)} ${esc(x.nastaveni.cas)}` : ""}</small>
      ${x.stav?.url ? `<a href="${esc(x.stav.url)}" target="_blank" rel="noopener">${esc(x.stav.url)}</a>` : ""}
      <div class="radek" style="gap:6px"><button type="button" class="btn small ghost" data-ys-pub-otevri="${esc(x.id)}">Otevřít</button>
      <button type="button" class="btn small ghost" data-ys-pub-smaz="${esc(x.id)}">Smazat záznam</button></div></article>`).join("") || `<p class="muted">Zatím nic.</p>`}</div></div>`;
}

// ------------------------------------------------------------- události --

async function vyberReel(id) {
  if (!id) { pub.zdroj = null; ulozPub(); return vykresliPublikaci(); }
  const r = await window.DHReelsUloziste.nacti("rendery", id);
  if (!r) return;
  souborVidea = null;
  let projekt = null, sceny = [];
  try { projekt = await window.DHReelsUloziste.nacti("projekty", r.projektId); } catch { /* nic */ }
  if (projekt?.sceny?.length && window.DHReelsRender?.casovaOsa) {
    sceny = window.DHReelsRender.casovaOsa(projekt).segmenty.map((s) => ({ od: s.od, text: s.scena.text.replace(/\*/g, "") }));
  }
  pub.zdroj = { typ: "reel", reelRender: id, nazev: r.nazev, delka: r.delka, velikost: r.velikost, sceny };
  if (projekt) {
    pub.scenar = [projekt.tema, ...projekt.sceny.map((s) => s.text.replace(/\*/g, "")), projekt.scenar?.popisek].filter(Boolean).join("\n");
    pub.fakta = (projekt.vyzkum?.fakta || []).filter((f) => f.pouzit !== false).map((f) => `${f.text}${f.zdroje?.length ? ` (${f.zdroje.map((z) => z.uri).join(", ")})` : ""}`).join("\n").slice(0, 3000);
  }
  ulozPub();
  vykresliPublikaci();
}

function init() {
  const el = $("#youtubeObsah");
  if (!el) return;
  el.addEventListener("click", async (e) => {
    const t = e.target.closest("button, [data-ys-krok]");
    if (!t) return;
    const d = t.dataset;
    if (d.ysKrok) { krok = d.ysKrok; vykresliVse(); return; }
    const akce = {
      pripojit, obnovit: async () => { try { kanal = await Y().kanal(); videa = []; seznamPlaylistu = null; vykresliVse(); } catch (er) { zprava(esc(er.message), "chyba"); } },
      odpojit: async () => { if (!confirm("Odpojit YouTube? Aplikace zapomene přístup (zruší se i souhlas u Googlu).")) return; await Y().odhlas(); kanal = null; videa = []; seznamPlaylistu = null; vykresliVse(); },
      "ulozit-client": async () => { Y().nastavClientId($("#ysClient").value); if (Y().clientId()) await pripojit(); },
      "smazat-client": () => { Y().nastavClientId(""); vykresliVse(); },
      seo: generujSEO,
      "kopirovat-tagy": () => navigator.clipboard.writeText(pub.seo.tagy.join(", ")).then(() => toast("Tagy zkopírované ✓")),
      "do-miniatur": () => { window.DHMiniatury?.predvyplnZVidea({ tema: pub.seo.titul || pub.zdroj?.nazev || "", titulek: pub.seo.titul, popis: pub.scenar }); window.DHShell?.jdi("miniatury"); },
      "bez-miniatury": () => { pub.miniatura = null; ulozPub(); vykresliPublikaci(); },
      publikovat: publikuj,
      "nova-pub": () => { pub = novaPublikace(); souborVidea = null; vykresliPublikaci(); },
      "pl-vlastni": () => vytvorPlaylist($("#ysPlNazev").value),
      "kom-nacti": async () => {
        try {
          if (!kanal) kanal = await Y().kanal();
          komentareVideo = $("#ysKomVideo").value;
          komentareData = await Y().komentare({ videoId: komentareVideo || undefined, kanalId: kanal.id });
          komentareAnalyza = null; vykresliKomentare();
        } catch (er) { zprava(esc(er.message), "chyba"); }
      },
      "kom-ai": analyzujKomentare,
    };
    if (d.ys && akce[d.ys]) return akce[d.ys]();
    if (d.ysMeta) return upravMetadata(d.ysMeta);
    if (d.ysMini) return miniaturaKVideu(d.ysMini);
    if (d.ysKom) { komentareVideo = d.ysKom; krok = "komentare"; vykresliVse(); return; }
    if (d.ysHashtag !== undefined) { const h = pub.seo.hashtagy[+d.ysHashtag]; h.vybran = !h.vybran; t.classList.toggle("on", h.vybran); ulozPub(); return; }
    if (d.ysVyberMini) { pub.miniatura = { obrazekId: d.ysVyberMini, zdroj: "tf" }; ulozPub(); vykresliPublikaci(); return; }
    if (d.ysPlNovy) return vytvorPlaylist(d.ysPlNovy);
    if (d.ysPlUloz) {
      const x = seznamPlaylistu.find((y) => y.id === d.ysPlUloz);
      const popis = $(`[data-ys-pl-popis="${d.ysPlUloz}"]`).value;
      try { await Y().upravPlaylist(x.id, x.nazev, popis); x.popis = popis; toast("Popis playlistu uložen ✓"); } catch (er) { zprava(esc(er.message), "chyba"); }
      return;
    }
    if (d.ysOdeslat !== undefined) {
      const c = komentareData[+d.ysOdeslat];
      const text = $(`[data-ys-odp="${d.ysOdeslat}"]`).value.trim();
      if (!text || !confirm(`Odeslat veřejnou odpověď pod komentář od ${c.autor}?\n\n„${text}“`)) return;
      try { await Y().odpovez(c.id, text); t.textContent = "✓ Odesláno"; t.disabled = true; } catch (er) { zprava(esc(er.message), "chyba"); }
      return;
    }
    if (d.ysPubOtevri) { pub = await U().nacti("publikace", d.ysPubOtevri); souborVidea = null; krok = "publikovat"; vykresliVse(); return; }
    if (d.ysPubSmaz) { if (confirm("Smazat záznam z historie? (Na YouTube se nic nemaže.)")) { await U().smaz("publikace", d.ysPubSmaz); vykresliHistorii(); } }
  });
  el.addEventListener("input", (e) => {
    if (!pub) return;
    const t = e.target;
    const s = pub.seo;
    if (t.id === "ysScenar") pub.scenar = t.value;
    else if (t.id === "ysFakta") pub.fakta = t.value;
    else if (t.id === "ysTitul") s.titul = t.value;
    else if (t.id === "ysPopis") s.popis = t.value;
    else if (t.id === "ysTagy") s.tagy = t.value.split(",").map((x) => x.trim()).filter(Boolean);
    else if (t.id === "ysNovyPlaylist") pub.nastaveni.novyPlaylist = t.value;
    else return;
    ulozPub(); vykresliKontroly();
  });
  el.addEventListener("change", async (e) => {
    const t = e.target, n = pub?.nastaveni;
    if (t.id === "ysRazeni") { razeni = t.value; vykresliVidea(); return; }
    if (!pub) return;
    if (t.id === "ysReel") return vyberReel(t.value);
    if (t.id === "ysSoubor") {
      const f = t.files[0];
      if (!f) return;
      souborVidea = f;
      let delka = null;
      try { delka = await new Promise((ok) => { const v = document.createElement("video"); v.preload = "metadata"; v.onloadedmetadata = () => ok(v.duration); v.onerror = () => ok(null); v.src = URL.createObjectURL(f); }); } catch { /* nic */ }
      pub.zdroj = { typ: "soubor", nazev: f.name, velikost: f.size, delka };
      pub.stav.relace = null;
      if (!pub.seo.titul) pub.seo.titul = f.name.replace(/\.[^.]+$/, "").slice(0, 100);
      ulozPub(); vykresliPublikaci(); return;
    }
    if (t.id === "ysMiniSoubor") {
      const f = t.files[0];
      if (!f) return;
      const img = await U().blobNaImg(f);
      if (img.naturalWidth < 640 || Math.abs(img.naturalWidth / img.naturalHeight - 16 / 9) > 0.05) toast(`Miniatura má ${img.naturalWidth}×${img.naturalHeight} – doporučeno 1280×720 (16:9).`, "info");
      if (f.size > 2 * 1024 * 1024) { toast("Soubor má víc než 2 MB – YouTube ho nepřijme.", "chyba"); return; }
      pub.miniatura = { obrazekId: await U().ulozObrazek(f, { finalni: true }), zdroj: "soubor" };
      ulozPub(); vykresliPublikaci(); return;
    }
    if (t.name === "ysTitul") { pub.seo.titul = pub.seo.tituly[+t.value].text; ulozPub(); vykresliPublikaci(); return; }
    const mapa = { ysKategorie: "kategorie", ysPlaylist: "playlistId", ysJazyk: "jazyk", ysLicence: "licence", ysDatum: "datum", ysCas: "cas", ysDatumNahr: "datumNahravani" };
    if (mapa[t.id]) { n[mapa[t.id]] = t.value; ulozPub(); if (["ysPlaylist", "ysDatum", "ysCas"].includes(t.id)) vykresliPublikaci(); else vykresliKontroly(); return; }
    const bool = { ysNaplan: "naplanovat", ysPlacena: "placenaPropagace", ysEmbed: "embed", ysNotif: "notifikace" };
    if (bool[t.id]) { n[bool[t.id]] = t.checked; ulozPub(); if (t.id === "ysNaplan") vykresliPublikaci(); return; }
    if (t.name === "ysVid") { n.viditelnost = t.value; if (t.value !== "private") n.naplanovat = false; ulozPub(); vykresliPublikaci(); return; }
    if (t.name === "ysDeti") { n.proDeti = t.value === "ano"; ulozPub(); vykresliKontroly(); return; }
    if (t.name === "ysSynt") { n.syntetika = t.value === "ano"; ulozPub(); vykresliKontroly(); }
  });
  document.addEventListener("dh:zalozka", (e) => { if (e.detail === "youtube") vykresliVse(); });
  document.addEventListener("dh:youtube", (e) => { if (!e.detail.pripojeno) { kanal = null; } if ($("#zalozkaYoutube") && !$("#zalozkaYoutube").hidden) vykresliKanal(); });
  document.addEventListener("dh:miniatura", () => { if (krok === "publikovat" && !$("#zalozkaYoutube").hidden) vykresliPublikaci(); });
  if (!Y().clientId()) krok = "pripojeni";
  vykresliVse();
}

window.DHYtStudio = {
  get kanal() { return kanal; },
  async zajistiKanal() { if (!kanal) kanal = await Y().kanal(); return kanal; },
  async videaKanalu() { if (!videa.length) await nactiVidea(); return videa; },
  publikovatReel(id) { pub = novaPublikace(); krok = "publikovat"; window.DHShell?.jdi("youtube"); vyberReel(id); },
};
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
