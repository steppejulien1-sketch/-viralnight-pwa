// Chargement des données de gamification depuis Supabase (streak, badges,
// défis, classement). Nécessite une session (ensureSession).

import { supabase, isConfigured } from "./supabase.js";
import { ensureSession } from "./session.js";
import { CLUB } from "./mock.js";

let _clubId = null;

export async function clubId() {
  if (_clubId) return _clubId;
  const { data } = await supabase.from("clubs").select("id").eq("slug", CLUB.slug).maybeSingle();
  _clubId = data?.id || null;
  return _clubId;
}

export async function myId() {
  const s = await ensureSession();
  return s?.user?.id || null;
}

// --- Lecture PUBLIQUE, sans session ------------------------------------
// L'ecran d'accueil est vu AVANT toute inscription : il ne doit jamais
// appeler ensureSession(), sinon on declencherait une connexion pour un
// visiteur qui n'a encore rien demande. La RLS autorise la lecture des
// clubs et des recompenses actives avec la seule cle anon.
//
// Tout echec renvoie null : l'accueil retombe alors sur ses donnees de
// demonstration. C'est le premier ecran apres le scan du QR, il ne peut
// pas se permettre d'afficher une erreur ou un ecran vide.

export async function loadPublicClub(slug = CLUB.slug) {
  if (!isConfigured) return null;
  try {
    const { data } = await supabase
      .from("clubs")
      .select("id, name, city, ig_handle")
      .eq("slug", slug)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

// Recompenses actives d'un club, de la moins chere a la plus chere.
// On ecarte celles hors de leur fenetre de validite et celles en rupture :
// afficher une recompense qu'on ne peut pas prendre est une promesse creuse.
export async function loadPublicRewards(clubUuid) {
  if (!isConfigured || !clubUuid) return null;
  try {
    const nowISO = new Date().toISOString();
    const { data, error } = await supabase
      .from("rewards")
      .select("id, title, cost_points, category, stock_remaining, valid_from, valid_until")
      .eq("club_id", clubUuid)
      .eq("active", true)
      .order("cost_points");
    if (error || !data) return null;

    return data.filter(
      (r) =>
        (r.stock_remaining === null || r.stock_remaining > 0) &&
        (!r.valid_from || r.valid_from <= nowISO) &&
        (!r.valid_until || r.valid_until >= nowISO)
    );
  } catch {
    return null;
  }
}

// Streak courant du clubbeur pour ce club.
export async function loadStreak() {
  if (!isConfigured) return null;
  await ensureSession();
  const cid = await clubId();
  const uid = await myId();
  if (!cid || !uid) return null;
  const { data } = await supabase
    .from("streaks")
    .select("current_streak, longest_streak")
    .eq("club_id", cid)
    .eq("user_id", uid)
    .maybeSingle();
  return data || { current_streak: 0, longest_streak: 0 };
}

// Défi actif du club (le plus proche de sa fin).
export async function loadActiveChallenge() {
  if (!isConfigured) return null;
  await ensureSession();
  const cid = await clubId();
  if (!cid) return null;
  const { data } = await supabase
    .from("challenges")
    .select("*")
    .eq("club_id", cid)
    .eq("active", true)
    .lte("starts_at", new Date().toISOString())
    .gte("ends_at", new Date().toISOString())
    .order("ends_at")
    .limit(1)
    .maybeSingle();
  return data || null;
}

// Catalogue de badges + ceux débloqués par le user.
export async function loadBadges() {
  if (!isConfigured) return { all: [], unlocked: new Set() };
  await ensureSession();
  const uid = await myId();
  const [{ data: all }, { data: mine }] = await Promise.all([
    supabase.from("badges").select("*").order("sort"),
    supabase.from("user_badges").select("badge_id").eq("user_id", uid),
  ]);
  return { all: all || [], unlocked: new Set((mine || []).map((m) => m.badge_id)) };
}

// Classement hebdo du club + ma position.
export async function loadLeaderboard() {
  if (!isConfigured) return { rows: [], me: null };
  await ensureSession();
  const cid = await clubId();
  const uid = await myId();
  const monday = mondayISO();
  // Passe par une fonction SECURITY DEFINER : la RLS de `users` interdit
  // de lire le handle des autres clubbeurs via une jointure classique.
  const { data } = await supabase.rpc("get_leaderboard", { p_club: cid, p_week: monday });
  const rows = (data || []).map((r) => ({
    rank: Number(r.rank),
    handle: r.handle || "clubbeur",
    points: r.week_points,
    isMe: r.user_id === uid,
  }));
  return { rows, me: rows.find((r) => r.isMe) || null };
}

function mondayISO() {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // 0 = lundi
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
}

// Compte à rebours lisible ("2j 4h", "5h 12m", "18m").
export function countdown(endsAt) {
  const ms = new Date(endsAt) - new Date();
  if (ms <= 0) return "terminé";
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = m % 60;
  if (d > 0) return `${d}j ${h}h`;
  if (h > 0) return `${h}h ${mm}m`;
  return `${mm}m`;
}

// Credite une story publiee : ecrit story_events, le solde et le classement
// dans la meme transaction cote base (fonction credit_story, security definer).
//
// On ne fait PAS un update de users depuis le client : la migration 0004 le
// bloque justement, parce que n'importe qui pouvait sinon s'attribuer des
// points. Le nombre de vues est une PROPOSITION, la base le plafonne.
//
// Retourne { awarded, balance, lifetime } ou null si Supabase n'est pas
// configure (mode demo hors ligne), et { error } si l'appel echoue.
export async function creditStory(views = 0, kind = "story", url = "") {
  if (!isConfigured) return null;
  await ensureSession();
  const cid = await clubId();
  if (!cid) return null;

  const n = Number(views);
  const { data, error } = await supabase.rpc("credit_story", {
    p_club: cid,
    // La base rejette tout type hors story/reel/tiktok : on n'invente pas
    // de repli ici, une erreur vaut mieux qu'un credit au mauvais tarif.
    p_kind: kind,
    p_views: Number.isFinite(n) && n > 0 ? Math.round(n) : 0,
    p_url: url || null,
  });
  if (error) return { error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  // Remontee vers le dashboard du gerant (site B2B). Volontairement en
  // "au mieux" : si elle echoue, le clubbeur garde ses points. L'erreur
  // est tracee dans story_events.push_error, pas perdue.
  if (url && row.story_id) {
    supabase.functions
      .invoke("push-submission", { body: { story_id: row.story_id } })
      .catch(() => {});
  }

  return {
    awarded: row.awarded,
    balance: row.new_balance,
    lifetime: row.new_lifetime,
    storyId: row.story_id,
    unlocksAt: row.unlocks_at || null,
  };
}

// Profil du clubbeur connecte : solde, cumul et nombre d'abonnes.
// follower_count est ECRIT uniquement par les edge functions de connexion
// (migration 0009). Ici on ne fait que le lire.
export async function loadMyProfile() {
  if (!isConfigured) return null;
  const uid = await myId();
  if (!uid) return null;
  const { data } = await supabase
    .from("users")
    .select("handle, points_balance, lifetime_points, follower_count, follower_source")
    .eq("id", uid)
    .maybeSingle();
  return data || null;
}

// Points gagnes mais pas encore depensables, et date du prochain deblocage.
// Voir migration 0011 : le gain d'une soiree n'est utilisable qu'apres le
// delai fixe par le club (12 h par defaut), pour qu'il ne soit pas depense
// le soir meme, avant que le contenu ait genere la moindre vue.
export async function loadPendingPoints() {
  if (!isConfigured) return { pending: 0, nextUnlock: null };
  const uid = await myId();
  if (!uid) return { pending: 0, nextUnlock: null };

  // On verse d'abord ce qui est arrive a echeance, sinon le clubbeur
  // verrait encore "en attente" des points deja disponibles.
  await supabase.rpc("release_due_points", { p_uid: uid });

  const { data } = await supabase.rpc("my_pending_points");
  const row = Array.isArray(data) ? data[0] : data;
  return {
    pending: Number(row?.pending || 0),
    nextUnlock: row?.next_unlock || null,
  };
}

// "dans 4 h", "dans 35 min", "bientot" — pour annoncer le deblocage.
export function untilLabel(iso) {
  if (!iso) return "";
  const ms = new Date(iso) - new Date();
  if (ms <= 0) return "maintenant";
  const m = Math.round(ms / 60000);
  if (m < 60) return `dans ${m} min`;
  const hStr = Math.round(m / 60);
  return `dans ${hStr} h`;
}
