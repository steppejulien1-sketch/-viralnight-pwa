// Plus aucune capture, quel que soit le format (0028).
// Verifie par l'interface : story, reel et tiktok se deposent sans image,
// le lien est exige pour les deux derniers, et le gerant sait ou verifier.
const fs = require("fs");
const puppeteer = require("puppeteer-core");
const V = require("./lib_vn");
const LOCAL = "http://127.0.0.1:5174";

const trace = [];
const dire = (ok, t) => { trace.push([ok, t]); console.log((ok ? "  OK  | " : " FAIL | ") + t); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

const visibles = (page) => page.evaluate(() =>
  [...document.querySelectorAll("button,a[href],[role=button],input,label")]
    .filter((e) => e.offsetParent !== null)
    .map((e) => `${e.tagName}${e.type ? "[" + e.type + "]" : ""}:${(e.textContent || e.placeholder || "").trim().slice(0, 40)}`));

const texte = (page) => page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").trim());

async function clic(page, libelle, sel = "button,a,[role=button],li") {
  const h = await page.evaluateHandle((t, s) =>
    [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null)
      .find((e) => (e.textContent || "").trim().toLowerCase().includes(t.toLowerCase())) || null, libelle, sel);
  const el = h.asElement();
  if (!el) throw new Error(`« ${libelle} » introuvable | vu : ${(await visibles(page)).join(" · ")}`);
  await el.click();
  await pause(1400);
}

async function sessionGerant() {
  const txt = fs.readFileSync("C:/Users/stepp/viralnight-identifiants.txt", "utf8");
  const i = txt.indexOf("owner@mirage.club");
  const m = /mot de passe\s*\.*\s*(\S+)/i.exec(txt.slice(i, i + 400));
  const r = await fetch(`${V.BASE}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: V.ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@mirage.club", password: m[1] }),
  });
  return (await r.json()).access_token;
}

// Un depot complet depuis l'interface, pour un format donne.
async function deposer(nav, compte, format, lien) {
  const page = await nav.newPage();
  const envois = [];
  page.on("request", (r) => {
    if (/rpc\/submit_story/.test(r.url())) envois.push(r.postData());
  });
  await page.goto(compte.lien, { waitUntil: "networkidle2", timeout: 60000 });
  await page.goto(LOCAL + "/?c=mirage-brussels", { waitUntil: "networkidle2" });
  await pause(2000);
  await clic(page, "Commencer");
  const pseudo = await page.$("input[type=text]");
  await pseudo.click(); await pseudo.type("e2e_" + format);
  await clic(page, "C'est parti");
  await pause(1500);
  await clic(page, "Poster");
  await pause(1000);
  if (format !== "story") await clic(page, format === "reel" ? "Reel" : "TikTok");

  const resultat = { page, envois };
  if (format !== "story") {
    // 1er essai VOLONTAIREMENT sans lien : il doit etre refuse.
    await clic(page, "Ouvrir " + (format === "tiktok" ? "TikTok" : "Instagram"));
    resultat.refusSansLien = /colle le lien/i.test(await texte(page));
    const champ = await page.$("input[type=url]");
    if (champ) { await champ.click(); await champ.type(lien); }
  }
  await clic(page, "Ouvrir " + (format === "tiktok" ? "TikTok" : "Instagram"));
  for (const p of await nav.pages()) {
    const u = p.url();
    if (p !== page && (u.includes("instagram.com") || u.includes("tiktok.com"))) await p.close();
  }
  await pause(800);
  resultat.ecranPreuve = await visibles(page);
  await clic(page, "envoyer au club");
  await pause(3000);
  resultat.apres = await texte(page);
  return resultat;
}

(async () => {
  const club = V.sql("select id, ig_handle from public.clubs where slug='mirage-brussels'")[0];
  const comptes = {};
  const nav = await puppeteer.launch({
    executablePath: V.CHROME, headless: "new",
    defaultViewport: { width: 430, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  });

  try {
    for (const [format, lien] of [
      ["story", null],
      ["reel", "https://www.instagram.com/reel/Cx1y2z3aBcD/"],
      ["tiktok", "https://www.tiktok.com/@moi/video/7412345678901234567"],
    ]) {
      const c = await V.compteJetable(format, LOCAL);
      comptes[format] = c;
      const r = await deposer(nav, c, format, lien);

      dire(!r.ecranPreuve.some((x) => /INPUT\[file\]/.test(x)),
        `${format} : aucune capture demandee a l'ecran`);
      if (format !== "story") {
        dire(r.refusSansLien === true, `${format} : sans lien, l'ecran refuse d'avancer`);
      }
      const corps = r.envois[0] ? JSON.parse(r.envois[0]) : null;
      dire(corps && corps.p_proof === null, `${format} : p_proof envoye a null`);
      if (format !== "story") {
        dire(corps && !!corps.p_url, `${format} : le lien accompagne le depot`);
      }
      dire(/ENVOY/i.test(r.apres || ""), `${format} : depot accepte`);

      const st = V.sql(`select id, kind, url from public.story_events where user_id='${c.uid}'`)[0];
      dire(!!st, `${format} : la ligne existe en base`);
      await r.page.close();
    }

    // --- Ce que voit le gerant -----------------------------------------
    const pageG = await nav.newPage();
    await pageG.setViewport({ width: 1400, height: 1200 });
    await pageG.goto(await V.lienGerant(LOCAL + "/owner.html"), { waitUntil: "networkidle2", timeout: 60000 });
    await pause(4000);
    await pageG.screenshot({ path: `${__dirname}/d-gerant.png`, fullPage: true });
    const vu = await texte(pageG);
    dire(!/Capture illisible/i.test(vu), "aucune carte n'affiche « Capture illisible »");
    dire((vu.match(/Pas de capture/g) || []).length >= 3, "les trois contenus affichent « Pas de capture »");
    dire(new RegExp(club.ig_handle.replace(".", "\\.")).test(vu), "la story renvoie vers l'Instagram du club");
    dire(/Ouvre le lien/i.test(vu), "le reel et le TikTok renvoient vers le lien");
    dire(!/Lire la capture/i.test(vu), "le bouton OCR a disparu (plus rien a lire)");
    dire(/Ouvrir la publication/i.test(vu), "le lien est cliquable depuis la carte");

    // Validation d'un des trois
    await clic(pageG, "Valider et créditer");
    await pause(3000);
    const credites = V.sql(`select count(*)::int as n from public.story_events
                             where verified = true and user_id in (${Object.values(comptes).map((c) => `'${c.uid}'`).join(",")})`)[0];
    dire(credites.n === 1, `validation depuis la console : ${credites.n} contenu credite`);
  } finally {
    for (const c of Object.values(comptes)) await V.supprimerCompte(c.uid);
    await nav.close();
    console.log("\ncomptes de test supprimes");
  }

  const ko = trace.filter(([o]) => !o);
  console.log(`\n=== ${trace.length - ko.length}/${trace.length} verifications au vert ===`);
  ko.forEach(([, t]) => console.log("  ECHEC :", t));
  process.exit(ko.length ? 1 : 0);
})().catch((e) => { console.error("\nECHEC:", e.message); process.exit(1); });
