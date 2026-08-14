// tiktok-views — lit le nombre de VUES REELLES d'un TikTok deposé.
//
// C'est la piece qui permet de payer un TikTok aux vues (migration 0025)
// sans rouvrir la faille que le forfait avait fermee : le chiffre ne vient
// ni du clubbeur ni du gerant, mais de l'API TikTok, au nom du clubbeur
// lui-meme.
//
// ⚠️ ELLE NE CREDITE RIEN. Elle ecrit `verified_views` +
// `views_source = 'tiktok_api'` sur la story, et c'est tout. Seul
// `review_story()` verse des points, et seulement quand le gerant valide.
// Meme lecon que l'OCR (`ocr-screenshot`), dont la premiere version
// s'auto-validait et ecrivait le solde en direct.
//
// FLUX
//   1. le clubbeur depose un TikTok avec son lien (submit_story)
//   2. cette fonction retrouve la video dans SES videos (video.list)
//   3. elle enregistre les vues mesurees
//   4. le gerant valide -> story_points('tiktok', vues verifiees)
//
// ⚠️ APPELEE AVEC LE JETON DU CLUBBEUR (verify_jwt). On ne lit que SES
// videos, avec SON jeton TikTok. Un gerant ne peut pas declencher la
// lecture a sa place : il n'a pas de jeton TikTok, et la story ne lui
// appartient pas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KEY = Deno.env.get("TIKTOK_CLIENT_KEY") ?? "";
const SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

// L'identifiant d'une video dans une URL TikTok. Deux formes courantes :
//   https://www.tiktok.com/@pseudo/video/7412345678901234567
//   https://vm.tiktok.com/XXXXXXX/   (lien court, non resolvable ici)
function idDepuisUrl(url: string): string | null {
  const m = String(url || "").match(/\/video\/(\d{5,25})/);
  return m ? m[1] : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!KEY || !SECRET) {
    // Meme posture que les autres fonctions sociales : on le DIT, on ne
    // fait pas semblant. Le parcours retombe sur le forfait de 60 pts.
    return json({ error: "not_configured", message: "Connexion TikTok pas encore configurée." }, 200);
  }

  let corps: { story_id?: string };
  try {
    corps = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const storyId = String(corps.story_id || "");
  if (!storyId) return json({ error: "bad_request" }, 400);

  // Qui appelle ? Le jeton Supabase du clubbeur, pas une confiance aveugle.
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "not_authenticated" }, 401);

  const db = admin();
  const { data: auth } = await db.auth.getUser(jwt);
  const uid = auth?.user?.id;
  if (!uid) return json({ error: "not_authenticated" }, 401);

  const { data: story } = await db
    .from("story_events")
    .select("id, user_id, kind, url, verified")
    .eq("id", storyId)
    .maybeSingle();

  if (!story) return json({ error: "unknown_story" }, 404);
  // ⚠️ La story doit appartenir a l'appelant. Sans ce controle, n'importe
  // quel compte connecte pourrait faire lire les vues d'un autre.
  if (story.user_id !== uid) return json({ error: "not_your_story" }, 403);
  if (story.kind !== "tiktok") return json({ error: "not_a_tiktok" }, 400);
  // Une story deja validee ne doit plus bouger : le montant est verse.
  if (story.verified) return json({ error: "already_reviewed" }, 409);

  const videoId = idDepuisUrl(story.url || "");
  if (!videoId) {
    await db.from("story_events").update({
      views_source: null,
      views_checked_at: new Date().toISOString(),
    }).eq("id", storyId);
    return json({ error: "lien_illisible", message: "Le lien ne contient pas d'identifiant de vidéo TikTok." });
  }

  // --- jeton TikTok du clubbeur -----------------------------------------
  const { data: tok } = await db
    .from("social_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("user_id", uid)
    .eq("provider", "tiktok")
    .maybeSingle();

  if (!tok?.access_token) {
    return json({ error: "non_connecte", message: "Connecte ton compte TikTok pour que tes vues soient comptées." });
  }

  let acces = tok.access_token as string;

  // ⚠️ L'access_token TikTok expire en 24 h. Sans rafraichissement, la
  // lecture echouerait des le lendemain de la connexion — c'est-a-dire
  // presque toujours, puisqu'on lit les vues APRES la publication.
  const expire = tok.expires_at ? new Date(tok.expires_at).getTime() : 0;
  if (expire && expire < Date.now() + 60_000 && tok.refresh_token) {
    const r = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: KEY,
        client_secret: SECRET,
        grant_type: "refresh_token",
        refresh_token: tok.refresh_token,
      }),
    });
    const neuf = await r.json();
    if (neuf.access_token) {
      acces = neuf.access_token;
      await db.from("social_tokens").update({
        access_token: neuf.access_token,
        refresh_token: neuf.refresh_token ?? tok.refresh_token,
        expires_at: neuf.expires_in
          ? new Date(Date.now() + Number(neuf.expires_in) * 1000).toISOString()
          : null,
        updated_at: new Date().toISOString(),
      }).eq("user_id", uid).eq("provider", "tiktok");
    } else {
      console.error("refresh tiktok", neuf);
      return json({ error: "jeton_expire", message: "Reconnecte ton compte TikTok." });
    }
  }

  // --- lecture des vues --------------------------------------------------
  // On demande la liste des videos de l'utilisateur et on cherche la
  // sienne. `video.list` ne permet pas d'interroger une video par son id
  // sans la posseder : c'est precisement ce qui rend le chiffre fiable.
  let curseur: number | undefined;
  let trouvee: { view_count?: number } | null = null;

  for (let page = 0; page < 3 && !trouvee; page++) {
    const r = await fetch(
      "https://open.tiktokapis.com/v2/video/list/?fields=id,view_count,share_url,create_time",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${acces}`, "Content-Type": "application/json" },
        body: JSON.stringify({ max_count: 20, ...(curseur ? { cursor: curseur } : {}) }),
      }
    );
    const rep = await r.json();
    const videos = rep?.data?.videos;
    if (!Array.isArray(videos)) {
      console.error("video.list", rep);
      return json({ error: "lecture_impossible", message: rep?.error?.message || "TikTok n'a pas répondu." });
    }
    trouvee = videos.find((v: { id?: string; share_url?: string }) =>
      String(v.id) === videoId || String(v.share_url || "").includes(videoId)
    ) || null;
    if (!rep.data.has_more) break;
    curseur = rep.data.cursor;
  }

  if (!trouvee) {
    return json({
      error: "video_introuvable",
      message: "Cette vidéo n'a pas été trouvée sur ton compte TikTok.",
    });
  }

  const vues = Number(trouvee.view_count);
  if (!Number.isFinite(vues) || vues < 0) {
    return json({ error: "vues_illisibles" });
  }

  // ⚠️ `verified_views` + `views_source`, JAMAIS `views` : cette derniere
  // reste la colonne declarative, et `review_story` n'accepte que la
  // premiere, a condition que la source soit 'tiktok_api'.
  const { error: majErr } = await db
    .from("story_events")
    .update({
      verified_views: Math.round(vues),
      views_source: "tiktok_api",
      views_checked_at: new Date().toISOString(),
    })
    .eq("id", storyId);

  if (majErr) {
    console.error("maj vues", majErr);
    return json({ error: "enregistrement_impossible" }, 500);
  }

  return json({ vues: Math.round(vues), source: "tiktok_api" });
});
