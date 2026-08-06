// Edge Function — instagram-auth
// ----------------------------------------------------------------
// Connexion "Continuer avec Instagram".
//
// POURQUOI CETTE FONCTION EXISTE
// L'echange du code OAuth contre un jeton exige le CLIENT SECRET de
// l'app Meta. Ce secret ne peut pas vivre dans le navigateur : il serait
// lisible par n'importe qui dans le bundle. L'echange se fait donc ici,
// cote serveur, en service_role.
//
// CE QUE FAIT LE FLUX
//   1. le client redirige vers instagram.com/oauth/authorize
//   2. Instagram renvoie sur la PWA avec ?code=...
//   3. le client POST ce code ici
//   4. on echange code -> access_token + user_id (API Instagram)
//   5. on lit le username du compte
//   6. on cree/retrouve l'utilisateur Supabase et on renvoie un lien de
//      session que le client consomme
//
// ⚠️ CONTRAINTE INSTAGRAM (verifiee, aout 2026)
// L'API Basic Display est fermee depuis le 4 decembre 2024. Son
// remplacant, "Instagram API with Instagram Login", n'accepte QUE les
// comptes professionnels (Business ou Createur). Un compte PERSONNEL
// recevra une erreur d'Instagram. Le passage en compte Createur est
// gratuit, instantane, et ne demande AUCUNE page Facebook -- c'est ce
// que le message d'erreur explique a l'utilisateur.
//
// SECRETS A DEFINIR (Supabase > Edge Functions > Secrets) :
//   INSTAGRAM_APP_ID       identifiant de l'app Meta
//   INSTAGRAM_APP_SECRET   secret de l'app Meta
//   INSTAGRAM_REDIRECT_URI doit correspondre AU CARACTERE PRES a celle
//                          declaree dans la console Meta
//   SITE_URL               origine de la PWA (pour le lien de session)

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
    const APP_ID = Deno.env.get("INSTAGRAM_APP_ID");
    const APP_SECRET = Deno.env.get("INSTAGRAM_APP_SECRET");
    const REDIRECT = Deno.env.get("INSTAGRAM_REDIRECT_URI");
    const SITE_URL = Deno.env.get("SITE_URL") || "";

    if (!APP_ID || !APP_SECRET || !REDIRECT) {
      // On le dit franchement plutot que de renvoyer une erreur vague.
      return json(
        { error: "not_configured", message: "Connexion Instagram pas encore configurée." },
        503
      );
    }

    const { code } = await req.json();
    if (!code) return json({ error: "missing_code" }, 400);

    // --- 1. code -> access_token courte duree -------------------------
    const form = new FormData();
    form.append("client_id", APP_ID);
    form.append("client_secret", APP_SECRET);
    form.append("grant_type", "authorization_code");
    form.append("redirect_uri", REDIRECT);
    form.append("code", code);

    const tokRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: form,
    });
    const tok = await tokRes.json();

    if (!tokRes.ok || !tok.access_token) {
      // Instagram refuse notamment les comptes personnels : on traduit.
      return json(
        {
          error: "instagram_refused",
          detail: tok?.error_message || tok?.error_type || "échange du code refusé",
          message:
            "Instagram a refusé la connexion. Vérifie que ton compte est bien un compte " +
            "Créateur ou Professionnel : c'est gratuit et ça se change en 30 secondes " +
            "dans Instagram (Paramètres › Type de compte).",
        },
        400
      );
    }

    const igUserId = String(tok.user_id ?? "");
    const accessToken = String(tok.access_token);

    // --- 2. lecture du username --------------------------------------
    const meRes = await fetch(
      `https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${encodeURIComponent(accessToken)}`
    );
    const me = await meRes.json();
    const username = String(me?.username || "").trim();

    if (!username) {
      return json(
        {
          error: "no_username",
          message: "Impossible de lire ton pseudo Instagram. Réessaie dans un instant.",
        },
        400
      );
    }

    // --- 3. utilisateur Supabase -------------------------------------
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Adresse technique stable, derivee de l'identifiant Instagram : elle
    // sert de cle de compte, l'utilisateur ne la voit jamais.
    const email = `ig_${igUserId}@instagram.viralnight.local`;

    // createUser echoue si le compte existe deja : c'est le cas nominal
    // d'une reconnexion, on l'ignore.
    await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { instagram_id: igUserId, instagram_username: username },
    });

    // Le handle vient d'Instagram, jamais du client : c'est tout
    // l'interet de passer par ici.
    const { data: userRow } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (userRow?.id) {
      await admin.from("users").update({ handle: username }).eq("id", userRow.id);
    }

    // --- 4. lien de session ------------------------------------------
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: SITE_URL || undefined },
    });

    if (linkErr) return json({ error: "session_failed", detail: linkErr.message }, 500);

    return json({
      username,
      instagram_id: igUserId,
      // Le client consomme ces jetons pour ouvrir la session.
      email,
      token_hash: link?.properties?.hashed_token ?? null,
      action_link: link?.properties?.action_link ?? null,
    });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
