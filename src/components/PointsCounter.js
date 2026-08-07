// Gros compteur de points — le chiffre-roi du dashboard, en mono pour
// le feel "data". S'anime au montage (count-up).

import { h } from "../lib/dom.js";
import { countUp } from "../lib/animations.js";

export function PointsCounter(value, { animate = true } = {}) {
  const num = h("span", { class: "pc-num mono" }, animate ? "0" : String(value));
  const el = h("div", { class: "pc" }, [
    num,
    h("span", { class: "pc-unit" }, "pts"),
  ]);
  if (animate) {
    setTimeout(() => countUp(num, value, { dur: 1000 }), 120);
  }

  // Permet de lancer (ou relancer) le compteur quand le vrai solde arrive
  // de Supabase. Le dashboard monte le compteur a 0 sans animation, puis
  // appelle ceci : on evite de compter jusqu'a une valeur de demonstration
  // avant de sauter brutalement sur la vraie.
  el.setValue = (v, { dur = 900 } = {}) => countUp(num, v, { dur });

  return el;
}
