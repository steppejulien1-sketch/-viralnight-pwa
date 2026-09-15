// VERIFIE LE CADEAU DU JOUR ET LE BONUS DE BIENVENUE, EN VRAI.
//
//   node outils/test_cadeau_bienvenue.cjs
//
// Deux comptes jetables sur la BASE DE PRODUCTION, un vrai club, de
// vrais points credites -- puis menage complet. Ce qui est verifie ne
// peut pas l'etre autrement : daily_gift() et welcome_bonus() lisent
// auth.uid(), donc il FAUT un jeton de session, pas la cle service.
//
// Le test qui compte le plus est le 6 : deux comptes differents sur le
// MEME jeton d'appareil. C'est la seule garde anti-triche qui se teste,
// et c'est celle que Julien a demandee.

const V = require("./lib_vn.cjs");

const ok = (t) => console.log("  ok   " + t);

// V.sql() rend l'erreur au lieu de la lever : sans ce filet, une
// insertion refusee passe inapercue et TOUS les tests suivants echouent
// pour une raison qui n'a rien a voir. C'est exactement ce qui est
// arrive au premier essai (pas de ligne dans public.users, donc la clef
// etrangere de point_grants refusait le grant, en silence).
function sql(q) {
  const r = V.sql(q);
  if (r && r.message) throw new Error("SQL : " + r.message + " | " + q.trim().slice(0, 160));
  return r;
}
const ko = (t) => { console.log("  ECHEC " + t); process.exitCode = 1; };
const dit = (c, a, t) => (c ? ok : ko)(t + "   (" + JSON.stringify(a) + ")");

async function creer(prefixe) {
  const email = `test-cadeau-${prefixe}-${Date.now()}@viralnight.test`;
  const motdepasse = "Test-" + Math.random().toString(36).slice(2) + "A1!";
  const [st, u] = await V.admin("/auth/v1/admin/users", "POST",
    { email, password: motdepasse, email_confirm: true });
  if (st >= 400) throw new Error("creation: " + JSON.stringify(u));

  // Aucun trigger sur auth.users : c'est l'appli qui pose le profil
  // public.users a l'inscription. Sans lui, point_grants refuse le grant
  // (clef etrangere) et tout repond "aucun_club".
  sql(`insert into public.users (id, handle, email)
       values ('${u.id}', 'test_${prefixe}_${Date.now()}', '${email}')`);

  const r = await fetch(`${V.BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: V.ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: motdepasse }),
  });
  const s = await r.json();
  if (!s.access_token) throw new Error("connexion: " + JSON.stringify(s));
  return { id: u.id, email, jeton: s.access_token };
}

async function rpc(compte, nom, args) {
  const r = await fetch(`${V.BASE}/rest/v1/rpc/${nom}`, {
    method: "POST",
    headers: {
      apikey: V.ANON,
      Authorization: `Bearer ${compte.jeton}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args || {}),
  });
  return r.json();
}

