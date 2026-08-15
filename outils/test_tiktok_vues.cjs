// Barème TikTok aux vues (migration 0025) — vérifié contre la base réelle,
// avec une vraie session gérant. Ce qui compte ici :
//   · une vue non vérifiée ne paie JAMAIS ;
//   · le repli forfait marche tant que l'app TikTok n'existe pas ;
//   · un TikTok viral ne fait pas échouer la validation.
const fs = require("fs");
const V = require("./lib_vn.cjs");

const trace = [];
const dire = (ok, t) => { trace.push([ok, t]); console.log((ok ? "  OK  | " : " FAIL | ") + t); };

const rpc = (fn, args, jwt) =>
  fetch(`${V.BASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { apikey: V.ANON, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  }).then(async (r) => [r.status, await r.json().catch(() => null)]);

async function sessionGerant() {
  const txt = fs.readFileSync("C:/Users/stepp/viralnight-identifiants.txt", "utf8");
  const i = txt.indexOf("owner@mirage.club");
  const m = /mot de passe\s*\.*\s*(\S+)/i.exec(txt.slice(i, i + 400));
  const r = await fetch(`${V.BASE}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: V.ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "owner@mirage.club", password: m[1] }),
  });
  const j = await r.json();
  if (!j.access_token) throw new Error("session gerant refusee : " + JSON.stringify(j));
  return j.access_token;
}

(async () => {
  const club = V.sql("select id from public.clubs where slug='mirage-brussels'")[0];
  const c = await V.compteJetable("tk");
  // ⚠️ Aucun declencheur ne cree `public.users` (migration 0018) : c'est
  // l'inscription qui s'en charge. Un test qui insere en direct doit donc
  // creer la ligne, sinon la cle etrangere de story_events casse.
  V.sql(`insert into public.users (id, handle, email)
         values ('${c.uid}', 'e2e_tk', '${c.email}') on conflict (id) do nothing`);
  const jwtO = await sessionGerant();

  // Un dépôt en attente, avec ou sans vues mesurées.
  function deposer({ kind = "tiktok", verified_views = null, source = null, views = 0 }) {
    const vv = verified_views == null ? "null" : verified_views;
    const src = source == null ? "null" : `'${source}'`;
    const r = V.sql(`
      with s as (
        insert into public.story_events
          (user_id, club_id, kind, url, base_points, awarded_points, views,
           verified, verified_views, views_source)
        values ('${c.uid}', '${club.id}', '${kind}',
                'https://www.tiktok.com/@x/video/74123456789012345${Math.floor(Math.random() * 90 + 10)}',
                0, 0, ${views}, false, ${vv}, ${src})
        returning id
      )
      insert into public.view_claims (story_event_id, user_id, screenshot_url, extracted_views, status)
      select s.id, '${c.uid}', 'p/${c.uid}/p.png', 0, 'pending' from s
      returning story_event_id as id`);
    if (!r || !r[0]) throw new Error("insertion refusee : " + JSON.stringify(r));
    return r[0].id;
  }

  try {
    // 1. Pas de vues mesurées -> repli forfait 60
    const s1 = deposer({});
    let [, file] = await rpc("get_pending_stories", { p_club: club.id }, jwtO);
    const l1 = (file || []).find((x) => x.story_id === s1);
    dire(l1?.suggested_points === 60, `sans vues mesurees, la file propose ${l1?.suggested_points} pts`);
    let [st, r] = await rpc("review_story", { p_story: s1, p_approve: true }, jwtO);
    dire(st < 400 && r?.[0]?.awarded === 60, `validation -> ${r?.[0]?.awarded} pts (repli choisi par Julien)`);

    // 2. 5 000 vues mesurées par l'API -> 410
    const s2 = deposer({ verified_views: 5000, source: "tiktok_api" });
    [, file] = await rpc("get_pending_stories", { p_club: club.id }, jwtO);
    const l2 = (file || []).find((x) => x.story_id === s2);
    dire(l2?.suggested_points === 410, `5 000 vues mesurees -> la file propose ${l2?.suggested_points} pts`);
    dire(l2?.verified_views === 5000 && l2?.views_source === "tiktok_api", "le gerant voit d'ou vient le chiffre");
    [st, r] = await rpc("review_story", { p_story: s2, p_approve: true }, jwtO);
    dire(st < 400 && r?.[0]?.awarded === 410, `validation -> ${r?.[0]?.awarded} pts (60 + 350)`);

    // 3. LE POINT CRITIQUE : un chiffre sans source vérifiée ne paie pas
    const s3 = deposer({ verified_views: 90000, source: null, views: 999999 });
    [st, r] = await rpc("review_story", { p_story: s3, p_approve: true, p_views: 999999 }, jwtO);
    dire(st < 400 && r?.[0]?.awarded === 60,
      `90 000 vues SANS source verifiee -> ${r?.[0]?.awarded} pts : elles ne paient pas`);

    // 4. Les autres formats gardent le forfait
    const s4 = deposer({ kind: "story", verified_views: 50000, source: "tiktok_api" });
    [st, r] = await rpc("review_story", { p_story: s4, p_approve: true }, jwtO);
    dire(st < 400 && r?.[0]?.awarded === 100, `une story reste a ${r?.[0]?.awarded} pts meme avec des vues`);

    const s5 = deposer({ kind: "reel", verified_views: 50000, source: "tiktok_api" });
    [st, r] = await rpc("review_story", { p_story: s5, p_approve: true }, jwtO);
    dire(st < 400 && r?.[0]?.awarded === 60, `un reel reste a ${r?.[0]?.awarded} pts`);

    // 5. TikTok viral : le plafond ne doit PAS faire echouer la validation
    const s6 = deposer({ verified_views: 3000000, source: "tiktok_api" });
    [st, r] = await rpc("review_story", { p_story: s6, p_approve: true }, jwtO);
    dire(st < 400 && r?.[0]?.awarded === 2060, `TikTok viral -> ${r?.[0]?.awarded} pts, bonus plafonne, validation OK`);

    // 6. La saisie manuelle du gérant reste bornée
    const s7 = deposer({});
    [st, r] = await rpc("review_story", { p_story: s7, p_approve: true, p_points: 99999 }, jwtO);
    dire(JSON.stringify(r).includes("points_out_of_range"), "une saisie hors bornes reste refusee");

    // 7. Le gérant garde la main sur un montant calculé
    const s8 = deposer({ verified_views: 5000, source: "tiktok_api" });
    [st, r] = await rpc("review_story", { p_story: s8, p_approve: true, p_points: 150 }, jwtO);
    dire(st < 400 && r?.[0]?.awarded === 150, `le gerant peut ramener 410 a ${r?.[0]?.awarded} pts`);

    // 8. La table de jetons est bien fermée au client
    const rr = await fetch(`${V.BASE}/rest/v1/social_tokens?select=*`, {
      headers: { apikey: V.ANON, Authorization: `Bearer ${jwtO}` },
    });
    dire(rr.status >= 400 || (await rr.json()).length === 0,
      `social_tokens injoignable depuis un client (HTTP ${rr.status})`);
  } finally {
    await V.supprimerCompte(c.uid);
    console.log("\ncompte de test supprime");
  }

  const ko = trace.filter(([o]) => !o);
  console.log(`\n=== ${trace.length - ko.length}/${trace.length} verifications au vert ===`);
  ko.forEach(([, t]) => console.log("  ECHEC :", t));
  process.exit(ko.length ? 1 : 0);
})().catch((e) => { console.error("\nECHEC:", e.message); process.exit(1); });
