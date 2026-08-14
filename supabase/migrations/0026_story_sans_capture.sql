-- 0026 — Une story ne demande plus de capture d'écran.
--
-- DÉCISION DE JULIEN (2026-08-14) : « pour les stories, faut pas mettre de
-- capture d'écran obligatoire, ça sert à rien : on vérifiera que ça existe
-- grâce à l'Insta du club ».
--
-- Il a raison, et c'est même plus solide que ce qu'on faisait. Une capture
-- d'écran ne prouve pas grand-chose : elle se fabrique, se recycle d'une
-- soirée à l'autre, et le gérant devait la croire sur parole. **La mention
-- dans les stories du club, elle, arrive chez le club lui-même.** C'est
-- une source qu'un clubbeur ne contrôle pas — donc une vraie preuve, là où
-- la capture n'était qu'un geste.
--
-- CE QUI CHANGE : `submit_story` n'exige plus `p_proof` pour une STORY.
-- Le dépôt reste possible AVEC une capture (elle est conservée et affichée
-- au gérant si elle existe), elle n'est simplement plus un péage.
--
-- ⚠️ CE QUI NE CHANGE PAS, ET NE DOIT PAS :
--   · reel et tiktok gardent l'obligation. Pour eux la vérification passe
--     par le LIEN public, que le gérant ouvre — et le lien est déjà exigé
--     par l'écran de dépôt. Les traiter comme les stories reviendrait à
--     accepter un contenu que personne ne peut aller voir.
--   · le club valide toujours AVANT tout point (0014). Retirer la capture
--     ne retire pas le contrôle : ça le déplace vers l'endroit où il est
--     réellement fiable.
--   · un seul dépôt par 12 h (`already_pending`) : c'est lui qui empêche
--     d'inonder la file, maintenant qu'un dépôt ne coûte plus rien.
--
-- ⚠️ CONSÉQUENCE POUR LE GÉRANT : une story arrive désormais SANS image.
-- Son écran de validation doit lui dire où regarder (les mentions du
-- compte Instagram du club) au lieu d'afficher un cadre vide. C'est fait
-- dans `owner/sections/review.js` — les deux vont ensemble.

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
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_kind := lower(coalesce(p_kind, ''));
  if v_kind not in ('story', 'reel', 'tiktok') then
    raise exception 'invalid_kind';
  end if;

  v_proof := nullif(btrim(coalesce(p_proof, '')), '');

  -- ⚠️ LA CAPTURE N'EST PLUS EXIGÉE POUR UNE STORY (0026). Une story n'a
  -- pas d'URL publique : sa vérification passe par les mentions reçues sur
  -- le compte Instagram du club, que le clubbeur ne contrôle pas.
  -- Pour un reel ou un TikTok, la capture reste demandée : le gérant a le
  -- lien pour aller voir, mais on ne change qu'une chose à la fois.
  if v_kind <> 'story' and v_proof is null then
    raise exception 'proof_required';
  end if;

  -- ⚠️ story_events.views est NOT NULL DEFAULT 0 (0012) : on ne peut pas y
  -- écrire NULL. Le chiffre est décoratif depuis le forfait (0020) ; pour
  -- TikTok, seul `verified_views` compte (0025).
  v_views := greatest(coalesce(p_views, 0), 0);
  if v_views > 1000000 then v_views := 1000000; end if;

  -- Un dépôt par contenu et par 12 h. Ce garde-fou compte DOUBLE
  -- maintenant : sans capture à fournir, déposer ne demande plus aucun
  -- effort.
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
    (v_uid, p_club, v_kind, nullif(btrim(coalesce(p_url, '')), ''), 0, 0, v_views, false)
  returning id into v_id;

  -- ⚠️ La ligne `view_claims` est créée MÊME SANS CAPTURE : c'est elle qui
  -- porte le statut (pending/approved/rejected) et c'est sur elle que
  -- `get_pending_stories` fait sa jointure. Sans elle, une story sans
  -- capture n'apparaîtrait JAMAIS dans la file du gérant — le dépôt
  -- partirait dans le vide.
  insert into public.view_claims
    (story_event_id, user_id, screenshot_url, extracted_views, status)
  values
    (v_id, v_uid, v_proof, v_views, 'pending');

  return v_id;
end;
$function$;

-- L'ACL survit à un `create or replace` (pas de drop ici), mais on la
-- repose par sécurité : la signature est inchangée.
grant execute on function public.submit_story(uuid, text, integer, text, text)
  to anon, authenticated, service_role;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- VÉRIFICATION
-- ═══════════════════════════════════════════════════════════════════════
-- Depuis une session clubbeur :
--   select public.submit_story('<club>', 'story', 0, null, null);  -- OK
--   select public.submit_story('<club>', 'reel',  0, null, 'http'); -- proof_required
-- Et la story déposée sans capture DOIT apparaître dans
--   select * from public.get_pending_stories('<club>');
