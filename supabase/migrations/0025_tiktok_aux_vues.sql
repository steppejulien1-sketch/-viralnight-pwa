-- 0025 — Les TikToks sont payés aux VUES RÉELLES. Le reste garde le forfait.
--
-- DÉCISION DE JULIEN (2026-08-14) : « fais l'app TikTok, mais celle-ci avec
-- les vues ». Barème choisi : **60 pts + 7 pts / 100 vues**, bonus plafonné
-- à 2 000 — exactement celui d'avant le forfait, donc personne ne perd ce
-- que l'app promettait ce matin encore.
--
-- ⚠️ POURQUOI TIKTOK PEUT, ET PAS LES AUTRES. La 0020 a supprimé le calcul
-- aux vues pour une raison précise : le chiffre était DÉCLARÉ par le
-- clubbeur, donc invérifiable et gonflable. TikTok change ça — et rien que
-- ça : son API rend le `view_count` de la vidéo, mesuré par TikTok. Une
-- story Instagram n'a même pas d'URL publique ; un Reel n'expose pas ses
-- vues. La distinction n'est donc pas un caprice de format, c'est la
-- présence ou non d'une source vérifiable.
--
-- ⚠️ RÈGLE ABSOLUE, À NE JAMAIS ASSOUPLIR :
-- **seules les vues écrites par l'API TikTok entrent dans le calcul.**
-- C'est le rôle de `views_source = 'tiktok_api'`. Un nombre saisi à la main
-- — par le clubbeur (impossible depuis la 0024) ou par le gérant (champ
-- « vues constatées », purement indicatif) — reste dans `views` et ne
-- touche JAMAIS au montant. Sans ce cloisonnement, on rouvre exactement la
-- faille que la 0020 avait fermée.
--
-- REPLI CHOISI PAR JULIEN : pas de vue vérifiée -> **60 pts au forfait**,
-- comme aujourd'hui. Tant que l'app TikTok n'est pas validée, rien ne
-- casse : les TikToks sont payés comme avant, et le gérant garde la main
-- sur le montant (0022).

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Où atterrit un chiffre de vues VÉRIFIÉ
-- ═══════════════════════════════════════════════════════════════════════
-- Colonne SÉPARÉE de `views` (déclaratif) : les mélanger reviendrait à
-- rendre indiscernable ce qui a été mesuré de ce qui a été affirmé.
alter table public.story_events
  add column if not exists verified_views    integer,
  add column if not exists views_source      text,
  add column if not exists views_checked_at  timestamptz;

comment on column public.story_events.verified_views is
  'Vues mesurées par la plateforme (API). SEULE source admise pour le '
  'calcul des points. `views` reste déclaratif et sans effet.';

-- ═══════════════════════════════════════════════════════════════════════
-- 2. Les jetons TikTok, pour pouvoir relire les vues plus tard
-- ═══════════════════════════════════════════════════════════════════════
-- `tiktok-auth` jetait l'access_token une fois le profil créé (« on a ce
-- qu'il fallait »). C'était vrai tant qu'on ne voulait que le pseudo et
-- les abonnés. Pour lire les vues d'une vidéo publiée PLUS TARD, il faut
-- pouvoir rappeler l'API au nom du clubbeur.
create table if not exists public.social_tokens (
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null check (provider in ('tiktok', 'instagram')),
  open_id       text,
  access_token  text not null,
  refresh_token text,
  scope         text,
  expires_at    timestamptz,
  updated_at    timestamptz not null default now(),
  primary key (user_id, provider)
);

-- ⚠️ TABLE À SECRETS : aucun accès client, jamais. RLS activée SANS
-- AUCUNE POLICY — donc tout est refusé — et les droits sont retirés
-- explicitement. Seules les edge functions (service_role) y touchent.
-- Un access_token TikTok lisible par le navigateur donnerait à n'importe
-- qui le droit d'agir sur le compte TikTok du clubbeur.
alter table public.social_tokens enable row level security;
revoke all on public.social_tokens from public, anon, authenticated;
grant all on public.social_tokens to service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Le barème
-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️ TOUJOURS L'UNIQUE SOURCE DE VÉRITÉ. `lib/bareme.js` ne fait
-- qu'annoncer ce que cette fonction calcule (voir son en-tête).
create or replace function public.story_points(p_kind text, p_views integer)
returns integer
language sql
immutable
set search_path to 'public'
as $function$
  select case lower(p_kind)
           when 'story'  then 100
           when 'reel'   then  60
           -- TikTok : socle + 7 pts par tranche de 100 vues VÉRIFIÉES,
           -- bonus plafonné à 2 000. `p_views` null (aucune vue vérifiée)
           -- retombe sur le socle seul — c'est le repli choisi.
           when 'tiktok' then 60 + least(
                                  (greatest(coalesce(p_views, 0), 0) / 100) * 7,
                                  2000)
         end;
$function$;

comment on function public.story_points(text, integer) is
  'Barème. story/reel au forfait (p_views ignoré). tiktok : 60 + 7 pts / '
  '100 vues, plafond de bonus 2 000. N''accepter QUE des vues vérifiées.';

