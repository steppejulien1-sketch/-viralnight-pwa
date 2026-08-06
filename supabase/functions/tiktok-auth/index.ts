// Edge Function — tiktok-auth
// ----------------------------------------------------------------
// Connexion "Continuer avec TikTok" (Login Kit, OAuth v2).
// Deux actions dans une seule fonction, choisies par la methode :
//   POST  -> demarre le flux, renvoie l'URL d'autorisation
//   GET   -> TikTok redirige ici, on echange le code et on ouvre la session
//
// POURQUOI LA REDIRECTION ARRIVE ICI ET NON SUR LA PWA
// TikTok exige une redirect_uri fixe et declaree. Une URL d'edge function
// est stable, contrairement a une route de SPA. Surtout, l'autorisation
// s'ouvre souvent dans un navigateur externe sur mobile : le retour se
// fait alors dans un contexte ou le sessionStorage de la PWA est VIDE.
// Le state vit donc en base (table oauth_states), pas dans le navigateur.
//
// ⚠️ decodeURIComponent(code) : TikTok renvoie un code URL-encode.
// L'envoyer brut fait echouer l'echange de jeton. Piege signale par le
// paquet viralnight-followers fourni par Julien -- mon implementation
// precedente avait ce bug.
//
// SECRETS : TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI
//           (= l'URL de CETTE fonction), APP_ORIGIN (origine de la PWA)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const KEY = Deno.env.get("TIKTOK_CLIENT_KEY") ?? "";
const SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET") ?? "";
const REDIRECT = Deno.env.get("TIKTOK_REDIRECT_URI") ?? "";
const APP_ORIGIN = (Deno.env.get("APP_ORIGIN") ?? "").replace(/\/$/, "");

// Scope minimal : juste de quoi identifier la personne. On ne demande ni
// ses stats ni ses videos -- l'ecran d'onboarding s'y engage.
const SCOPE = "user.info.basic";

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

  if (!KEY || !SECRET || !REDIRECT) {
    if (req.method === "GET") return back("?social_error=not_configured");
    return json({ error: "not_configured", message: "Connexion TikTok pas encore configurée." }, 503);
  }

  // ---------------------------------------------------------------- POST
  // Depart : on cree un state en base et on renvoie l'URL d'autorisation.
  if (req.method === "POST") {
    const state = crypto.randomUUID();
    const { error } = await admin().from("oauth_states").insert({ state, provider: "tiktok" });
    if (error) return json({ error: "state_failed", detail: error.message }, 500);

    const u = new URL("https://www.tiktok.com/v2/auth/authorize/");
    u.searchParams.set("client_key", KEY);
    u.searchParams.set("scope", SCOPE);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("redirect_uri", REDIRECT);
    u.searchParams.set("state", state);
    return json({ authorize_url: u.toString() });
  }

  // ----------------------------------------------------------------- GET
  // Retour de TikTok.
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  if (denied) return back("?social_error=cancelled");
  if (!code || !state) return back("?social_error=missing_params");

  const db = admin();

  // State a usage unique, valable 10 minutes.
  const { data: row } = await db
    .from("oauth_states")
    .select("state, provider, created_at")
    .eq("state", state)
    .maybeSingle();

  if (!row || row.provider !== "tiktok") return back("?social_error=invalid_state");
  await db.from("oauth_states").delete().eq("state", state);
  if (Date.now() - new Date(row.created_at).getTime() > 10 * 60 * 1000) {
    return back("?social_error=expired_state");
  }

  try {
    // TikTok renvoie un code URL-encode : le decoder est obligatoire.
    const tokRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: KEY,
        client_secret: SECRET,
        code: decodeURIComponent(code),
        grant_type: "authorization_code",
        redirect_uri: REDIRECT,
      }),
    });
    const tok = await tokRes.json();
    if (!tok.access_token) {
      console.error("tiktok token error", tok);
      return back("?social_error=token_failed");
    }

    const infoRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name",
      { headers: { Authorization: `Bearer ${tok.access_token}` } }
    );
    const info = await infoRes.json();
    const u = info?.data?.user;
    if (!u) {
      console.error("tiktok info error", info);
      return back("?social_error=info_failed");
    }

    const username = String(u.username || u.display_name || "").trim();
    const openId = String(u.open_id || tok.open_id || "");
    if (!username || !openId) return back("?social_error=no_username");

    // Adresse technique stable : cle de compte, jamais montree.
    const email = `tt_${openId}@tiktok.viralnight.local`;

    // Echoue si le compte existe deja : c'est le cas nominal d'une
    // reconnexion, on l'ignore volontairement.
    await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { tiktok_open_id: openId, tiktok_username: username },
    });

    // Le pseudo vient de TikTok, jamais du client : c'est tout l'interet
    // de passer par ici.
    const { data: userRow } = await db
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (userRow?.id) {
      await db.from("users").update({ handle: username }).eq("id", userRow.id);
    }

    // On ne conserve PAS l'access_token : on a ce qu'il fallait.
    // action_link ouvre la session cote Supabase puis renvoie sur la PWA.
    const { data: link, error: linkErr } = await db.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${APP_ORIGIN}/?social_connected=tiktok` },
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
