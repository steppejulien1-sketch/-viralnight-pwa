-- ============================================================
-- 0040 — Le cadeau du jour
-- ------------------------------------------------------------
-- Julien, 06/09/2026 : « cadeau du jour, trente points par exemple [...]
-- tu cliques sur un truc ou il faut mettre recuperer et c'est assez gros
-- et une fois que tu as recuperé, ca disparait, ca laisse place a la
-- boutique. Et le lendemain, ca reapparait a dix heures. »
--
-- Trois regles, et chacune a une consequence en base :
--
--   1. LE MONTANT EST ANNONCE AVANT d'etre pris ("trente points" ecrit
--      sur la carte, puis on appuie sur Recuperer). Le tirage ne peut
--      donc plus etre au hasard a l'instant du clic : il doit etre
--      DETERMINISTE, sinon il suffit de rafraichir la page jusqu'a
--      tomber sur le jackpot. Voir montant_cadeau().
--   2. LA JOURNEE DU CADEAU COMMENCE A 10 H, pas a minuit. Voir
--      jour_cadeau().
--   3. UNE FOIS PRIS, LA CARTE DISPARAIT. C'est cote appli, mais c'est
--      la meme idee que le reste : une carte « reviens demain » affichee
--      en permanence devient un meuble, et un meuble ne se touche plus.
--
-- L'ESCALIER. Le montant n'est pas fixe : 2, 3, 4, 5, 6, 8, puis 20 le
-- septieme jour, et on recommence. Manquer un jour renvoie a la premiere
-- marche. Ce qui ramene quelqu'un n'est pas la taille du cadeau, c'est
-- de VOIR la marche suivante et de savoir qu'un jour saute la fait
-- retomber -- deux ressorts qui ne coutent rien au club, alors que le
-- montant, lui, coute.
--
-- CE QUE CA COUTE.
--   escalier  : 2+3+4+5+6+8+20 = 48 points par semaine, soit 6,86 / jour
--   jackpot   : 1 fois sur 100, le cadeau vaut 40 au lieu de sa marche
--   esperance : 0,99 x 6,86 + 0,01 x 40 = 7,19 points par jour
--
-- ⚠️ CE QUE CA REPRESENTE POUR LE CLUB QUI PAIE. Les recompenses posees
-- a la creation d'un vrai club sont : vestiaire 40, shot 60, pinte 90,
-- cocktail 130. A 7,19 points par jour, quelqu'un qui ouvre l'appli tous
-- les jours sans jamais rien publier gagne un cocktail toutes les trois
-- semaines environ. C'est le prix de l'habitude, et il est paye par le
-- dernier club frequente. Les sept montants vivent dans une TABLE, pas
-- dans le code : un update suffit a les baisser, sans redeploiement.
--
-- ⚠️ PAS DE CADEAU SANS CLUB. Quelqu'un qui n'a jamais scanne de QR n'a
-- pas de « derniere boutique » : lui donner des points ferait payer une
-- recompense a un club qu'il n'a jamais visite. La fonction renvoie
-- alors `aucun_club` et l'appli l'invite a scanner.
-- ============================================================

-- ------------------------------------------------------------
-- La journee du cadeau commence a 10 h
-- ------------------------------------------------------------
-- Julien : « tous les jours a dix heures, il y a un cadeau. » Donc la
-- journee du cadeau n'est pas la journee civile : elle va de 10 h a
-- 10 h. Avant 10 h, on est encore dans la journee de la veille -- et
-- celui qui n'a pas pris son cadeau d'hier peut donc encore le prendre
-- le matin. C'est voulu : on ne punit pas quelqu'un qui se couche a 4 h.
--
-- ⚠️ EN HEURE DE PARIS, pas en UTC. La base tourne en UTC : 10 h y
-- tomberait a midi l'ete et 11 h l'hiver cote clubbeur, et le cadeau
-- changerait d'heure deux fois par an sans que personne comprenne.
create or replace function public.jour_cadeau()
returns date
language sql stable as $$
  select case
    when (now() at time zone 'Europe/Paris')::time >= time '10:00'
      then (now() at time zone 'Europe/Paris')::date
    else (now() at time zone 'Europe/Paris')::date - 1
  end;
$$;

comment on function public.jour_cadeau is
  'La journee du cadeau, de 10 h a 10 h, heure de Paris. Remplace '
  'current_date partout ici : sinon le cadeau reapparaitrait a minuit.';

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
  -- La journee du cadeau (jour_cadeau(), pas current_date) : c'est elle
  -- qui porte la regle « un par jour » dans la clef primaire.
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
  'Un cadeau par personne et par journee de cadeau. La clef primaire '
  '(user_id, gift_date) EST la garantie : la base refuse le second, '
  'aucune verification cote appli n''est necessaire ni suffisante.';

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
        and g.gift_date = public.jour_cadeau() - 1),
    1);
$$;

comment on function public.jour_de_cycle is
  'La marche du jour, deduite de la ligne d''HIER. Aucun compteur '
  'separe : l''historique est la seule source, il ne peut pas mentir.';

