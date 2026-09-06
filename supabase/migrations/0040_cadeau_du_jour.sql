-- ============================================================
-- 0040 — Le cadeau du jour, en escalier
-- ------------------------------------------------------------
-- Julien, 06/09/2026 : « trouve un systeme de recompense pour les rendre
-- accro [...] tu peux meme changer les cinq points et mettre genre trois
-- points, puis cinq points, puis dix points. »
--
-- Ce n'est donc plus un tirage plat repete chaque jour, mais un ESCALIER
-- de sept jours qui recommence : 2, 3, 4, 5, 6, 8, puis 20. Manquer un
-- jour renvoie a la premiere marche.
--
-- POURQUOI UN ESCALIER PLUTOT QU'UN MONTANT FIXE. Ce qui ramene
-- quelqu'un, ce n'est pas la taille du cadeau -- c'est de VOIR la marche
-- suivante, et de savoir qu'un jour saute fait tout retomber. Les deux
-- ressorts qui font revenir (la marche visible, la perte) ne coutent
-- rien au club ; seul le montant coute. D'ou un escalier qui monte franc
-- et une depense qui, elle, ne bouge pas.
--
-- CE QUE CA COUTE, ET POURQUOI CE N'EST PAS PLUS QU'AVANT.
--   escalier  : 2+3+4+5+6+8+20 = 48 points par semaine, soit 6,86 / jour
--   jackpot   : 1 fois sur 100, le cadeau vaut 40 au lieu de sa marche
--   esperance : 0,99 x 6,86 + 0,01 x 40 = 7,19 points par jour
-- La version plate d'avant (5 / 10 / 20 / 35) revenait a 6,65 points par
-- jour. On change donc la FORME du cadeau, pas son prix.
--
-- ⚠️ CE QUE CA REPRESENTE POUR LE CLUB QUI PAIE. Les recompenses reelles
-- posees a la creation d'un club sont : vestiaire 40, shot 60, pinte 90,
-- cocktail 130. A 7,19 points par jour, quelqu'un qui ouvre l'appli tous
-- les jours sans jamais rien publier gagne un cocktail toutes les trois
-- semaines environ. C'est le prix de l'habitude, et il est paye par le
-- dernier club frequente. Les sept montants vivent dans une TABLE, pas
-- dans le code : un update suffit a les baisser, sans redeploiement.
--
-- ⚠️ LE TIRAGE ET LA MARCHE SE CALCULENT ICI, PAS DANS LE NAVIGATEUR.
-- Cote client, c'est un jackpot a volonte : il suffit de rappeler la
-- fonction jusqu'a tomber sur le bon nombre. Et une garde « un par
-- jour » posee dans le localStorage se contourne en vidant son
-- navigateur. La clef primaire (user_id, gift_date) est ce qui rend le
-- cadeau REELLEMENT quotidien -- c'est la base qui refuse le second.
--
-- ⚠️ PAS DE CADEAU SANS CLUB. Quelqu'un qui n'a jamais scanne de QR n'a
-- pas de « derniere boutique » : lui donner des points ferait payer une
-- recompense a un club qu'il n'a jamais visite. La fonction renvoie
-- alors `aucun_club` et l'appli l'invite a scanner.
-- ============================================================

-- ------------------------------------------------------------
-- L'escalier
-- ------------------------------------------------------------
-- Dans une table et pas dans une fonction : changer un montant est une
-- decision commerciale, elle ne doit pas demander un deploiement.
create table if not exists public.daily_gift_ladder (
  jour   int  primary key check (jour between 1 and 7),
  points int  not null check (points > 0)
);

insert into public.daily_gift_ladder (jour, points) values
  (1, 2), (2, 3), (3, 4), (4, 5), (5, 6), (6, 8), (7, 20)
on conflict (jour) do nothing;

alter table public.daily_gift_ladder enable row level security;

-- Lisible par tout le monde : l'appli dessine les sept marches, dont
-- celles a venir. Aucune policy d'ecriture -- ca se change a la main.
drop policy if exists "ladder - select" on public.daily_gift_ladder;
create policy "ladder - select"
  on public.daily_gift_ladder for select using (true);

