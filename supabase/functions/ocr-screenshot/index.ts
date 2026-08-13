// Edge Function — ocr-screenshot
// ----------------------------------------------------------------
// Lit le nombre de vues sur la capture deposee par un clubbeur et le
// PROPOSE au gerant. Elle ne credite RIEN et ne valide RIEN.
//
// ⚠️ CE QUE FAISAIT LA VERSION PRECEDENTE, ET POURQUOI ELLE N'A JAMAIS
// ETE DEPLOYEE :
//   1. elle INVENTAIT le nombre de vues (2000 + random * 14000) ;
//   2. elle passait le claim en 'approved' toute seule ;
//   3. elle ecrivait users.points_balance EN DIRECT, court-circuitant
//      point_grants et le blocage de 12 h (migration 0011) ;
//   4. elle ne verifiait AUCUN droit sur le claim : n'importe quel
//      clubbeur connecte pouvait la rappeler en boucle et se crediter.
// C'etait la faille d'auto-credit fermee par la 0014, en pire.
//
// REGLE DE CONCEPTION : review_story() reste le SEUL chemin qui verse
// des points. Ici on ecrit uniquement view_claims.ocr_views, une colonne
// separee (migration 0019) qui n'entre dans aucun calcul. La declaration
// du clubbeur (extracted_views) n'est jamais ecrasee : c'est la piece
// qui documente l'ecart entre ce qu'il annonce et ce que montre l'image.
//
// APPELANT : le GERANT uniquement, depuis l'ecran "A valider". Verifie
// par owns_club() execute avec SON jeton, pas avec le service_role.
//
// SECRETS : VISION_PROVIDER ("anthropic" par defaut, ou "openai")
//           ANTHROPIC_API_KEY  ou  OPENAI_API_KEY
//           VISION_MODEL (facultatif, pour changer de modele sans
//           redeployer)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const PROVIDER = (Deno.env.get("VISION_PROVIDER") ?? "anthropic").toLowerCase();
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";

// Lire un nombre sur une capture est une tache simple : le petit modele
// suffit et coute une fraction du grand. Surchargeable par secret.
const MODEL =
  Deno.env.get("VISION_MODEL") ??
  (PROVIDER === "openai" ? "gpt-4o-mini" : "claude-haiku-4-5-20251001");

const CONSIGNE = [
  "Cette image est une capture d'ecran de statistiques Instagram ou TikTok.",
  "Trouve le NOMBRE DE VUES (aussi appele 'vues', 'views', 'lectures',",
  "'affichages'). Ignore les likes, commentaires, partages et abonnes.",
  "Les nombres peuvent etre abreges (4,2 k / 4.2K / 1,3 M) : convertis-les",
  "en entier (4200, 1300000).",
  'Reponds UNIQUEMENT par du JSON : {"vues": 4187} ou {"vues": null} si tu',
  "ne trouves pas de nombre de vues. Aucun autre texte.",
].join(" ");

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function base64(buf: ArrayBuffer): string {
  const octets = new Uint8Array(buf);
  let bin = "";
  // Par tranches : String.fromCharCode(...) sur un tableau entier fait
  // sauter la pile au-dela de quelques dizaines de milliers d'octets.
  for (let i = 0; i < octets.length; i += 0x8000) {
    bin += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

/** Renvoie le nombre de vues lu, ou null. Leve en cas d'echec reseau. */
async function lireVues(dataB64: string, mediaType: string): Promise<number | null> {
  let texte = "";

  if (PROVIDER === "openai") {
    if (!OPENAI_KEY) throw new Error("OPENAI_API_KEY absente");
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 64,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: CONSIGNE },
              { type: "image_url", image_url: { url: `data:${mediaType};base64,${dataB64}` } },
            ],
          },
        ],
      }),
    });
    const out = await r.json();
    if (!r.ok) throw new Error(out?.error?.message || `openai ${r.status}`);
    texte = out?.choices?.[0]?.message?.content ?? "";
  } else {
    if (!ANTHROPIC_KEY) throw new Error("ANTHROPIC_API_KEY absente");
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 64,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: dataB64 } },
              { type: "text", text: CONSIGNE },
            ],
          },
        ],
      }),
    });
    const out = await r.json();
    if (!r.ok) throw new Error(out?.error?.message || `anthropic ${r.status}`);
    texte = out?.content?.[0]?.text ?? "";
  }

  // Le modele est prie de repondre en JSON pur, mais on ne lui fait pas
  // confiance sur la forme : on va chercher l'objet dans la reponse.
  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let vues: unknown = null;
  try {
    vues = JSON.parse(m[0])?.vues;
  } catch {
    return null;
  }
  const n = Number(vues);
  // Borne haute : au-dela c'est une lecture aberrante, mieux vaut ne rien
  // proposer que d'afficher un chiffre absurde au gerant.
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return null;
  return Math.round(n);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const { story_id } = await req.json();
    if (!story_id) return json({ error: "missing_story_id" }, 400);

    // Identite de l'appelant, depuis SON jeton.
    const authHeader = req.headers.get("Authorization") || "";
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: who } = await asUser.auth.getUser();
    if (!who?.user?.id) return json({ error: "not_authenticated" }, 401);

    const db = admin();

    const { data: story } = await db
      .from("story_events")
      .select("id, club_id, verified")
      .eq("id", story_id)
      .maybeSingle();
    if (!story) return json({ error: "story_not_found" }, 404);

    // ⚠️ Le controle de droit s'execute avec le jeton de l'APPELANT :
    // owns_club() lit auth.uid(). Le faire en service_role reviendrait a
    // ne rien verifier du tout.
    const { data: proprio } = await asUser.rpc("owns_club", { cid: story.club_id });
    if (proprio !== true) return json({ error: "not_owner" }, 403);

    const { data: claim } = await db
      .from("view_claims")
      .select("id, screenshot_url")
      .eq("story_event_id", story_id)
      .maybeSingle();
    if (!claim?.screenshot_url) return json({ error: "no_proof" }, 404);

    // Bucket prive : URL signee courte, juste le temps de lire l'image.
    const { data: signed } = await db.storage
      .from("story-proofs")
      .createSignedUrl(claim.screenshot_url, 120);
    if (!signed?.signedUrl) return json({ error: "proof_unreadable" }, 404);

    const img = await fetch(signed.signedUrl);
    if (!img.ok) return json({ error: "proof_unreadable" }, 404);
    const mediaType = (img.headers.get("content-type") || "image/jpeg").split(";")[0];
    const b64 = base64(await img.arrayBuffer());

    let vues: number | null = null;
    let erreur: string | null = null;
    try {
      vues = await lireVues(b64, mediaType);
      if (vues === null) erreur = "Aucun nombre de vues trouve sur la capture.";
    } catch (e) {
      // Une panne du service de vision ne doit pas empecher le gerant de
      // valider a la main : on trace et on rend la main.
      erreur = String(e instanceof Error ? e.message : e).slice(0, 300);
    }

    // SEULES ces trois colonnes sont ecrites. Ni points, ni statut, ni
    // extracted_views.
    await db
      .from("view_claims")
      .update({ ocr_views: vues, ocr_at: new Date().toISOString(), ocr_error: erreur })
      .eq("id", claim.id);

    return json({ ok: true, vues, erreur });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
