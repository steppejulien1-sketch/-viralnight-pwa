-- ============================================================
-- 0050 — Un cadeau de bienvenue par COMPTE, plus de limite par telephone
-- ------------------------------------------------------------
-- Julien, 15/09/2026 : « pas besoin de 1 cadeau par appareil, on fait juste
-- la regle 1 cadeau par compte ». La limite par jeton d'appareil (0041)
-- privait un second compte cree sur le meme telephone -- un couple, des
-- amis qui se pretent un telephone, ou Julien qui teste -- et l'ecran
-- ressemblait a une panne.
--
-- Reste : la clef primaire (user_id), un bonus par compte. Le jeton
-- d'appareil est encore note (device_hash) mais ne bloque plus rien.
-- ============================================================

drop index if exists public.welcome_bonuses_device_uniq;

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

  -- Le club qui paie, s'il y en a un : le dernier frequente.
  select pg.club_id into v_club
    from public.point_grants pg
   where pg.user_id = v_uid
   order by pg.created_at desc
   limit 1;

  -- La clef primaire arbitre : deux appels simultanes du meme compte ne
  -- versent qu'une fois.
  begin
    insert into public.welcome_bonuses (user_id, club_id, amount, device_hash)
    values (v_uid, v_club, v_amount, v_device);
  exception
    when unique_violation then
      return jsonb_build_object('etat', 'deja_pris');
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
  'Cinquante points a la creation du compte, tout de suite. Une fois par '
  'compte (0050 : plus de limite par appareil). Avec un club : grant rattache '
  'au club ; sans club : solde credite directement, comme claim_referral.';

create or replace function public.welcome_bonus_status(p_device text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_amount int  := public.montant_bienvenue();
begin
  if v_uid is null then
    return jsonb_build_object('etat', 'non_connecte');
  end if;
  if exists (select 1 from public.welcome_bonuses where user_id = v_uid) then
    return jsonb_build_object('etat', 'deja_pris');
  end if;
  return jsonb_build_object('etat', 'disponible', 'points', v_amount);
end;
$$;

grant execute on function public.welcome_bonus(text) to authenticated;
grant execute on function public.welcome_bonus_status(text) to authenticated;
