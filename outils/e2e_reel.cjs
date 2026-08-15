// TEST DE BOUT EN BOUT — LE VRAI CHEMIN, DEPUIS L'INTERFACE, EN PROD.
//
// ⚠️ POURQUOI CELUI-CI ET PAS CELUI DU MATIN. Le precedent rejouait les
// RPC avec les bons parametres — dont `p_views`, que le front n'envoie
// PLUS depuis le forfait. Il validait un chemin que personne n'emprunte.
// Ici tout passe par des clics sur viralnight-pwa.vercel.app : ce qui part
// sur le reseau est exactement ce que ferait le telephone de Julien.
//
// Clubbeur jetable + vraie console gerant. Menage complet a la fin.

const fs = require("fs");
const zlib = require("zlib");
const puppeteer = require("puppeteer-core");
const V = require("./lib_vn.cjs");

const trace = [];
const dire = (ok, t) => { trace.push([ok, t]); console.log((ok ? "  OK  | " : " FAIL | ") + t); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const nf = (n) => new Intl.NumberFormat("fr-FR").format(n);

function fabriquerCapture(chemin) {
  const [w, h] = [540, 960];
  const lignes = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x++) {
      const clair = y % 120 < 3;
      row[1 + x * 3] = clair ? 255 : 22;
      row[2 + x * 3] = clair ? 47 : 20;
      row[3 + x * 3] = clair ? 69 : 26;
    }
    lignes.push(row);
  }
  const crcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const bloc = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const corps = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(corps));
    return Buffer.concat([len, corps, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(chemin, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloc("IHDR", ihdr), bloc("IDAT", zlib.deflateSync(Buffer.concat(lignes))), bloc("IEND", Buffer.alloc(0)),
  ]));
}

const visibles = (page) => page.evaluate(() =>
  [...document.querySelectorAll("button,a[href],[role=button],input,label")]
    .filter((e) => e.offsetParent !== null)
    .map((e) => `${e.tagName}${e.type ? "[" + e.type + "]" : ""}:${(e.textContent || e.placeholder || "").trim().slice(0, 40)}`));

const texte = (page) => page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, "\n").trim());

async function clic(page, libelle, sel = "button,a,[role=button]") {
  const h = await page.evaluateHandle((t, s) => {
    return [...document.querySelectorAll(s)].filter((e) => e.offsetParent !== null)
      .find((e) => (e.textContent || "").trim().toLowerCase().includes(t.toLowerCase())) || null;
  }, libelle, sel);
  const el = h.asElement();
  if (!el) throw new Error(`« ${libelle} » introuvable | vu : ${(await visibles(page)).join(" · ")}`);
  await el.click();
  await pause(1600);
}

