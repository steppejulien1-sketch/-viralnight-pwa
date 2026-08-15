// LA CONSOLE DU GERANT, SECTION PAR SECTION.
//
// Pendant du parcours clubbeur : ici on regarde ce que voit la personne
// QUI PAIE. Session gerant reelle via lien magique admin.
//
// ⚠️ `get_club_stats` / `get_club_audience` sont SECURITY DEFINER +
// owns_club() : muettes en SQL direct. La seule facon de les verifier est
// de lire ce que le gerant VOIT, puis de le comparer a un calcul
// independant. C'est pour ca qu'on passe par le navigateur.

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("./lib_vn.cjs");

const DOSSIER = `${__dirname}/parcours-gerant`;
const SITE = process.env.VN_URL || V.PROD;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const notes = [];

const texte = (p) => p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").trim());

const visibles = (p) => p.evaluate(() =>
  [...document.querySelectorAll("button,a[href],[role=button],input,select,textarea")]
    .filter((e) => e.offsetParent !== null)
    .map((e) => `${e.tagName}${e.type ? "[" + e.type + "]" : ""}:${(e.textContent || e.placeholder || e.value || "").trim().slice(0, 40)}`));

const mesures = (p) => p.evaluate(() => {
  const d = document.documentElement;
  const hors = [...document.querySelectorAll("*")].slice(0, 3000)
    .filter((e) => e.getBoundingClientRect().right > d.clientWidth + 1)
    .map((e) => `${e.tagName}.${(e.className || "").toString().split(" ")[0]}`);
  const petits = [...document.querySelectorAll("*")].slice(0, 3000)
    .filter((e) => e.children.length === 0 && (e.textContent || "").trim().length > 2 && e.offsetParent !== null)
    .map((e) => ({ px: parseFloat(getComputedStyle(e).fontSize), t: e.textContent.trim().slice(0, 34) }))
    .filter((x) => x.px < 12).slice(0, 8);
  // Un texte qui deborde de son cadre : frequent sur un tableau de bord
  // dense, invisible sur une capture si la coupe est nette.
  // ⚠️ Deux faux positifs a exclure, sinon la sonde crie au loup :
  //   - `text-overflow: ellipsis` = coupe VOULUE (les sous-titres de
  //     tableau sont bornes a 260px expres) ;
  //   - les elements SVG et les <input>, dont scrollWidth ne mesure pas
  //     un debordement visible (un champ defile, c'est normal).
  const coupes = [...document.querySelectorAll("*")].slice(0, 3000)
    .filter((e) => e.children.length === 0 && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 0)
    .filter((e) => !(e instanceof SVGElement) && e.tagName !== "INPUT" && e.tagName !== "TEXTAREA")
    .filter((e) => getComputedStyle(e).textOverflow !== "ellipsis")
    .map((e) => `${(e.className || "").toString().split(" ")[0]} « ${e.textContent.trim().slice(0, 28)} »`)
    .slice(0, 6);
  return { deborde: d.scrollWidth > d.clientWidth + 1, petits, coupes };
});

async function cap(page, nom, titre) {
  await pause(900);
  await page.screenshot({ path: `${DOSSIER}/${nom}.png`, fullPage: true });
  const m = await mesures(page);
  notes.push({ nom, titre, ...m });
  console.log(`\n### ${titre}  ->  ${nom}.png`);
  console.log("  texte  :", (await texte(page)).split("\n").slice(0, 14).join(" | "));
  console.log("  actions:", (await visibles(page)).join(" · "));
  if (m.deborde) console.log("  ⚠ DEBORDEMENT HORIZONTAL");
  if (m.petits.length) console.log("  ⚠ TEXTE < 12px :", m.petits.map((x) => `${x.px}px « ${x.t} »`).join(" · "));
  if (m.coupes.length) console.log("  ⚠ TEXTE COUPE :", m.coupes.join(" · "));
}

async function clic(page, libelle, sel = "button,a,[role=button],li,nav *") {
  const h = await page.evaluateHandle((t, s) =>
    [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null)
      .find((e) => (e.textContent || "").trim().toLowerCase() === t.toLowerCase()
                || (e.textContent || "").trim().toLowerCase().includes(t.toLowerCase())) || null, libelle, sel);
  const el = h.asElement();
  if (!el) { console.log(`  (« ${libelle} » introuvable — ignore)`); return false; }
  await el.click();
  await pause(2200);
  return true;
}

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });

  const nav = await puppeteer.launch({
    executablePath: V.CHROME, headless: "new", protocolTimeout: 180000,
    defaultViewport: { width: 1400, height: 950, deviceScaleFactor: 1 },
  });

  try {
    const page = await nav.newPage();
    await page.goto(await V.lienGerant(SITE + "/owner.html"), { waitUntil: "networkidle2", timeout: 60000 });
    await pause(3500);
    await cap(page, "1-arrivee", "Arrivee du gerant (section par defaut)");

    for (const [section, nom] of [
      ["Boutique", "2-boutique"],
      ["Défis", "3-defis"],
      ["Statistiques", "4-statistiques"],
      ["QR", "5-qr"],
      ["Paramètres", "6-parametres"],
    ]) {
      if (await clic(page, section)) await cap(page, nom, `Section ${section}`);
    }
  } finally {
    await nav.close();
  }

  fs.writeFileSync(`${DOSSIER}/notes.json`, JSON.stringify(notes, null, 1));
  const pbs = notes.filter((n) => n.deborde || n.petits.length || n.coupes.length);
  console.log(`\n=== ${notes.length} sections capturees ===`);
  console.log(pbs.length ? `⚠ ${pbs.length} section(s) avec un defaut mesurable` : "aucun defaut mesurable");
})().catch((e) => { console.error("\nECHEC:", e.message); process.exit(1); });
