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
  return el;
}
