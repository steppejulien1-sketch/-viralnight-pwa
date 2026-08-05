// Session client.
//
// DEMO : tant que l'OAuth Instagram réel n'est pas branché, on connecte un
// clubbeur de démonstration pour que la boutique (lecture + rédemption
// atomique via RPC) fonctionne end-to-end. À remplacer par la vraie session
// Instagram en prod.

import { supabase, isConfigured } from "./supabase.js";

let cached = null;

export async function ensureSession() {
  if (!isConfigured) return null;
  if (cached) return cached;
  const { data } = await supabase.auth.getSession();
  if (data?.session) {
    cached = data.session;
    return cached;
  }
  const { data: signin } = await supabase.auth.signInWithPassword({
    email: "clubbeur@demo.mirage",
    password: "Clubbeur2026!",
  });
  cached = signin?.session || null;
  return cached;
}
