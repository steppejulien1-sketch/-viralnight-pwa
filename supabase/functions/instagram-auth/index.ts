// Edge Function — instagram-auth
// ----------------------------------------------------------------
// Connexion "Continuer avec Instagram". Meme forme que tiktok-auth :
//   POST -> cree un state en base, renvoie l'URL d'autorisation
//   GET  -> Instagram redirige ici, on echange le code et on ouvre la session
//
// Le state vit en base (oauth_states) et non dans le navigateur : sur
// mobile, l'ecran d'autorisation s'ouvre souvent dans un navigateur
// externe et le retour arrive dans un contexte ou sessionStorage est vide.
//
// ⚠️ CONTRAINTE INSTAGRAM (verifiee, aout 2026)
// L'API Basic Display est fermee depuis le 4 decembre 2024. Son
// remplacant n'accepte QUE les comptes professionnels (Createur ou
// Business). Un compte PERSONNEL sera refuse par Instagram. Le passage en
// compte Createur est gratuit, instantane, et ne demande aucune page
// Facebook : c'est ce que dit le message d'erreur.
//
// SECRETS : INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET,
//           INSTAGRAM_REDIRECT_URI (= l'URL de CETTE fonction),
//           APP_ORIGIN (origine de la PWA)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const APP_ID = Deno.env.get("INSTAGRAM_APP_ID") ?? "";
const APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET") ?? "";
const REDIRECT = Deno.env.get("INSTAGRAM_REDIRECT_URI") ?? "";
const APP_ORIGIN = (Deno.env.get("APP_ORIGIN") ?? "").replace(/\/$/, "");

const SCOPE = "instagram_business_basic";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function back(qs: string) {
  return new Response(null, { status: 302, headers: { Location: `${APP_ORIGIN}/${qs}` } });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  if (!APP_ID || !APP_SECRET || !REDIRECT) {
    if (req.method === "GET") return back("?social_error=not_configured");
    return json(
      { error: "not_configured", message: "Connexion Instagram pas encore configurée." },
      503
    );
  }

  if (req.method === "POST") {
    const state = crypto.randomUUID();
    const { error } = await admin().from("oauth_states").insert({ state, provider: "instagram" });
    if (error) return json({ error: "state_failed", detail: error.message }, 500);

    const u = new URL("https://www.instagram.com/oauth/authorize");
    u.searchParams.set("client_id", APP_ID);
    u.searchParams.set("redirect_uri", REDIRECT);
    u.searchParams.set("scope", SCOPE);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("state", state);
    return json({ authorize_url: u.toString() });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (url.searchParams.get("error")) return back("?social_error=cancelled");
  if (!code || !state) return back("?social_error=missing_params");

  const db = admin();

  const { data: row } = await db
    .from("oauth_states")
    .select("state, provider, created_at")
    .eq("state", state)
    .maybeSingle();

  if (!row || row.provider !== "instagram") return back("?social_error=invalid_state");
  await db.from("oauth_states").delete().eq("state", state);
  if (Date.now() - new Date(row.created_at).getTime() > 10 * 60 * 1000) {
    return back("?social_error=expired_state");
  }

  try {
    // Instagram attend du multipart. Le code peut arriver URL-encode et
    // suffixe de "#_" : les deux cassent l'echange s'ils sont laisses.
    const clean = decodeURIComponent(code).replace(/#_$/, "");

    const form = new FormData();
    form.append("client_id", APP_ID);
    form.append("client_secret", APP_SECRET);
    form.append("grant_type", "authorization_code");
    form.append("redirect_uri", REDIRECT);
    form.append("code", clean);

    const tokRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: form,
    });
    const tok = await tokRes.json();
    if (!tok.access_token) {
      // Cas le plus frequent : compte personnel, refuse par Instagram.
      console.error("instagram token error", tok);
      return back("?social_error=ig_pro_required");
    }

    const meRes = await fetch(
      // followers_count n'existe que pour les comptes professionnels.
      // Sur un compte qui ne le sert pas, le champ revient absent : on
      // stocke null plutot que d'inventer un chiffre.
      `https://graph.instagram.com/v21.0/me?fields=id,username,followers_count&access_token=${encodeURIComponent(tok.access_token)}`
    );
    const me = await meRes.json();
    const username = String(me?.username || "").trim();
    const igId = String(tok.user_id ?? me?.id ?? "");
    if (!username || !igId) return back("?social_error=no_username");

    const email = `ig_${igId}@instagram.viralnight.local`;

    await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { instagram_id: igId, instagram_username: username },
    });

    const { data: userRow } = await db
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (userRow?.id) {
      const followers = Number(me?.followers_count);
      await db
        .from("users")
        .update({
          handle: username,
          follower_count: Number.isFinite(followers) && followers >= 0 ? followers : null,
          follower_source: "instagram",
          follower_updated_at: new Date().toISOString(),
        })
        .eq("id", userRow.id);
    }

    const { data: link, error: linkErr } = await db.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${APP_ORIGIN}/?social_connected=instagram` },
    });
    if (linkErr || !link?.properties?.action_link) {
      console.error("generateLink error", linkErr);
      return back("?social_error=session_failed");
    }

    return new Response(null, {
      status: 302,
      headers: { Location: link.properties.action_link },
    });
  } catch (e) {
    console.error(e);
    return back("?social_error=unexpected");
  }
});
