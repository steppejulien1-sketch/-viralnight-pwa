-- 0014 — La preuve d'abord, les points ensuite.
--
-- AVANT : l'ecran "Poster ma story" attendait 4,5 secondes (une fausse
-- detection), puis appelait credit_story() et creditait les points. Trois
-- consequences :
--   1. n'importe qui pouvait gagner des points SANS avoir rien publie ;
--   2. la capture d'ecran etait facultative, alors que c'est elle qui porte
--      le nombre de vues — donc le montant du gain ;
--   3. le club payait des recompenses sur des chiffres que personne n'avait
--      jamais regardes.
--
-- MAINTENANT : le clubbeur DECLARE son contenu avec sa capture obligatoire.
-- Rien n'est credite. Le club valide (ou corrige le nombre de vues, ou
-- refuse), et c'est cette validation qui declenche le gain.
--
-- credit_story() n'est plus appelable par un client : c'est le coeur du
-- verrou, tout le reste ne serait que decoration sans cette revocation.

-- 1) Le bareme, a UN SEUL endroit ------------------------------------------
-- Il etait duplique dans credit_story ; le dupliquer une 2e fois dans la
-- validation garantissait qu'ils divergent un jour.
create or replace function public.story_points(p_kind text, p_views integer)
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select case lower(p_kind)
           when 'story' then 100 + least((greatest(coalesce(p_views,0),0) / 100) * 20, 2000)
           when 'reel'  then  60 + least((greatest(coalesce(p_views,0),0) / 100) *  7, 2000)
           when 'tiktok' then 60 + least((greatest(coalesce(p_views,0),0) / 100) *  7, 2000)
         end;
$$;

comment on function public.story_points(text, integer) is
  'Bareme unique. Retourne NULL pour un type inconnu — les appelants doivent lever.';

