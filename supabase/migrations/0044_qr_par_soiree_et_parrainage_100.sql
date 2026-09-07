-- ============================================================
-- 0044 — Un QR par soiree, et le parrainage a 100 points
-- ------------------------------------------------------------
-- Julien : « UN QR PAR SOIREE » et « quand tu parraines quelqu'un, c'est
-- pas cent cinquante points mais cent points, et que ca s'affiche aussi
-- dans les trucs [l'historique] ».
--
-- 1. LE SCAN SUIT LA MEME SOIREE QUE LA STORY. checkin_scan() bloquait
--    sur une fenetre de 12 heures glissantes : quelqu'un qui scannait a
--    23 h pouvait rescanner le lendemain a 11 h, et deux scans pouvaient
--    tomber dans la meme nuit. La regle devient la meme que pour les
--    stories (0042) : une par soiree, de 6 h a 6 h, heure de Bruxelles.
--
-- 2. LE PARRAINAGE PASSE DE 50 A 100 POINTS. L'appli en annonce 150
--    depuis un moment, la base en donnait 50 : personne n'avait raison.
--    Julien tranche a 100, des deux cotes.
--
-- 3. ET IL PASSE PAR point_grants. Les points de parrainage etaient
--    ajoutes DIRECTEMENT sur users.points_balance : aucun club ne les
--    payait, et ils n'apparaissaient nulle part dans l'historique --
--    exactement ce que Julien demande de corriger ("que ca s'affiche").
--    Ils suivent maintenant le meme chemin que tout le reste.
--
--    Quel club paie : le dernier frequente par le PARRAIN, comme le
--    cadeau du jour. S'il n'en a aucun (il a partage son lien sans
--    jamais scanner), c'est celui du filleul -- qui vient justement
--    d'arriver par un club. Si vraiment ni l'un ni l'autre, on retombe
--    sur l'ancien chemin direct plutot que de perdre les points.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Un scan par soiree
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

  /* UNE SOIREE, pas douze heures glissantes. Avec l'ancienne fenetre,
     un scan a 23 h laissait rescanner le lendemain a 11 h -- et surtout
     deux scans pouvaient tomber dans la meme nuit, ce que la regle
     "un QR par soiree" interdit. Meme decoupage que les stories (0042).

     `source = 'scan'` et non « story_id is null » : depuis le cadeau du
     jour, tous les grants sans story ne sont plus des scans (0043). */
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
$$;

comment on function public.checkin_scan is
  'Le scan du QR sur place : 15 points, UN PAR SOIREE et par club '
  '(soiree_de, de 6 h a 6 h). Remplace une fenetre de 12 h glissantes '
  'qui laissait deux scans tomber dans la meme nuit.';

-- ------------------------------------------------------------
-- 2 et 3. Le parrainage : 100 points, et dans l'historique
-- ------------------------------------------------------------
create or replace function public.montant_parrainage()
returns int language sql immutable as $$ select 100; $$;

comment on function public.montant_parrainage is
  'Ce que rapporte un filleul. Une fonction plutot qu''un nombre au '
  'milieu du code : le changer est une decision commerciale, elle doit '
  'se trouver du premier coup -- et l''appli affiche la meme valeur.';

create or replace function public.claim_referral(p_code text)
returns table(referrer_id uuid, referrer_handle text, awarded integer)
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_clean    text := trim(lower(p_code));
  v_referrer record;
  v_deja     uuid;
  v_club     uuid;
  v_points   int := public.montant_parrainage();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_clean is null or v_clean = '' then
    raise exception 'code_manquant';
  end if;

  select referred_by into v_deja from public.users where id = v_uid;
  if v_deja is not null then
    raise exception 'deja_parraine';
  end if;

  select id, handle into v_referrer
    from public.users
   where lower(handle) = v_clean
   limit 1;

  if v_referrer.id is null then
    raise exception 'introuvable';
  end if;

  if v_referrer.id = v_uid then
    raise exception 'soi_meme';
  end if;

  update public.users set referred_by = v_referrer.id where id = v_uid;

  /* Le club qui paie : le dernier frequente par le PARRAIN. A defaut,
     celui du filleul -- il vient justement d'arriver par un club. */
  select pg.club_id into v_club
    from public.point_grants pg
   where pg.user_id = v_referrer.id
   order by pg.created_at desc
   limit 1;

  if v_club is null then
    select pg.club_id into v_club
      from public.point_grants pg
     where pg.user_id = v_uid
     order by pg.created_at desc
     limit 1;
  end if;

  if v_club is not null then
    -- Le chemin normal : un grant comme les autres, donc visible dans
    -- l'historique et rattache a un club qui le paie.
    insert into public.point_grants (user_id, club_id, amount, unlocks_at, released, source)
    values (v_referrer.id, v_club, v_points, now(), false, 'parrainage');
    perform public.release_due_points(v_referrer.id);
  else
    /* Ni le parrain ni le filleul n'ont jamais scanne : aucun club a qui
       rattacher le grant, et point_grants.club_id est NOT NULL. On
       retombe sur l'ancien chemin direct -- mieux vaut des points sans
       ligne d'historique que pas de points du tout. */
    update public.users
       set points_balance  = points_balance + v_points,
           lifetime_points = lifetime_points + v_points
     where id = v_referrer.id;
  end if;

  -- Le parrain et le filleul se connaissent forcement : autant les
  -- rendre amis (meme table que 0031) plutot que de dupliquer la
  -- notion de relation.
  insert into public.friendships (user_id, friend_id) values (v_uid, v_referrer.id)
    on conflict (user_id, friend_id) do nothing;
  insert into public.friendships (user_id, friend_id) values (v_referrer.id, v_uid)
    on conflict (user_id, friend_id) do nothing;

  return query select v_referrer.id, v_referrer.handle, v_points;
end;
$$;

-- L'appli lit le montant plutot que de l'ecrire en dur : un seul
-- endroit ou le changer, et l'ecran ne peut plus mentir.
grant execute on function public.montant_parrainage() to anon, authenticated;
grant execute on function public.montant_bienvenue() to anon, authenticated;
