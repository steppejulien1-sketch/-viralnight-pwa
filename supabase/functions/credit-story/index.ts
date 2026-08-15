// Edge Function — credit-story
// ----------------------------------------------------------------
// PONT RETOUR : le site B2B valide un contenu, cette fonction credite le
// clubbeur dans la base de la PWA.
//
// C'est le pendant de `push-submission`, qui fait l'aller. Depuis le
// 2026-08-15 la validation est centralisee cote B2B (decision de
// Julien) : la console gerant n'a plus d'ecran « A valider », donc le
// credit ne peut plus venir que d'ici.
//
// ⚠️ POURQUOI UN SECRET PARTAGE ET PAS UNE SESSION.
// L'appelant est un serveur, pas une personne : il n'a pas de session
// gerant et n'a aucune raison d'en avoir une. Mais sans controle, cette
// fonction serait un distributeur de points ouvert sur Internet — la
// cle anon est publique, elle est dans le bundle de l'app.
// Le secret n'est connu que des deux serveurs. Il ne transite jamais par
// un navigateur.
//
// ⚠️ La comparaison du secret est a temps constant. Un `===` sur une
// chaine s'arrete au premier caractere different, ce qui laisse mesurer
// le secret octet par octet. Le cout de faire propre ici est nul.
//
// SECRET A DEFINIR : B2B_BRIDGE_SECRET (identique cote B2B)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-vn-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/** Comparaison a temps constant : la duree ne depend pas du contenu. */
function memeSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const attendu = Deno.env.get("B2B_BRIDGE_SECRET") || "";
  if (!attendu) return json({ error: "not_configured", message: "Pont non configuré." }, 503);

  const fourni = req.headers.get("x-vn-secret") || "";
  if (!memeSecret(fourni, attendu)) return json({ error: "forbidden" }, 403);

  let corps: Record<string, unknown>;
  try {
    corps = await req.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const storyId = typeof corps.story_id === "string" ? corps.story_id : "";
  if (!storyId) return json({ error: "missing_story_id" }, 400);

  // Refuser explicitement plutot que d'assumer : une validation est un
  // acte qui deplace de l'argent (des points echangeables au bar).
  const approve = corps.approve === true || corps.approve === false ? corps.approve : null;
  if (approve === null) return json({ error: "missing_approve" }, 400);

  const nombreOuNull = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data, error } = await admin.rpc("review_story_externe", {
    p_story: storyId,
    p_approve: approve,
    p_views: nombreOuNull(corps.views),
    p_points: nombreOuNull(corps.points),
  });

  if (error) {
    // `already_reviewed` n'est pas une panne : c'est le verrou qui fait
    // son travail si le B2B renvoie deux fois la meme validation. On le
    // distingue pour que l'appelant ne le traite pas comme une erreur.
    const deja = error.message?.includes("already_reviewed");
    return json({ error: deja ? "already_reviewed" : "rpc_failed", detail: error.message }, deja ? 409 : 500);
  }

  const ligne = Array.isArray(data) ? data[0] : data;
  return json({
    ok: true,
    awarded: ligne?.awarded ?? 0,
    new_lifetime: ligne?.new_lifetime ?? null,
    unlocks_at: ligne?.unlocks_at ?? null,
  });
});
