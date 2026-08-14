// Jauge de progression.
//
// aria-hidden par defaut : la barre est un doublon visuel de la
// phrase qui la suit (« 260 pts avant de debloquer »). La faire
// lire aussi par un lecteur d'ecran repeterait l'information.
// Passer `label` pour en faire une vraie barre annoncee.

import { h } from "../lib/dom.js";
import "./Progress.css";

/**
 * @param {number} current
 * @param {number} target
 * @param {object} o
 * @param {boolean} [o.thin]  version fine (sous une ligne de liste)
 * @param {string}  [o.label] rend la barre annoncable (role=progressbar)
 */
export function Progress(current = 0, target = 0, o = {}) {
  const { thin = false, label = null } = o;

  const fill = h("span", { class: "vn-bar__fill" });
  const el = h(
    "div",
    {
      class: ["vn-bar", thin ? "vn-bar--thin" : ""].filter(Boolean).join(" "),
      "aria-hidden": label ? null : "true",
      role: label ? "progressbar" : null,
      "aria-label": label,
    },
    [fill]
  );

  el.setValue = (c, t = target) => {
    const pct = pourcent(c, t);
    fill.style.width = `${pct}%`;
    el.classList.toggle("vn-bar--done", pct >= 100);
    if (label) {
      el.setAttribute("aria-valuenow", String(pct));
      el.setAttribute("aria-valuemin", "0");
      el.setAttribute("aria-valuemax", "100");
    }
  };

  el.setValue(current, target);
  return el;
}

/** Part accomplie en pourcentage, bornee a [0, 100]. */
export function pourcent(current, target) {
  if (!target || target <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}
