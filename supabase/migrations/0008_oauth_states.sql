-- ============================================================
-- 0008 — State OAuth cote serveur
-- ------------------------------------------------------------
-- Mon implementation rangeait le state anti-CSRF dans sessionStorage.
-- C'est fragile pour un OAuth mobile : TikTok et Instagram ouvrent
-- souvent leur ecran d'autorisation dans un navigateur externe ou un
-- onglet different, et le retour se fait alors dans un contexte ou
-- sessionStorage est VIDE -- la connexion echouait sans raison visible.
--
-- Le state vit donc en base : genere au depart, relie a rien d'autre
-- qu'a lui-meme (on est en connexion, l'utilisateur n'existe pas encore),
-- consomme une seule fois, expire au bout de 10 minutes.
--
-- Idee reprise du paquet fourni par Julien (viralnight-followers), qui
-- faisait ca correctement.
-- ============================================================

create table if not exists public.oauth_states (
  state       text primary key,
  provider    text not null check (provider in ('tiktok', 'instagram')),
  created_at  timestamptz not null default now()
);

alter table public.oauth_states enable row level security;

-- Aucune policy : seules les edge functions (service_role) y touchent.
-- Le client n'a ni a lire ni a ecrire un state.

create index if not exists oauth_states_created_idx
  on public.oauth_states(created_at);

-- Menage des states jamais consommes (onglet ferme en cours de route).
create or replace function public.purge_oauth_states()
returns void language sql security definer set search_path = public as $$
  delete from public.oauth_states where created_at < now() - interval '30 minutes';
$$;
