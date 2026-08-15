-- Les vues transmises par le pont retour ne doivent plus se perdre.
--
-- TROUVE PAR L'EPREUVE DU PONT (outils/test_pont_retour.cjs, 15/16) :
-- le B2B validait en transmettant 4 200 vues, et `story_events.views`
-- restait a 0.
--
-- POURQUOI. Le coeur lisait les vues ainsi :
--
--   select coalesce(p_views, extracted_views, 0) into v_views
--     from public.view_claims where story_event_id = p_story;
--
-- Quand la requete ne ramene AUCUNE LIGNE, `select ... into` n'affecte
-- rien : `v_views` reste NULL, et le `p_views` de l'appelant est jete
-- sans un mot. Le `coalesce` donne l'illusion du contraire — il ne
-- s'execute que si une ligne existe.
--
-- Le parcours nominal n'etait pas casse (`submit_story` cree bien un
-- `view_claims`), mais depuis le 2026-08-15 ce chemin porte la TOTALITE
-- des credits : un contenu sans claim — depot ancien, insertion
-- manuelle, correctif futur — aurait perdu ses vues en silence.
--
-- ⚠️ Seul le coeur est redefini. `review_story` et `review_story_externe`
-- ne changent pas : elles ne font que le controle d'acces.

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

  -- ⚠️ LE CORRECTIF. Sans cette ligne, un contenu sans `view_claims`
  -- laisse `v_views` a NULL et perd le chiffre envoye par l'appelant.
  if v_views is null then
    v_views := coalesce(p_views, 0);
  end if;

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

  insert into public.leaderboard_entries (user_id, club_id, week_start_date, week_points)
  values (v_user, v_club, date_trunc('week', now())::date, v_total)
  on conflict (user_id, club_id, week_start_date)
  do update set week_points = public.leaderboard_entries.week_points + excluded.week_points;

  return query select v_total, v_life, v_unlock;
end;
$function$;

-- ⚠️ `create or replace` REATTRIBUE LES DROITS PAR DEFAUT : sans ces deux
-- lignes, le coeur redeviendrait appelable avec la cle anon, et le
-- verrou pose par la 0029 sauterait en silence. C'est exactement le
-- piege paye par la 0016.
revoke execute on function public.review_story_core(uuid, boolean, integer, integer) from public, anon, authenticated;
grant execute on function public.review_story_core(uuid, boolean, integer, integer) to service_role;
