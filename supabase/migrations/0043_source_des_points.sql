-- ============================================================
-- 0043 — D'ou viennent les points (et une regression a reparer)
-- ------------------------------------------------------------
-- Julien veut un historique des points cote appli. `point_grants` dit
-- combien et pour quel club, jamais POURQUOI : impossible d'ecrire
-- "+15 scan" ou "+5 cadeau" sans deviner. D'ou une colonne `source`.
--
-- ⚠️ ET UNE REGRESSION INTRODUITE PAR 0040/0041, A REPARER ICI.
-- checkin_scan() decide si le QR a deja ete scanne recemment ainsi :
--
--     exists (select 1 from point_grants
--              where user_id = ... and club_id = ...
--                and story_id is null
--                and created_at > now() - interval '12 hours')
--
-- « story_id is null » voulait dire « un scan » -- c'etait vrai tant que
-- les scans etaient les seuls grants sans story. Depuis hier, le cadeau
-- du jour et le bonus de bienvenue en creent aussi. Consequence : QUI A
-- PRIS SON CADEAU DU JOUR NE POUVAIT PLUS SCANNER LE QR DU MEME CLUB
-- pendant douze heures -- la fonction repondait deja_recupere = true,
-- zero point, sans rien expliquer. La colonne `source` rend le test
-- explicite au lieu de reposer sur une coincidence.
--
-- ⚠️ CE QUE CETTE MIGRATION NE TRANCHE PAS : claim_referral() donne 50
-- points au parrain, alors que l'appli en annonce 150 -- et elle les
-- ajoute DIRECTEMENT sur users.points_balance, sans passer par
-- point_grants. Donc : aucun club ne paie ces points, et ils
-- n'apparaitront pas dans l'historique. C'est une decision de produit
-- (quel montant, qui paie), pas un detail technique : elle attend
-- Julien. Rien n'est change ici.
-- ============================================================

alter table public.point_grants add column if not exists source text;

comment on column public.point_grants.source is
  'D''ou vient le grant : scan, story, cadeau, bienvenue, instagram. '
  'Sert l''historique cote appli ET le controle anti-rescan de '
  'checkin_scan(), qui reposait avant sur "story_id is null".';

-- Rattrapage de l'existant. Avant aujourd'hui, les seuls grants sans
-- story etaient des scans : le cadeau et le bonus n'existaient pas.
update public.point_grants set source = 'story' where source is null and story_id is not null;
update public.point_grants set source = 'scan'  where source is null and story_id is null;

create index if not exists point_grants_user_source_idx
  on public.point_grants (user_id, source, created_at desc);

