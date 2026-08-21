-- ============================================================
-- 0036 — Solde de points par club (etape 1 : lecture en parallele)
-- ------------------------------------------------------------
-- CONTEXTE. users.points_balance est un solde UNIQUE, partage entre
-- tous les clubs frequentes : des points gagnes au Club A sont
-- depensables dans la boutique du Club B, qui n'a rien fait pour les
-- meriter. Julien veut un solde SEPARE par club (chaque boite finance
-- ses propres recompenses avec l'activite de SES clients).
--
-- point_grants (0011) suit deja club_id par grant -- la granularite
-- existe. Ce qui manque, c'est un solde par club a lire, et un point
-- ou l'alimenter au deblocage.
--
-- PORTEE DE CETTE MIGRATION. Additive seulement, rien de casse :
--   - release_due_points continue de crediter users.points_balance
--     EXACTEMENT comme avant (meme calcul, meme colonne) ;
--   - elle alimente EN PLUS user_club_balance, en parallele.
-- redeem_reward n'est PAS touchee : la depense continue de debiter le
-- solde global. La bascule du cote depense (et la question de ce que
-- deviennent les soldes globaux deja acquis) est une decision separee,
-- pas encore prise.
-- ============================================================

create table if not exists public.user_club_balance (
  user_id        uuid not null references public.users(id) on delete cascade,
  club_id        uuid not null references public.clubs(id) on delete cascade,
  points_balance int  not null default 0 check (points_balance >= 0),
  updated_at     timestamptz not null default now(),
  primary key (user_id, club_id)
);

alter table public.user_club_balance enable row level security;

-- Lecture seule, et seulement le sien -- comme point_grants (0011).
-- Aucune policy d'ecriture : seule release_due_points (security
-- definer) y touche, jamais le client directement.
drop policy if exists "own club balance - select" on public.user_club_balance;
create policy "own club balance - select"
  on public.user_club_balance for select using (auth.uid() = user_id);

-- release_due_points change de forme (boucle au lieu d'un UPDATE en
-- bloc, necessaire pour connaitre le club_id de chaque grant qui
-- mature) mais son comportement observable est identique : meme
-- signature, meme valeur de retour, users.points_balance credite du
-- meme montant qu'avant.
create or replace function public.release_due_points(p_uid uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_uid, auth.uid());
  v_sum int := 0;
  rec record;
begin
  if v_uid is null then return 0; end if;

  -- released=true est pose DANS la boucle : deux appels simultanes ne
  -- peuvent pas verser deux fois le meme grant (meme garantie qu'avant,
  -- l'UPDATE ligne par ligne reste atomique par ligne).
  for rec in
    update public.point_grants
       set released = true
     where user_id = v_uid
       and released = false
       and unlocks_at <= now()
    returning club_id, amount
  loop
    v_sum := v_sum + rec.amount;

    insert into public.user_club_balance (user_id, club_id, points_balance)
    values (v_uid, rec.club_id, rec.amount)
    on conflict (user_id, club_id)
    do update set points_balance = public.user_club_balance.points_balance + excluded.points_balance,
                  updated_at = now();
  end loop;

  if v_sum > 0 then
    update public.users set points_balance = points_balance + v_sum where id = v_uid;
  end if;

  return v_sum;
end $$;

revoke all on function public.release_due_points(uuid) from public;
grant execute on function public.release_due_points(uuid) to authenticated;

-- Lecture du solde pour UN club -- ce que la boutique appellera une
-- fois la vraie bascule decidee. Fait aussi murir les grants de ce
-- club au passage (meme reflexe que redeem_reward), pour ne jamais
-- afficher un solde en retard d'un cycle de deblocage.
create or replace function public.my_club_balance(p_club uuid)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  perform public.release_due_points(v_uid);
  return coalesce(
    (select points_balance from public.user_club_balance
      where user_id = v_uid and club_id = p_club),
    0
  );
end $$;

revoke all on function public.my_club_balance(uuid) from public;
grant execute on function public.my_club_balance(uuid) to authenticated;
