// Etat vide et squelette de chargement.
//
// Les deux repondent a la meme question : « il n'y a rien a
// montrer, qu'est-ce que j'affiche ? ». La reponse est toujours la
// verite — un message ou une barre grise, jamais une donnee
// inventee qui tiendrait le temps d'une seconde.

import { h, icon } from "../lib/dom.js";
import "./Feedback.css";

/**
 * @param {object} o
 * @param {string} o.title  ce qui manque, du point de vue du clubbeur
 * @param {string} [o.sub]  ce qu'il peut faire pour que ca change
 * @param {string} [o.ico]  nom d'icone (lib/dom)
 */
export function Empty(o = {}) {
  const { title, sub = "", ico = null } = o;
  return h("div", { class: "vn-empty" }, [
    ico ? h("span", { class: "vn-empty__ico", "aria-hidden": "true" }, icon(ico, 26)) : null,
    h("p", { class: "vn-empty__title" }, title),
    sub ? h("p", { class: "vn-empty__sub" }, sub) : null,
  ]);
}

/** Une barre grise. `card` pour occuper la place d'une carte entiere. */
export function Skeleton({ width = "100%", card = false } = {}) {
  return h("div", {
    class: `vn-skel${card ? " vn-skel--card" : ""}`,
    style: { width },
    "aria-hidden": "true",
  });
}

/** Plusieurs barres de largeurs decroissantes — un bloc de texte. */
export function SkeletonText(lignes = 3) {
  const largeurs = ["100%", "78%", "54%", "88%", "62%"];
  return h(
    "div",
    { class: "vn-skel-stack", style: { display: "flex", flexDirection: "column", gap: "8px" } },
    Array.from({ length: lignes }, (_, i) => Skeleton({ width: largeurs[i % largeurs.length] }))
  );
}
