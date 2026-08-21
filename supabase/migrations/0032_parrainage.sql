-- ============================================================
-- 0032 — Parrainage : inviter par lien, gagner des points
-- ------------------------------------------------------------
-- Chaque clubbeur a un lien perso (?parrain=<son-pseudo>). Quand
-- quelqu'un cree un compte via ce lien, claim_referral() credite le
-- PARRAIN (pas le filleul -- demande de Julien : "on gagne des points"
-- au sujet de la personne qui invite).
--
-- Comme add_friend (0031), c'est security definer : le client ne credite
-- jamais ses propres points (voir 0004, credit_story). referred_by
-- n'est pas dans la liste des colonnes ecrivables par le client
-- (grant update (handle, email) uniquement) -- seule cette fonction
-- peut la poser, une seule fois par compte.
-- ============================================================

alter table public.users
  add column if not exists referred_by uuid references public.users(id);

-- Valeur du parrainage : alignee sur le socle d'une story (credit_story,
-- v_base = 100) -- amener un clubbeur vaut autant qu'un contenu publie.
-- Modifiable ici seul si Julien veut un autre montant.
create or replace function public.claim_referral(p_code text)
returns table(referrer_id uuid, referrer_handle text, awarded int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_clean    text := trim(lower(p_code));
  v_referrer record;
  v_deja     uuid;
  v_points   int := 100;
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

  update public.users
     set points_balance  = points_balance + v_points,
         lifetime_points = lifetime_points + v_points
   where id = v_referrer.id;

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

revoke all on function public.claim_referral(text) from public;
grant execute on function public.claim_referral(text) to authenticated;
