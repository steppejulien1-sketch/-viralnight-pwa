// Routeur SPA minimal avec transitions d'ecran (slide horizontal).
//
// Chaque page est une fonction async qui recoit (params, ctx) et retourne
// un element DOM (le .screen). Le routeur gere le montage et l'animation
// d'entree/sortie. Pas de dependance : ~1 KB.

export function createRouter({ mount, routes, initial }) {
  let currentEl = null;
  let animating = false;

  const ctx = {
    navigate: (name, params) => go(name, params, "forward"),
    back: (name, params) => go(name, params, "back"),
  };

  async function go(name, params = {}, direction = "forward") {
    if (animating) return;
    const factory = routes[name];
    if (!factory) {
      console.warn(`Route inconnue : ${name}`);
      return;
    }

    const nextEl = await factory(params, ctx);
    nextEl.classList.add("screen");

    // Premier montage : pas d'animation de sortie.
    if (!currentEl) {
      mount.appendChild(nextEl);
      currentEl = nextEl;
      requestAnimationFrame(() => nextEl.classList.add("is-active"));
      return;
    }

    animating = true;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    // L'ecran entrant demarre decale (droite si forward, gauche si back).
    const enterFrom = direction === "back" ? "-100%" : "100%";
    const exitTo = direction === "back" ? "100%" : "-100%";

    nextEl.style.transform = reduced ? "none" : `translateX(${enterFrom})`;
    mount.appendChild(nextEl);

    const outgoing = currentEl;
    currentEl = nextEl;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        nextEl.classList.add("is-active");
        if (!reduced) {
          nextEl.style.transform = "translateX(0)";
          outgoing.style.transform = `translateX(${exitTo})`;
          outgoing.style.opacity = "0.6";
        }
      });
    });

    const done = () => {
      outgoing.remove();
      nextEl.style.transform = "";
      animating = false;
    };

    if (reduced) {
      done();
    } else {
      let finished = false;
      const end = () => {
        if (finished) return;
        finished = true;
        done();
      };
      nextEl.addEventListener("transitionend", end, { once: true });
      // Filet de securite si transitionend ne se declenche pas.
      setTimeout(end, 400);
    }
  }

  go(initial, {}, "forward");
  return ctx;
}
