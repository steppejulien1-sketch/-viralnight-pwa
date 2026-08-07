// Overlay de célébration (déblocage récompense / niveau / badge).
// Court (auto-dismiss ~1.8s), tapable pour fermer, respecte
// prefers-reduced-motion (pas de confettis animés alors). Zéro dépendance.

import { h } from "./dom.js";

// Confettis : camaieu de rouge + blanc. Pas de vert (rejete), pas de
// multicolore (ca fait "genere par IA", Julien l'a dit plusieurs fois).
const COLORS = ["#ff2d2d", "#ff7a3d", "#ffffff", "#ff5c5c"];

export function celebrate({ title = "Débloqué !", sub = "" } = {}) {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const pieces = reduced
    ? []
    : Array.from({ length: 26 }, (_, i) => {
        const left = (i * 37) % 100; // pseudo-réparti sans Math.random
        const delay = (i % 6) * 40;
        const dur = 1100 + (i % 5) * 120;
        const color = COLORS[i % COLORS.length];
        const rot = (i * 47) % 360;
        return h("span", {
          class: "cbr-piece",
          style: {
            left: `${left}%`,
            background: color,
            animationDelay: `${delay}ms`,
            animationDuration: `${dur}ms`,
            "--rot": `${rot}deg`,
          },
        });
      });

  const overlay = h("div", { class: "cbr", role: "status", "aria-live": "polite", onClick: dismiss }, [
    h("div", { class: "cbr-confetti", "aria-hidden": "true" }, pieces),
    h("div", { class: "cbr-card" }, [
      h("div", { class: "cbr-burst", "aria-hidden": "true" }),
      h("h2", { class: "cbr-title" }, title),
      sub ? h("p", { class: "cbr-sub" }, sub) : null,
    ]),
  ]);

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-in"));

  let done = false;
  function dismiss() {
    if (done) return;
    done = true;
    overlay.classList.remove("is-in");
    setTimeout(() => overlay.remove(), 260);
  }
  const t = setTimeout(dismiss, 1800);
  overlay.addEventListener("click", () => clearTimeout(t), { once: true });

  return dismiss;
}
