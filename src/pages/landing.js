// Ecran d'accueil apres scan du QR physique du club.
// Une seule chose a faire : "Rejoindre". Ambiance premium, nom du club
// en tres gros, halo corail comme un projecteur de scene (pas un degrade
// multicolore cliche).

import { h, icon } from "../lib/dom.js";
import { CLUB } from "../lib/mock.js";

export function Landing(_params, ctx) {
  const screen = h("div", { class: "lp" }, [
    // Atmosphere : halo corail diffus en haut + lueur de sol en bas.
    h("div", { class: "lp-atmos", "aria-hidden": "true" }, [
      h("span", { class: "lp-glow lp-glow-top" }),
      h("span", { class: "lp-glow lp-glow-floor" }),
    ]),

    // Barre du haut : marque ViralNight + statut "en salle".
    h("header", { class: "lp-top" }, [
      h("span", { class: "lp-brand" }, [
        h("span", { class: "lp-brand-mark", "aria-hidden": "true" }),
        "ViralNight",
      ]),
      h("span", { class: "lp-live" }, [
        h("span", { class: "lp-live-dot", "aria-hidden": "true" }),
        "En salle",
      ]),
    ]),

    // Coeur : le club.
    h("main", { class: "lp-hero" }, [
      h("p", { class: "lp-eyebrow reveal", style: { "--d": "0ms" } }, [
        icon("scan", 14),
        `Tu es au ${CLUB.name}, ${CLUB.city}`,
      ]),
      h("h1", { class: "lp-title reveal", style: { "--d": "70ms" } }, CLUB.name),
      h("p", { class: "lp-sub reveal", style: { "--d": "140ms" } }, [
        "Poste ta soirée, gagne des points, débloque des trucs gratuits. ",
        h("strong", {}, "Ce soir, ta story te rapporte."),
      ]),
    ]),

    // Bas : action unique + reassurance.
    h("footer", { class: "lp-cta reveal", style: { "--d": "220ms" } }, [
      h(
        "button",
        {
          class: "btn btn-primary btn-block lp-join",
          onClick: () => ctx.navigate("onboarding"),
        },
        ["Rejoindre", icon("arrowRight", 19)]
      ),
      h("p", { class: "lp-reassure" }, [
        icon("sparkles", 13),
        `${CLUB.city} · gratuit · aucune app à installer`,
      ]),
    ]),
  ]);

  return screen;
}
