// Session client.
//
// ⚠️ HISTORIQUE — a lire avant de toucher a ce fichier.
// Ce module connectait AUTOMATIQUEMENT tout visiteur sur un compte de
// demonstration, identifiants ecrits en dur :
//     signInWithPassword({ email: "clubbeur@demo.mirage", password: "..." })
// Deux consequences en production :
//   1. le mot de passe se retrouvait en clair dans le bundle public
//      (verifie sur viralnight-pwa.vercel.app) ;
//   2. TOUS les clubbeurs partageaient un seul et meme compte : memes
//      points, memes recompenses, meme classement.
//
// Le repli de demo est desormais explicite et ne s'active JAMAIS tout seul
// en production. Voir DEMO_AUTH plus bas.

import { supabase, isConfigured } from "./supabase.js";

// Le mode demo n'est actif qu'en developpement local, ou si on l'a
// explicitement demande au build via VITE_DEMO_AUTH=1 (utile pour une
// demo commerciale). Jamais par defaut sur un deploiement.
const DEMO_AUTH =
  import.meta.env.DEV || import.meta.env.VITE_DEMO_AUTH === "1";

const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL || "clubbeur@demo.mirage";
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || "";

let cached = null;

// Retourne la session courante, ou null si personne n'est connecte.
// N'ouvre plus de session a la place de l'utilisateur.
export async function ensureSession() {
  if (!isConfigured) return null;
  if (cached) return cached;

  const { data } = await supabase.auth.getSession();
  if (data?.session) {
    cached = data.session;
    return cached;
  }

  // Repli de demonstration, strictement encadre.
  if (DEMO_AUTH && DEMO_PASSWORD) {
    const { data: signin } = await supabase.auth.signInWithPassword({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
    });
    cached = signin?.session || null;
    return cached;
  }

  return null;
}

// Vrai si un utilisateur est reellement connecte.
export async function isSignedIn() {
  const s = await ensureSession();
  return Boolean(s?.user?.id);
}

export async function currentUser() {
  const s = await ensureSession();
  return s?.user || null;
}

export async function signOut() {
  cached = null;
  if (!isConfigured) return;
  await supabase.auth.signOut();
}

// Reagit aux changements de session (retour de magic link, expiration).
export function onSessionChange(cb) {
  if (!isConfigured) return () => {};
  const { data } = supabase.auth.onAuthStateChange((_evt, session) => {
    cached = session || null;
    cb(session || null);
  });
  return () => data?.subscription?.unsubscribe();
}
