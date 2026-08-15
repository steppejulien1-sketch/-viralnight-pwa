// LE PARCOURS DU CLUBBEUR, ECRAN PAR ECRAN, EN PRODUCTION.
//
// But different de e2e_reel.cjs : celui-la verifie que la mecanique est
// juste (points, verrous, base). Celui-ci REGARDE ce que la personne voit
// et photographie chaque etape pour un examen a l'oeil.
//
// ⚠️ L'accueil est capture SANS SESSION d'abord : c'est l'ecran que voit
// quelqu'un qui vient de scanner le QR et qui n'a jamais rien installe.
// Le capturer connecte donnerait une image que personne ne voit jamais.
//
// Menage complet du compte jetable a la fin.

const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("./lib_vn.cjs");

const DOSSIER = `${__dirname}/parcours`;
// Par defaut la PROD. `VN_URL=http://127.0.0.1:4174` pour verifier une
// correction AVANT de la deployer — le point qui manquait jusqu'ici.
const SITE = process.env.VN_URL || V.PROD;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const notes = [];

const texte = (p) => p.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").trim());

const visibles = (p) => p.evaluate(() =>
  [...document.querySelectorAll("button,a[href],[role=button],input,select,textarea")]
    .filter((e) => e.offsetParent !== null)
    .map((e) => `${e.tagName}${e.type ? "[" + e.type + "]" : ""}:${(e.textContent || e.placeholder || e.value || "").trim().slice(0, 44)}`));

// Debordement horizontal : le defaut le plus courant sur telephone, et le
// seul qu'une capture ne montre pas toujours (la page est juste rognee).
const deborde = (p) => p.evaluate(() => {
  const d = document.documentElement;
  const hors = [...document.querySelectorAll("*")].slice(0, 3000)
    .filter((e) => e.getBoundingClientRect().right > d.clientWidth + 1)
    .map((e) => `${e.tagName}.${(e.className || "").toString().split(" ")[0]}`);
  return { scroll: d.scrollWidth, client: d.clientWidth, hors: [...new Set(hors)].slice(0, 6) };
});

// Texte trop petit : le plancher du socle est 12px (ui/tokens.css).
// ⚠️ Borne a 3000 elements : l'overlay de celebration ajoute des CENTAINES
// de confettis, et le parcours entier s'arretait sur un depassement de
// delai du protocole au moment de la confirmation de depot.
const minuscules = (p) => p.evaluate(() =>
  [...document.querySelectorAll("*")].slice(0, 3000)
    .filter((e) => e.children.length === 0 && (e.textContent || "").trim().length > 2 && e.offsetParent !== null)
    .map((e) => ({ px: parseFloat(getComputedStyle(e).fontSize), t: e.textContent.trim().slice(0, 34) }))
    .filter((x) => x.px < 12)
    .slice(0, 8));

async function cap(page, nom, titre) {
  await pause(700);
  const chemin = `${DOSSIER}/${nom}.png`;
  await page.screenshot({ path: chemin, fullPage: true });
  const d = await deborde(page);
  const m = await minuscules(page);
  notes.push({ nom, titre, debordement: d.scroll > d.client + 1 ? d : null, minuscules: m });
  console.log(`\n### ${titre}  ->  ${nom}.png`);
  console.log("  texte  :", (await texte(page)).split("\n").slice(0, 12).join(" | "));
  console.log("  actions:", (await visibles(page)).join(" · "));
  if (d.scroll > d.client + 1) console.log(`  ⚠ DEBORDEMENT ${d.scroll}px > ${d.client}px :`, d.hors.join(" "));
  if (m.length) console.log("  ⚠ TEXTE < 12px :", m.map((x) => `${x.px}px « ${x.t} »`).join(" · "));
}

async function clic(page, libelle, sel = "button,a,[role=button]") {
  const h = await page.evaluateHandle((t, s) =>
    [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null)
      .find((e) => (e.textContent || "").trim().toLowerCase().includes(t.toLowerCase())) || null, libelle, sel);
  const el = h.asElement();
  if (!el) { console.log(`  (« ${libelle} » introuvable — ignore)`); return false; }
  await el.click();
  await pause(1800);
  return true;
}

