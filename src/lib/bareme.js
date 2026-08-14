// Bareme des points, cote affichage.
//
// ⚠️ LA BASE FAIT FOI. Ces valeurs ne calculent RIEN : elles servent
// uniquement a annoncer le bareme a l'ecran. Le calcul reel vit dans la
// fonction SQL `story_points(kind, views)` (migration 0014), appelee par
// `submit_story` et `review_story`. Un clubbeur ne peut pas influencer son
// gain depuis le navigateur -- l'execution de `credit_story` a d'ailleurs
// ete revoquee pour anon et authenticated.
//
// POURQUOI CE FICHIER EXISTE. Ces constantes trainaient dans `mock.js`
// (donc melangees a des donnees fictives) ET recopiees une deuxieme fois
// dans le tableau KINDS de `post-story.js`. Trois sources pour un meme
// bareme, dont deux qui se donnaient l'air d'etre des donnees de
// demonstration : la divergence n'etait qu'une question de temps.
//
// SI LE BAREME CHANGE : le modifier dans `story_points()` d'abord, ici
// ensuite. L'inverse afficherait une promesse que la base ne tient pas.

/**
 * Montant par contenu.
 *
 * ⚠️ BAREME AU FORFAIT depuis la migration 0020 (appliquee le
 * 2026-08-14) : `per100` est a 0, les vues n'entrent plus dans le
 * calcul. Les socles n'ont PAS bouge — on a seulement retire le bonus
 * indexe sur les vues.
 *
 * Remettre une valeur dans `per100` ici ne changerait RIEN au montant
 * verse : le calcul vit dans `story_points()`, qui ignore desormais son
 * parametre `p_views`. Ca ne ferait qu'annoncer un bonus inexistant.
 */
export const BAREME = {
  story: { base: 100, per100: 0 },
  reel: { base: 60, per100: 0 },
  tiktok: { base: 60, per100: 0 },
};

/**
 * Plafond du bonus de vues, applique par la base.
 * Non affiche aujourd'hui : le mentionner sur l'ecran d'accueil
 * reviendrait a parler d'un cas que presque personne n'atteint.
 */
export const BONUS_MAX = 2000;

/**
 * Le bareme est-il au FORFAIT (un montant fixe par contenu) ou indexe
 * sur les vues ?
 *
 * ⚠️ POURQUOI CETTE BASCULE EXISTE. Julien a tranche le passage au
 * forfait (« on ne se base plus sur les vues pour le contenu »), mais
 * la migration SQL n'est PAS ecrite ni appliquee : `story_points()`
 * calcule encore un bonus aux vues. Tant que c'est le cas, les ecrans
 * doivent continuer d'annoncer le bareme aux vues — annoncer le
 * forfait avant que la base le fasse, ce serait promettre un montant
 * que le club ne versera pas.
 *
 * Le jour ou la migration part, il suffit de mettre `per100: 0`
 * ci-dessus : toutes les phrases de l'app suivent toutes seules.
 */
export const AU_FORFAIT = Object.values(BAREME).every((b) => !b.per100);

/**
 * La phrase qui annonce le gain, pour un type de contenu.
 * Une seule formulation dans toute l'app.
 */
export function phraseBareme(kind = "story") {
  const b = BAREME[kind] || BAREME.story;
  if (!b.per100) return `${b.base} pts par ${libelle(kind)}`;
  return `${b.base} pts d'office, + ${b.per100} pts par 100 vues`;
}

/** Ce qu'on promet en une ligne, sous le titre de l'accueil. */
export function promesseCourte() {
  return AU_FORFAIT
    ? "Poste, le club valide, tu retires au bar. C'est tout."
    : "Poste, on compte les vues, tu retires au bar. C'est tout.";
}

function libelle(kind) {
  if (kind === "tiktok") return "TikTok";
  if (kind === "reel") return "Reel";
  return "story";
}
