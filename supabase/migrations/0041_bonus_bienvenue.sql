-- ============================================================
-- 0041 — Le bonus de bienvenue
-- ------------------------------------------------------------
-- Julien, 06/09/2026 : « la premiere fois qu'on arrive, qu'on se cree un
-- compte, qu'on puisse gagner cinquante points. » Puis, tout de suite
-- apres : « que ca reconnaisse [...] si il a deja cree un compte sur le
-- meme telephone, que ca ne lui redonne pas cinquante points [...] parce
-- que sinon il y en a qui vont essayer de tricher. »
--
-- Cinquante points, une seule fois par personne. C'est plus que six
-- jours de cadeau quotidien, et au-dessus du vestiaire offert (40) : ca
-- se triche donc, et ca vaut la peine d'etre triche.
--
-- ============================================================
-- CE QUI EMPECHE REELLEMENT LA TRICHE, ET CE QUI N'EMPECHE RIEN
-- ============================================================
--
-- 1. UN SEUL BONUS PAR COMPTE. La clef primaire (user_id). Increvable,
--    et sans interet pour le tricheur : il fait un second compte.
--
-- 2. UN SEUL BONUS PAR APPAREIL. L'appli envoie un identifiant tire au
--    hasard et garde dans le navigateur ; un index unique refuse le
--    second bonus qui le porte. ⚠️ CE GARDE-FOU EST FAIBLE ET IL FAUT LE
--    SAVOIR : vider les donnees du site, ou passer en navigation privee,
--    fabrique un appareil neuf. Il arrete celui qui se recree un compte
--    sans y penser, pas celui qui cherche a tricher.
--
-- 3. LE VRAI VERROU : PAS DE BONUS SANS CLUB. Les cinquante points sont
--    payes par un club, donc il en faut un -- et le seul moyen d'en
--    avoir un est d'avoir scanne son QR SUR PLACE. Recommencer, ce n'est
--    donc pas vider son navigateur : c'est retourner physiquement dans
--    le club, ressortir un compte, rescanner. Et chaque scan laisse une
--    ligne que le club voit passer. C'est ce qui rend le jeu peu
--    rentable, bien plus que l'identifiant d'appareil.
--
-- ⚠️ POURQUOI PAS DE LIMITE PAR ADRESSE IP. C'est le reflexe habituel,
-- et il serait ici une panne : dans un club, tout le monde est sur le
-- meme wifi. Une limite par IP refuserait le bonus a une file entiere de
-- vrais clients le soir de l'ouverture, exactement quand il sert. On ne
-- la pose pas.
--
-- ⚠️ CE QU'ON NE FAIT PAS NON PLUS : empreinte de navigateur (canvas,
-- polices, resolution). Ca se contourne aussi, ca casse a chaque mise a
-- jour de navigateur, et ca collecte sur des gens qui n'ont rien demande
-- des donnees qu'on n'a aucune raison de garder. Cinquante points ne
-- valent pas ca.
--
-- QUAND LES POINTS TOMBENT. A la creation du compte s'il y a deja un
-- club (le cas normal : on scanne le QR du club, l'appli s'ouvre, on
-- cree son compte) -- sinon ils ATTENDENT le premier scan. Personne ne
-- les perd, et aucun club ne paie pour quelqu'un qui n'est jamais venu.
-- ============================================================

create table if not exists public.welcome_bonuses (
  user_id     uuid primary key references public.users(id) on delete cascade,
  club_id     uuid not null references public.clubs(id) on delete cascade,
  amount      int  not null check (amount > 0),
  -- Tire au hasard par l'appli et garde dans le navigateur. Ni un
  -- numero de serie, ni une empreinte : juste un jeton, qui ne dit rien
  -- de l'appareil et ne sert qu'ici.
  device_hash text,
  created_at  timestamptz not null default now()
);

-- Un seul bonus par jeton d'appareil. Partiel : les lignes sans jeton
-- (vieux client, stockage vide) ne se bloquent pas entre elles -- mieux
-- vaut laisser passer que refuser un vrai client.
create unique index if not exists welcome_bonuses_device_uniq
  on public.welcome_bonuses (device_hash)
  where device_hash is not null;

alter table public.welcome_bonuses enable row level security;

-- Sa propre ligne, et rien d'autre : la table est une liste de jetons
-- d'appareils, elle n'a aucune raison d'etre lisible en entier.
drop policy if exists "own welcome - select" on public.welcome_bonuses;
create policy "own welcome - select"
  on public.welcome_bonuses for select using (auth.uid() = user_id);

