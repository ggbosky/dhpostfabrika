// Šablony textů pro @denik_hokeje – bez AI, bez klíčů.
// Texty jsou psané tak, aby jména týmů a hráčů stála v 1. pádě (čeština je
// jinak neohýbá správně) a slovesa v přítomném čase (nezáleží na rodu).

(() => {
"use strict";

const SOUTEZE = {
  "Extraliga": ["#extraliga", "#tipsportextraliga"],
  "Chance liga": ["#chanceliga"],
  "NHL": ["#nhl", "#icehockey"],
  "Reprezentace": ["#ceskyhokej", "#reprezentace"],
  "Mistrovství světa": ["#mshokej", "#iihfworlds"],
  "Jiná / žádná": [],
};

// ---------------------------------------------------------------- pomocníci --

const nahodne = (pole) => pole[Math.floor(Math.random() * pole.length)];
const t = (s) => (s || "").trim();
const velke = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const bezKonce = (s) => t(s).replace(/[.!?…\s]+$/u, "");
const veta = (s) => {
  s = t(s);
  if (!s) return "";
  s = velke(s);
  return /[.!?…)"“”]$/u.test(s) ? s : s + ".";
};

function hashtag(s) {
  const slug = t(s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug.length >= 2 ? "#" + slug : null;
}

function skore(text) {
  const m = t(text).match(/^(\d{1,2})\s*[:\-–]\s*(\d{1,2})$/);
  if (!m) throw new Error("Skóre zadej ve tvaru 4:3.");
  return [Number(m[1]), Number(m[2])];
}

const KONEC = {
  "": { zkratka: "", text: "", kde: "" },
  pp: { zkratka: "\u00a0pp", text: " po prodloužení", kde: "v prodloužení" },
  sn: { zkratka: "\u00a0sn", text: " po nájezdech", kde: "v nájezdech" },
};

// Pole formuláře: [klíč, popisek, typ, placeholder, povinné]
const SPOLECNA_POLE = [
  ["soutez", "Soutěž", "soutez"],
  ["poznamka", "Vlastní věta navíc (nepovinné)", "textarea", "Např. Kometa se tím posouvá na 2. místo tabulky."],
];

// ------------------------------------------------------------------ šablony --

const SABLONY = {
  vysledek: {
    nazev: "Výsledek zápasu",
    ikona: "🏒",
    pole: [
      ["domaci", "Domácí tým", "text", "Kometa Brno", true],
      ["hoste", "Hosté", "text", "Sparta Praha", true],
      ["skore", "Skóre (domácí:hosté)", "text", "4:3", true],
      ["konec", "Konec zápasu", "select", { "": "V základní době", pp: "Po prodloužení", sn: "Po nájezdech" }],
      ["strelci", "Střelci (nepovinné)", "text", "Zbořil 2, Kořenář – Horák"],
      ["brankar", "Brankář (nepovinné)", "text", "Furch"],
      ["zakroky", "Počet zákroků brankáře", "text", "34"],
      ["hvezda", "Hráč zápasu (nepovinné)", "text", "Peter Mueller"],
    ],
    tvor(d) {
      const [a, b] = skore(d.skore);
      const k = KONEC[d.konec || ""];
      const vysl = `${d.domaci} – ${d.hoste} ${a}:${b}${k.zkratka}`;
      let hook, telo, titulek, cta;

      if (a === b) {
        hook = nahodne([`🤝 Body se dělí!`, `⚖️ Bez vítěze!`]);
        telo = [nahodne([
          `Utkání ${d.domaci} – ${d.hoste} končí remízou ${a}:${b}.`,
          `${d.domaci} a ${d.hoste} se rozcházejí smírně, ${a}:${b}.`,
        ])];
        titulek = `${d.domaci} ${a}:${b} ${d.hoste}`;
        cta = ["Spravedlivá remíza? 👇", "Kdo si podle vás zasloužil víc? 👇"];
      } else {
        const vitez = a > b ? d.domaci : d.hoste;
        const porazeny = a > b ? d.hoste : d.domaci;
        const [v, p] = [Math.max(a, b), Math.min(a, b)];
        const hooky = [
          `🚨 ${vitez} slaví výhru${k.text}!`,
          `🔥 Body bere ${vitez}!`,
          `🏒 ${vitez} vítězí ${v}:${p}${k.zkratka}!`,
        ];
        if (k.kde) hooky.push(`😮‍💨 Drama až do konce! ${vitez} rozhoduje ${k.kde}.`);
        if (v - p >= 3) hooky.push(`💥 Jasná věc! ${vitez} přehrává soupeře ${v}:${p}.`);
        hook = nahodne(hooky);
        telo = [nahodne([
          `${vitez} zvládá souboj s týmem ${porazeny} a vítězí ${v}:${p}${k.text}.`,
          `Utkání ${d.domaci} – ${d.hoste} končí ${a}:${b}${k.text}. Radovat se může ${vitez}.`,
          `Výhru ${v}:${p}${k.text} slaví ${vitez}.`,
        ])];
        titulek = nahodne([`${vitez} vítězí ${v}:${p}${k.zkratka}`, vysl]);
        cta = [
          "Co říkáte na výkon obou týmů? 👇",
          "Kdo byl pro vás hráčem zápasu? 👇",
          "Jak hodnotíte zápas? Napište do komentářů 👇",
        ];
        if (k.kde) cta.push("Zasloužená výhra, nebo štěstí? 👇");
      }

      const radky = [];
      if (t(d.strelci)) radky.push(`🥅 Branky: ${bezKonce(d.strelci)}`);
      if (t(d.brankar)) radky.push(t(d.zakroky) ? `🧤 ${t(d.brankar)}: ${t(d.zakroky)} zákroků` : `🧤 V brance: ${t(d.brankar)}`);
      if (t(d.hvezda)) radky.push(`⭐ Hráč zápasu: ${t(d.hvezda)}`);
      if (radky.length) telo.push(radky.join("\n"));
      return { hook, telo, cta, titulek, tagy: [d.domaci, d.hoste] };
    },
  },

  prestup: {
    nazev: "Přestup / podpis",
    ikona: "✍️",
    pole: [
      ["hrac", "Hráč", "text", "Jakub Flek", true],
      ["pozice", "Pozice", "select", { útočník: "Útočník", obránce: "Obránce", brankář: "Brankář", trenér: "Trenér" }],
      ["kam", "Nový tým", "text", "Kometa Brno", true],
      ["odkud", "Předchozí tým (nepovinné)", "text", "Dynamo Pardubice"],
      ["delka", "Délka smlouvy (nepovinné)", "text", "do roku 2028"],
    ],
    tvor(d) {
      const hooky = [
        `🚨 Je to oficiální! ${d.hrac} míří do týmu ${d.kam}.`,
        `✍️ Podpis je na světě! ${d.kam} má novou posilu.`,
        `🔥 Velká posila! ${d.hrac} je novou tváří týmu ${d.kam}.`,
      ];
      if (t(d.odkud)) hooky.push(`🚨 Hokejová bomba! ${d.hrac} mění dres.`);
      const pozice = d.pozice || "útočník";
      const telo = [nahodne([
        `${velke(pozice)} ${d.hrac} přichází ${t(d.odkud) ? `z týmu ${t(d.odkud)} ` : ""}do týmu ${d.kam}.`,
        `${d.kam} oznamuje novou posilu: ${pozice} ${d.hrac}${t(d.odkud) ? ` (dosud ${t(d.odkud)})` : ""}.`,
      ])];
      if (t(d.delka)) telo.push(nahodne([`Smlouvu podepisuje ${bezKonce(d.delka)}.`, `Kontrakt platí ${bezKonce(d.delka)}.`]));
      return {
        hook: nahodne(hooky),
        telo,
        cta: ["Jak velká posila to podle vás bude? 👇", "Co na tenhle přestup říkáte? 👇", "Splní podle vás očekávání? Pište do komentářů 👇"],
        titulek: nahodne([`${d.hrac} míří do týmu ${d.kam}`, `Nová posila: ${d.hrac}`]),
        tagy: [d.kam, d.hrac],
      };
    },
  },

  milnik: {
    nazev: "Rekord / milník",
    ikona: "🏆",
    pole: [
      ["hrac", "Hráč nebo tým", "text", "David Pastrňák", true],
      ["milnik", "Milník / rekord", "text", "400. gól v NHL", true],
      ["tym", "Tým (nepovinné)", "text", "Boston Bruins"],
      ["kontext", "Kdy / při jaké příležitosti (nepovinné)", "text", "v zápase proti Torontu"],
    ],
    tvor(d) {
      const milnik = bezKonce(d.milnik);
      return {
        hook: nahodne([
          `🔥 ${velke(milnik)}! ${d.hrac} zapisuje historii.`,
          `🏆 Historický moment: ${d.hrac} – ${milnik}!`,
          `👏 Klobouk dolů! ${d.hrac} a ${milnik}.`,
        ]),
        telo: [
          `${d.hrac}${t(d.tym) ? ` (${t(d.tym)})` : ""} dosahuje dalšího milníku: ${milnik}${t(d.kontext) ? ` – ${bezKonce(d.kontext)}` : ""}.`,
          nahodne(["Gratulujeme! 👏", "Velká gratulace! 🎉", "Tohle se jen tak nevidí. 🔥"]),
        ],
        cta: ["Kam až to podle vás může dotáhnout? 👇", "Čekali jste to? 👇", "Pošlete gratulaci do komentářů 👇"],
        titulek: `${d.hrac}: ${milnik}`,
        tagy: [d.hrac, d.tym],
      };
    },
  },

  zraneni: {
    nazev: "Zranění / absence",
    ikona: "🚑",
    pole: [
      ["hrac", "Hráč", "text", "Roman Červenka", true],
      ["tym", "Tým", "text", "Dynamo Pardubice", true],
      ["co", "Co se stalo (nepovinné)", "text", "zranění kolena"],
      ["doba", "Jak dlouho bude chybět (nepovinné)", "text", "minimálně šest týdnů"],
    ],
    tvor(d) {
      const telo = [`${d.hrac} je mimo hru${t(d.co) ? `, důvodem je ${bezKonce(d.co)}` : ""}.`];
      if (t(d.doba)) telo.push(`Předpokládaná pauza: ${bezKonce(d.doba)}.`);
      telo.push(nahodne(["Přejeme brzké uzdravení! 🙏", "Ať je brzy zpátky na ledě! 🙏"]));
      return {
        hook: nahodne([
          `😬 Nepříjemná zpráva z týmu ${d.tym}.`,
          `🚑 ${d.tym} přichází o důležitého hráče.`,
          `❌ ${d.hrac} bude chybět.`,
        ]),
        telo,
        cta: ["Jak velká ztráta to pro tým bude? 👇", "Kdo podle vás zaskočí? 👇"],
        titulek: nahodne([`${d.hrac} bude chybět`, `${d.hrac} mimo hru`]),
        tagy: [d.tym, d.hrac],
      };
    },
  },

  pozvanka: {
    nazev: "Pozvánka / tip na zápas",
    ikona: "🗓️",
    pole: [
      ["domaci", "Domácí tým", "text", "Sparta Praha", true],
      ["hoste", "Hosté", "text", "Kometa Brno", true],
      ["kdy", "Kdy", "text", "dnes v 17:00", true],
      ["kde", "Kde / vysílání (nepovinné)", "text", "O2 arena, přímý přenos na ČT sport"],
      ["kontext", "O co se hraje (nepovinné)", "text", "souboj prvního s druhým týmem tabulky"],
    ],
    tvor(d) {
      const zapas = `${d.domaci} – ${d.hoste}`;
      const telo = [];
      if (t(d.kontext)) telo.push(veta(d.kontext));
      const info = [`🕐 ${velke(bezKonce(d.kdy))}`];
      if (t(d.kde)) info.push(`📍 ${bezKonce(d.kde)}`);
      telo.push(info.join("\n"));
      return {
        hook: nahodne([
          `🗓️ ${velke(bezKonce(d.kdy))} nás čeká ${zapas}!`,
          `🔥 Šlágr na programu: ${zapas}!`,
          `👀 ${zapas}. Tohle si nenechte ujít!`,
        ]),
        telo,
        cta: ["Jak to podle vás dopadne? Napište tip na výsledek 👇", "Kdo bere body? Tipujte v komentářích 👇"],
        titulek: `${d.domaci} vs. ${d.hoste}`,
        tagy: [d.domaci, d.hoste],
      };
    },
  },

  zprava: {
    nazev: "Obecná zpráva",
    ikona: "📰",
    pole: [
      ["nadpis", "Hlavní zpráva (jedna věta)", "text", "Kladno mění trenéra", true],
      ["fakta", "Podrobnosti – každý řádek = jeden odstavec", "textarea", "Vedení klubu odvolalo hlavního trenéra po sérii pěti porážek.\nTým do konce sezony povede jeho dosavadní asistent."],
      ["tagy", "Týmy / hráči pro hashtagy, oddělené čárkou (nepovinné)", "text", "Rytíři Kladno"],
    ],
    tvor(d) {
      const nadpis = bezKonce(d.nadpis);
      return {
        hook: nahodne([`🚨 ${velke(nadpis)}!`, `📰 ${velke(nadpis)}.`, `🔥 ${velke(nadpis)}!`]),
        telo: t(d.fakta).split(/\n+/).map(veta).filter(Boolean),
        cta: ["Co na to říkáte? 👇", "Jaký na to máte názor? Pište do komentářů 👇", "Dobrý krok, nebo chyba? 👇"],
        titulek: nadpis,
        tagy: t(d.tagy).split(","),
      };
    },
  },
};

window.DH = { SABLONY, SOUTEZE, SPOLECNA_POLE, hashtag, nahodne, veta, bezKonce, velke };
})();