(async () => {
  const capture = `${__dirname}/capture-story.png`;
  fabriquerCapture(capture);

  const club = V.sql("select id from public.clubs where slug='mirage-brussels'")[0];
  const avant = V.sql(`select count(*)::int as n, coalesce(sum(awarded_points),0)::int as pts
                         from public.story_events where club_id='${club.id}'`)[0];
  console.log(`\nAvant : ${avant.n} contenus, ${nf(avant.pts)} pts distribues\n`);

  const c = await V.compteJetable("reel");
  const nav = await puppeteer.launch({
    executablePath: V.CHROME, headless: "new",
    defaultViewport: { width: 430, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  });
  const envois = [];

  try {
    const page = await nav.newPage();
    page.on("request", (r) => {
      if (/rpc\/(submit_story|declare_followers)/.test(r.url())) envois.push({ rpc: r.url().split("/").pop(), corps: r.postData() });
    });

    // ── 1. Arrivee par le QR ───────────────────────────────────────────
    await page.goto(c.lien, { waitUntil: "networkidle2", timeout: 60000 });
    await page.goto(V.PROD + "/?c=mirage-brussels", { waitUntil: "networkidle2" });
    await pause(2500);
    dire(/Mirage|story/i.test(await texte(page)), "l'accueil du club s'ouvre avec la session");

    // ── 2. Inscription (pseudo + abonnes declares) ─────────────────────
    await clic(page, "Commencer");
    const pseudo = await page.$("input[type=text]");
    await pseudo.click(); await pseudo.type("e2e_reel");
    const abo = await page.$("input[type=number]");
    if (abo) { await abo.click(); await abo.type("3400"); }
    const fichierProfil = await page.$("input[type=file]");
    if (fichierProfil) await fichierProfil.uploadFile(capture);
    await pause(600);
    await clic(page, "C'est parti");
    await page.screenshot({ path: `${__dirname}/r-dashboard.png` });
    const apresInscription = await texte(page);
    dire(!/Commencer/.test(apresInscription), "inscription faite, on arrive sur l'app");
    console.log("    ecran :", apresInscription.split("\n").slice(0, 6).join(" / "));

    const profil = V.sql(`select handle, follower_count, follower_source, points_balance, lifetime_points
                            from public.users where id='${c.uid}'`)[0];
    dire(!!profil && profil.handle === "e2e_reel", `profil cree en base (@${profil?.handle})`);
    dire(profil?.follower_count === 3400 && profil?.follower_source === "declared",
      `abonnes declares enregistres : ${profil?.follower_count} (source ${profil?.follower_source})`);

    // ── 3. Deposer un contenu ──────────────────────────────────────────
    console.log("    cliquables :", (await visibles(page)).join(" · "));
    await clic(page, "Poster");
    await page.screenshot({ path: `${__dirname}/r-post.png` });
    console.log("    ecran depot :", (await visibles(page)).join(" · "));

    // ⚠️ Le parcours est en DEUX ecrans : « Ouvrir Instagram » ouvre un
    // onglet (window.open) ET fait passer a l'ecran de preuve. C'est ce
    // bouton qui declenche la suite — sans lui, aucun champ capture.
    await clic(page, "Ouvrir Instagram");
    for (const p of await nav.pages()) {
      if (p !== page && p.url().includes("instagram.com")) await p.close();
    }
    await pause(800);
    await page.screenshot({ path: `${__dirname}/r-preuve.png` });
    console.log("    ecran preuve :", (await visibles(page)).join(" · "));

    const champFichier = await page.$("input[type=file]");
    if (!champFichier) throw new Error("pas de champ capture sur l'ecran de preuve");
    await champFichier.uploadFile(capture);
    await pause(1500);
    await page.screenshot({ path: `${__dirname}/r-capture.png` });

    console.log("    avant envoi :", (await visibles(page)).join(" · "));
    await clic(page, "Envoyer au club");
    await pause(3000);
    await page.screenshot({ path: `${__dirname}/r-envoye.png` });
    console.log("    apres envoi :", (await texte(page)).split("\n").slice(0, 5).join(" / "));

    // ── 4. Ce que le front a REELLEMENT envoye ─────────────────────────
    const envoi = envois.find((e) => e.rpc === "submit_story");
    dire(!!envoi, "le front a bien appele submit_story");
    if (envoi) {
      console.log("    corps envoye :", envoi.corps);
      const corps = JSON.parse(envoi.corps);
      dire(!("p_views" in corps) || corps.p_views === 0 || corps.p_views == null,
        `p_views n'est pas renseigne par le front (recu : ${JSON.stringify(corps.p_views)})`);
      dire(!!corps.p_proof, "la capture accompagne le depot");
    }

    const st = V.sql(`select id, kind, views, awarded_points, verified
                        from public.story_events where user_id='${c.uid}'`)[0];
    dire(!!st, "le depot existe en base");
    dire(st && st.awarded_points === 0 && st.verified === false, "rien n'est credite avant validation");
    dire(st && st.views === 0, `la colonne vues reste a 0 = non renseignee (et non une vieille valeur) : ${st?.views}`);

    // ── 5. Le gerant valide depuis SA console ──────────────────────────
    const pageG = await nav.newPage();
    await pageG.setViewport({ width: 1400, height: 1000 });
    await pageG.goto(await V.lienGerant(), { waitUntil: "networkidle2", timeout: 60000 });
    await pause(3000);
    await pageG.screenshot({ path: `${__dirname}/r-gerant.png` });
    const vuGerant = await texte(pageG);
    dire(/valider/i.test(vuGerant), "la console gerant s'ouvre sur « A valider »");
    dire(/e2e_reel/.test(vuGerant), "le depot du clubbeur apparait dans la file");
    dire(/non renseign/i.test(vuGerant) || !/\b0\b/.test(vuGerant.split("Points")[0] || ""),
      "le champ vues affiche « non renseigne », pas « 0 »");

    const montant = await pageG.$eval(".ow-review-points", (e) => e.value).catch(() => null);
    dire(montant === "100", `le montant propose est le forfait : ${montant}`);

    await clic(pageG, "Valider et créditer");
    await pause(3500);
    await pageG.screenshot({ path: `${__dirname}/r-valide.png` });

    // ── 6. Verification en base ────────────────────────────────────────
    const apres = V.sql(`select s.kind, s.awarded_points, s.base_points, s.verified, s.views,
                                g.amount, round(extract(epoch from (g.unlocks_at - now()))/3600.0,1)::text as heures
                           from public.story_events s
                           left join public.point_grants g on g.story_id = s.id
                          where s.user_id='${c.uid}'`)[0];
    dire(apres?.awarded_points === 100 && apres?.verified === true, `100 pts credites (${apres?.awarded_points}, verified=${apres?.verified})`);
    dire(apres?.amount === 100, `un grant de ${apres?.amount} pts, debloquable dans ${apres?.heures} h`);
    dire(apres?.views === 0, "la validation n'a pas invente de vues");
    const u = V.sql(`select points_balance, lifetime_points from public.users where id='${c.uid}'`)[0];
    dire(u?.lifetime_points === 100 && u?.points_balance === 0, `lifetime ${u?.lifetime_points}, depensable ${u?.points_balance} (blocage 12 h)`);

    // ── 7. Le tableau de bord du gerant dit-il la verite ? ─────────────
    //
    // ⚠️ On ne relit PAS get_club_stats en SQL direct : elle est
    // SECURITY DEFINER et protegee par owns_club(), donc muette hors
    // session gerant. On lit ce que le gerant VOIT, c'est la question
    // posee — et on le compare a un calcul independant.
    const ref = V.sql(`
      select count(*)::int as contenus,
             coalesce(sum(awarded_points),0)::int as pts,
             coalesce(sum(views),0)::int as vues,
             count(distinct user_id)::int as clubbeurs
        from public.story_events
       where club_id='${club.id}' and mentioned_at >= now() - interval '30 days'`)[0];

    await clic(pageG, "Statistiques", "button,a,[role=button],li");
    await pause(2500);
    await pageG.screenshot({ path: `${__dirname}/r-stats.png` });

    const vu = await pageG.evaluate(() => ({
      titreLabel: document.querySelector(".ow-hero-label")?.textContent.trim(),
      titreNum: document.querySelector(".ow-hero-num")?.textContent.trim(),
      sousTitre: document.querySelector(".ow-hero-sub")?.textContent.trim(),
      tuiles: [...document.querySelectorAll(".ow-tile")].map((t) => [
        t.querySelector(".ow-tile-label")?.textContent.trim(),
        t.querySelector(".ow-tile-val")?.textContent.trim(),
        t.querySelector(".ow-tile-note")?.textContent.trim(),
      ]),
      aside: document.querySelector(".ow-stats-aside")?.textContent.trim() || null,
      titreGraphe: document.querySelector(".ow-chart-head h2")?.textContent.trim(),
    }));
    console.log("\n  Ce que le gerant voit :", JSON.stringify(vu, null, 1));

    const num = (s) => Number(String(s || "").replace(/[^\d]/g, ""));
    dire(num(vu.titreNum) === ref.contenus,
      `chiffre-titre = ${vu.titreNum} contenus, conforme au calcul independant (${ref.contenus})`);
    dire(/Contenus publiés/i.test(vu.titreLabel || ""), `le titre porte sur les contenus : « ${vu.titreLabel} »`);
    const tuilePts = vu.tuiles.find((t) => /Points distribués/i.test(t[0] || ""));
    dire(num(tuilePts?.[1]) === ref.pts, `« Points distribués » = ${tuilePts?.[1]}, conforme (${nf(ref.pts)})`);
    dire(num(tuilePts?.[2]) === Math.round(ref.pts / ref.contenus),
      `note « ${tuilePts?.[2]} » = ${nf(ref.pts)}/${ref.contenus} arrondi`);
    dire(vu.aside !== null && num(vu.aside) === ref.vues,
      `mention vues « ${vu.aside} » conforme (${nf(ref.vues)})`);
    dire(/Contenus par jour/i.test(vu.titreGraphe || ""), `la courbe trace les contenus : « ${vu.titreGraphe} »`);

    // Le depot n'apporte aucune vue : le total doit etre EXACTEMENT celui
    // d'avant le test. C'est ce qui prouve qu'aucun chiffre n'est invente.
    const vuesAvant = V.sql(`select coalesce(sum(views),0)::int as v from public.story_events
                              where club_id='${club.id}' and user_id <> '${c.uid}'
                                and mentioned_at >= now() - interval '30 days'`)[0].v;
    dire(ref.vues === vuesAvant, `le total de vues n'a pas bouge (${nf(ref.vues)}) — ce depot n'en apporte aucune`);
  } finally {
    await nav.close();
    await V.supprimerCompte(c.uid);
    console.log("\ncompte de test supprime");
  }

  const ko = trace.filter(([ok]) => !ok);
  console.log(`\n=== ${trace.length - ko.length}/${trace.length} verifications au vert ===`);
  ko.forEach(([, t]) => console.log("  ECHEC :", t));
  process.exit(ko.length ? 1 : 0);
})().catch((e) => { console.error("\nECHEC:", e.message); process.exit(1); });
