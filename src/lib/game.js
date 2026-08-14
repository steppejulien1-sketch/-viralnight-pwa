// Chargement des données de gamification depuis Supabase (streak, badges,
// défis, classement). Nécessite une session (ensureSession).

import { supabase, isConfigured } from "./supabase.js";
import { ensureSession } from "./session.js";
import { currentClub, currentClubId } from "./club.js";

// Le club vient du QR scanne (lib/club.js), plus d'un slug ecrit en dur.
export async function clubId() {
  return currentClubId();
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

// Le club identifie par le QR. Retourne null si aucun QR n'a ete scanne :
// les ecrans doivent alors demander un scan, pas inventer un club.
export async function loadPublicClub() {
  return currentClub();
}

// Preuve chiffree publique d'un club. Agregats seulement, aucune ligne
// nominative (fonction SECURITY DEFINER, migration 0013).
//
// ⚠️ La fonction renvoie encore `views_total`, `best_views` et
// `best_points` : ces trois champs ne sont PLUS AFFICHES depuis le passage
// au forfait, et il ne faut pas les remettre sans y penser. `post-story.js`
// n'envoie plus aucun nombre de vues, donc `views_total` est FIGE, et le
// peu qui l'alimente encore (saisie du gerant a la validation) n'est
// verifie par personne. Voir le commentaire de `preuve()` dans
// `pages/landing.js`, et celui en tete de `owner/sections/stats.js` — le
// meme piege y a fige tout le tableau de bord du gerant.
export async function loadClubProof(clubUuid, jours = 30) {
  if (!isConfigured || !clubUuid) return null;
  try {
    const { data, error } = await supabase.rpc("get_club_proof", {
      p_club: clubUuid,
      p_days: jours,
    });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    return row || null;
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

// Badges AVEC leur progression (migration 0017).
//
// Ils ne sont plus octroyés par un déclencheur — il n'en existait AUCUN,
// donc rien ne se débloquait jamais — mais dérivés des données à la
// lecture. La progression vient avec : un cadenas ne dit pas quoi faire
// pour l'ouvrir, « 5 275 / 10 000 » si.
export async function loadMyBadges() {
  if (!isConfigured) return null;
  await ensureSession();
  const cid = await clubId();
  const { data, error } = await supabase.rpc("get_my_badges", { p_club: cid });
  return error ? null : data || [];
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

// Depose un contenu AVEC sa capture. Ne credite RIEN : la base cree une
// ligne en attente, c'est le club qui valide (migration 0014).
//
// L'ancienne voie (creditStory) permettait de se crediter soi-meme depuis
// le navigateur ; l'execution de credit_story a ete revoquee pour anon et
// authenticated. Ne pas la remettre.
export async function submitStory({ kind, views, file, url = "" }) {
  if (!isConfigured) return { error: "hors_ligne" };
  const s = await ensureSession();
  const uid = s?.user?.id;
  if (!uid) return { error: "not_authenticated" };
  if (!file) return { error: "proof_required" };

  const cid = await clubId();
  if (!cid) return { error: "club_introuvable" };

  // Bucket PRIVE. Le chemin est `{club}/{clubbeur}/{horodatage}` : c'est
  // LUI qui porte les droits (migration 0015). Le clubbeur relit son
  // dossier, le gerant lit le dossier de son club — aucune jointure, donc
  // aucune policy fragile. L'horodatage evite d'ecraser les depots
  // precedents : ils servent de trace en cas de litige.
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
  const chemin = `${cid}/${uid}/${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from("story-proofs")
    .upload(chemin, file, { contentType: file.type || "image/jpeg" });
  if (upErr) return { error: "upload:" + upErr.message };

  const { data, error } = await supabase.rpc("submit_story", {
    p_club: cid,
    p_kind: kind,
    p_views: Math.max(0, Math.round(Number(views) || 0)),
    p_proof: chemin,
    p_url: url || null,
  });
  if (error) return { error: error.message };

  // Remontee vers le dashboard du gerant (site B2B).
  //
  // Elle partait avant depuis creditStory(), devenue INJOIGNABLE : la
  // migration 0014 a revoque l'execution de credit_story pour anon et
  // authenticated. Plus rien n'appelait donc le pont, et il serait reste
  // inerte meme une fois b2b_public_code renseigne.
  //
  // C'est bien le clubbeur qui appelle, pas le gerant : push-submission
  // verifie que l'appelant est l'AUTEUR de la story (story.user_id === uid).
  // Depuis l'ecran de validation, le gerant prendrait un not_your_story.
  //
  // Au mieux, volontairement : si la remontee echoue, le depot reste
  // valable cote PWA et l'erreur est tracee dans story_events.push_error.
  // Le B2B insere en 'pending' et n'attribue aucun point avant sa propre
  // validation par le staff -- les deux economies restent separees.
  //
  // Seuls Reels et TikToks peuvent traverser : la route B2B valide le
  // domaine du lien, et une story Instagram n'a pas d'URL publique.
  if (url && data) {
    supabase.functions
      .invoke("push-submission", { body: { story_id: data } })
      .catch(() => {});
  }

  return { storyId: data };
}

// Contenus en attente de validation pour le clubbeur connecte.
export async function loadMyPending() {
  if (!isConfigured) return [];
  const uid = await myId();
  if (!uid) return [];
  const { data } = await supabase
    .from("story_events")
    .select("id, mentioned_at, kind, views")
    .eq("user_id", uid)
    .eq("verified", false)
    .order("mentioned_at", { ascending: false });
  return data || [];
}

// Profil du clubbeur connecte : solde, cumul et nombre d'abonnes.
// follower_count est ECRIT uniquement par les edge functions de connexion
// (migration 0009) ou par `declare_followers`. Ici on ne fait que le lire.
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

// Historique reel du clubbeur : ses soirees, de la plus recente a la plus
// ancienne. Sert au profil (compteur) et au dashboard (liste).
export async function loadMyHistory(limite = 20) {
  if (!isConfigured) return null;
  const uid = await myId();
  if (!uid) return null;
  const { data, error } = await supabase
    .from("story_events")
    // `verified` est INDISPENSABLE : un depot en attente de validation a
    // awarded_points = 0 (migration 0014). Sans ce champ, l'historique
    // l'affichait « +0 » — alors que l'ecran d'envoi promet de le
    // retrouver ici « marque en attente ».
    .select("id, mentioned_at, awarded_points, kind, views, verified")
    .eq("user_id", uid)
    .order("mentioned_at", { ascending: false })
    .limit(limite);
  return error ? null : data || [];
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