-- ------------------------------------------------------------
-- checkin_scan : le test redevient explicite
-- ------------------------------------------------------------
create or replace function public.checkin_scan(p_club_slug text)
returns table(deja_recupere boolean, points integer, club_nom text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_club record;
  v_deja boolean;
  v_montant integer := 15;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id, name into v_club from public.clubs where lower(slug) = lower(trim(p_club_slug)) limit 1;
  if v_club.id is null then
    raise exception 'club_introuvable';
  end if;

  /* SOURCE = 'scan', et non plus « story_id is null ».
     Voir l'entete : depuis le cadeau du jour, « pas de story » ne veut
     plus dire « un scan ». */
  select exists (
    select 1 from public.point_grants
    where user_id = v_uid and club_id = v_club.id and source = 'scan'
      and created_at > now() - interval '12 hours'
  ) into v_deja;

  if v_deja then
    return query select true, 0, v_club.name;
    return;
  end if;

  -- released=false + unlocks_at=now() (pas true en dur) : c'est
  -- release_due_points(), le vrai mecanisme deja construit qui
  -- alimente users.points_balance, qui doit gerer ce grant -- sinon il
  -- reste invisible du solde pour toujours (aucun trigger ne le fait
  -- automatiquement, verifie).
  insert into public.point_grants (user_id, club_id, story_id, amount, unlocks_at, released, source)
  values (v_uid, v_club.id, null, v_montant, now(), false, 'scan');

  perform public.release_due_points(v_uid);

  return query select false, v_montant, v_club.name;
end;
$$;

-- ------------------------------------------------------------
-- Le cadeau et le bonus signent leurs grants
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

  if exists (select 1 from public.daily_gifts
              where user_id = v_uid and gift_date = v_jourcal) then
    return jsonb_build_object('etat', 'deja_pris');
  end if;

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

  begin
    insert into public.daily_gifts (user_id, gift_date, club_id, amount, jackpot, jour)
    values (v_uid, v_jourcal, v_club, v_amount, v_jackpot, v_jour);
  exception when unique_violation then
    return jsonb_build_object('etat', 'deja_pris');
  end;

  insert into public.point_grants (user_id, club_id, amount, unlocks_at, released, source)
  values (v_uid, v_club, v_amount, now(), false, 'cadeau');

  perform public.release_due_points(v_uid);

  select c.name into v_nom from public.clubs c where c.id = v_club;

  return jsonb_build_object(
    'etat', 'ok', 'points', v_amount, 'jackpot', v_jackpot,
    'jour', v_jour, 'club', coalesce(v_nom, ''));
end;
$$;

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

  select pg.club_id into v_club
    from public.point_grants pg
   where pg.user_id = v_uid
   order by pg.created_at desc
   limit 1;

  if v_club is null then
    return jsonb_build_object('etat', 'aucun_club', 'points', v_amount);
  end if;

  begin
    insert into public.welcome_bonuses (user_id, club_id, amount, device_hash)
    values (v_uid, v_club, v_amount, v_device);
  exception
    when unique_violation then
      if exists (select 1 from public.welcome_bonuses where user_id = v_uid) then
        return jsonb_build_object('etat', 'deja_pris');
      end if;
      return jsonb_build_object('etat', 'appareil_deja_servi');
  end;

  insert into public.point_grants (user_id, club_id, amount, unlocks_at, released, source)
  values (v_uid, v_club, v_amount, now(), false, 'bienvenue');

  perform public.release_due_points(v_uid);

  select c.name into v_nom from public.clubs c where c.id = v_club;

  return jsonb_build_object('etat', 'ok', 'points', v_amount, 'club', coalesce(v_nom, ''));
end;
$$;

-- ------------------------------------------------------------
-- L'historique, cote appli
-- ------------------------------------------------------------
-- Julien : "l'historique des points". On voit un solde, jamais d'ou il
-- vient -- et c'est ce qui rend un compte de fidelite credible, en plus
-- de couper court aux "j'ai pas eu mes points".
create or replace function public.historique_points(p_limite int default 40)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_lignes jsonb;
begin
  if v_uid is null then
    return jsonb_build_object('etat', 'non_connecte');
  end if;

  select coalesce(jsonb_agg(l order by l_ordre desc), '[]'::jsonb) into v_lignes
  from (
    select jsonb_build_object(
             'quand',  pg.created_at,
             'points', pg.amount,
             'source', coalesce(pg.source, 'points'),
             'club',   coalesce(c.name, ''),
             -- Un grant non libere est deja gagne mais pas encore
             -- depensable : le dire evite le "j'ai pas eu mes points".
             'en_attente', (pg.released = false and pg.unlocks_at > now())
           ) as l,
           pg.created_at as l_ordre
      from public.point_grants pg
      left join public.clubs c on c.id = pg.club_id
     where pg.user_id = v_uid
     order by pg.created_at desc
     limit greatest(1, least(coalesce(p_limite, 40), 200))
  ) t;

  return jsonb_build_object('etat', 'ok', 'lignes', v_lignes);
end;
$$;

grant execute on function public.historique_points(int) to authenticated;

-- ------------------------------------------------------------
-- Le compteur de parrainage
-- ------------------------------------------------------------
-- Julien : "le compteur de parrainage". C'est ce qui fait rouvrir
-- l'ecran d'invitation : sans lui, on partage un lien dans le vide.
--
-- ⚠️ Ne renvoie PAS de total de points : claim_referral() les ajoute
-- directement sur users.points_balance sans passer par point_grants, et
-- pour un montant (50) qui contredit celui affiche dans l'appli (150).
-- Annoncer un total ici reviendrait a choisir entre les deux a la place
-- de Julien. Le nombre d'amis, lui, n'est pas ambigu.
create or replace function public.mes_parrainages()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null then
    return jsonb_build_object('etat', 'non_connecte');
  end if;

  select count(*) into v_n from public.users where referred_by = v_uid;

  return jsonb_build_object('etat', 'ok', 'amis', coalesce(v_n, 0));
end;
$$;

grant execute on function public.mes_parrainages() to authenticated;
