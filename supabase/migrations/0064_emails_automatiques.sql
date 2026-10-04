-- 0064 : les e-mails automatiques des commerces, facon Joyn (04/10/2026).
-- users.date_naissance : facultative, posee par le client dans ses Reglages,
--   sert seulement a l'e-mail d'anniversaire.
-- clubs.emails_auto : les reglages du gerant (quels e-mails partent, et le
--   coupon de chacun), ecrits par le serveur (api/credit-clubbeur.js).
-- emails_log : chaque e-mail parti, par client, lieu et type. Sert a ne pas
--   renvoyer le meme e-mail et aux statistiques du gerant. Serveur seul.
alter table public.users add column if not exists date_naissance date;
grant update (date_naissance) on public.users to authenticated;

alter table public.clubs add column if not exists emails_auto jsonb not null default '{}'::jsonb;

create table if not exists public.emails_log (
  id         bigserial primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  club_id    uuid not null references public.clubs(id) on delete cascade,
  type       text not null check (type in ('bienvenue', 'anniversaire', 'absents', 'hebdo', 'offre')),
  envoye_le  timestamptz not null default now()
);
create index if not exists emails_log_club_idx on public.emails_log (club_id, envoye_le desc);
create index if not exists emails_log_user_idx on public.emails_log (user_id, envoye_le desc);
alter table public.emails_log enable row level security;
-- Aucune policy : seul le serveur (service_role) lit et ecrit.
