// Edge Function — push-submission
// ----------------------------------------------------------------
// Fait remonter un contenu publie par un clubbeur (PWA) vers le
// dashboard du gerant (site B2B).
//
// POURQUOI COTE SERVEUR
//   - le navigateur du clubbeur se heurterait au CORS en appelant
//     viralnight-koif.vercel.app ;
//   - le code public de l'etablissement ne doit pas transiter par le
//     client, sinon n'importe qui pourrait injecter des contenus dans le
//     dashboard d'un autre club.
//
// CE QUE FAIT LA FONCTION
//   1. verifie que l'appelant est bien l'auteur de la story
//   2. lit le code public B2B du club (clubs.b2b_public_code)
//   3. POST /api/track-post sur le site B2B
//   4. marque story_events.pushed_at ou push_error
//
// ⚠️ Le B2B insere en statut 'pending' et n'attribue AUCUN point tant
// que le staff n'a pas valide depuis l'admin. C'est deliberé : les deux
// economies restent separees.
//
// ⚠️ Une story Instagram n'a pas d'URL publique. La route B2B valide le
// domaine du lien, donc un contenu sans URL ne peut pas remonter. On le
// dit franchement au lieu d'echouer en silence.
//
// SECRET A DEFINIR : B2B_SITE_URL (ex: https://viralnight-koif.vercel.app)

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

// Le B2B n'accepte que ces quatre types.
function contentTypeFor(kind: string): string {
  if (kind === "story") return "story";
  if (kind === "reel") return "reel";
  return "video"; // tiktok
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const B2B = Deno.env.get("B2B_SITE_URL");
    if (!B2B) {
      return json({ error: "not_configured", message: "Site B2B non configuré." }, 503);
    }

    const { story_id } = await req.json();
    if (!story_id) return json({ error: "missing_story_id" }, 400);

    // Identite de l'appelant, depuis son jeton : on ne fait pas confiance
    // a un user_id qui viendrait du corps de la requete.
    const authHeader = req.headers.get("Authorization") || "";
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: who } = await asUser.auth.getUser();
    const uid = who?.user?.id;
    if (!uid) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    const { data: story } = await admin
      .from("story_events")
      .select("id, user_id, club_id, kind, url, awarded_points, pushed_at")
      .eq("id", story_id)
      .maybeSingle();

    if (!story) return json({ error: "story_not_found" }, 404);
    if (story.user_id !== uid) return json({ error: "not_your_story" }, 403);
    if (story.pushed_at) return json({ ok: true, already: true });

    if (!story.url) {
      const msg = "pas d'URL (une story Instagram n'a pas de lien public)";
      await admin.from("story_events").update({ push_error: msg }).eq("id", story.id);
      return json({ ok: false, skipped: true, reason: msg });
    }

    const { data: club } = await admin
      .from("clubs")
      .select("b2b_public_code")
      .eq("id", story.club_id)
      .maybeSingle();

    const code = club?.b2b_public_code;
    if (!code) {
      const msg = "club non relié à un établissement B2B";
      await admin.from("story_events").update({ push_error: msg }).eq("id", story.id);
      return json({ ok: false, skipped: true, reason: msg });
    }

    // customerId doit etre un UUID cote B2B : l'id du clubbeur en est un.
    const res = await fetch(`${B2B.replace(/\/$/, "")}/api/track-post`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        customerId: story.user_id,
        url: story.url,
        contentType: contentTypeFor(story.kind),
      }),
    });

    const out = await res.json().catch(() => ({}));

    if (!res.ok || out?.error) {
      const msg = String(out?.error || `HTTP ${res.status}`).slice(0, 300);
      await admin.from("story_events").update({ push_error: msg }).eq("id", story.id);
      return json({ ok: false, error: "b2b_refused", detail: msg }, 502);
    }

    await admin
      .from("story_events")
      .update({ pushed_at: new Date().toISOString(), push_error: null })
      .eq("id", story.id);

    return json({ ok: true, already: Boolean(out?.alreadySubmitted) });
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