-- 2) Depot d'un contenu : capture OBLIGATOIRE, zero point ------------------
create or replace function public.submit_story(
  p_club uuid,
  p_kind text,
  p_views integer,
  p_proof text,
  p_url text default null
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
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_kind := lower(coalesce(p_kind, ''));
  if v_kind not in ('story', 'reel', 'tiktok') then
    raise exception 'invalid_kind';
  end if;

  -- La capture est la piece justificative : sans elle il n'y a rien a
  -- verifier, donc rien a payer.
  if p_proof is null or btrim(p_proof) = '' then
    raise exception 'proof_required';
  end if;

  if p_views is null or p_views < 0 then
    raise exception 'views_required';
  end if;

  -- Un depot par contenu et par jour : evite qu'on renvoie dix fois la
  -- meme capture en esperant qu'une passe.
  if exists (
    select 1 from public.story_events s
     where s.user_id = v_uid
       and s.club_id = p_club
       and s.verified = false
       and s.mentioned_at > now() - interval '12 hours'
  ) then
    raise exception 'already_pending';
  end if;

  -- awarded_points = 0 et verified = false : la ligne existe pour etre
  -- verifiee, elle ne vaut rien tant que le club ne l'a pas regardee.
  insert into public.story_events (user_id, club_id, kind, url, base_points, awarded_points, views, verified)
  values (v_uid, p_club, v_kind, nullif(btrim(coalesce(p_url, '')), ''), 0, 0, p_views, false)
  returning id into v_id;

  insert into public.view_claims (story_event_id, user_id, screenshot_url, extracted_views, status)
  values (v_id, v_uid, p_proof, p_views, 'pending');

  return v_id;
end;
$function$;

-- 3) Validation par le club : c'est ELLE qui credite ------------------------
create or replace function public.review_story(
  p_story uuid,
  p_approve boolean,
  p_views integer default null
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
  v_views int;
  v_total int;
  v_hours int;
  v_unlock timestamptz;
  v_life int;
begin
  select s.club_id, s.user_id, s.kind, s.verified
    into v_club, v_user, v_kind, v_verified
    from public.story_events s
   where s.id = p_story;

  if v_club is null then raise exception 'unknown_story'; end if;
  if not public.owns_club(v_club) then raise exception 'not_owner'; end if;
  -- Sans ce garde-fou, valider deux fois crediterait deux fois.
  if v_verified then raise exception 'already_reviewed'; end if;

  if not p_approve then
    update public.view_claims set status = 'rejected' where story_event_id = p_story;
    -- La ligne reste, marquee refusee : elle documente la decision plutot
    -- que de disparaitre sans trace.
    update public.story_events set awarded_points = 0, views = 0 where id = p_story;
    return query select 0, null::integer, null::timestamptz;
    return;
  end if;

  -- Le club peut corriger le chiffre declare : c'est lui qui a la capture
  -- sous les yeux.
  select coalesce(p_views, extracted_views) into v_views
    from public.view_claims where story_event_id = p_story;

  v_total := public.story_points(v_kind, v_views);
  if v_total is null then raise exception 'invalid_kind'; end if;

  update public.story_events
     set views = v_views,
         base_points = case when v_kind = 'story' then 100 else 60 end,
         awarded_points = v_total,
         verified = true
   where id = p_story;

  update public.view_claims
     set status = 'approved', extracted_views = v_views, bonus_points = v_total
   where story_event_id = p_story;

  -- Le gain reste bloque le temps prevu par le club (migration 0011).
  select coalesce(points_lock_hours, 12) into v_hours from public.clubs where id = v_club;
  v_unlock := now() + make_interval(hours => coalesce(v_hours, 12));

  insert into public.point_grants (user_id, club_id, story_id, amount, unlocks_at)
  values (v_user, v_club, p_story, v_total, v_unlock);

  update public.users
     set lifetime_points = lifetime_points + v_total
   where id = v_user
   returning lifetime_points into v_life;

  insert into public.leaderboard_entries (user_id, club_id, week, week_points)
  values (v_user, v_club, date_trunc('week', now())::date, v_total)
  on conflict (user_id, club_id, week)
  do update set week_points = public.leaderboard_entries.week_points + excluded.week_points;

  return query select v_total, v_life, v_unlock;
end;
$function$;

-- 4) La file d'attente du club ---------------------------------------------
create or replace function public.get_pending_stories(p_club uuid)
returns table(
  story_id uuid,
  handle text,
  kind text,
  declared_views integer,
  proof_path text,
  url text,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.owns_club(p_club) then raise exception 'not_owner'; end if;

  return query
  select s.id, u.handle, s.kind, c.extracted_views, c.screenshot_url, s.url, s.mentioned_at
    from public.story_events s
    join public.view_claims c on c.story_event_id = s.id
    join public.users u on u.id = s.user_id
   where s.club_id = p_club
     and s.verified = false
     and c.status = 'pending'
   order by s.mentioned_at;
end;
$function$;

-- 5) ⚠️ LE VERROU : un client ne peut plus se crediter lui-meme ------------
-- credit_story reste en base (les edge functions s'en servent quand la
-- verification viendra d'un webhook reseau), mais plus personne ne peut
-- l'appeler depuis le navigateur.
revoke execute on function public.credit_story(uuid, text, integer, text) from anon, authenticated;

grant execute on function public.submit_story(uuid, text, integer, text, text) to authenticated;
grant execute on function public.review_story(uuid, boolean, integer) to authenticated;
grant execute on function public.get_pending_stories(uuid) to authenticated;
grant execute on function public.story_points(text, integer) to anon, authenticated;

-- 6) Le bucket des captures de vues ----------------------------------------
insert into storage.buckets (id, name, public)
values ('story-proofs', 'story-proofs', false)
on conflict (id) do nothing;

-- Chacun depose dans un dossier a son nom, et ne lit que le sien.
drop policy if exists "story proof - insert own" on storage.objects;
create policy "story proof - insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'story-proofs' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "story proof - read own" on storage.objects;
create policy "story proof - read own" on storage.objects
  for select to authenticated
  using (bucket_id = 'story-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
