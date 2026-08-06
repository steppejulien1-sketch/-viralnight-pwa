// Connexion sociale : "Continuer avec TikTok" / "avec Instagram".
//
// FLUX (revu apres le paquet viralnight-followers fourni par Julien)
//   1. la PWA POST sur l'edge function -> elle cree un state EN BASE et
//      renvoie l'URL d'autorisation
//   2. redirection vers TikTok / Instagram
//   3. le reseau redirige vers l'EDGE FUNCTION (pas vers la PWA)
//   4. la fonction echange le code, cree l'utilisateur, et renvoie le
//      navigateur sur le lien de session Supabase
//   5. la PWA se retrouve connectee, avec ?social_connected=... dans l'URL
//
// POURQUOI PAS DE STATE DANS sessionStorage
// Sur mobile, l'ecran d'autorisation s'ouvre souvent dans un navigateur
// externe : le retour se fait dans un contexte ou sessionStorage est VIDE.
// Ma premiere version echouait donc silencieusement. Le state vit en base.
//
// ⚠️ Instagram n'accepte QUE les comptes professionnels (Createur ou
// Business) depuis la fermeture de Basic Display, le 4 decembre 2024.
// TikTok, lui, est ouvert a tous : il est donc propose en premier.

import { supabase, isConfigured } from "./supabase.js";

const PROVIDERS = {
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    ico: "tiktok",
    fn: "tiktok-auth",
    // Seule la presence de la cle publique sert a savoir si le bouton est
    // actif. Tout le reste (secret, redirect_uri) vit cote serveur.
    ready: Boolean(import.meta.env.VITE_TIKTOK_CLIENT_KEY),
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    ico: "instagram",
    fn: "instagram-auth",
    ready: Boolean(import.meta.env.VITE_INSTAGRAM_APP_ID),
  },
};

// Les deux boutons sont toujours renvoyes : l'ecran les affiche meme non
// configures, et l'indique au tap. Voir onboarding.js.
export function availableProviders() {
  return Object.values(PROVIDERS).map((p) => ({
    ...p,
    ready: Boolean(isConfigured && p.ready),
  }));
}

export function providerReady(id) {
  const p = PROVIDERS[id];
  return Boolean(isConfigured && p && p.ready);
}

// Demande l'URL d'autorisation puis redirige. Retourne un message
// d'erreur, ou null si la redirection est partie.
export async function startSocialLogin(providerId) {
  const p = PROVIDERS[providerId];
  if (!p) return "Réseau inconnu.";
  if (!isConfigured) return "L'app n'est pas reliée à sa base.";

  const { data, error } = await supabase.functions.invoke(p.fn, { body: {} });

  if (error) return `Connexion ${p.label} indisponible pour le moment.`;
  if (data?.error) return data.message || `Connexion ${p.label} indisponible.`;
  if (!data?.authorize_url) return `Réponse ${p.label} incomplète.`;

  window.location.href = data.authorize_url;
  return null;
}

// Retour de flux : la session est deja ouverte par Supabase, il ne reste
// qu'a lire le resultat et nettoyer l'URL.
export function readSocialReturn() {
  const q = new URLSearchParams(window.location.search);
  const ok = q.get("social_connected");
  const err = q.get("social_error");
  if (!ok && !err) return null;

  window.history.replaceState({}, "", window.location.pathname);

  if (ok) return { ok: true, provider: ok };
  return { ok: false, message: messageFor(err) };
}

function messageFor(code) {
  switch (code) {
    case "cancelled":
      return "Connexion annulée.";
    case "expired_state":
      return "La connexion a expiré. Recommence.";
    case "invalid_state":
      return "Retour invalide. Recommence.";
    case "not_configured":
      return "Cette connexion n'est pas encore activée.";
    case "token_failed":
    case "info_failed":
      return "Le réseau a refusé la connexion. Réessaie dans un instant.";
    case "ig_pro_required":
      return (
        "Instagram a refusé : ton compte doit être Créateur ou Professionnel. " +
        "C'est gratuit et ça se change en 30 secondes dans Instagram " +
        "(Paramètres › Type de compte). Ou connecte-toi avec TikTok."
      );
    case "no_username":
      return "Impossible de lire ton pseudo.";
    case "session_failed":
      return "Impossible d'ouvrir la session. Réessaie.";
    default:
      return "La connexion n'a pas abouti. Réessaie.";
  }
}