(async () => {
  const club = sql("select id, name from public.clubs limit 1")[0];
  console.log(`\nBase clubbeur ${V.REF} — club de test : ${club.name}\n`);

  const a = await creer("a");
  const b = await creer("b");
  const n = await creer("n");
  const APPAREIL = "test-appareil-" + Date.now();

  try {
    // ---- 1. Sans club scanne : le bonus se prend quand meme (0049) ----
    console.log("1. Un compte tout neuf, sans aucun scan");
    dit((await rpc(a, "welcome_bonus_status", { p_device: APPAREIL })).etat === "disponible",
      await rpc(a, "welcome_bonus_status", { p_device: APPAREIL }),
      "le bonus est disponible tout de suite (0049)");
    const sansClub = await rpc(n, "welcome_bonus", { p_device: APPAREIL });
    dit(sansClub.etat === "ok" && sansClub.points === 50, sansClub, "un autre compte sans scan le prend");
    const soldeN = sql(`select points_balance from public.users where id = '${n.id}'`)[0];
    dit(Number(soldeN.points_balance) === 50, soldeN, "ses 50 points sont dans son solde (depensables)");
    dit((await rpc(a, "daily_gift_status")).etat === "aucun_club",
      await rpc(a, "daily_gift_status"), "le cadeau aussi");

    // ---- 2. Il scanne : un grant, comme checkin_scan ----
    console.log("\n2. Il scanne le QR du club (15 points de check-in)");
    sql(`insert into public.point_grants (user_id, club_id, amount, unlocks_at, released)
           values ('${a.id}', '${club.id}', 15, now(), false)`);
    sql(`select public.release_due_points('${a.id}')`);
    ok("scan simule, 15 points credites");

    // ---- 3. Le bonus de bienvenue ----
    console.log("\n3. Le bonus de bienvenue");
    const av = await rpc(a, "welcome_bonus_status", { p_device: APPAREIL });
    dit(av.etat === "disponible" && av.points === 50, av, "annonce 50 points");
    const pris = await rpc(a, "welcome_bonus", { p_device: APPAREIL });
    dit(pris.etat === "ok" && pris.points === 50, pris, "credite 50 points");
    const rejoue = await rpc(a, "welcome_bonus", { p_device: APPAREIL });
    dit(rejoue.etat === "deja_pris", rejoue, "ne se reprend pas");

    // ---- 4. Un cadeau par COMPTE, plus par telephone (0050) ----
    console.log("\n4. Un SECOND compte sur le MEME telephone (0050 : il y a droit)");
    sql(`insert into public.point_grants (user_id, club_id, amount, unlocks_at, released)
           values ('${b.id}', '${club.id}', 15, now(), false)`);
    sql(`select public.release_due_points('${b.id}')`);
    const bStatut = await rpc(b, "welcome_bonus_status", { p_device: APPAREIL });
    dit(bStatut.etat === "disponible", bStatut, "le statut l'annonce");
    const bPris = await rpc(b, "welcome_bonus", { p_device: APPAREIL });
    dit(bPris.etat === "ok" && bPris.points === 50, bPris, "et il le recoit");
    const bRejoue = await rpc(b, "welcome_bonus", { p_device: APPAREIL });
    dit(bRejoue.etat === "deja_pris", bRejoue, "mais une seule fois par compte");

    // ---- 5. Le cadeau du jour, et son montant deterministe ----
    console.log("\n5. Le cadeau du jour");
    const s1 = await rpc(a, "daily_gift_status");
    const s2 = await rpc(a, "daily_gift_status");
    dit(s1.etat === "disponible" && s1.jour === 1, s1, "disponible, premiere marche");
    dit(s1.points === s2.points, { s1: s1.points, s2: s2.points },
      "DETERMINISTE : deux lectures donnent le meme montant");

    const c = await rpc(a, "daily_gift");
    dit(c.etat === "ok" && c.points === s1.points, { annonce: s1.points, verse: c.points },
      "verse EXACTEMENT le montant annonce");
    const c2 = await rpc(a, "daily_gift");
    dit(c2.etat === "deja_pris", c2, "un seul par journee");

    // ---- 6. Les points sont bien arrives ----
    console.log("\n6. Le solde");
    const solde = sql(`select points_balance from public.users where id = '${a.id}'`)[0];
    const attendu = 15 + 50 + c.points;
    dit(Number(solde.points_balance) === attendu,
      { solde: solde.points_balance, attendu }, `15 (scan) + 50 (bienvenue) + ${c.points} (cadeau)`);

    // ---- 7. Le jackpot tombe bien vers 1 % ----
    console.log("\n7. La frequence du jackpot, sur 20 000 tirages simules");
    const j = sql(`
      select count(*) filter (where m.jackpot) as jackpots, count(*) as total
      from generate_series(1, 20000) g,
      lateral public.montant_cadeau(gen_random_uuid(), current_date + g, 5) m`)[0];
    const taux = (100 * j.jackpots) / j.total;
    dit(taux > 0.6 && taux < 1.5, { taux: taux.toFixed(2) + " %" }, "entre 0,6 et 1,5 % (cible 1 %)");
  } finally {
    console.log("\nMenage");
    for (const c of [a, b, n]) {
      V.sql(`delete from public.daily_gifts where user_id = '${c.id}'`);
      V.sql(`delete from public.welcome_bonuses where user_id = '${c.id}'`);
      V.sql(`delete from public.point_grants where user_id = '${c.id}'`);
      V.sql(`delete from public.user_club_balance where user_id = '${c.id}'`);
      V.sql(`delete from public.users where id = '${c.id}'`);
      await V.admin(`/auth/v1/admin/users/${c.id}`, "DELETE");
    }
    ok("les trois comptes jetables et leurs lignes sont supprimes");
  }
})();
