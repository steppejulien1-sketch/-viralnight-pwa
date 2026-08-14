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
  // ⚠️ TIKTOK EST REPASSE AUX VUES (migration 0025, decision de Julien).
  // Il est le SEUL, et pour une raison de fond : son API rend le
  // `view_count` mesure par TikTok. Une story Instagram n'a pas d'URL
  // publique, un Reel n'expose pas ses vues — la, le chiffre serait
  // declaratif, donc gonflable. Ne pas remettre `per100` sur les autres
  // formats sans source verifiable.
  tiktok: { base: 60, per100: 7 },
};

/**
 * Plafond du bonus de vues, applique par la base.
 * Non affiche aujourd'hui : le mentionner sur l'ecran d'accueil
 * reviendrait a parler d'un cas que presque personne n'atteint.
 */
export const BONUS_MAX = 2000;

/**
 * L'ACCUEIL est-il au forfait ? Il ne parle que de STORIES — c'est le
 * geste du clubbeur au club, et de loin le format le plus depose.
 *
 * ⚠️ CE N'EST PLUS « tous les formats » (`Object.values(...).every`).
 * Depuis la 0025, TikTok est aux vues et les autres au forfait : la
 * regle globale basculait donc l'accueil sur « on compte tes vues »,
 * alors qu'une story reste payee 100 pts quoi qu'il arrive. Promettre
 * un comptage de vues a quelqu'un qui vient poster une story serait
 * faux.
 */
export const AU_FORFAIT = !BAREME.story.per100;

/**
 * La phrase qui annonce le gain, pour un type de contenu.
 * Une seule formulation dans toute l'app.
 */
export function phraseBareme(kind = "story") {
  const b = BAREME[kind] || BAREME.story;
  if (!b.per100) return `${b.base} pts par ${libelle(kind)}`;
  // ⚠️ « vues comptées par TikTok », pas « tes vues » : c'est la mesure de
  // la plateforme qui paie, pas un chiffre qu'on saisit. La nuance evite
  // qu'un clubbeur annonce 50 000 vues et s'estime lese.
  return `${b.base} pts d'office, + ${b.per100} pts par 100 vues comptées par ${libelle(kind)}`;
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