-- ═══════════════════════════════════════════════════════════════════════
-- 4. La validation utilise les vues vérifiées, et elles seules
-- ═══════════════════════════════════════════════════════════════════════
drop function if exists public.review_story(uuid, boolean, integer, integer);

create or replace function public.review_story(
  p_story   uuid,
  p_approve boolean,
  p_views   integer default null,
  p_points  integer default null
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
  -- ⚠️ BORNE DE SAISIE HUMAINE UNIQUEMENT (0022 : attraper le zéro de
  -- trop). Elle ne s'applique PAS au montant calculé par le barème :
  -- un TikTok au plafond vaut 2 060 (60 + 2 000), et une borne à 2 000
  -- aurait fait échouer la validation des vidéos les plus virales —
  -- exactement les contenus que le club veut récompenser.
  c_max constant int := 2100;
begin
  select s.club_id, s.user_id, s.kind, s.verified, s.verified_views, s.views_source
    into v_club, v_user, v_kind, v_verified, v_vues_verifiees, v_source
    from public.story_events s
   where s.id = p_story;

  if v_club is null then raise exception 'unknown_story'; end if;
  if not public.owns_club(v_club) then raise exception 'not_owner'; end if;
  if v_verified then raise exception 'already_reviewed'; end if;

  if not p_approve then
    update public.view_claims set status = 'rejected' where story_event_id = p_story;
    update public.story_events set awarded_points = 0, views = 0 where id = p_story;
    return query select 0, null::integer, null::timestamptz;
    return;
  end if;

  -- Historique seulement. Ne touche pas au montant (0020).
  select coalesce(p_views, extracted_views, 0) into v_views
    from public.view_claims where story_event_id = p_story;

  -- ⚠️ LE MONTANT NE PEUT VENIR QUE D'UNE MESURE. On n'utilise
  -- `verified_views` que si une API l'a écrite (`views_source`). Sans
  -- cette condition, une future colonne remplie a la main paierait.
  v_forfait := public.story_points(
                 v_kind,
                 case when v_source = 'tiktok_api' then v_vues_verifiees end);
  if v_forfait is null then raise exception 'invalid_kind'; end if;

  -- Le gérant garde le dernier mot (0022). La borne ne contrôle QUE sa
  -- saisie : le montant calculé par le barème est borné par construction.
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

  -- ⚠️ week_start_date, PAS week (bug 42703 corrigé par la 0016).
  insert into public.leaderboard_entries (user_id, club_id, week_start_date, week_points)
  values (v_user, v_club, date_trunc('week', now())::date, v_total)
  on conflict (user_id, club_id, week_start_date)
  do update set week_points = public.leaderboard_entries.week_points + excluded.week_points;

  return query select v_total, v_life, v_unlock;
end;
$function$;

-- ═══════════════════════════════════════════════════════════════════════
-- 5. La file du gérant montre les vues mesurées
-- ═══════════════════════════════════════════════════════════════════════
drop function if exists public.get_pending_stories(uuid);

create or replace function public.get_pending_stories(p_club uuid)
returns table(
  story_id uuid, handle text, kind text, declared_views integer,
  ocr_views integer, ocr_error text, proof_path text, url text,
  submitted_at timestamptz,
  verified_views integer, views_source text, suggested_points integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.owns_club(p_club) then raise exception 'not_owner'; end if;

  return query
  select s.id, u.handle, s.kind, c.extracted_views, c.ocr_views, c.ocr_error,
         c.screenshot_url, s.url, s.mentioned_at,
         s.verified_views, s.views_source,
         -- Le montant que la validation versera si le gérant ne touche à
         -- rien : calculé ICI, pour que l'écran ne le recalcule pas de son
         -- côté (c'était déjà une source de divergence, cf. bareme.js).
         public.story_points(
           s.kind,
           case when s.views_source = 'tiktok_api' then s.verified_views end)
    from public.story_events s
    join public.view_claims c on c.story_event_id = s.id
    join public.users u on u.id = s.user_id
   where s.club_id = p_club
     and s.verified = false
     and c.status = 'pending'
   order by s.mentioned_at;
end;
$function$;

-- Droits reposés à l'identique après les `drop` (l'ACL ne survit pas).
grant execute on function public.review_story(uuid, boolean, integer, integer)
  to anon, authenticated, service_role;
grant execute on function public.get_pending_stories(uuid)
  to anon, authenticated, service_role;
-- Filet : le verrou de la 0014 doit survivre à tout remplacement.
revoke execute on function public.credit_story(uuid, text, integer, text)
  from anon, authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- VÉRIFICATION
-- ═══════════════════════════════════════════════════════════════════════
--   select public.story_points('tiktok', null);   -- 60  (repli)
--   select public.story_points('tiktok', 5000);   -- 410
--   select public.story_points('tiktok', 999999); -- 2060 (bonus plafonné)
--   select public.story_points('story', 999999);  -- 100 (forfait intact)
