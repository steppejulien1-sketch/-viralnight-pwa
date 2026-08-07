// Ecran d'accueil apres scan du QR physique du club — v3 "vitrine".
//
// L'ancienne version montrait un nom de club geant et une promesse
// floue ("debloque des trucs gratuits"), puis demandait de s'inscrire.
// On perdait le monde exactement la : personne ne s'engage sans savoir
// ce qu'il y gagne.
//
// Cette version repond a "qu'est-ce que j'y gagne ?" AVANT la question :
// les recompenses reelles sont visibles des le premier ecran, le bareme
// est ecrit noir sur blanc, et un chiffre reel montre que c'est atteignable.

import { h, icon } from "../lib/dom.js";
import { CLUB, REWARDS, HISTORY, STORY_BASE_POINTS, POINTS_PER_100_VIEWS } from "../lib/mock.js";

const nf = new Intl.NumberFormat("fr-FR");

// Pictogramme par recompense. On se cale sur l'id, pas sur le libelle :
// le club peut renommer sa recompense sans casser l'icone.
const PICTO = {
  drink: "gift",
  "coupe-file": "sparkles",
  vip: "trophy",
  table: "medal",
};

export function Landing(_params, ctx) {
  // La moins chere en premier : c'est elle qui declenche l'inscription.
  const parPrix = [...REWARDS].sort((a, b) => a.cost - b.cost);
  const premiere = parPrix[0];

  // Preuve chiffree tiree de l'historique reel, jamais inventee.
  const derniere = HISTORY[0] || null;
  const soirees = derniere ? Math.ceil(premiere.cost / derniere.points) : 0;

  return h("div", { class: "lp" }, [
    // Lueur rouge unique, en haut a gauche. Une seule couleur sur l'ecran.
    h("div", { class: "lp-atmos", "aria-hidden": "true" }, [h("span", { class: "lp-glow" })]),

    h("header", { class: "lp-top" }, [
      h("span", { class: "lp-brand" }, [h("span", { class: "lp-brand-mark", "aria-hidden": "true" }), "ViralNight"]),
      h("span", { class: "lp-live" }, [h("span", { class: "lp-live-dot", "aria-hidden": "true" }), "En salle"]),
    ]),

    h("main", { class: "lp-body" }, [
      // --- Accroche ---
      h("section", { class: "lp-hook" }, [
        h("p", { class: "lp-here reveal", style: { "--d": "0ms" } }, [icon("scan", 13), `Tu es au ${CLUB.name}`]),
        h("h1", { class: "lp-title reveal", style: { "--d": "60ms" } }, [
          "Ta story de ce soir vaut ",
          h("em", {}, "un verre"),
          ".",
        ]),
        h("p", { class: "lp-sub reveal", style: { "--d": "120ms" } }, "Poste, on compte les vues, tu retires au bar. C'est tout."),
      ]),

      // --- Vitrine : ce qu'on peut prendre ---
      h("section", { class: "lp-shelf reveal", style: { "--d": "180ms" } }, [
        h("div", { class: "lp-shelf-head" }, [
          h("span", { class: "label" }, "Ce que tu peux prendre"),
          h("span", { class: "lp-shelf-count mono" }, `${parPrix.length} dispos`),
        ]),
        h(
          "ul",
          { class: "lp-rail" },
          parPrix.map((r, i) =>
            h("li", { class: `lp-reward${i === 0 ? " is-first" : ""}` }, [
              h("span", { class: "lp-reward-icn", "aria-hidden": "true" }, icon(PICTO[r.id] || "gift", 19)),
              h("span", { class: "lp-reward-title" }, r.title),
              h("span", { class: "lp-reward-cost mono" }, [nf.format(r.cost), h("small", {}, "pts")]),
            ])
          )
        ),
      ]),

      // --- Comment ca marche, en 3 temps ---
      h("section", { class: "lp-how reveal", style: { "--d": "240ms" } }, [
        etape("1", "Poste ta story", `Tague @${CLUB.igHandle}`),
        etape("2", "On compte tes vues", `${STORY_BASE_POINTS} pts d'office, + ${POINTS_PER_100_VIEWS} pts par 100 vues`),
        etape("3", "Tu retires au bar", "Tu montres ton code, c'est réglé"),
      ]),

      // --- Preuve chiffree (uniquement si on a un vrai historique) ---
      derniere
        ? h("section", { class: "lp-proof reveal", style: { "--d": "300ms" } }, [
            h("span", { class: "lp-proof-num mono" }, nf.format(derniere.views)),
            h("p", { class: "lp-proof-txt" }, [
              "vues sur la story de la dernière soirée — ",
              h("strong", {}, `${derniere.points} pts`),
              soirees > 1 ? `. Ta première récompense en ${soirees} soirées.` : ".",
            ]),
          ])
        : null,
    ]),

    // --- Action, collee en bas ---
    h("footer", { class: "lp-cta" }, [
      h("button", { class: "btn btn-primary btn-block lp-join", onClick: () => ctx.navigate("onboarding") }, [
        "Commencer",
        icon("arrowRight", 19),
      ]),
      h("p", { class: "lp-reassure" }, `${CLUB.city} · gratuit · aucune app à installer`),
    ]),
  ]);

  function etape(n, titre, detail) {
    return h("div", { class: "lp-step" }, [
      h("span", { class: "lp-step-n mono", "aria-hidden": "true" }, n),
      h("span", { class: "lp-step-txt" }, [
        h("span", { class: "lp-step-title" }, titre),
        h("span", { class: "lp-step-detail" }, detail),
      ]),
    ]);
  }
}
