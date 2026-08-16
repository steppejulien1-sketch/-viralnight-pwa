// EPREUVE DU PONT RETOUR : le B2B valide, le clubbeur est-il credite ?
//
// C'est la piece la plus sensible de la bascule du 2026-08-15 : depuis
// que la validation a quitte la console gerant, ce chemin est le SEUL
// par lequel un clubbeur peut recevoir des points. S'il se casse, plus
// personne n'est paye — et rien ne le signalerait cote PWA.
//
// Compte jetable, verifie en base, supprime a la fin.
//
// ⚠️ Il faut lui passer le secret EN CLAIR, et il ne se trouve nulle part
// sur le PC : Supabase ne rend qu'une empreinte SHA-256, et la valeur ne
// vit que dans les variables Vercel et Supabase. S'il est perdu, en
// generer un neuf et le reposer des deux cotes avec `poser_pont_retour.cjs`.
//
// Le test qui n'a besoin d'aucun secret, et qui couvre la chaine entiere
// depuis le depot du clubbeur, est cote B2B :
//   01-base-fonctionnelle-vite-supabase-api/outils/e2e_validation_complete.cjs

const V = require("./lib_vn.cjs");

const SECRET = process.argv[2] || process.env.VN_BRIDGE_SECRET;
if (!SECRET) {
  console.log("usage : node outils/test_pont_retour.cjs <secret>");
  process.exit(1);
}

const trace = [];
const dire = (ok, t) => { trace.push([ok, t]); console.log((ok ? "  OK  | " : " FAIL | ") + t); };

// ⚠️ AUCUN apikey, AUCUN Authorization : on appelle EXACTEMENT comme
// `api/credit-clubbeur.js` le fait depuis le serveur B2B.
// Ce test envoyait la cle anon en plus, que le vrai appelant n'a pas. Il
// annoncait donc 16/16 alors que la passerelle Supabase refusait le vrai
// appel en 401 avant meme d'executer la fonction : personne n'etait paye.
// Un test qui s'accorde une faveur que la prod n'a pas ne teste rien.
async function pont(corps, secret = SECRET) {
  const r = await fetch(`${V.BASE}/functions/v1/credit-story`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-vn-secret": secret,
    },
    body: JSON.stringify(corps),
  });
  return [r.status, await r.json().catch(() => ({}))];
}

(async () => {
  const club = V.sql("select id, points_lock_hours from public.clubs where slug='mirage-brussels'")[0];
  const c = await V.compteJetable("pont");
  V.sql(`insert into public.users (id, email, handle) values ('${c.uid}', '${c.email}', 'pont_test')`);

  // Un contenu depose, non valide : exactement l'etat dans lequel le
  // pont aller le laisse.
  const story = V.sql(`insert into public.story_events (user_id, club_id, kind, url, awarded_points, verified, mentioned_at)
                       values ('${c.uid}', '${club.id}', 'reel', 'https://www.instagram.com/reel/PontTest/', 0, false, now())
                       returning id`)[0];

  try {
    // --- Le verrou d'abord : sans lui, tout le reste est decoratif ---
    let [st] = await pont({ story_id: story.id, approve: true }, "mauvais-secret");
    dire(st === 403, `un mauvais secret est refuse (${st})`);

    const avantSansSecret = V.sql(`select verified from public.story_events where id='${story.id}'`)[0];
    dire(avantSansSecret.verified === false, "et il n'a rien credite au passage");

    // --- Le chemin nominal ---
    let [st2, out] = await pont({ story_id: story.id, approve: true, points: 250, views: 4200 });
    dire(st2 === 200, `validation acceptee (${st2})`);
    dire(out.awarded === 250, `250 pts annonces par le pont (recu : ${out.awarded})`);

    const apres = V.sql(`select s.verified, s.awarded_points, s.views, g.amount,
                                round(extract(epoch from (g.unlocks_at - now()))/3600.0, 1)::text as heures
                           from public.story_events s
                           left join public.point_grants g on g.story_id = s.id
                          where s.id = '${story.id}'`)[0];
    dire(apres.verified === true, "le contenu est marque valide en base");
    dire(apres.awarded_points === 250, `250 pts inscrits sur le contenu (${apres.awarded_points})`);
    dire(apres.views === 4200, `les vues transmises sont conservees (${apres.views})`);
    dire(Number(apres.amount) === 250, `un grant de 250 pts existe (${apres.amount})`);
    dire(Math.abs(Number(apres.heures) - (club.points_lock_hours ?? 12)) < 0.2,
      `points bloques ${apres.heures} h, comme le club le demande (${club.points_lock_hours ?? 12})`);

    const u = V.sql(`select points_balance, lifetime_points from public.users where id='${c.uid}'`)[0];
    dire(u.lifetime_points === 250, `cumul a vie credite : ${u.lifetime_points}`);
    dire(u.points_balance === 0, `solde depensable encore a 0, le blocage tient (${u.points_balance})`);

    const lb = V.sql(`select week_points from public.leaderboard_entries where user_id='${c.uid}'`)[0];
    dire(lb && lb.week_points === 250, `classement hebdo alimente (${lb?.week_points})`);

    // --- Le verrou anti-double-credit ---
    const [st3, out3] = await pont({ story_id: story.id, approve: true, points: 250 });
    dire(st3 === 409 && out3.error === "already_reviewed",
      `un second credit est refuse en 409, pas en 500 (${st3} ${out3.error})`);

    const u2 = V.sql(`select lifetime_points from public.users where id='${c.uid}'`)[0];
    dire(u2.lifetime_points === 250, `et le cumul n'a pas bouge (${u2.lifetime_points})`);

    // --- Une saisie hors bornes ne doit pas passer ---
    const s2 = V.sql(`insert into public.story_events (user_id, club_id, kind, url, awarded_points, verified, mentioned_at)
                      values ('${c.uid}', '${club.id}', 'reel', 'https://www.instagram.com/reel/PontTest2/', 0, false, now())
                      returning id`)[0];
    const [st4, out4] = await pont({ story_id: s2.id, approve: true, points: 99999 });
    dire(st4 >= 400 && String(out4.detail || "").includes("points_out_of_range"),
      `un montant absurde est rejete (${st4} ${out4.detail || out4.error})`);

    // --- Un refus ne credite rien ---
    const [st5] = await pont({ story_id: s2.id, approve: false });
    const refuse = V.sql(`select awarded_points from public.story_events where id='${s2.id}'`)[0];
    const g2 = V.sql(`select count(*)::int as n from public.point_grants where story_id='${s2.id}'`)[0];
    dire(st5 === 200 && refuse.awarded_points === 0 && g2.n === 0,
      `un refus ne credite rien (${st5}, ${refuse.awarded_points} pts, ${g2.n} grant)`);
  } finally {
    V.sql(`delete from public.leaderboard_entries where user_id='${c.uid}';
           delete from public.point_grants where user_id='${c.uid}';
           delete from public.story_events where user_id='${c.uid}';
           delete from public.users where id='${c.uid}';`);
    await V.admin(`/auth/v1/admin/users/${c.uid}`, "DELETE");
    console.log("\ncompte de test supprime");
  }

  const ko = trace.filter(([ok]) => !ok);
  console.log(`\n=== ${trace.length - ko.length}/${trace.length} verifications au vert ===`);
  ko.forEach(([, t]) => console.log("  ECHEC :", t));
  process.exit(ko.length ? 1 : 0);
})().catch((e) => { console.error("\nECHEC:", e.message); process.exit(1); });
