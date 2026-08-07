-- 0017 — Des badges qui se debloquent vraiment, avec leur progression.
--
-- ETAT TROUVE : aucune fonction n'ecrivait dans `user_badges`. Les badges
-- ne pouvaient donc JAMAIS se debloquer — les deux affiches comme obtenus
-- sur le compte de demo avaient ete inseres a la main. Et deux d'entre eux
-- etaient impossibles par nature :
--   - "Recruteur — tu as parraine un ami"  -> aucun parrainage dans l'app
--   - "Soiree legendaire — evenement special" -> aucune notion d'evenement
-- C'est la meme faute que la fausse detection de story : promettre ce que
-- le produit ne sait pas tenir.
--
-- CHOIX RETENU : les badges ne sont plus OCTROYES par un declencheur, ils
-- sont DERIVES des donnees. Chaque badge porte une cible chiffree, et la
-- progression se calcule a la lecture. Deux avantages :
--   - impossible d'avoir un badge "en retard" faute de declencheur ;
--   - la progression ("6 / 10") existe gratuitement, alors qu'un simple
--     cadenas ne dit pas quoi faire pour l'ouvrir.
-- `user_badges` sert uniquement a garder la DATE du premier deblocage.

-- 1) Le catalogue : seulement ce que l'app sait mesurer -------------------
alter table public.badges add column if not exists target integer;
alter table public.badges add column if not exists metric text;

comment on column public.badges.metric is
  'Ce qui est compte : stories | views | redemptions | streak. Doit correspondre a un cas de get_my_badges.';

-- Les deux badges intenables disparaissent, avec les attributions qui
-- avaient ete posees a la main dessus.
delete from public.user_badges
 where badge_id in (select id from public.badges where code in ('referral', 'legend_night'));
delete from public.badges where code in ('referral', 'legend_night');

update public.badges set metric = 'stories', target = 1,  icon = 'sparkles'  where code = 'first_story';
update public.badges set metric = 'stories', target = 10, icon = 'instagram' where code = 'ten_stories';
update public.badges set metric = 'redemptions', target = 1, icon = 'gift'   where code = 'first_reward';

insert into public.badges (code, name, description, icon, sort, metric, target)
values
  ('streak_3',   'Trois d''affilée', 'Trois soirées de suite sans en louper une', 'flame',  4, 'streak', 3),
  ('views_10k',  'Dix mille vues',   '10 000 vues cumulées sur tes contenus',     'trophy', 5, 'views',  10000),
  ('views_50k',  'Cinquante mille',  '50 000 vues cumulées — tu remplis la salle', 'medal', 6, 'views',  50000)
on conflict (code) do update
  set name = excluded.name,
      description = excluded.description,
      icon = excluded.icon,
      sort = excluded.sort,
      metric = excluded.metric,
      target = excluded.target;

-- 2) Progression + deblocage, en une lecture ------------------------------
create or replace function public.get_my_badges(p_club uuid default null)
returns table(
  code text,
  name text,
  description text,
  icon text,
  metric text,
  target integer,
  current_value integer,
  unlocked boolean,
  unlocked_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_stories int;
  v_views int;
  v_redemptions int;
  v_streak int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Seuls les contenus VALIDES comptent : sinon un depot en attente
  -- ferait clignoter un badge qui peut encore etre refuse.
  select count(*), coalesce(sum(s.views), 0)
    into v_stories, v_views
    from public.story_events s
   where s.user_id = v_uid
     and s.verified = true
     and (p_club is null or s.club_id = p_club);

  select count(*) into v_redemptions
    from public.redemptions r
   where r.user_id = v_uid;

  -- Le record, pas la serie en cours : un badge ne se reprend pas.
  select coalesce(max(k.longest_streak), 0) into v_streak
    from public.streaks k
   where k.user_id = v_uid
     and (p_club is null or k.club_id = p_club);

  -- Enregistre la date du premier deblocage. `on conflict do nothing` :
  -- rejouer la lecture ne repousse jamais la date d'origine.
  insert into public.user_badges (user_id, badge_id)
  select v_uid, b.id
    from public.badges b
   where b.target is not null
     and case b.metric
           when 'stories' then v_stories
           when 'views' then v_views
           when 'redemptions' then v_redemptions
           when 'streak' then v_streak
           else 0
         end >= b.target
  on conflict (user_id, badge_id) do nothing;

  return query
  select b.code,
         b.name,
         b.description,
         b.icon,
         b.metric,
         b.target,
         case b.metric
           when 'stories' then v_stories
           when 'views' then v_views
           when 'redemptions' then v_redemptions
           when 'streak' then v_streak
           else 0
         end::integer,
         ub.user_id is not null,
         ub.unlocked_at
    from public.badges b
    left join public.user_badges ub
      on ub.badge_id = b.id and ub.user_id = v_uid
   order by b.sort;
end;
$function$;

grant execute on function public.get_my_badges(uuid) to authenticated;
