// Ecran — la coquille commune : en-tete, corps, pied.
//
// Chaque page en fabrique un et remplit `body` (et `foot` si elle a
// une action principale). Le pied est colle en bas, dans la zone du
// pouce : c'est la regle d'ergonomie la plus importante de l'app,
// et elle n'etait respectee que sur trois ecrans sur huit.

import { h, icon } from "../lib/dom.js";
import { tap } from "../lib/haptics.js";
import "./Screen.css";

/**
 * @param {object} o
 * @param {string} [o.label]   intertitre de la barre du haut
 * @param {Function} [o.onBack] affiche la fleche retour
 * @param {Node} [o.headRight] contenu cale a droite de la barre
 * @returns {HTMLElement} l'ecran, avec .body et .foot accessibles
 */
export function Screen(o = {}) {
  const { label = "", onBack = null, headRight = null } = o;

  const body = h("main", { class: "vn-screen__body" });
  const foot = h("footer", { class: "vn-screen__foot vn-slot" });

  const head = h("header", { class: "vn-screen__head" }, [
    onBack
      ? h(
          "button",
          {
            type: "button",
            class: "vn-screen__back",
            "aria-label": "Retour",
            onClick: () => {
              tap();
              onBack();
            },
          },
          icon("arrowRight", 19)
        )
      : null,
    // ⚠️ Le nom de l'ecran n'est PAS un intertitre : c'est un reperage,
    // il se lit d'un coup d'oeil et ne doit rien reclamer. En `vn-label`
    // il etait en capitales espacees, au meme niveau sonore que le titre
    // juste en dessous — deux cris pour la meme information.
    h("div", { class: "vn-screen__head-main" }, [
      label ? h("span", { class: "vn-screen__name" }, label) : null,
    ]),
    headRight,
  ]);

  const el = h("div", { class: "vn-screen" }, [head, body, foot]);

  el.body = body;
  el.foot = foot;
  el.head = head;
  return el;
}

/** Titre principal, dans le corps (pas dans la barre du haut). */
export function Title(children) {
  return h("h1", { class: "vn-screen__title" }, children);
}

/** Phrase d'accroche sous le titre. */
export function Sub(children) {
  return h("p", { class: "vn-screen__sub" }, children);
}

/** Mention rassurante sous le bouton du pied. */
export function Note(children, ico = "check") {
  return h("p", { class: "vn-screen__note" }, [
    ico ? icon(ico, 13) : null,
    h("span", {}, children),
  ]);
}

/** Intertitre + contenu. `right` se cale au bout de la ligne. */
export function Section(label, children, right = null) {
  return h("section", { class: "vn-section" }, [
    label
      ? h("div", { class: "vn-section__head" }, [
          h("span", { class: "vn-label" }, label),
          right,
        ])
      : null,
    ...(Array.isArray(children) ? children : [children]),
  ]);
}

/** Emplacement rempli en asynchrone : invisible tant qu'il est vide. */
export function Slot(extra = "") {
  return h("div", { class: `vn-slot ${extra}`.trim() });
}
