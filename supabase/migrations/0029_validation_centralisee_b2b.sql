-- Validation centralisee sur le site B2B.
--
-- DECISION PRODUIT (Julien, 2026-08-15) : « c'est sur ce site que je veux
-- qu'on puisse verifier les clients, pas sur l'autre ». La validation des
-- contenus quitte la console gerant de la PWA et devient l'affaire du
-- back-office B2B, qui valide pour tous les clubs.
--
-- LE PROBLEME A RESOUDRE. `review_story` est la fonction qui credite
-- reellement le clubbeur. Elle exige `owns_club()`, donc un gerant
-- connecte. Le B2B, lui, appelle depuis un serveur : il n'a pas de
-- session gerant, et il n'a AUCUNE raison d'en avoir une.
--
-- CE QU'ON NE FAIT PAS : recopier le corps de `review_story` dans une
-- seconde fonction. Le bareme, le blocage 12 h, le classement hebdo et
-- le verrou anti-double-validation vivraient alors en deux exemplaires,
-- et divergeraient au premier changement. Ce projet a deja paye ce prix
-- (le bareme avait fini en QUATRE exemplaires avant d'etre ramene a un).
--
-- CE QU'ON FAIT : le corps descend dans `review_story_core`, et deux
-- portes s'ouvrent dessus.
--   - `review_story`        : porte GERANT, verifie owns_club() ;
--   - `review_story_externe`: porte SERVEUR, reservee a service_role.
-- Une seule implementation, deux controles d'acces.

-- 1) Le coeur : exactement l'ancien corps, SANS le controle owns_club().
--    Il n'est appelable par personne d'autre que service_role (voir les
--    revocations plus bas) et par les deux portes ci-dessous, qui sont
--    SECURITY DEFINER.
create or replace function public.review_story_core(
  p_story uuid,
  p_approve boolean,
  p_views integer default null,
  p_points integer default null
)
returns table(awarded integer, new_lifetime integer, unlocks_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_club uuid;
  v_user uuid;
  v_kind text;
  v_verified boolean;
  v_vues_verifiees int;
  v_source text;
  v_views int;
  v_forfait int;
  v_total int;
  v_hours int;
  v_unlock timestamptz;
  v_life int;
  -- ⚠️ BORNE DE SAISIE HUMAINE UNIQUEMENT (0022). Elle ne s'applique PAS
  -- au montant calcule par le bareme : un TikTok au plafond vaut 2 060.
  c_max constant int := 2100;
begin
  select s.club_id, s.user_id, s.kind, s.verified, s.verified_views, s.views_source
    into v_club, v_user, v_kind, v_verified, v_vues_verifiees, v_source
    from public.story_events s
   where s.id = p_story;

  if v_club is null then raise exception 'unknown_story'; end if;
  if v_verified then raise exception 'already_reviewed'; end if;

  if not p_approve then
    update public.view_claims set status = 'rejected' where story_event_id = p_story;
    update public.story_events set awarded_points = 0, views = 0 where id = p_story;
    return query select 0, null::integer, null::timestamptz;
    return;
  end if;

  select coalesce(p_views, extracted_views, 0) into v_views
    from public.view_claims where story_event_id = p_story;

  -- ⚠️ LE MONTANT NE PEUT VENIR QUE D'UNE MESURE.
  v_forfait := public.story_points(
                 v_kind,
                 case when v_source = 'tiktok_api' then v_vues_verifiees end);
  if v_forfait is null then raise exception 'invalid_kind'; end if;

  if p_points is not null and (p_points < 0 or p_points > c_max) then
    raise exception 'points_out_of_range';
  end if;
  v_total := coalesce(p_points, v_forfait);

  update public.story_events
     set views = coalesce(v_views, 0),
         base_points = v_forfait,
         awarded_points = v_total,
         verified = true
   where id = p_story;

  update public.view_claims
     set status = 'approved',
         extracted_views = coalesce(v_views, 0),
         bonus_points = 0
   where story_event_id = p_story;

  if v_total = 0 then
    select lifetime_points into v_life from public.users where id = v_user;
    return query select 0, v_life, null::timestamptz;
    return;
  end if;

  select coalesce(points_lock_hours, 12) into v_hours from public.clubs where id = v_club;
  v_unlock := now() + make_interval(hours => coalesce(v_hours, 12));

  insert into public.point_grants (user_id, club_id, story_id, amount, unlocks_at)
  values (v_user, v_club, p_story, v_total, v_unlock);

  update public.users
     set lifetime_points = lifetime_points + v_total
   where id = v_user
   returning lifetime_points into v_life;

  -- ⚠️ week_start_date, PAS week (bug 42703 corrige par la 0016).
  insert into public.leaderboard_entries (user_id, club_id, week_start_date, week_points)
  values (v_user, v_club, date_trunc('week', now())::date, v_total)
  on conflict (user_id, club_id, week_start_date)
  do update set week_points = public.leaderboard_entries.week_points + excluded.week_points;

  return query select v_total, v_life, v_unlock;
end;
$function$;

-- 2) Porte GERANT : inchangee de l'exterieur, elle ne fait plus que le
--    controle d'acces avant de deleguer.
create or replace function public.review_story(
  p_story uuid,
  p_approve boolean,
  p_views integer default null,
  p_points integer default null
)
returns table(awarded integer, new_lifetime integer, unlocks_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_club uuid;
begin
  select club_id into v_club from public.story_events where id = p_story;
  if v_club is null then raise exception 'unknown_story'; end if;
  if not public.owns_club(v_club) then raise exception 'not_owner'; end if;

  return query select * from public.review_story_core(p_story, p_approve, p_views, p_points);
end;
$function$;

-- 3) Porte SERVEUR : appelee par l'edge function `credit-story`, elle-meme
--    protegee par un secret partage avec le site B2B.
create or replace function public.review_story_externe(
  p_story uuid,
  p_approve boolean,
  p_views integer default null,
  p_points integer default null
)
returns table(awarded integer, new_lifetime integer, unlocks_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  return query select * from public.review_story_core(p_story, p_approve, p_views, p_points);
end;
$function$;

-- ⚠️ LE VERROU. Sans ces revocations, n'importe quel visiteur muni de la
-- cle anon (elle est publique, elle est dans le bundle) pourrait
-- s'attribuer des points en appelant directement la fonction. C'est
-- exactement la faille que la 0014 avait fermee sur `credit_story` — on
-- ne la rouvre pas par une porte de service.
--
-- ⚠️ `create or replace` REATTRIBUE les droits par defaut : ces trois
-- lignes doivent etre rejouees APRES toute redefinition des fonctions
-- ci-dessus. C'est le piege de la 0016.
revoke execute on function public.review_story_core(uuid, boolean, integer, integer) from public, anon, authenticated;
revoke execute on function public.review_story_externe(uuid, boolean, integer, integer) from public, anon, authenticated;

grant execute on function public.review_story_core(uuid, boolean, integer, integer) to service_role;
grant execute on function public.review_story_externe(uuid, boolean, integer, integer) to service_role;
