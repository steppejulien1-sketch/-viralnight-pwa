// Donnees de demonstration realistes — le temps de cabler Supabase.
// Rien de generique : noms, recompenses et chiffres doivent avoir l'air
// vrais (un vrai club, de vraies recompenses).

export const CLUB = {
  slug: "mirage-brussels",
  name: "Mirage",
  city: "Bruxelles",
  igHandle: "mirage.brussels",
  tagline: "Le samedi soir se joue ici.",
};

// Paliers selon le nombre de followers Instagram.
export const TIERS = [
  { id: "x1", label: "Habitué", mult: 1, min: 0, max: 500 },
  { id: "x2", label: "Ambassadeur", mult: 2, min: 500, max: 2000 },
  { id: "x4", label: "Influenceur", mult: 4, min: 2000, max: 10000 },
  { id: "x8", label: "Icône", mult: 8, min: 10000, max: Infinity },
];

export function tierForFollowers(count) {
  return TIERS.find((t) => count >= t.min && count < t.max) || TIERS[0];
}

// Mock du lookup de followers : en prod, une Edge Function appellera une API
// tierce. Ici, valeur pseudo-deterministe derivee du handle (meme handle =
// meme resultat), dans une fourchette credible 180 - 14 000.
export function mockFollowers(handle) {
  const clean = String(handle).replace(/[^a-z0-9]/gi, "").toLowerCase();
  let seed = 0;
  for (let i = 0; i < clean.length; i++) seed = (seed * 31 + clean.charCodeAt(i)) >>> 0;
  const buckets = [340, 720, 1240, 2600, 4800, 8300, 12400];
  const base = buckets[seed % buckets.length];
  const jitter = (seed % 200) - 100;
  return Math.max(180, base + jitter);
}

// Utilisateur mock (rempli apres onboarding). Un petit historique est
// pre-rempli pour montrer un dashboard vivant en demo — en prod, tout
// viendra de Supabase (0 point au premier soir).
export const USER = {
  handle: "",
  email: "",
  followers: 0,
  tier: TIERS[0],
  points: 480,
};

// Points de base d'une story avant multiplicateur de palier.
export const STORY_BASE_POINTS = 70;

// Historique des soirees du clubbeur (stories validees).
export const HISTORY = [
  { date: "Samedi 2 août", kind: "Story Instagram", views: 8400, points: 280 },
  { date: "Samedi 26 juillet", kind: "Story Instagram", views: 5100, points: 200 },
];

// Prochaine recompense atteignable : la moins chere encore hors de portee.
export function nextReward(points) {
  const sorted = [...REWARDS].sort((a, b) => a.cost - b.cost);
  return sorted.find((r) => r.cost > points) || null;
}

// Recompenses du club Mirage — vraies formulations, pas "Reward 1".
export const REWARDS = [
  {
    id: "drink",
    title: "10€ offerts sur ta conso",
    desc: "Valable au bar principal, une fois par soirée.",
    cost: 300,
  },
  {
    id: "coupe-file",
    title: "Coupe-file garanti",
    desc: "Entrée prioritaire, sans faire la queue, avant 1h.",
    cost: 600,
  },
  {
    id: "vip",
    title: "Accès carré VIP",
    desc: "Une place dans le carré, pour toi + 1.",
    cost: 1200,
  },
  {
    id: "table",
    title: "Table offerte + bouteille",
    desc: "Une table réservée avec une bouteille incluse.",
    cost: 3000,
  },
];
