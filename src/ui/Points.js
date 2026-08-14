// Points — l'affichage d'un montant, en quatre tailles.
//
// Remplace a la fois PointsCounter.js (le gros compteur du
// dashboard) et la dizaine de `h("span", { class: "... mono" },
// \`${nf.format(x)} pts\`)` recopies dans les ecrans. Le formatage
// francais (espace insecable comme separateur de milliers) etait
// refait a chaque endroit, avec un `new Intl.NumberFormat` par
// fichier.

import { h } from "../lib/dom.js";
import { countUp } from "../lib/animations.js";
import "./Points.css";

const nf = new Intl.NumberFormat("fr-FR");

/**
 * @param {number} value
 * @param {object} o
 * @param {string} [o.size]  hero | lg | md | sm
 * @param {boolean}[o.unit]  afficher « pts »
 * @param {boolean}[o.sign]  prefixer d'un + (un gain)
 * @param {boolean}[o.off]   hors de portee (gris au lieu de rouge)
 */
export function Points(value = 0, o = {}) {
  const { size = "md", unit = true, sign = false, off = false } = o;

  const num = h("span", { class: "vn-pts__num" }, format(value, sign));
  const el = h(
    "span",
    {
      class: ["vn-pts", `vn-pts--${size}`, off ? "vn-pts--off" : ""].filter(Boolean).join(" "),
    },
    [num, unit ? h("span", { class: "vn-pts__unit" }, "pts") : null]
  );

  // Le compteur monte a 0 puis s'anime vers le vrai solde des sa
  // reception. On n'anime JAMAIS depuis une valeur de demonstration :
  // afficher 480 en attendant, c'est raconter une histoire fausse
  // pendant une seconde — assez pour croire qu'on peut prendre une
  // recompense qu'on n'a pas.
  el.setValue = (v, { animate = true, dur = 900 } = {}) => {
    if (!animate) {
      num.textContent = format(v, sign);
      return;
    }
    countUp(num, v, { dur, format: (x) => format(Math.round(x), sign) });
  };

  return el;
}

function format(v, sign) {
  const n = Number.isFinite(v) ? v : 0;
  return `${sign && n > 0 ? "+" : ""}${nf.format(n)}`;
}
