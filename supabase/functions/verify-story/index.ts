// Edge Function — verify-story
// ----------------------------------------------------------------
// Appelee par le webhook Instagram quand une story tague le club.
// Verifie l'evenement, calcule les points (base x multiplicateur de
// palier) et credite le solde. En service_role : le client ne credite
// JAMAIS ses propres points lui-meme.
//
// STUB : la verification du webhook est simulee (on fait confiance a
// l'appelant). A durcir avec la signature du webhook Instagram.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const BASE_POINTS = 70;
const MULT: Record<string, number> = { x1: 1, x2: 2, x4: 4, x8: 8 };

serve(async (req) => {
  try {
    const { user_id, club_id } = await req.json();
    if (!user_id || !club_id) return json({ error: "user_id et club_id requis" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Palier courant du clubbeur.
    const { data: user, error: uErr } = await admin
      .from("users")
      .select("tier, points_balance")
      .eq("id", user_id)
      .single();
    if (uErr || !user) return json({ error: "user introuvable" }, 404);

    const awarded = BASE_POINTS * (MULT[user.tier] ?? 1);

    // Enregistre la story creditee.
    await admin.from("story_events").insert({
      user_id,
      club_id,
      base_points: BASE_POINTS,
      awarded_points: awarded,
      verified: true,
    });

    // Credite le solde.
    const newBalance = user.points_balance + awarded;
    await admin.from("users").update({ points_balance: newBalance }).eq("id", user_id);

    return json({ awarded_points: awarded, new_balance: newBalance });
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
