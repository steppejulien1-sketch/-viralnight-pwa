// Petites animations impératives, sans dépendance.

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const nf = new Intl.NumberFormat("fr-FR");

// easeOutExpo : démarre vite, ralentit à la fin — feel "premium".
function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// Compteur qui monte de 0 (ou de la valeur courante) jusqu'à `to`.
export function countUp(el, to, { dur = 800, format = (v) => nf.format(Math.round(v)) } = {}) {
  const from = el.__val || 0;
  el.__val = to;
  if (reduced()) {
    el.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  function frame(now) {
    const p = Math.min(1, (now - t0) / dur);
    const v = from + (to - from) * easeOutExpo(p);
    el.textContent = format(v);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Révèle en cascade une liste d'éléments (fade + translate y).
export function stagger(els, { step = 60, y = 8 } = {}) {
  els.forEach((el, i) => {
    if (reduced()) return;
    el.style.opacity = "0";
    el.style.transform = `translateY(${y}px)`;
    el.style.transition = "opacity .5s var(--ease-out), transform .5s var(--ease-out)";
    el.style.transitionDelay = `${i * step}ms`;
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        el.style.opacity = "1";
        el.style.transform = "none";
      })
    );
  });
}
