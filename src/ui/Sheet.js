// Bottom sheet — confirmation et messages bloquants.
//
// Ecrit a la main dans rewards.js, et remplace par un `alert()`
// quand le rendu du ticket echouait. Extrait ici, avec ce que la
// version d'origine n'avait pas : fermeture au clavier (Echap),
// piege de focus minimal, et restitution du focus a l'element qui
// avait ouvert la feuille.

import { h } from "../lib/dom.js";
import "./Sheet.css";

/**
 * @param {object} o
 * @param {string} o.title
 * @param {Node|string} [o.body]     contenu libre sous le titre
 * @param {Node[]} [o.actions]       boutons, du plus engageant au moins
 * @param {Function} [o.onClose]
 * @returns {{close: Function}}
 */
export function Sheet(o = {}) {
  const { title, body = null, actions = [], onClose } = o;

  // A qui rendre le focus quand la feuille se ferme.
  const origine = document.activeElement;

  const feuille = h(
    "div",
    { class: "vn-sheet", role: "dialog", "aria-modal": "true", "aria-label": title },
    [
      h("span", { class: "vn-sheet__grip", "aria-hidden": "true" }),
      h("h2", { class: "vn-sheet__title" }, title),
      typeof body === "string" ? h("p", { class: "vn-sheet__sub" }, body) : body,
      ...actions,
    ]
  );

  const back = h(
    "div",
    {
      class: "vn-sheet-back",
      // Un tap SUR LE FOND ferme, un tap dans la feuille non.
      onClick: (e) => {
        if (e.target === back) close();
      },
    },
    [feuille]
  );

  document.body.appendChild(back);
  requestAnimationFrame(() => back.classList.add("is-open"));

  // Le premier bouton prend le focus : au clavier comme au lecteur
  // d'ecran, on arrive directement sur l'action.
  requestAnimationFrame(() => feuille.querySelector("button")?.focus());

  function onKey(e) {
    if (e.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);

  let ferme = false;
  function close() {
    if (ferme) return;
    ferme = true;
    document.removeEventListener("keydown", onKey);
    back.classList.remove("is-open");
    // Attend la fin du glissement avant de retirer du DOM.
    setTimeout(() => {
      back.remove();
      origine?.focus?.();
      onClose?.();
    }, 320);
  }

  return { close, el: feuille };
}
