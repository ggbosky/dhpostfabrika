// Kostra aplikace: navigace (boční panel / spodní lišta), hlavička stránky, rychlé hledání (Ctrl+K),
// náhled v Instagramu, oznámení (toasty) a klávesové zkratky.
(() => {
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ik = (n) => `<svg class="ik"><use href="#i-${n}"/></svg>`;
const normalizuj = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const FORMATY = {
  post: { nazev: "Post", ikona: "post", barva: "#e01e26", popis: "Jedna fotka s titulkem a text. Na výsledky, rekordy a zprávy." },
  carousel: { nazev: "Carousel", ikona: "carousel", barva: "#ffc000", popis: "Víc slidů – příběh, žebříček, statistiky. Lidé si ho nejčastěji ukládají." },
  vyroci: { nazev: "Dnes před lety", ikona: "vyroci", barva: "#4da3ff", popis: "Šablona výročí: datum, událost a fotka." },
  reels: { nazev: "Reel", ikona: "reels", barva: "#b26bff", popis: "Video 9:16 s českým hlasem, titulky a ověřenými fakty." },
};

const STRANKY = {
  prehled: { skupina: "Start", nazev: "Přehled", ikona: "domu" },
  statistiky: { skupina: "Start", nazev: "Statistiky", ikona: "statistiky",
    popis: "Jak si vedou tvoje příspěvky: dosah, uložení, sdílení, nejlepší čas na post, co funguje a co ne. Hity jedním klikem zopakuješ v jiném formátu.",
    kroky: ["Připoj Instagram nebo nahraj CSV", "Podívej se, co funguje", "Zopakuj hity, naplánuj další"] },
  temata: { skupina: "Start", nazev: "Témata", ikona: "temata",
    popis: "AI projde web a najde ověřené zajímavosti – milníky, rekordy, příběhy – vždy se zdroji. Z tématu jedním klikem uděláš post, carousel nebo reel, nebo si ho uložíš do plánu.",
    kroky: ["Vyber, co hledat", "Najdi témata", "Zvol formát nebo ulož do plánu"] },
  post: { skupina: "Tvořit", nazev: "Nový post", ikona: "post",
    popis: "Obrázek 1080×1350 s titulkem a text postu. Nech AI navrhnout, nebo vyplň formulář ručně.",
    kroky: ["Zadání pro AI nebo formulář", "Fotka a titulek", "Stáhni obrázek a zkopíruj text"], akce: ["ig", "plan", "ulozit"] },
  carousel: { skupina: "Tvořit", nazev: "Carousel", ikona: "carousel",
    popis: "Série slidů ve stylu Deníku hokeje. Titulní slide + obsahové slidy, každý s vlastní fotkou.",
    kroky: ["Návrh od AI nebo slidy ručně", "Fotky a texty slidů", "Popisek a stažení všech slidů"], akce: ["ig", "plan", "ulozit"] },
  vyroci: { skupina: "Tvořit", nazev: "Dnes před lety", ikona: "vyroci",
    popis: "Jednoslidový post podle tvé šablony. Nadpis se sám přizpůsobí datu („DNES PŘED…“ jen když výročí připadá na dnešek).",
    kroky: ["Datum a událost", "Fotka", "Stáhni a zkopíruj popisek"], akce: ["ig", "plan", "ulozit"] },
  reels: { skupina: "Tvořit", nazev: "Reels", ikona: "reels",
    popis: "Krátké video 9:16: rešerše se zdroji, český scénář a hlas, legální záběry, střih a kontrola kvality před exportem.",
    kroky: ["Téma", "Rešerše a scénář", "Záběry a hlas", "Střih, kontrola, MP4"] },
  plan: { skupina: "Organizace", nazev: "Plán publikace", ikona: "plan",
    popis: "Rozvrhni si obsah do týdne. Záznamy přetahuj mezi dny, kliknutím měň stav a jedním tlačítkem je otevři k tvorbě.",
    akce: ["novy", "kopirovat"] },
  koncepty: { skupina: "Organizace", nazev: "Koncepty", ikona: "koncepty",
    popis: "Rozpracované posty i s fotkami. Ukládají se jen v tomhle prohlížeči a práce se navíc průběžně ukládá sama." },
  styl: { skupina: "Nastavení", nazev: "Můj styl a AI", ikona: "styl",
    popis: "Aplikace se naučí tvoje hashtagy, výzvy a tón z dřívějších postů. Tady vložíš i AI klíč (Claude nebo Gemini)." },
};
const S_IG = new Set(["post", "carousel", "vyroci"]);

let aktualni = null;

// ------------------------------------------------------------- oznámení --

function toast(text, druh = "ok", ms = 3800) {
  const el = document.createElement("div");
  el.className = `toast ${druh}`;
  el.innerHTML = text;
  const box = $("#toasty");
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => { el.classList.add("pryc"); setTimeout(() => el.remove(), 300); }, ms);
}

// ------------------------------------------------------------- navigace --

function jdi(kam) {
  const t = document.querySelector(`.tab[data-tab="${kam}"]`);
  if (t) t.click();
  $$("dialog.list[open]").forEach((d) => d.close());
}

function vykresliHlavu(kam) {
  const el = $("#strankaHlava");
  const s = STRANKY[kam];
  if (!s || kam === "prehled") { el.hidden = true; el.innerHTML = ""; return; }
  el.hidden = false;
  const akce = (s.akce || []).map((a) => ({
    ig: `<button type="button" class="btn small ghost" data-ig="${kam}">${ik("telefon")} Náhled v IG</button>`,
    plan: `<button type="button" class="btn small ghost" data-sh-plan="${kam}">${ik("plan")} Do plánu</button>`,
    ulozit: `<button type="button" class="btn small" data-sh-ulozit="${kam}" title="Ctrl+S">${ik("ulozit")} Uložit<span class="sh-dl"> koncept</span></button>`,
    novy: `<button type="button" class="btn small" data-plan-novy="">${ik("plus")} Nový záznam</button>`,
    kopirovat: `<button type="button" class="btn small ghost" data-plan-kopirovat>📋 Zkopírovat týden</button>`,
  })[a]).join("");
  el.innerHTML = `
    <div class="sh-text">
      <div class="sh-drobek">${esc(s.skupina)}</div>
      <h1>${esc(s.nazev)}</h1>
      ${s.popis ? `<p>${esc(s.popis)}</p>` : ""}
      ${s.kroky ? `<ol class="sh-kroky">${s.kroky.map((k) => `<li>${esc(k)}</li>`).join("")}</ol>` : ""}
    </div>
    ${akce ? `<div class="sh-akce">${akce}</div>` : ""}`;
}

function poPrepnuti(kam) {
  const prvni = aktualni === null;
  aktualni = kam;
  vykresliHlavu(kam);
  $$(".spodni [data-jdi]").forEach((b) => b.classList.toggle("on", b.dataset.jdi === kam));
  document.title = `${STRANKY[kam]?.nazev || "Post Fabrika"} · DH Post Fabrika`;
  if (location.hash.slice(1) !== kam) history[prvni ? "replaceState" : "pushState"](null, "", `#${kam}`);
  window.scrollTo(0, 0);
}

// ------------------------------------------------------- tvorba z odkudkoliv --

const AI_POLE = { post: "#aiZadani", carousel: "#cAiZadani", vyroci: "#vAiZadani" };

function reel(tema, poznamka = "") {
  jdi("reels");
  document.querySelector('.r-krok[data-krok="zalozit"]')?.click();
  const el = $("#rTema");
  if (el) { el.value = tema; el.focus(); }
  toast("Téma reelu je vyplněné – zkontroluj délku a styl a klikni <b>Založit projekt</b>.", "info", 5000);
  return poznamka;
}

function tvor(format, zadani = "", zdroje = []) {
  zadani = zadani.trim();
  if (format === "reels") { if (zadani) reel(zadani.split("\n")[0].slice(0, 160)); else jdi("reels"); return; }
  if (!zadani) { jdi(format); setTimeout(() => $(AI_POLE[format])?.focus(), 50); return; }
  if (!window.DHAI?.maKlic()) {
    jdi(format);
    const pole = $(AI_POLE[format]);
    if (pole) { pole.value = zadani; pole.focus(); }
    toast('Zadání je vyplněné. Aby ho AI rozpracovala, vlož klíč v <a href="#" data-jdi-na-ai>Můj styl → AI</a>.', "info", 6000);
    return;
  }
  if (format === "post") window.DHPost.navrhni(zadani, zdroje);
  else if (format === "carousel") window.DHCarousel.navrhni(zadani, zdroje, 4);
  else if (format === "vyroci") window.DHVyroci.navrhni(zadani, zdroje);
}

function hledatVyroci() {
  jdi("temata");
  const s = $("#tObdobi");
  if (s) { s.value = "vyroci"; s.dispatchEvent(new Event("change", { bubbles: true })); }
  $("#tHledej")?.click();
}

async function ulozKoncept(typ) {
  if (!window.DHKoncepty) return null;
  const id = await window.DHKoncepty.uloz(typ);
  if (id) toast(`Koncept uložen ✓ <a href="#koncepty" data-jdi="koncepty">Koncepty</a>`);
  return id;
}

async function doPlanu(typ) {
  const id = await ulozKoncept(typ);
  const nazev = {
    post: () => $("#titulek")?.value || ($("#text")?.value || "").split("\n")[0],
    carousel: () => ($("#cPopisek")?.value || "").split("\n")[0] || $("#cAiZadani")?.value,
    vyroci: () => ($("#vText")?.value || "").replace(/\*/g, "") || $("#vAiZadani")?.value,
  }[typ]?.() || FORMATY[typ].nazev;
  window.DHPlan?.upravit({ format: typ, nazev: nazev.trim().slice(0, 90), konceptId: id || "", stav: "rozpracovano" });
}

// ------------------------------------------------------ náhled Instagramu --

const ig = { i: 0, n: 1, text: "", cely: false };

function igData(typ) {
  if (typ === "post") return { platna: [$("#platno")], popisek: $("#text").value };
  if (typ === "carousel") return { platna: window.DHCarousel?.platna?.() || [$("#cPlatno")], popisek: $("#cPopisek").value };
  return { platna: [$("#vPlatno")], popisek: $("#vPopisek").value };
}

function klon(c) {
  const k = document.createElement("canvas");
  k.width = c.width; k.height = c.height;
  k.getContext("2d").drawImage(c, 0, 0);
  return k;
}

function popisekHtml(text, cely) {
  let kus = text;
  if (!cely) {
    const nl = text.indexOf("\n");
    kus = text.slice(0, 125);
    if (nl >= 0 && nl < 125) kus = text.slice(0, nl);
  }
  const html = esc(kus).replace(/(^|[\s(])([#@][\p{L}\p{N}_.]+)/gu, '$1<span class="tag">$2</span>');
  return `<b>denik_hokeje</b> ${html}${!cely && kus.length < text.length ? `… <button type="button" class="ig-vic" data-ig-vic>více</button>` : ""}`;
}

function igKontroly(text, slidu, typ) {
  const tagy = text.match(/#[\p{L}\p{N}_]+/gu) || [];
  const prvni = text.split("\n")[0].trim();
  const out = [];
  if (!text.trim()) out.push(["err", "Popisek", "Popisek je prázdný – bez textu post skoro nikdo neuloží."]);
  else if (text.length > 2200) out.push(["err", "Délka popisku", `${text.length} / 2 200 znaků – Instagram delší text nepřijme.`]);
  else out.push(["ok", "Délka popisku", `${text.length.toLocaleString("cs-CZ")} / 2 200 znaků.`]);
  if (text.trim()) {
    if (prvni.length > 125) out.push(["warn", "První věta", `Má ${prvni.length} znaků – ve feedu se usekne kolem 125. Háček dej na začátek.`]);
    else out.push(["ok", "První věta", "Háček je ve feedu vidět celý."]);
  }
  if (tagy.length > 30) out.push(["err", "Hashtagy", `${tagy.length} hashtagů – Instagram povolí nejvýš 30.`]);
  else if (tagy.length > 5) out.push(["warn", "Hashtagy", `${tagy.length} hashtagů – Instagram teď doporučuje 3–5 relevantních.`]);
  else if (!tagy.length) out.push(["warn", "Hashtagy", "Žádný hashtag – přidej 3–5 (např. ve Můj styl)."]);
  else out.push(["ok", "Hashtagy", `${tagy.length} hashtagů: ${esc(tagy.join(" "))}`]);
  if (typ === "carousel") out.push([slidu > 20 ? "err" : "ok", "Slidy", `${slidu} ${slidu === 1 ? "slide" : slidu < 5 ? "slidy" : "slidů"} (Instagram povolí až 20).`]);
  return out;
}

function igPosun() {
  $("#igPas").style.transform = `translateX(${-ig.i * 100}%)`;
  $$(".ig-tecky i").forEach((t, j) => t.classList.toggle("on", j === ig.i));
  const p = $("#igPocitadlo");
  if (p) p.textContent = `${ig.i + 1}/${ig.n}`;
  const l = $(".ig-sipka.l"), r = $(".ig-sipka.p");
  if (l) l.hidden = ig.i === 0;
  if (r) r.hidden = ig.i === ig.n - 1;
}

function otevriIG(typ) {
  if (!S_IG.has(typ)) typ = "post";
  const { platna, popisek } = igData(typ);
  ig.i = 0; ig.n = platna.length; ig.text = popisek || ""; ig.cely = false;
  const vice = ig.n > 1;
  $("#igObsah").innerHTML = `
    <div class="ig">
      <div class="ig-hlava"><img src="brand/dh-avatar.webp" alt=""><div><b>denik_hokeje</b><small>Deník hokeje</small></div><span>•••</span></div>
      <div class="ig-media"><div class="ig-pas" id="igPas"></div>
        ${vice ? `<span class="ig-pocitadlo" id="igPocitadlo"></span><button type="button" class="ig-sipka l" data-ig-krok="-1" aria-label="Předchozí">‹</button><button type="button" class="ig-sipka p" data-ig-krok="1" aria-label="Další">›</button>` : ""}
      </div>
      <div class="ig-akce">${ik("srdce")}${ik("bublina")}${ik("sdilet")}<div class="ig-tecky">${vice ? platna.map(() => "<i></i>").join("") : ""}</div>${ik("zalozka")}</div>
      <div class="ig-popisek" id="igPopisek">${popisekHtml(ig.text, false)}</div>
    </div>
    <div class="ig-kontrola">
      <h2>Kontrola před zveřejněním</h2>
      <ul>${igKontroly(ig.text, ig.n, typ).map(([d, t, x]) => `<li class="${d}"><b>${t}</b>${x}</li>`).join("")}</ul>
      <p class="muted" style="font-size:13px">Takhle zhruba post uvidí lidé ve feedu (tmavý režim). Fakta a zdroje si před zveřejněním ještě proklikni.</p>
      <div class="akce">
        <button type="button" class="btn" data-ig-kopiruj>Kopírovat popisek</button>
        <button type="button" class="btn ghost" data-zavrit>Zpět k úpravám</button>
      </div>
    </div>`;
  const pas = $("#igPas");
  platna.forEach((c) => pas.appendChild(klon(c)));
  igPosun();
  // swipe
  const media = $(".ig-media");
  let x0 = null;
  media.addEventListener("pointerdown", (e) => { x0 = e.clientX; });
  media.addEventListener("pointerup", (e) => {
    if (x0 === null) return;
    const dx = e.clientX - x0; x0 = null;
    if (Math.abs(dx) > 40) { ig.i = Math.max(0, Math.min(ig.n - 1, ig.i + (dx < 0 ? 1 : -1))); igPosun(); }
  });
  $("#igDialog").showModal();
}

// ------------------------------------------------------- rychlé hledání --

const pal = { polozky: [], vyber: 0, viditelne: [] };

async function polozkyPalety() {
  const out = [];
  for (const [k, s] of Object.entries(STRANKY)) out.push({ skupina: "Přejít na", nazev: s.nazev, ikona: s.ikona, klic: `${k} ${s.popis || ""}`, spust: () => jdi(k) });
  const akce = [
    ["Najít výročí dnešního dne", "vyroci", "dnes v historii vyroci den", hledatVyroci],
    ["Najít nová témata s AI", "temata", "hledat napady", () => { jdi("temata"); $("#tVlastni")?.focus(); }],
    ["Nový post s AI", "post", "vytvorit navrh", () => tvor("post")],
    ["Nový carousel s AI", "carousel", "vytvorit navrh slidy", () => tvor("carousel")],
    ["Nové „Dnes před lety“", "vyroci", "vytvorit sablona", () => tvor("vyroci")],
    ["Nový reel", "reels", "video vytvorit", () => tvor("reels")],
    ["Přidat záznam do plánu", "plan", "naplanovat kalendar novy", () => window.DHPlan?.upravit({})],
    ["Nastavit AI klíč (Claude / Gemini)", "styl", "api klic anthropic claude gemini nastaveni", () => { jdi("styl"); setTimeout(() => $("#aiKarta")?.scrollIntoView({ behavior: "smooth" }), 60); }],
  ];
  if (S_IG.has(aktualni)) {
    akce.unshift(["Náhled v Instagramu", "telefon", "ig instagram kontrola nahled", () => otevriIG(aktualni)]);
    akce.unshift(["Uložit koncept", "ulozit", "ulozit ctrl s", () => ulozKoncept(aktualni)]);
  }
  if (window.__dhZamceno) akce.push(["Odhlásit (zamknout aplikaci)", "styl", "logout odhlasit heslo zamknout", odhlasit]);
  akce.forEach(([nazev, ikona, klic, spust]) => out.push({ skupina: "Akce", nazev, ikona, klic, spust }));
  try {
    const k = (await window.DHKoncepty?.seznam?.()) || [];
    k.filter((z) => !z.auto).sort((a, b) => b.upraveno - a.upraveno).slice(0, 30).forEach((z) => out.push({
      skupina: "Koncepty", nazev: z.nazev, ikona: FORMATY[z.typ]?.ikona || "koncepty", info: FORMATY[z.typ]?.nazev || "",
      klic: "koncept", spust: () => window.DHKoncepty.otevri(z.id),
    }));
  } catch { /* bez konceptů */ }
  (window.DHPlan?.polozky() || []).forEach((p) => out.push({
    skupina: "Plán", nazev: p.nazev || "Bez názvu", ikona: "plan", info: p.datum ? new Date(`${p.datum}T12:00`).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" }) : "zásobník",
    klic: "plan", spust: () => window.DHPlan.upravit(p),
  }));
  return out;
}

function filtrujPaletu() {
  const q = normalizuj($("#palVstup").value).split(/\s+/).filter(Boolean);
  const skore = (p) => {
    const n = normalizuj(p.nazev);
    const h = `${n} ${normalizuj(`${p.skupina} ${p.klic || ""} ${p.info || ""}`)}`;
    if (!q.every((w) => h.includes(w))) return -1;
    return q.filter((w) => n.includes(w)).length * 10 + q.filter((w) => n.startsWith(w)).length * 5;
  };
  pal.viditelne = pal.polozky.map((p, i) => ({ p, s: skore(p), i })).filter((x) => x.s >= 0)
    .sort((a, b) => (q.length ? b.s - a.s : 0) || a.i - b.i).map((x) => x.p).slice(0, 40);
  pal.vyber = 0;
  vykresliPaletu();
}

function vykresliPaletu() {
  const el = $("#palSeznam");
  if (!pal.viditelne.length) { el.innerHTML = `<div class="pal-prazdno">Nic takového tu není. Zkus „post“, „plán“ nebo „výročí“.</div>`; return; }
  let skupina = "";
  el.innerHTML = pal.viditelne.map((p, i) => {
    const hlava = p.skupina !== skupina ? `<div class="pal-skupina">${esc(p.skupina)}</div>` : "";
    skupina = p.skupina;
    return `${hlava}<button type="button" class="pal-polozka ${i === pal.vyber ? "on" : ""}" data-pal="${i}" role="option">${ik(p.ikona)}<span>${esc(p.nazev)}</span>${p.info ? `<small>${esc(p.info)}</small>` : ""}</button>`;
  }).join("");
  el.querySelector(".pal-polozka.on")?.scrollIntoView({ block: "nearest" });
}

async function otevriPaletu() {
  const d = $("#paleta");
  if (d.open) return;
  $("#palVstup").value = "";
  pal.polozky = [];
  d.showModal();
  $("#palVstup").focus();
  pal.polozky = await polozkyPalety();
  filtrujPaletu();
}

function spustPaletu(i) {
  const p = pal.viditelne[i];
  if (!p) return;
  $("#paleta").close();
  Promise.resolve().then(p.spust).catch((e) => toast(esc(e.message), "chyba"));
}

// ------------------------------------------------------------------ start --

function init() {
  // „Tvořit“ list na mobilu
  $("#listFormaty").innerHTML = Object.entries(FORMATY).map(([k, f]) => `
    <button type="button" class="list-format" style="--f:${f.barva}" data-jdi="${k}">
      <span class="ik-box" style="--f:${f.barva}">${ik(f.ikona)}</span><span class="lf-txt"><b>${f.nazev}</b>${f.popis}</span></button>`).join("");

  document.addEventListener("dh:zalozka", (e) => poPrepnuti(e.detail));
  window.addEventListener("popstate", () => {
    const k = location.hash.slice(1);
    if (STRANKY[k] && k !== aktualni) jdi(k);
  });

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-jdi], [data-paleta], [data-list-tvorit], [data-zavrit], [data-ig], [data-sh-ulozit], [data-sh-plan], [data-ig-krok], [data-ig-vic], [data-ig-kopiruj], [data-pal]");
    if (!t) return;
    const d = t.dataset;
    if (d.jdi !== undefined) { e.preventDefault(); $$("dialog[open]").forEach((x) => x.close()); jdi(d.jdi); }
    else if (d.paleta !== undefined) otevriPaletu();
    else if (d.listTvorit !== undefined) $("#listTvorit").showModal();
    else if (d.zavrit !== undefined) t.closest("dialog")?.close();
    else if (d.ig) otevriIG(d.ig);
    else if (d.shUlozit) ulozKoncept(d.shUlozit);
    else if (d.shPlan) doPlanu(d.shPlan);
    else if (d.igKrok) { ig.i = Math.max(0, Math.min(ig.n - 1, ig.i + Number(d.igKrok))); igPosun(); }
    else if (d.igVic !== undefined) { $("#igPopisek").innerHTML = popisekHtml(ig.text, true); }
    else if (d.igKopiruj !== undefined) {
      navigator.clipboard.writeText(ig.text).then(() => toast("Popisek zkopírován ✓"), () => toast("Kopírování se nepovedlo – označ text ručně.", "chyba"));
    } else if (d.pal !== undefined) spustPaletu(Number(d.pal));
  });

  // klik na pozadí dialogu ho zavře
  $$("dialog.dlg").forEach((dlg) => dlg.addEventListener("click", (e) => { if (e.target === dlg) dlg.close(); }));

  $("#palVstup").addEventListener("input", filtrujPaletu);
  $("#palVstup").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const n = pal.viditelne.length;
      if (!n) return;
      pal.vyber = (pal.vyber + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
      vykresliPaletu();
    } else if (e.key === "Enter") { e.preventDefault(); spustPaletu(pal.vyber); }
  });

  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    const vPoli = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); otevriPaletu(); }
    else if (!mod && e.key === "/" && !vPoli && !$("dialog[open]")) { e.preventDefault(); otevriPaletu(); }
    else if (mod && e.key.toLowerCase() === "s" && S_IG.has(aktualni)) { e.preventDefault(); ulozKoncept(aktualni); }
  });

  // tečka stavu AI v mobilní hlavičce
  const pAI = $("#pAI"), tecka = $("#aiTecka");
  const zrcadli = () => tecka?.classList.toggle("ok", pAI.classList.contains("ok"));
  if (pAI) { new MutationObserver(zrcadli).observe(pAI, { attributes: true, childList: true }); zrcadli(); }

  // Zamčená verze (přihlášení heslem): tlačítko Odhlásit
  if (window.__dhZamceno) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pill odhlasit";
    b.textContent = "🔒 Odhlásit";
    b.title = "Zapomenout heslo na tomhle zařízení";
    b.addEventListener("click", odhlasit);
    $(".bok-stav")?.appendChild(b);
  }

  const start = location.hash.slice(1);
  jdi(STRANKY[start] ? start : "prehled");
}

function odhlasit() {
  try { localStorage.removeItem("dhpf_zamek"); } catch { /* nic */ }
  location.reload();
}

window.DHToast = toast;
window.DHShell = { jdi, tvor, reel, hledatVyroci, otevriIG, FORMATY, get aktualni() { return aktualni; } };
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
})();
