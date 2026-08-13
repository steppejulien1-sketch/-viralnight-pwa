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

/** Socle + bonus par tranche de 100 vues, par type de contenu. */
export const BAREME = {
  story: { base: 100, per100: 20 },
  reel: { base: 60, per100: 7 },
  tiktok: { base: 60, per100: 7 },
};

/**
 * Plafond du bonus de vues, applique par la base.
 * Non affiche aujourd'hui : le mentionner sur l'ecran d'accueil
 * reviendrait a parler d'un cas que presque personne n'atteint.
 */
export const BONUS_MAX = 2000;
