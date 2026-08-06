// Edge Function — tiktok-auth
// ----------------------------------------------------------------
// Connexion "Continuer avec TikTok" (Login Kit, OAuth v2).
//
// Meme raison d'etre que instagram-auth : l'echange du code contre un
// jeton exige le client_secret, qui ne peut pas vivre dans le navigateur.
//
// DIFFERENCE IMPORTANTE AVEC INSTAGRAM
// TikTok accorde le scope user.info.basic par defaut a toute app Login
// Kit et n'exige PAS de compte professionnel. N'importe quel clubbeur
// peut donc se connecter avec TikTok, alors qu'Instagram refuse les
// comptes personnels depuis la fermeture de Basic Display.
//
// SECRETS A DEFINIR (Supabase > Edge Functions > Secrets) :
//   TIKTOK_CLIENT_KEY     "client key" de l'app TikTok
//   TIKTOK_CLIENT_SECRET  "client secret" de l'app TikTok
//   TIKTOK_REDIRECT_URI   identique au caractere pres a celle declaree
//                         sur developers.tiktok.com
//   SITE_URL              origine de la PWA

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const KEY = Deno.env.get("TIKTOK_CLIENT_KEY");
    const SECRET = Deno.env.get("TIKTOK_CLIENT_SECRET");
    const REDIRECT = Deno.env.get("TIKTOK_REDIRECT_URI");
    const SITE_URL = Deno.env.get("SITE_URL") || "";

    if (!KEY || !SECRET || !REDIRECT) {
      return json(
        { error: "not_configured", message: "Connexion TikTok pas encore configurée." },
        503
      );
    }

    const { code } = await req.json();
    if (!code) return json({ error: "missing_code" }, 400);

    // --- 1. code -> access_token -------------------------------------
    // TikTok attend du x-www-form-urlencoded, pas du JSON.
    const body = new URLSearchParams({
      client_key: KEY,
      client_secret: SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT,
    });

    const tokRes = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const tok = await tokRes.json();

    if (!tokRes.ok || !tok.access_token) {
      return json(
        {
          error: "tiktok_refused",
          detail: tok?.error_description || tok?.error || "échange du code refusé",
          message: "TikTok a refusé la connexion. Réessaie dans un instant.",
        },
        400
      );
    }

    const accessToken = String(tok.access_token);
    const openId = String(tok.open_id ?? "");

    // --- 2. profil ----------------------------------------------------
    const meRes = await fetch(
      "https://open.tiktokapis.com/v2/user/info/?fields=open_id,username,display_name",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const me = await meRes.json();
    const u = me?.data?.user || {};
    // username peut manquer selon les scopes accordes : on retombe sur
    // display_name plutot que d'echouer.
    const username = String(u.username || u.display_name || "").trim();

    if (!username) {
      return json(
        { error: "no_username", message: "Impossible de lire ton pseudo TikTok." },
        400
      );
    }

    // --- 3. utilisateur Supabase --------------------------------------
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const email = `tt_${openId || username}@tiktok.viralnight.local`;

    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { tiktok_open_id: openId, tiktok_username: username },
    });

    const { data: userRow } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (userRow?.id) {
      await admin.from("users").update({ handle: username }).eq("id", userRow.id);
    }

    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: SITE_URL || undefined },
    });

    if (linkErr) return json({ error: "session_failed", detail: linkErr.message }, 500);

    return json({
      username,
      tiktok_open_id: openId,
      email,
      token_hash: link?.properties?.hashed_token ?? null,
    });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
