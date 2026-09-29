-- ============================================================
-- 0060 — Les offres par e-mail des commerces (offre Pro, 30/09/2026)
--
-- Un commerce envoie une offre par e-mail (« −20 % ce mardi ») a ses
-- clients. Uniquement a ceux qui ont DIT OUI, lieu par lieu : c'est la
-- loi (RGPD + e-Privacy, prospection par e-mail = consentement prealable),
-- et c'est ce qui evite que Noctify devienne un robinet a spam.
--
-- consentements_offres : une ligne par (client, lieu). Le client la pose
--   lui-meme depuis la page du lieu dans l'appli (RLS : chacun les siennes).
--   Le lien « Se desabonner » de chaque e-mail la remet a false cote serveur.
-- offres_email : l'historique des envois d'un lieu. Lu et ecrit par le
--   serveur seulement (service_role) : aucune policy.
-- ============================================================

create table if not exists public.consentements_offres (
  user_id  uuid not null references public.users(id) on delete cascade,
  club_id  uuid not null references public.clubs(id) on delete cascade,
  accepte  boolean not null default false,
  maj_le   timestamptz not null default now(),
  primary key (user_id, club_id)
);

create index if not exists consentements_offres_club_idx
  on public.consentements_offres (club_id) where accepte;

alter table public.consentements_offres enable row level security;

drop policy if exists "consentements - lire les siens" on public.consentements_offres;
create policy "consentements - lire les siens"
  on public.consentements_offres for select using (auth.uid() = user_id);

drop policy if exists "consentements - poser les siens" on public.consentements_offres;
create policy "consentements - poser les siens"
  on public.consentements_offres for insert with check (auth.uid() = user_id);

-- using ET with check : on ne peut pas reattribuer sa ligne a un autre.
drop policy if exists "consentements - changer les siens" on public.consentements_offres;
create policy "consentements - changer les siens"
  on public.consentements_offres for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.offres_email (
  id              uuid primary key default gen_random_uuid(),
  club_id         uuid not null references public.clubs(id) on delete cascade,
  sujet           text not null check (char_length(sujet) between 1 and 120),
  message         text not null check (char_length(message) between 1 and 2000),
  cible           text not null check (cible in ('tous', 'absents')),
  destinataires   int not null default 0,
  envoyes         int not null default 0,
  erreur          text,
  cree_le         timestamptz not null default now()
);

create index if not exists offres_email_club_idx on public.offres_email (club_id, cree_le desc);

alter table public.offres_email enable row level security;
-- Aucune policy : seul le serveur (service_role) lit et ecrit.