-- ------------------------------------------------------------
-- Le montant — TIRAGE DETERMINISTE
-- ------------------------------------------------------------
-- ⚠️ CETTE FONCTION NE DOIT JAMAIS UTILISER random().
--
-- La carte ANNONCE le montant avant qu'on appuie sur « Recuperer ».
-- Avec un tirage au hasard a chaque appel, il suffirait de rafraichir la
-- page jusqu'a lire « 40 points » puis de cliquer : jackpot a volonte.
--
-- Le hasard vient donc du COUPLE (personne, journee) passe dans un md5 :
-- imprevisible pour la personne, mais toujours identique pour le meme
-- couple. daily_gift_status() peut l'annoncer, daily_gift() le verse, et
-- les deux tombent forcement d'accord.
--
-- bit(28) et non bit(32) : sur 32 bits le cast donne un entier SIGNE,
-- et le modulo d'un negatif ne tombe pas dans 0..99. 28 bits restent
-- toujours positifs.
create or replace function public.montant_cadeau(p_uid uuid, p_jour date, p_marche int)
returns table (amount int, jackpot boolean)
language sql stable as $$
  select case when d.gagne then 40 else p_marche end, d.gagne
  from (
    select (('x' || substr(md5(p_uid::text || p_jour::text || 'cadeau-noctify'), 1, 7))::bit(28)::int % 100) = 0
      as gagne
  ) d;
$$;

comment on function public.montant_cadeau is
  'Le montant du cadeau : la marche du jour, ou 40 une fois sur cent. '
  'DETERMINISTE (md5 du couple personne+journee) : c''est ce qui permet '
  'd''annoncer le montant avant de le donner sans ouvrir un re-tirage '
  'a volonte. Ne jamais y mettre random().';

-- ------------------------------------------------------------
-- Le cadeau
-- ------------------------------------------------------------
create or replace function public.daily_gift()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_jourcal date := public.jour_cadeau();
  v_club    uuid;
  v_nom     text;
  v_jour    int;
  v_marche  int;
  v_amount  int;
  v_jackpot boolean;
begin
  if v_uid is null then
    return jsonb_build_object('etat', 'non_connecte');
  end if;

  -- Deja pris aujourd'hui : on le dit, on ne retire pas.
  if exists (select 1 from public.daily_gifts
              where user_id = v_uid and gift_date = v_jourcal) then
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
  select l.points into v_marche from public.daily_gift_ladder l where l.jour = v_jour;
  v_marche := coalesce(v_marche, 2);
  select m.amount, m.jackpot into v_amount, v_jackpot
    from public.montant_cadeau(v_uid, v_jourcal, v_marche) m;

  /* L'insertion d'abord, et c'est elle qui arbitre : deux appels
     simultanes (deux onglets, un double tap) se disputent la meme clef
     primaire, le perdant ne recoit rien. Faire l'inverse -- crediter
     puis noter -- donnerait deux fois les points sur la course. */
  begin
    insert into public.daily_gifts (user_id, gift_date, club_id, amount, jackpot, jour)
    values (v_uid, v_jourcal, v_club, v_amount, v_jackpot, v_jour);
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
  'Le cadeau du jour, credite au dernier club frequente. Montant '
  'deterministe et unicite garantie par la clef primaire de '
  'daily_gifts : rappeler la fonction ne donne rien de plus.';

grant execute on function public.daily_gift() to authenticated;

-- ------------------------------------------------------------
-- Ce qu'il y a a prendre, et combien
-- ------------------------------------------------------------
-- Renvoie le MONTANT en plus de l'etat : la carte l'annonce avant que la
-- personne appuie. C'est sans risque parce que montant_cadeau() est
-- deterministe -- rafraichir ne change rien.
create or replace function public.daily_gift_status()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := auth.uid();
  v_jourcal date := public.jour_cadeau();
  v_club    uuid;
  v_jour    int;
  v_marche  int;
  v_amount  int;
  v_jackpot boolean;
  v_echelle jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('etat', 'non_connecte');
  end if;

  select jsonb_agg(jsonb_build_object('jour', l.jour, 'points', l.points) order by l.jour)
    into v_echelle from public.daily_gift_ladder l;
  v_echelle := coalesce(v_echelle, '[]'::jsonb);

  if exists (select 1 from public.daily_gifts
              where user_id = v_uid and gift_date = v_jourcal) then
    return jsonb_build_object('etat', 'deja_pris', 'echelle', v_echelle);
  end if;

  select pg.club_id into v_club
    from public.point_grants pg
   where pg.user_id = v_uid
   order by pg.created_at desc
   limit 1;

  v_jour := public.jour_de_cycle(v_uid);
  select l.points into v_marche from public.daily_gift_ladder l where l.jour = v_jour;
  v_marche := coalesce(v_marche, 2);
  select m.amount, m.jackpot into v_amount, v_jackpot
    from public.montant_cadeau(v_uid, v_jourcal, v_marche) m;

  if v_club is null then
    return jsonb_build_object(
      'etat', 'aucun_club', 'jour', v_jour, 'points', v_amount,
      'jackpot', v_jackpot, 'echelle', v_echelle);
  end if;

  return jsonb_build_object(
    'etat', 'disponible', 'jour', v_jour, 'points', v_amount,
    'jackpot', v_jackpot, 'echelle', v_echelle);
end;
$$;

grant execute on function public.daily_gift_status() to authenticated;
