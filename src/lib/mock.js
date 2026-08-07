// Donnees de demonstration realistes — le temps de cabler Supabase.
//
// MODELE v2 : plus de palier base sur les abonnes (impossible a verifier,
// et l'API Instagram ne donne pas les abonnes des comptes perso). A la
// place :
//   - la connexion Instagram PROUVE la propriete du compte (anti-triche) ;
//   - les points viennent des VUES REELLES des stories (portee reelle),
//     pas d'un multiplicateur d'abonnes ;
//   - un NIVEAU (gamification) recompense l'activite cumulee.

export const CLUB = {
  slug: "mirage-brussels",
  name: "Mirage",
  city: "Bruxelles",
  igHandle: "mirage.brussels",
  tagline: "Le samedi soir se joue ici.",
};

// Niveaux bases sur les points gagnes a vie (activite reelle, PAS abonnes).
export const LEVELS = [
  { id: "l1", label: "Nouveau", min: 0, next: 800 },
  { id: "l2", label: "Habitué", min: 800, next: 2500 },
  { id: "l3", label: "Régulier", min: 2500, next: 6000 },
  { id: "l4", label: "VIP du Mirage", min: 6000, next: null },
];

export function levelForPoints(total) {
  return [...LEVELS].reverse().find((l) => total >= l.min) || LEVELS[0];
}

// Points d'une story taguee : un socle pour avoir poste + un bonus indexe
// sur les vues reelles (revele via la capture d'ecran).
export const STORY_BASE_POINTS = 100; // socle pour une story validee
export const POINTS_PER_100_VIEWS = 20; // bonus : 20 pts / 100 vues

export function pointsForViews(views) {
  return Math.round((views / 100) * POINTS_PER_100_VIEWS);
}

// Utilisateur mock (rempli apres connexion Instagram).
export const USER = {
  handle: "",
  connected: false,
  points: 480,
  totalEarned: 1240, // cumul a vie -> niveau
};

// Historique des soirees (stories validees) — vues reelles + points gagnes.
export const HISTORY = [
  { date: "Samedi 2 août", views: 8400, points: 280 },
  { date: "Samedi 26 juillet", views: 5100, points: 200 },
];

// Recompenses du club Mirage.
export const REWARDS = [
  { id: "drink", title: "Un cocktail offert", desc: "À retirer au bar principal, une fois par soirée.", cost: 300 },
  { id: "coupe-file", title: "Coupe-file garanti", desc: "Entrée prioritaire, sans faire la queue, avant 1h.", cost: 600 },
  { id: "vip", title: "Accès carré VIP", desc: "Une place dans le carré, pour toi + 1.", cost: 1200 },
  { id: "table", title: "Table offerte + bouteille", desc: "Une table réservée avec une bouteille incluse.", cost: 3000 },
];

export function nextReward(points) {
  return [...REWARDS].sort((a, b) => a.cost - b.cost).find((r) => r.cost > points) || null;
}
