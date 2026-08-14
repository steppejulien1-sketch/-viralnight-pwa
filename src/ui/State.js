// Pastille d'etat.
//
// Un seul vocabulaire pour toute l'app. Le statut d'un contenu
// s'ecrivait differemment selon l'ecran : « en attente » sur le
// profil, « En cours de verification » sur le bonus, rien du tout
// dans l'historique du dashboard.

import { h } from "../lib/dom.js";
import "./State.css";

const LIBELLES = {
  wait: "En attente",
  ok: "Validé",
  no: "Refusé",
  live: "En salle",
};

// Les etats vivants (qui bougent tout seuls) portent un point qui bat.
const AVEC_POINT = new Set(["wait", "live"]);

/**
 * @param {"wait"|"ok"|"no"|"live"} kind
 * @param {string} [label] pour remplacer le libelle par defaut
 */
export function State(kind = "wait", label = null) {
  const k = LIBELLES[kind] ? kind : "wait";
  return h("span", { class: `vn-state vn-state--${k}` }, [
    AVEC_POINT.has(k) ? h("span", { class: "vn-state__dot", "aria-hidden": "true" }) : null,
    label || LIBELLES[k],
  ]);
}
