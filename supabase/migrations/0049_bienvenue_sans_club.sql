-- ============================================================
-- 0049 — Le bonus de bienvenue se prend TOUT DE SUITE, meme sans club
-- ------------------------------------------------------------
-- Julien, 15/09/2026 : « il faut pas que les points arrivent au premier
-- scan, faut que les gens puissent recuperer direct, ca donne de la
-- dopamine ». La 0041 refusait le bonus tant qu'aucun club n'avait ete
-- scanne (« aucun_club ») : c'etait son verrou anti-triche le plus solide.
--
-- ⚠️ CE QUE CA CHANGE COTE TRICHE : sans club exige, un tricheur peut
-- reprendre 50 points en recreant un compte depuis une navigation privee
-- (le jeton d'appareil se contourne, voir 0041). Restent : un bonus par
-- compte, un par jeton d'appareil. Decision de Julien, prise en connaissance.
--
-- COMMENT, SANS CLUB : point_grants.club_id est NOT NULL, et tout ce qui
-- lit « le dernier club frequente » (cadeau du jour, parrainage) prendrait
-- une ligne sans club pour une absence de club. On ne touche donc PAS a
-- point_grants : comme claim_referral (0044) quand aucun club n'est connu,
-- le solde est credite directement. Avec un club, rien ne change : un grant
-- rattache au club, visible dans l'historique.
-- ============================================================

alter table public.welcome_bonuses alter column club_id drop not null;

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

  -- Le club qui paie, s'il y en a un : le dernier frequente.
  select pg.club_id into v_club
    from public.point_grants pg
   where pg.user_id = v_uid
   order by pg.created_at desc
   limit 1;

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

  if v_club is not null then
    insert into public.point_grants (user_id, club_id, amount, unlocks_at, released, source)
    values (v_uid, v_club, v_amount, now(), false, 'bienvenue');
    perform public.release_due_points(v_uid);
    select c.name into v_nom from public.clubs c where c.id = v_club;
  else
    update public.users
       set points_balance  = points_balance + v_amount,
           lifetime_points = lifetime_points + v_amount
     where id = v_uid;
  end if;

  return jsonb_build_object('etat', 'ok', 'points', v_amount, 'club', coalesce(v_nom, ''));
end;
$$;

comment on function public.welcome_bonus is
  'Cinquante points a la creation du compte, tout de suite (0049). Une fois '
  'par compte et par jeton d''appareil. Avec un club : grant rattache au club ; '
  'sans club : solde credite directement, comme claim_referral.';

create or replace function public.welcome_bonus_status(p_device text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_device text := nullif(btrim(coalesce(p_device, '')), '');
  v_amount int  := public.montant_bienvenue();
begin
  if v_uid is null then
    return jsonb_build_object('etat', 'non_connecte');
  end if;

  if exists (select 1 from public.welcome_bonuses where user_id = v_uid) then
    return jsonb_build_object('etat', 'deja_pris');
  end if;

  if v_device is not null
     and exists (select 1 from public.welcome_bonuses where device_hash = v_device) then
    return jsonb_build_object('etat', 'appareil_deja_servi');
  end if;

  -- Plus d'« aucun_club » : le bonus se prend des l'inscription.
  return jsonb_build_object('etat', 'disponible', 'points', v_amount);
end;
$$;

grant execute on function public.welcome_bonus(text) to authenticated;
grant execute on function public.welcome_bonus_status(text) to authenticated;
