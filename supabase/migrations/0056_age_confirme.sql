-- 0056 · Confirmation d'age (25/09/2026).
--
-- Les recompenses sont souvent de l'alcool. Apple refuse une appli qui pousse
-- des mineurs a boire (regle 1.4.3). L'age n'etait verifie que dans les CGU.
-- L'appli demande maintenant « J'ai 18 ans ou plus » une fois par compte ; la
-- date de la reponse est gardee ici.

alter table public.users add column if not exists majeur_confirme_at timestamptz;

create or replace function public.confirmer_majorite()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  update public.users set majeur_confirme_at = coalesce(majeur_confirme_at, now()) where id = auth.uid();
end;
$$;
grant execute on function public.confirmer_majorite() to authenticated;

create or replace function public.majorite_confirmee()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select majeur_confirme_at is not null from public.users where id = auth.uid()), false);
$$;
grant execute on function public.majorite_confirmee() to authenticated;