comment on table public.daily_gift_ladder is
  'Les sept marches du cadeau du jour. Baisser un montant = un update '
  'ici, pas un deploiement. L''appli lit cette table pour dessiner les '
  'jours a venir.';

-- ------------------------------------------------------------
-- Les cadeaux deja pris
-- ------------------------------------------------------------
create table if not exists public.daily_gifts (
  user_id    uuid not null references public.users(id) on delete cascade,
  -- La DATE, pas un horodatage : c'est elle qui porte la regle « un par
  -- jour » dans la clef primaire.
  gift_date  date not null,
  club_id    uuid not null references public.clubs(id) on delete cascade,
  amount     int  not null check (amount > 0),
  jackpot    boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, gift_date)
);

-- La marche atteinte ce jour-la. C'est la ligne d'HIER qui dit quelle
-- marche vaut aujourd'hui : pas de compteur separe a tenir a jour, donc
-- rien qui puisse se desynchroniser de l'historique.
alter table public.daily_gifts add column if not exists jour int not null default 1;

alter table public.daily_gifts enable row level security;

-- Lecture seule, et seulement les siens -- meme regle que point_grants
-- (0011) et user_club_balance (0036). Aucune policy d'ecriture : seule
-- la fonction security definer ci-dessous y touche.
drop policy if exists "own gifts - select" on public.daily_gifts;
create policy "own gifts - select"
  on public.daily_gifts for select using (auth.uid() = user_id);

comment on table public.daily_gifts is
  'Un cadeau par personne et par jour. La clef primaire (user_id, '
  'gift_date) EST la garantie : la base refuse le second, aucune '
  'verification cote appli n''est necessaire ni suffisante.';

-- ------------------------------------------------------------
-- Quelle marche aujourd'hui ?
-- ------------------------------------------------------------
-- Pris hier -> la marche suivante, et on repart a 1 apres la septieme.
-- Rien hier -> retour a la premiere marche, quelle qu'ait ete la serie.
create or replace function public.jour_de_cycle(p_uid uuid)
returns int
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when g.jour >= 7 then 1 else g.jour + 1 end
       from public.daily_gifts g
      where g.user_id = p_uid
        and g.gift_date = current_date - 1),
    1);
$$;

comment on function public.jour_de_cycle is
  'La marche du jour, deduite de la ligne d''HIER. Aucun compteur '
  'separe : l''historique est la seule source, il ne peut pas mentir.';

-- ------------------------------------------------------------
-- Le montant
-- ------------------------------------------------------------
create or replace function public.tirer_cadeau(p_jour int)
returns table (amount int, jackpot boolean)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_marche int;
begin
  select l.points into v_marche from public.daily_gift_ladder l where l.jour = p_jour;
  v_marche := coalesce(v_marche, 2);

  -- Une fois sur cent, le cadeau du jour vaut 40 au lieu de sa marche.
  -- C'est la seule part de hasard : l'escalier, lui, est previsible, et
  -- c'est justement ce qui le rend tenable.
  if random() < 0.01 then
    return query select 40, true;
  end if;

  return query select v_marche, false;
end;
$$;

comment on function public.tirer_cadeau is
  'Le montant du cadeau : la marche du jour, ou 40 une fois sur cent. '
  'Separee de daily_gift() pour que la regle se lise et se change sans '
  'toucher a la mecanique de versement.';

-- ------------------------------------------------------------
-- Le cadeau
-- ------------------------------------------------------------
create or replace function public.daily_gift()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_today   date := current_date;
  v_club    uuid;
  v_nom     text;
  v_jour    int;
  v_amount  int;
  v_jackpot boolean;
