-- ============================================================
-- 0045 — Ce que Julien veut voir : installations, ouvertures, departs
-- ------------------------------------------------------------
-- Julien, 13/09/2026 : « je n'ai pas un compte ou j'ai toutes les donnees
-- rassemblees [...] le nombre de telechargements de l'application, le
-- nombre de personnes qui ont quitte l'application, les raisons pour
-- lesquelles ils ont quitte ».
--
-- Deux choses que la base ne savait pas :
--
-- 1. COMBIEN D'APPAREILS ONT L'APPLI. Tant qu'elle n'est pas sur les
--    stores, il n'y a pas de « telechargement » a compter : il y a des
--    telephones qui l'ont posee sur l'ecran d'accueil. L'appli note
--    - « installation » : la premiere fois qu'elle tourne en plein ecran
--      (iPhone : navigator.standalone ; Android : l'evenement
--      appinstalled ou le display-mode standalone). Une par appareil.
--    - « ouverture » : une par appareil et par jour, installee ou non.
--      C'est ce qui donne les actifs du jour / de la semaine / du mois.
--    ⚠️ LIMITES A CONNAITRE. Une desinstallation ne se voit pas (le web
--    ne le dit pas). Sur iPhone, Safari et l'appli installee ont deux
--    stockages separes : le meme telephone compte pour deux appareils
--    s'il ouvre les deux. Et un jeton d'appareil se fabrique en vidant
--    son navigateur : ce sont des ordres de grandeur, pas une comptabilite.
--    Le jeton est tire au hasard (vn_stat), DISTINCT de celui du bonus de
--    bienvenue : les statistiques ne doivent pas pouvoir servir a retrouver
--    qui a touche quel bonus.
--
-- 2. POURQUOI LES GENS PARTENT. La suppression de compte envoyait deja un
--    e-mail. Ici on garde la raison pour les compter dans le temps -- SANS
--    rien qui identifie la personne (ni id, ni pseudo, ni e-mail) : elle
--    vient d'exercer son droit a l'effacement, on ne garde que des chiffres.
--    Ecrit par api/credit-clubbeur.js (cle service), jamais par l'appli.
-- ============================================================

create table if not exists public.app_evenements (
  id          bigint generated always as identity primary key,
  type        text not null check (type in ('installation', 'ouverture')),
  appareil    text not null check (length(appareil) between 8 and 64),
  plateforme  text not null default 'autre' check (plateforme in ('iphone', 'android', 'ordinateur', 'autre')),
  installee   boolean not null default false,
  -- Le jour de Bruxelles, pas celui de Greenwich : une ouverture a 0 h 30
  -- compte pour le jour qu'affiche le telephone, pas pour la veille.
  jour        date not null default ((now() at time zone 'Europe/Paris')::date),
  created_at  timestamptz not null default now()
);

-- Une installation par appareil, une ouverture par appareil et par jour.
-- L'appli peut donc renvoyer sans compter : la base ne double rien.
create unique index if not exists app_evenements_installation_uniq
  on public.app_evenements (appareil) where type = 'installation';
create unique index if not exists app_evenements_ouverture_jour_uniq
  on public.app_evenements (appareil, jour) where type = 'ouverture';
create index if not exists app_evenements_type_jour_idx
  on public.app_evenements (type, jour);

-- RLS sans aucune policy : invisible et inecrivable en direct, meme
-- connecte. On n'y entre que par noter_evenement, on n'en lit que par
-- la cle service (tableau de bord admin).
alter table public.app_evenements enable row level security;

create or replace function public.noter_evenement(
  p_type text, p_appareil text, p_plateforme text, p_installee boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_type is null or p_type not in ('installation', 'ouverture') then return; end if;
  if p_appareil is null or length(p_appareil) not between 8 and 64 then return; end if;
  insert into public.app_evenements (type, appareil, plateforme, installee)
  values (
    p_type,
    p_appareil,
    case when p_plateforme in ('iphone', 'android', 'ordinateur') then p_plateforme else 'autre' end,
    coalesce(p_installee, false)
  )
  on conflict do nothing;
end $$;

revoke all on function public.noter_evenement(text, text, text, boolean) from public;
-- anon aussi : on veut compter les ouvertures AVANT la creation du compte.
grant execute on function public.noter_evenement(text, text, text, boolean) to anon, authenticated;


create table if not exists public.departs (
  id                bigint generated always as identity primary key,
  motif             text not null check (motif in ('doublon', 'aucun_etablissement', 'pas_de_story', 'plus_utilise', 'autre', 'inconnu')),
  commentaire       text check (commentaire is null or length(commentaire) <= 500),
  anciennete_jours  int,
  points_perdus     int,
  points_gagnes     int,
  stories           int,
  etablissements    int,
  amis_invites      int,
  venu_par_ami      boolean,
  created_at        timestamptz not null default now()
);
create index if not exists departs_created_idx on public.departs (created_at desc);

alter table public.departs enable row level security;
