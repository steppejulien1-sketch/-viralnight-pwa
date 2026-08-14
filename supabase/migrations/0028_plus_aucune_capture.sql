-- 0028 — Plus aucune capture obligatoire. Le LIEN devient la pièce.
--
-- DÉCISION DE JULIEN (2026-08-14) : « retire la capture pour les reels et
-- les TikToks, ça marchera mieux si les gens se connectent avec une clé
-- API TikTok, et pour Instagram on regardera la mention ».
--
-- La 0026 avait déjà libéré les stories. Celle-ci va au bout : la capture
-- d'écran disparaît du parcours, pour tous les formats.
--
-- CE QUI VÉRIFIE QUOI, MAINTENANT :
--   · TikTok    → le compte connecté. `tiktok-views` cherche la vidéo
--                 DANS les vidéos de l'utilisateur (scope video.list) :
--                 la retrouver prouve à la fois qu'elle existe et qu'elle
--                 est bien à lui, et donne les vues réelles (0025).
--                 C'est de loin la vérification la plus forte du produit.
--   · Reel      → le lien public, que le gérant ouvre pour voir la mention.
--   · Story     → la mention reçue sur le compte Instagram du club (0026).
--
-- ⚠️ ET C'EST POUR ÇA QUE LE LIEN DEVIENT OBLIGATOIRE ICI.
-- Il ne l'était NULLE PART : ni en base, ni dans l'écran de dépôt (le
-- champ n'était pas validé). Tant que la capture était exigée, un reel
-- sans lien restait vérifiable par l'image. En la retirant sans rien
-- mettre à la place, un reel ou un TikTok serait arrivé chez le gérant
-- SANS AUCUN MOYEN DE LE VÉRIFIER — ni image, ni adresse. On échange une
-- pièce contre une autre, on n'en retire pas une pour rien.
--
-- Une story reste sans rien : c'est assumé, elle n'a pas d'URL publique
-- et sa preuve vit chez le club.
--
-- ⚠️ La capture reste ACCEPTÉE si elle arrive (le paramètre ne bouge pas,
-- l'écran de validation l'affiche toujours quand elle existe). Ce sont
-- les vieux clients pas encore rechargés qui en envoient : les refuser
-- casserait leur dépôt sans rien gagner.

begin;

create or replace function public.submit_story(
  p_club  uuid,
  p_kind  text,
  p_views integer,
  p_proof text,
  p_url   text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_id uuid;
  v_views int;
  v_proof text;
  v_url text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_kind := lower(coalesce(p_kind, ''));
  if v_kind not in ('story', 'reel', 'tiktok') then
    raise exception 'invalid_kind';
  end if;

  v_proof := nullif(btrim(coalesce(p_proof, '')), '');
  v_url   := nullif(btrim(coalesce(p_url, '')), '');

  -- ⚠️ PLUS AUCUNE CAPTURE EXIGÉE (0028). Ne pas réintroduire ce contrôle
  -- sans avoir d'abord retiré le lien obligatoire ci-dessous : les deux
  -- forment une seule règle, « tout contenu doit porter de quoi être
  -- vérifié ».
  if v_kind <> 'story' and v_url is null then
    raise exception 'url_required';
  end if;

  v_views := greatest(coalesce(p_views, 0), 0);
  if v_views > 1000000 then v_views := 1000000; end if;

  -- Garde-fou d'abus : déposer ne coûte plus aucun effort.
  if exists (
    select 1 from public.story_events s
     where s.user_id = v_uid
       and s.club_id = p_club
       and s.verified = false
       and s.mentioned_at > now() - interval '12 hours'
  ) then
    raise exception 'already_pending';
  end if;

  insert into public.story_events
    (user_id, club_id, kind, url, base_points, awarded_points, views, verified)
  values
    (v_uid, p_club, v_kind, v_url, 0, 0, v_views, false)
  returning id into v_id;

  -- ⚠️ La ligne `view_claims` existe MÊME SANS CAPTURE : elle porte le
  -- statut, et `get_pending_stories` fait sa jointure dessus. Sans elle,
  -- le dépôt n'apparaîtrait JAMAIS dans la file du gérant.
  insert into public.view_claims
    (story_event_id, user_id, screenshot_url, extracted_views, status)
  values
    (v_id, v_uid, v_proof, v_views, 'pending');

  return v_id;
end;
$function$;

grant execute on function public.submit_story(uuid, text, integer, text, text)
  to anon, authenticated, service_role;

commit;

-- VÉRIFICATION (depuis une session clubbeur)
--   submit_story(club,'story', 0, null, null)              -> OK
--   submit_story(club,'reel',  0, null, null)              -> url_required
--   submit_story(club,'reel',  0, null, 'https://…/reel/1') -> OK
--   submit_story(club,'tiktok',0, null, null)              -> url_required