begin
  if v_uid is null then
    return jsonb_build_object('etat', 'non_connecte');
  end if;

  -- Deja pris aujourd'hui : on le dit, on ne retire pas.
  if exists (select 1 from public.daily_gifts
              where user_id = v_uid and gift_date = v_today) then
    return jsonb_build_object('etat', 'deja_pris');
  end if;

  /* « La derniere boutique ou le client a ete » : le club du dernier
     point gagne. point_grants est alimente par checkin_scan (le scan du
     QR sur place) et par les stories validees -- dans les deux cas, la
     personne etait bien dans ce club. Le cadeau precedent en fait aussi
     partie, ce qui est voulu : sans nouvelle visite, les cadeaux
     continuent d'aller au meme club, et ils suivent des qu'on en
     frequente un autre. */
  select pg.club_id into v_club
    from public.point_grants pg
   where pg.user_id = v_uid
   order by pg.created_at desc
   limit 1;

  if v_club is null then
    return jsonb_build_object('etat', 'aucun_club');
  end if;

  v_jour := public.jour_de_cycle(v_uid);
  select t.amount, t.jackpot into v_amount, v_jackpot from public.tirer_cadeau(v_jour) t;

  /* L'insertion d'abord, et c'est elle qui arbitre : deux appels
     simultanes (deux onglets, un double tap) se disputent la meme clef
     primaire, le perdant ne recoit rien. Faire l'inverse -- crediter
     puis noter -- donnerait deux fois les points sur la course. */
  begin
    insert into public.daily_gifts (user_id, gift_date, club_id, amount, jackpot, jour)
    values (v_uid, v_today, v_club, v_amount, v_jackpot, v_jour);
  exception when unique_violation then
    return jsonb_build_object('etat', 'deja_pris');
  end;

  /* unlocks_at = maintenant : un cadeau qu'on ne peut pas depenser
     n'est pas un cadeau. Le delai de deblocage des clubs
     (clubs.points_lock_hours) existe pour les points de story, dont les
     vues doivent d'abord etre verifiees -- ici il n'y a rien a
     verifier. */
  insert into public.point_grants (user_id, club_id, amount, unlocks_at, released)
  values (v_uid, v_club, v_amount, now(), false);

  -- Le versement passe par la fonction existante : c'est elle qui tient
  -- users.points_balance ET user_club_balance a jour, on ne recopie pas
  -- sa logique ici.
  perform public.release_due_points(v_uid);

  select c.name into v_nom from public.clubs c where c.id = v_club;

  return jsonb_build_object(
    'etat', 'ok',
    'points', v_amount,
    'jackpot', v_jackpot,
    'jour', v_jour,
    'club', coalesce(v_nom, '')
  );
end;
$$;

comment on function public.daily_gift is
  'Le cadeau du jour, credite au dernier club frequente. Marche et '
  'tirage cote serveur, unicite garantie par la clef primaire de '
  'daily_gifts : rappeler la fonction ne donne rien de plus.';

grant execute on function public.daily_gift() to authenticated;

-- ------------------------------------------------------------
-- Est-ce qu'il reste un cadeau a prendre ?
-- ------------------------------------------------------------
-- Une lecture, pour que l'appli sache s'il faut afficher la carte sans
-- avoir a tenter le cadeau pour le decouvrir. Renvoie aussi l'escalier
-- entier et la marche du jour : l'appli dessine les sept jours d'un
-- coup, sans second aller-retour.
create or replace function public.daily_gift_status()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_club    uuid;
  v_jour    int;
  v_echelle jsonb;
  v_pris    boolean;
begin
  if v_uid is null then
    return jsonb_build_object('etat', 'non_connecte');
  end if;

  select jsonb_agg(jsonb_build_object('jour', l.jour, 'points', l.points) order by l.jour)
    into v_echelle from public.daily_gift_ladder l;
  v_echelle := coalesce(v_echelle, '[]'::jsonb);

  v_pris := exists (select 1 from public.daily_gifts
                     where user_id = v_uid and gift_date = current_date);

  -- Deja pris : la marche affichee est celle qui a ete JOUEE, pas la
  -- suivante -- sinon l'appli allumerait demain des ce soir.
  if v_pris then
    select g.jour into v_jour from public.daily_gifts g
     where g.user_id = v_uid and g.gift_date = current_date;
    return jsonb_build_object('etat', 'deja_pris', 'jour', v_jour, 'echelle', v_echelle);
  end if;

  select pg.club_id into v_club
    from public.point_grants pg
   where pg.user_id = v_uid
   order by pg.created_at desc
   limit 1;

  v_jour := public.jour_de_cycle(v_uid);

  if v_club is null then
    return jsonb_build_object('etat', 'aucun_club', 'jour', v_jour, 'echelle', v_echelle);
  end if;

  return jsonb_build_object('etat', 'disponible', 'jour', v_jour, 'echelle', v_echelle);
end;
$$;

grant execute on function public.daily_gift_status() to authenticated;
