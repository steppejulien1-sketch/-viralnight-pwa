-- 0057 · Un scan du QR rapporte 20 points (25/09/2026).
--
-- Julien, 18/09/2026 : « une story, 100 points ; un scan du QR, 20 points ».
-- L'appli des gerants et l'affiche QR annoncaient 20, la base en creditait 15.
-- Un client qui compte ses points voyait la difference. Seul le montant
-- change ; le reste de la fonction est celui de 0043.

create or replace function public.checkin_scan(p_club_slug text)
returns table(deja_recupere boolean, points integer, club_nom text)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_club record;
  v_deja boolean;
  v_montant integer := 20;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select id, name into v_club from public.clubs where lower(slug) = lower(trim(p_club_slug)) limit 1;
  if v_club.id is null then
    raise exception 'club_introuvable';
  end if;

  select exists (
    select 1 from public.point_grants
    where user_id = v_uid and club_id = v_club.id and source = 'scan'
      and public.soiree_de(created_at) = public.soiree_de(now())
  ) into v_deja;

  if v_deja then
    return query select true, 0, v_club.name;
    return;
  end if;

  insert into public.point_grants (user_id, club_id, story_id, amount, unlocks_at, released, source)
  values (v_uid, v_club.id, null, v_montant, now(), false, 'scan');

  perform public.release_due_points(v_uid);

  return query select false, v_montant, v_club.name;
end;
$function$;
