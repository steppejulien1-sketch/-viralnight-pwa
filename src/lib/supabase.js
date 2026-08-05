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
