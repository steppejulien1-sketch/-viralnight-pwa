// Bouton — la seule fabrique de boutons de l'app.
//
// Avant, chaque ecran composait ses classes a la main
// (`btn btn-primary btn-block`) et gerait son etat de chargement en
// reecrivant le libelle : « Envoi… » puis retour au texte d'origine,
// recopie a sept endroits, avec sept libelles legerement differents.
// Ici l'etat est porte par le composant.
//
// ⚠️ UN SEUL variant "primary" par ecran (voir Button.css).

import { h } from "../lib/dom.js";
import "./Button.css";

const VARIANTS = new Set(["primary", "ghost", "quiet", "ig", "tiktok"]);

/**
 * @param {object} o
 * @param {string} o.label     texte du bouton
 * @param {string} [o.variant] primary | ghost | quiet | ig | tiktok
 * @param {Node}   [o.ico]     pictogramme a gauche (icon() de lib/dom)
 * @param {Node}   [o.icoRight] pictogramme a droite
 * @param {boolean}[o.block]   pleine largeur
 * @param {boolean}[o.soon]    fournisseur pas encore configure
 * @param {Function}[o.onClick]
 */
export function Button(o = {}) {
  const {
    label = "",
    variant = "primary",
    ico = null,
    icoRight = null,
    block = false,
    disabled = false,
    soon = false,
    type = "button",
    onClick,
    ariaLabel,
  } = o;

  const v = VARIANTS.has(variant) ? variant : "primary";
  const txt = h("span", { class: "vn-btn__txt" }, label);

  const el = h(
    "button",
    {
      type,
      class: [
        "vn-btn",
        `vn-btn--${v}`,
        block ? "vn-btn--block" : "",
        soon ? "vn-btn--soon" : "",
      ]
        .filter(Boolean)
        .join(" "),
      disabled: disabled || false,
      "aria-label": ariaLabel || null,
      onClick,
    },
    [ico, txt, icoRight]
  );

  // Etat d'envoi. Le libelle NE CHANGE PAS : on ajoute le rond qui
  // tourne et on verrouille le bouton. Remplacer le texte par
  // « Envoi… » faisait sauter la largeur du bouton en pleine
  // interaction, juste sous le pouce.
  let spin = null;
  el.setLoading = (on) => {
    el.disabled = Boolean(on);
    if (on && !spin) {
      spin = h("span", { class: "vn-btn__spin", "aria-hidden": "true" });
      el.insertBefore(spin, txt);
      el.setAttribute("aria-busy", "true");
    } else if (!on && spin) {
      spin.remove();
      spin = null;
      el.removeAttribute("aria-busy");
    }
  };

  el.setLabel = (s) => {
    txt.textContent = s;
  };

  return el;
}
