// Client Supabase (cote navigateur, cle anon). L'app fonctionne en mode
// mock tant que les variables d'env ne sont pas fournies : isConfigured
// permet de basculer proprement.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(
  url && anon && url.startsWith("https://") && url.includes(".supabase.co")
);

export const supabase = isConfigured
  ? createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null;

// Connexion par magic link (email). L'utilisateur clique le lien recu.
export async function signInWithEmail(email) {
  if (!supabase) return { error: "Supabase non configuré (mode démo)." };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return { error: error?.message || null };
}

// Connexion Google, via le fournisseur OAuth natif de Supabase -- pas le
// meme mecanisme que TikTok/Instagram (lib/social.js), qui passent par une
// edge function parce que ces reseaux n'ont pas d'integration Supabase
// prete a l'emploi. Google, si. Tant que le fournisseur "Google" n'est pas
// active cote tableau de bord Supabase (Client ID + secret Google Cloud),
// cet appel echoue proprement avec un message clair plutot que de planter :
// voir isGoogleReady() plus bas, lu par l'ecran pour attenuer le bouton.
//
// `detectSessionInUrl: true` (deja pose dans le client ci-dessus) fait le
// reste tout seul au retour de Google : la session s'ouvre avant meme que
// ce fichier ne s'execute a nouveau, onboarding.js la retrouve via
// ensureSession() exactement comme un retour de lien magique.
export async function signInWithGoogle() {
  if (!supabase) return "Supabase non configuré (mode démo).";
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  return error?.message || null;
}

// Pas de cle publique a verifier cote client pour Google (contrairement a
// VITE_TIKTOK_CLIENT_KEY) : l'activation vit uniquement cote tableau de
// bord Supabase. On affiche donc le bouton actif par defaut ; s'il n'est
// pas configure, signInWithGoogle() renvoie l'erreur Supabase explicite
// ("Unsupported provider") plutot que de deviner a l'avance.
export const googleReady = true;
