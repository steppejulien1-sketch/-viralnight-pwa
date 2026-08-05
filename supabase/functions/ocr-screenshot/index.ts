// Edge Function — ocr-screenshot
// ----------------------------------------------------------------
// Recoit une capture d'ecran de stats Instagram (deja uploadee sur
// Storage), en extrait le nombre de vues, calcule un bonus et l'ajoute
// au solde. En service_role.
//
// STUB : l'OCR est simule (valeur pseudo-aleatoire). A remplacer par
// un vrai OCR (ex: appel a un service de vision) qui lit le compteur
// de vues sur l'image.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 1 point de bonus par tranche de 200 vues, plafonne.
function bonusForViews(views: number): number {
  return Math.min(500, Math.round(views / 200));
}

serve(async (req) => {
  try {
    const { claim_id } = await req.json();
    if (!claim_id) return json({ error: "claim_id requis" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: claim, error } = await admin
      .from("view_claims")
      .select("id, user_id, screenshot_url")
      .eq("id", claim_id)
      .single();
    if (error || !claim) return json({ error: "claim introuvable" }, 404);

    // TODO(prod): OCR reel de claim.screenshot_url -> nombre de vues.
    const extractedViews = 2000 + Math.floor(Math.random() * 14000);
    const bonus = bonusForViews(extractedViews);

    await admin
      .from("view_claims")
      .update({ extracted_views: extractedViews, bonus_points: bonus, status: "approved" })
      .eq("id", claim_id);

    // Credite le bonus.
    const { data: user } = await admin
      .from("users")
      .select("points_balance")
      .eq("id", claim.user_id)
      .single();
    if (user) {
      await admin
        .from("users")
        .update({ points_balance: user.points_balance + bonus })
        .eq("id", claim.user_id);
    }

    return json({ extracted_views: extractedViews, bonus_points: bonus });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
