// Connexion sociale : "Continuer avec Instagram" / "avec TikTok".
//
// Les secrets des apps Meta et TikTok ne peuvent pas vivre ici : l'echange
// du code se fait dans les edge functions instagram-auth / tiktok-auth.
// Ce module gere l'aller (redirection) et le retour (code -> session).
//
// ⚠️ DIFFERENCE ENTRE LES DEUX RESEAUX, verifiee en aout 2026 :
//   Instagram — l'API Basic Display est fermee depuis le 4 decembre 2024.
//     Son remplacant n'accepte QUE les comptes professionnels (Createur
//     ou Business). Un compte personnel sera refuse. Le passage en compte
//     Createur est gratuit, instantane, sans page Facebook.
//   TikTok — Login Kit accorde user.info.basic par defaut et n'exige
//     aucun compte professionnel. Ouvert a tout le monde.
// C'est pourquoi TikTok est propose en premier dans l'interface.

import { supabase, isConfigured } from "./supabase.js";

const PROVIDERS = {
  tiktok: {
    id: "tiktok",
    label: "TikTok",
    ico: "tiktok",
    fn: "tiktok-auth",
    appId: import.meta.env.VITE_TIKTOK_CLIENT_KEY || "",
    redirect: import.meta.env.VITE_TIKTOK_REDIRECT_URI || "",
    authorize: "https://www.tiktok.com/v2/auth/authorize/",
    scope: "user.info.basic",
    // TikTok nomme son identifiant d'app "client_key" et non "client_id".
    idParam: "client_key",
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    ico: "instagram",
    fn: "instagram-auth",
    appId: import.meta.env.VITE_INSTAGRAM_APP_ID || "",
    redirect: import.meta.env.VITE_INSTAGRAM_REDIRECT_URI || "",
    authorize: "https://www.instagram.com/oauth/authorize",
    scope: "instagram_business_basic",
    idParam: "client_id",
  },
};

// Un reseau n'est propose que s'il est reellement configure : mieux vaut
// pas de bouton qu'un bouton qui echoue.
export function availableProviders() {
  if (!isConfigured) return [];
  return Object.values(PROVIDERS).filter((p) => p.appId && p.redirect);
}

export function startSocialLogin(providerId) {
  const p = PROVIDERS[providerId];
  if (!p || !p.appId || !p.redirect) return false;

  // state anti-CSRF, verifie au retour. On y range aussi le reseau, sinon
  // on ne saurait pas quelle fonction appeler en revenant.
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  sessionStorage.setItem("social_state", state);
  sessionStorage.setItem("social_provider", p.id);

  const u = new URL(p.authorize);
  u.searchParams.set(p.idParam, p.appId);
  u.searchParams.set("redirect_uri", p.redirect);
  u.searchParams.set("scope", p.scope);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("state", state);
  window.location.href = u.toString();
  return true;
}

export function hasSocialReturn() {
  const q = new URLSearchParams(window.location.search);
  return q.has("code") || q.has("error");
}

// Consomme le retour : echange le code et ouvre la session Supabase.
export async function completeSocialLogin() {
  const q = new URLSearchParams(window.location.search);
  const code = q.get("code");
  const err = q.get("error");
  const state = q.get("state");
  const expected = sessionStorage.getItem("social_state");
  const providerId = sessionStorage.getItem("social_provider") || "tiktok";
  const p = PROVIDERS[providerId] || PROVIDERS.tiktok;

  // On nettoie l'URL tout de suite : le code ne doit ni rester visible ni
  // pouvoir etre rejoue si l'utilisateur rafraichit.
  window.history.replaceState({}, "", window.location.pathname);
  sessionStorage.removeItem("social_state");
  sessionStorage.removeItem("social_provider");

  if (err) return { ok: false, message: `Connexion ${p.label} annulée.` };
  if (!code) return { ok: false, message: `Retour ${p.label} incomplet.` };
  if (expected && state && state !== expected) {
    return { ok: false, message: `Retour ${p.label} invalide. Recommence.` };
  }

  const { data, error } = await supabase.functions.invoke(p.fn, { body: { code } });

  if (error) return { ok: false, message: `Connexion ${p.label} indisponible pour le moment.` };
  if (data?.error) return { ok: false, message: data.message || `${p.label} a refusé la connexion.` };
  if (!data?.email || !data?.token_hash) return { ok: false, message: "Session incomplète." };

  const { error: verifyErr } = await supabase.auth.verifyOtp({
    email: data.email,
    token_hash: data.token_hash,
    type: "magiclink",
  });
  if (verifyErr) return { ok: false, message: "Impossible d'ouvrir la session. Réessaie." };

  return { ok: true, username: data.username, provider: p.id };
}
