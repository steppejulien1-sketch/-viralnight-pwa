-- ============================================================
-- 0005 — Types de contenu : story, reel, tiktok
-- ------------------------------------------------------------
-- story_events n'enregistrait pas CE QUI avait ete publie, et
-- credit_story ignorait son parametre p_kind : tout etait paye au
-- tarif story. Le club ne pouvait donc pas savoir d'ou venait sa
-- visibilite, et un TikTok rapportait autant qu'une story.
--
-- Bareme repris de la logique du site B2B (dashboardData.js) :
--   storyViewsPerThousand: 80   -- cercle proche, convertit mieux
--   videoViewsPerThousand: 25   -- portee large, payee au volume
-- soit un rapport d'environ 3,2x en faveur des stories.
--
-- Transpose a l'echelle de la PWA (dont les recompenses coutent
-- 300 a 600 points) :
--   story  : socle 100 + 20 pts / 100 vues
--   reel   : socle  60 +  7 pts / 100 vues
--   tiktok : socle  60 +  7 pts / 100 vues
--
-- Ces valeurs sont regroupees dans le CASE ci-dessous : c'est le seul
-- endroit a modifier pour changer le bareme.
-- ============================================================

alter table public.story_events
  add column if not exists kind text not null default 'story';

alter table public.story_events
  drop constraint if exists story_events_kind_check;
alter table public.story_events
  add constraint story_events_kind_check
  check (kind in ('story', 'reel', 'tiktok'));

create index if not exists story_events_kind_idx
  on public.story_events(club_id, kind);

-- ------------------------------------------------------------
-- credit_story — prend enfin p_kind en compte
-- ------------------------------------------------------------
create or replace function public.credit_story(
  p_club uuid,
  p_kind text default 'story',
  p_views int default 0
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

  -- Le type vient du client : on le valide au lieu de lui faire confiance.
  -- On ECHOUE au lieu de retomber sur une valeur par defaut : un repli sur
  -- 'story' ferait payer le tarif le plus genereux a qui envoie n'importe
  -- quoi. Mieux vaut une erreur visible qu'un credit silencieux.
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

  -- Le nombre de vues est une PROPOSITION du client, jamais une consigne.
  if p_views is null or p_views < 0 then
    p_views := 0;
  end if;
  if p_views > 1000000 then
    p_views := 1000000;
  end if;

  v_bonus := least((p_views / 100) * v_per100, v_cap);
  v_total := v_base + v_bonus;

  insert into public.story_events (user_id, club_id, kind, base_points, awarded_points)
  values (v_uid, p_club, v_kind, v_base, v_total)
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

revoke all on function public.credit_story(uuid, text, int) from public;
grant execute on function public.credit_story(uuid, text, int) to authenticated;
