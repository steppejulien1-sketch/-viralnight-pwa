-- ============================================================
-- 0007 — Pont vers le site B2B
-- ------------------------------------------------------------
-- La PWA (clubbeurs) et le site B2B (gerants) vivent sur DEUX projets
-- Supabase distincts :
--   PWA : gcopwgmqjiufemapamek   (clubs, users, story_events, redemptions)
--   B2B : mrukkexghpcqtwvwwcbe   (establishments, submissions, rewards…)
-- Rien ne les reliait : un contenu publie par un clubbeur n'apparaissait
-- nulle part sur le dashboard du gerant.
--
-- On ne fusionne pas les bases (schemas differents, gros chantier). On
-- pousse les contenus vers la route publique deja prevue cote B2B,
-- /api/track-post, qui les insere dans `submissions` en statut 'pending'.
--
-- ⚠️ Le B2B n'attribue AUCUN point tant que le staff n'a pas valide le
-- contenu depuis l'admin. La PWA, elle, credite immediatement. Les deux
-- economies restent donc separees et c'est VOULU : le B2B mesure la
-- visibilite reelle apres controle, la PWA recompense l'action tout de
-- suite pour garder le clubbeur engage.
--
-- Ce fichier n'ajoute que la correspondance club -> etablissement.
-- L'appel HTTP se fait dans l'edge function push-submission, parce qu'il
-- exige le code public du club et ne doit pas partir du navigateur.
-- ============================================================

alter table public.clubs
  add column if not exists b2b_public_code text;

comment on column public.clubs.b2b_public_code is
  'Code public de l''etablissement correspondant sur le site B2B. '
  'Vide = les contenus de ce club ne remontent pas au dashboard gerant.';

-- URL du contenu publie. Indispensable pour que le B2B accepte la
-- soumission : sa route valide le domaine (instagram / tiktok / youtube).
-- Une story Instagram n'a pas d'URL publique, la colonne reste donc
-- souvent nulle pour kind='story' -- c'est attendu.
alter table public.story_events
  add column if not exists url text;

-- Trace de la remontee, pour savoir ce qui est arrive de l'autre cote
-- sans avoir a interroger l'autre base.
alter table public.story_events
  add column if not exists pushed_at timestamptz;

alter table public.story_events
  add column if not exists push_error text;

-- ------------------------------------------------------------
-- credit_story accepte desormais l'URL du contenu
-- ------------------------------------------------------------
create or replace function public.credit_story(
  p_club uuid,
  p_kind text default 'story',
  p_views int default 0,
  p_url text default null
)
returns table(story_id uuid, awarded int, new_balance int, new_lifetime int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_kind  text;
  v_base  int;
  v_per100 int;
  v_cap   int;
  v_bonus int;
  v_total int;
  v_id    uuid;
  v_bal   int;
  v_life  int;
  v_week  date := date_trunc('week', now())::date;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_kind := lower(coalesce(p_kind, 'story'));
  if v_kind not in ('story', 'reel', 'tiktok') then
    raise exception 'invalid_kind: %', p_kind;
  end if;

  -- Bareme par type. Seul endroit a modifier.
  case v_kind
    when 'story' then v_base := 100; v_per100 := 20; v_cap := 2000;
    when 'reel'  then v_base :=  60; v_per100 :=  7; v_cap := 2000;
    else              v_base :=  60; v_per100 :=  7; v_cap := 2000;
  end case;

  if p_views is null or p_views < 0 then p_views := 0; end if;
  if p_views > 1000000 then p_views := 1000000; end if;

  v_bonus := least((p_views / 100) * v_per100, v_cap);
  v_total := v_base + v_bonus;

  insert into public.story_events (user_id, club_id, kind, url, base_points, awarded_points)
  values (v_uid, p_club, v_kind, nullif(trim(coalesce(p_url, '')), ''), v_base, v_total)
  returning id into v_id;

  update public.users
     set points_balance  = points_balance + v_total,
         lifetime_points = lifetime_points + v_total
   where id = v_uid
   returning points_balance, lifetime_points into v_bal, v_life;

  insert into public.leaderboard_entries (user_id, club_id, week_start_date, week_points)
  values (v_uid, p_club, v_week, v_total)
  on conflict (club_id, user_id, week_start_date)
  do update set week_points = public.leaderboard_entries.week_points + excluded.week_points;

  return query select v_id, v_total, v_bal, v_life;
end;
$$;

revoke all on function public.credit_story(uuid, text, int, text) from public;
grant execute on function public.credit_story(uuid, text, int, text) to authenticated;

-- L'ancienne signature a 3 arguments est retiree : sans ca, PostgREST
-- ne saurait pas laquelle appeler et renverrait une erreur d'ambiguite.
drop function if exists public.credit_story(uuid, text, int);
