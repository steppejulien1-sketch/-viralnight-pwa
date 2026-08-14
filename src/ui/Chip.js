// Rail de chips — un choix exclusif parmi quelques options.
//
// Les deux usages de l'app (filtres de la boutique, choix du format
// de contenu) reconstruisaient tout l'ecran a chaque tap pour
// deplacer une classe. Ici seul l'etat des chips bouge ; l'appelant
// decide s'il doit recharger quoi que ce soit.

import { h } from "../lib/dom.js";
import { tap } from "../lib/haptics.js";
import "./Chip.css";

/**
 * @param {Array<{value:string,label:string,ico?:Node}>} options
 * @param {object} o
 * @param {string}  o.value     option active au depart
 * @param {Function} o.onChange (value) => void
 * @param {string}  [o.ariaLabel]
 */
export function Chips(options = [], o = {}) {
  const { value, onChange, ariaLabel = "Filtres" } = o;
  let actif = value ?? options[0]?.value;

  const boutons = options.map((opt) =>
    h(
      "button",
      {
        type: "button",
        role: "tab",
        class: `vn-chip${opt.value === actif ? " is-on" : ""}`,
        "aria-selected": opt.value === actif ? "true" : "false",
        onClick: () => {
          if (opt.value === actif) return;
          tap();
          actif = opt.value;
          maj();
          onChange?.(actif);
        },
      },
      [opt.ico || null, h("span", {}, opt.label)]
    )
  );

  const el = h("div", { class: "vn-chips", role: "tablist", "aria-label": ariaLabel }, boutons);

  function maj() {
    options.forEach((opt, i) => {
      const on = opt.value === actif;
      boutons[i].classList.toggle("is-on", on);
      boutons[i].setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  el.getValue = () => actif;
  el.setValue = (v) => {
    actif = v;
    maj();
  };

  return el;
}
