// Lignes de liste : une soiree, un badge, une tuile de navigation.
//
// Le meme gabarit servait sous quatre noms differents (db-event,
// cl-badge, lb-row, db-tile), chacun avec son propre alignement et
// sa propre taille de pictogramme.

import { h, icon } from "../lib/dom.js";
import "./Rows.css";

/** Conteneur de lignes. `tag` a "ul" quand ce sont des <li>. */
export function Rows(children = [], tag = "ul") {
  return h(tag, { class: "vn-rows" }, children);
}

/**
 * Une ligne : pictogramme | titre + sous-titre | valeur.
 * @param {object} o
 * @param {string} [o.ico]   nom d'icone (lib/dom)
 * @param {Node}   [o.lead]  remplace le pictogramme par un noeud libre
 *                           (le classement y met le rang + l'avatar)
 * @param {string} o.title
 * @param {string} [o.sub]
 * @param {Node}   [o.value] Points, State, ou n'importe quel noeud
 * @param {string} [o.class] modificateur pose par l'appelant
 */
export function Row(o = {}) {
  const { ico = "sparkles", lead = null, title, sub = "", value = null, tag = "li" } = o;
  return h(tag, { class: `vn-row ${o.class || ""}`.trim() }, [
    // `lead` prime sur `ico` : certaines listes ont besoin d'autre
    // chose qu'un pictogramme a gauche.
    lead || h("span", { class: "vn-row__ico", "aria-hidden": "true" }, icon(ico, 18)),
    h("span", { class: "vn-row__main" }, [
      h("span", { class: "vn-row__title" }, title),
      sub ? h("span", { class: "vn-row__sub" }, sub) : null,
    ]),
    value ? h("span", { class: "vn-row__val" }, value) : null,
  ]);
}

/**
 * Tuile cliquable — une destination.
 * Rend un <button> : les tuiles actuelles sont des <div> avec un
 * gestionnaire de clic, donc inatteignables au clavier.
 */
export function Tile(o = {}) {
  const { title, sub = "", onClick } = o;
  // ⚠️ LE PICTOGRAMME DECORATIF A SAUTE. Un trophee au-dessus de
  // « Classement » et une medaille au-dessus de « Collection » ne
  // codaient rien : le mot etait deja ecrit dessous. Une icone doit
  // porter une information que le texte ne porte pas, sinon elle
  // n'est que du remplissage — et le remplissage systematique est ce
  // qui fait « maquette generee ». La chevron de droite reste : elle
  // dit que la tuile mene ailleurs, ce que le texte ne dit pas.
  // `ico` est encore accepte par les appelants et volontairement
  // ignore, pour ne pas casser un appel oublie.
  return h("button", { type: "button", class: "vn-tile", onClick }, [
    h("span", { class: "vn-tile__txt" }, [
      h("span", { class: "vn-tile__title" }, title),
      sub ? h("span", { class: "vn-tile__sub" }, sub) : null,
    ]),
    h("span", { class: "vn-tile__arrow", "aria-hidden": "true" }, icon("chevron", 17)),
  ]);
}