comment on table public.welcome_bonuses is
  'Le bonus de bienvenue, une fois par personne (clef primaire) et une '
  'fois par jeton d''appareil (index unique partiel). Le jeton vient du '
  'navigateur : il arrete la recreation de compte distraite, pas la '
  'triche deliberee -- c''est l''obligation d''avoir scanne un club qui '
  'fait le vrai verrou.';

-- ------------------------------------------------------------
-- Le montant
-- ------------------------------------------------------------
-- Une fonction plutot qu'un nombre au milieu du code : le changer est
-- une decision commerciale, elle doit se trouver du premier coup.
create or replace function public.montant_bienvenue()
returns int language sql immutable as $$ select 50; $$;

-- ------------------------------------------------------------
-- Le bonus
-- ------------------------------------------------------------
create or replace function public.welcome_bonus(p_device text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_club   uuid;
  v_nom    text;
  v_device text := nullif(btrim(coalesce(p_device, '')), '');
  v_amount int  := public.montant_bienvenue();
begin
  if v_uid is null then
    return jsonb_build_object('etat', 'non_connecte');
  end if;

  if exists (select 1 from public.welcome_bonuses where user_id = v_uid) then
    return jsonb_build_object('etat', 'deja_pris');
  end if;

  -- Le club qui paie : le dernier frequente, comme pour le cadeau du
  -- jour. Sans club, le bonus n'est pas perdu -- il attend le premier
  -- scan, et l'appli le dit.
  select pg.club_id into v_club
    from public.point_grants pg
   where pg.user_id = v_uid
   order by pg.created_at desc
   limit 1;

  if v_club is null then
    return jsonb_build_object('etat', 'aucun_club', 'points', v_amount);
  end if;

  /* L'insertion arbitre, comme pour daily_gift : deux appels simultanes
     se disputent la clef primaire, et l'index d'appareil attrape le
     second compte du meme telephone. Crediter d'abord et noter ensuite
     donnerait les points deux fois sur la course. */
  begin
    insert into public.welcome_bonuses (user_id, club_id, amount, device_hash)
    values (v_uid, v_club, v_amount, v_device);
  exception
    when unique_violation then
      -- Deux causes possibles, et elles ne se disent pas pareil a
      -- l'ecran : le meme compte qui rejoue, ou un nouveau compte sur un
      -- telephone deja servi.
      if exists (select 1 from public.welcome_bonuses where user_id = v_uid) then
        return jsonb_build_object('etat', 'deja_pris');
      end if;
      return jsonb_build_object('etat', 'appareil_deja_servi');
  end;

  -- unlocks_at = maintenant : meme raison que le cadeau du jour, il n'y
  -- a rien a verifier sur un bonus de bienvenue.
  insert into public.point_grants (user_id, club_id, amount, unlocks_at, released)
  values (v_uid, v_club, v_amount, now(), false);

  perform public.release_due_points(v_uid);

  select c.name into v_nom from public.clubs c where c.id = v_club;

  return jsonb_build_object(
    'etat', 'ok', 'points', v_amount, 'club', coalesce(v_nom, ''));
end;
$$;

comment on function public.welcome_bonus is
  'Cinquante points a la premiere venue, payes par le club scanne. Une '
  'fois par compte et par appareil. Sans club, renvoie aucun_club : les '
  'points attendent le premier scan au lieu d''etre perdus.';

grant execute on function public.welcome_bonus(text) to authenticated;

-- ------------------------------------------------------------
-- Y a-t-il un bonus a prendre ?
-- ------------------------------------------------------------
-- Une lecture, pour que l'appli sache quoi afficher sans consommer le
-- bonus rien qu'en regardant.
create or replace function public.welcome_bonus_status(p_device text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_club   uuid;
  v_device text := nullif(btrim(coalesce(p_device, '')), '');
  v_amount int  := public.montant_bienvenue();
begin
  if v_uid is null then
    return jsonb_build_object('etat', 'non_connecte');
  end if;

  if exists (select 1 from public.welcome_bonuses where user_id = v_uid) then
    return jsonb_build_object('etat', 'deja_pris');
  end if;

  -- L'appareil a deja servi pour quelqu'un d'autre : on le dit ICI
  -- plutot que de laisser esperer cinquante points jusqu'au tap.
  if v_device is not null
     and exists (select 1 from public.welcome_bonuses where device_hash = v_device) then
    return jsonb_build_object('etat', 'appareil_deja_servi');
  end if;

  select pg.club_id into v_club
    from public.point_grants pg
   where pg.user_id = v_uid
   order by pg.created_at desc
   limit 1;

  if v_club is null then
    return jsonb_build_object('etat', 'aucun_club', 'points', v_amount);
  end if;

  return jsonb_build_object('etat', 'disponible', 'points', v_amount);
end;
$$;

grant execute on function public.welcome_bonus_status(text) to authenticated;
