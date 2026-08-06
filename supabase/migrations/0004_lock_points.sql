-- ============================================================
-- 0004 — Verrouillage de l'economie de points
-- ------------------------------------------------------------
-- Contexte : la RLS dit QUELLE ligne un utilisateur peut ecrire,
-- elle ne dit PAS quelles colonnes. La policy
--   "own profile - update" on public.users using (auth.uid() = id)
-- laissait donc un clubbeur reecrire n'importe quelle colonne de sa
-- propre ligne, points_balance compris.
--
-- Verifie en conditions reelles sur ce projet avec le compte de demo :
-- un simple PATCH /rest/v1/users a fait passer le solde de 480 a
-- 999999 (HTTP 200). Valeur restauree dans la foulee.
--
-- Consequence : n'importe quel client pouvait vider la boutique.
-- ============================================================

-- ------------------------------------------------------------
-- 1. users — l'utilisateur ne modifie que son identite
-- ------------------------------------------------------------
-- Les grants par colonne completent la RLS : celle-ci filtre la ligne,
-- ceux-ci filtrent les colonnes. Les deux sont necessaires.
revoke update on public.users from authenticated;
revoke update on public.users from anon;
grant update (handle, email) on public.users to authenticated;

-- points_balance, lifetime_points, tier, followers_count ne sont plus
-- ecrivables que par les fonctions security definer (redeem_reward,
-- credit_story) qui s'executent avec les droits du proprietaire.

-- ------------------------------------------------------------
-- 2. redemptions — plus d'insertion directe
-- ------------------------------------------------------------
-- Sans ca, un client pouvait s'inserer une redemption avec son propre
-- qr_code sans jamais etre debite. redeem_reward() est security definer,
-- il continue de fonctionner sans cette policy.
drop policy if exists "own redemptions - insert" on public.redemptions;

-- ------------------------------------------------------------
-- 3. view_claims — le bonus ne vient jamais du client
-- ------------------------------------------------------------
-- L'ecran Bonus doit pouvoir deposer une capture, mais surement pas
-- annoncer lui-meme combien de points elle vaut. On garde l'insertion,
-- limitee aux colonnes declaratives.
revoke insert on public.view_claims from authenticated;
revoke insert on public.view_claims from anon;
grant insert (story_event_id, user_id, screenshot_url) on public.view_claims to authenticated;

-- extracted_views, status et bonus_points restent au serveur : c'est la
-- verification (OCR / edge function) qui les renseigne.

-- ------------------------------------------------------------
-- 4. credit_story — le pendant de redeem_reward
-- ------------------------------------------------------------
-- Il n'existait aucun chemin legitime pour CREDITER des points : la
-- table story_events n'a pas de policy d'insertion et l'ecran
-- post-story se contentait d'incrementer une variable en memoire.
-- Cette fonction est le seul point d'entree autorise.
create or replace function public.credit_story(
  p_club uuid,
  p_kind text default 'story',
  p_views int default 0
)
returns table(story_id uuid, awarded int, new_balance int, new_lifetime int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_base  int  := 100;              -- socle par contenu publie
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

  -- Bornes dures : le client propose un nombre de vues, il ne le dicte pas.
  if p_views is null or p_views < 0 then
    p_views := 0;
  end if;
  if p_views > 100000 then
    p_views := 100000;
  end if;

  -- 20 points par tranche de 100 vues, plafonne.
  v_bonus := least((p_views / 100) * 20, 2000);
  v_total := v_base + v_bonus;

  insert into public.story_events (user_id, club_id, base_points, awarded_points)
  values (v_uid, p_club, v_base, v_total)
  returning id into v_id;

  update public.users
     set points_balance  = points_balance + v_total,
         lifetime_points = lifetime_points + v_total
   where id = v_uid
   returning points_balance, lifetime_points into v_bal, v_life;

  -- Classement hebdomadaire
  insert into public.leaderboard_entries (user_id, club_id, week_start_date, week_points)
  values (v_uid, p_club, v_week, v_total)
  -- ordre calque sur la cle primaire de leaderboard_entries
  on conflict (club_id, user_id, week_start_date)
  do update set week_points = public.leaderboard_entries.week_points + excluded.week_points;

  return query select v_id, v_total, v_bal, v_life;
end;
$$;

revoke all on function public.credit_story(uuid, text, int) from public;
grant execute on function public.credit_story(uuid, text, int) to authenticated;
