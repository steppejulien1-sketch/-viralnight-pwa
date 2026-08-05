// Edge Function — assign-tier
// ----------------------------------------------------------------
// Recoit un handle Instagram, determine le nombre d'abonnes puis le
// palier (x1/x2/x4/x8) et le persiste sur public.users (service_role,
// donc contourne RLS).
//
// STUB : le lookup de followers est mocke (deterministe par handle).
// A remplacer par un appel a une API tierce (ex: fournisseur de data
// Instagram) sans changer le contrat de sortie.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TIERS = [
  { tier: "x1", mult: 1, min: 0, max: 500 },
  { tier: "x2", mult: 2, min: 500, max: 2000 },
  { tier: "x4", mult: 4, min: 2000, max: 10000 },
  { tier: "x8", mult: 8, min: 10000, max: Infinity },
];

function tierFor(count: number) {
  return TIERS.find((t) => count >= t.min && count < t.max) ?? TIERS[0];
}

// TODO(prod): remplacer par un vrai appel API. Mock deterministe ici.
function mockFollowers(handle: string): number {
  const clean = handle.replace(/[^a-z0-9]/gi, "").toLowerCase();
  let seed = 0;
  for (const ch of clean) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const buckets = [340, 720, 1240, 2600, 4800, 8300, 12400];
  return Math.max(180, buckets[seed % buckets.length] + ((seed % 200) - 100));
}

serve(async (req) => {
  try {
    const { user_id, handle } = await req.json();
    if (!user_id || !handle) {
      return json({ error: "user_id et handle requis" }, 400);
    }

    const followers = mockFollowers(handle);
    const t = tierFor(followers);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    await admin
      .from("users")
      .update({
        followers_count: followers,
        tier: t.tier,
        tier_updated_at: new Date().toISOString(),
      })
      .eq("id", user_id);

    return json({ followers, tier: t.tier, mult: t.mult });
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