(async () => {
  fs.rmSync(DOSSIER, { recursive: true, force: true });
  fs.mkdirSync(DOSSIER, { recursive: true });

  const nav = await puppeteer.launch({
    executablePath: V.CHROME, headless: "new", protocolTimeout: 180000,
    defaultViewport: { width: 430, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  });

  let c = null;
  try {
    // ── 1. Ce que voit quelqu'un qui scanne le QR, sans compte ──────────
    const anon = await nav.newPage();
    await anon.goto(SITE + "/?c=mirage-brussels", { waitUntil: "networkidle2", timeout: 60000 });
    await pause(2500);
    await cap(anon, "1-accueil", "Accueil apres le scan du QR (aucun compte)");
    await anon.close();

    // ── 2. Le reste du parcours, connecte ───────────────────────────────
    c = await V.compteJetable("ux", SITE);
    const page = await nav.newPage();
    await page.goto(c.lien, { waitUntil: "networkidle2", timeout: 60000 });
    await page.goto(SITE + "/?c=mirage-brussels", { waitUntil: "networkidle2" });
    await pause(2500);

    await clic(page, "Commencer");
    await cap(page, "2-inscription", "Inscription");

    const pseudo = await page.$("input[type=text]");
    if (pseudo) { await pseudo.click(); await pseudo.type("julie_test"); }
    await pause(500);
    await cap(page, "3-inscription-remplie", "Inscription, pseudo saisi");

    await clic(page, "C'est parti");
    await cap(page, "4-dashboard", "Tableau de bord (nouveau compte, 0 point)");

    await clic(page, "Poster");
    await cap(page, "5-depot-format", "Depot : choix du format");

    // Le parcours de depot varie selon le format ; on suit TikTok, le seul
    // paye aux vues.
    await clic(page, "TikTok");
    await cap(page, "6-depot-tiktok", "Depot : format TikTok choisi");

    // ⚠️ Le lien est OBLIGATOIRE depuis la 0028 : sans lui, « Ouvrir
    // TikTok » repond « Colle le lien… » et le parcours n'avance pas.
    const lien = await page.$("input[type=url]");
    if (lien) { await lien.click(); await lien.type("https://www.tiktok.com/@julie_test/video/7412345678901234567"); }
    await pause(400);
    await cap(page, "7-depot-lien", "Depot : lien renseigne");

    await clic(page, "Ouvrir TikTok");
    for (const p of await nav.pages()) {
      if (p !== page && !/vercel\.app/.test(p.url())) await p.close();
    }
    await cap(page, "8-depot-envoi", "Depot : etape d'envoi");
    await clic(page, "Envoyer au club");
    await cap(page, "9-depot-confirme", "Depot : confirmation");

    // ── 3. Les onglets ──────────────────────────────────────────────────
    // ⚠️ La barre d'onglets est MASQUEE pendant le depot (parcours a une
    // seule issue, voulu). On revient par le bouton de l'ecran de
    // confirmation — un rechargement ramene sur l'accueil, pas dans l'app.
    await clic(page, "Voir mon espace");
    await pause(1500);
    for (const [onglet, nom, titre] of [
      ["Boutique", "10-boutique", "Boutique"],
      ["Classement", "11-classement", "Classement hebdo"],
      ["Profil", "12-profil", "Profil"],
    ]) {
      if (await clic(page, onglet, "button,a,[role=button],.vn-tab,[class*=tab]")) {
        await cap(page, nom, titre);
      }
    }
    await clic(page, "Accueil", "button,a,[role=button],.vn-tab,[class*=tab]");
    if (await clic(page, "Collection")) await cap(page, "13-collection", "Collection de badges");
  } finally {
    await nav.close();
    if (c) { await V.supprimerCompte(c.uid); console.log("\ncompte de test supprime"); }
  }

  fs.writeFileSync(`${DOSSIER}/notes.json`, JSON.stringify(notes, null, 1));
  console.log(`\n=== ${notes.length} ecrans captures dans outils/parcours/ ===`);
  const pbs = notes.filter((n) => n.debordement || n.minuscules.length);
  console.log(pbs.length ? `⚠ ${pbs.length} ecran(s) avec un defaut mesurable` : "aucun debordement ni texte sous 12px");
})().catch((e) => { console.error("\nECHEC:", e.message); process.exit(1); });
