// Carte — le conteneur de base.
//
// Rend un <button> des qu'un onClick est fourni : les « cartes
// cliquables » de l'app etaient des <div> avec un gestionnaire de
// clic, donc inatteignables au clavier et muettes pour un lecteur
// d'ecran.

import { h, icon } from "../lib/dom.js";
import "./Card.css";

/**
 * @param {object} o
 * @param {boolean} [o.live]  atteignable maintenant (contour + halo rouges)
 * @param {boolean} [o.flat]  section posee sur le fond, sans relief
 * @param {Function} [o.onClick] rend un <button> au lieu d'un <div>
 * @param {Node[]} children
 */
export function Card(o = {}, children = []) {
  const { live = false, flat = false, onClick = null, class: extra = "" } = o;
  const tag = onClick ? "button" : "div";

  return h(
    tag,
    {
      type: onClick ? "button" : null,
      class: [
        "vn-card",
        flat ? "vn-card--flat" : "",
        live ? "vn-card--live" : "",
        onClick ? "vn-card--tap" : "",
        extra,
      ]
        .filter(Boolean)
        .join(" "),
      onClick,
    },
    children
  );
}

/** En-tete de carte : libelle a gauche, chevron a droite. */
export function CardHead(label, right = null) {
  return h("div", { class: "vn-card__head" }, [
    h("span", { class: "vn-label" }, label),
    right === true
      ? h("span", { class: "vn-card__arrow", "aria-hidden": "true" }, icon("chevron", 16))
      : right,
  ]);
}
