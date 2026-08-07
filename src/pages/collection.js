// Ecran — Collection (badges).
//
// ⚠️ CE QUI A CHANGE, ET POURQUOI.
// L'ecran affichait une grille de cadenas gris. Deux problemes de fond :
//   - AUCUNE fonction n'attribuait les badges : ils ne pouvaient jamais se
//     debloquer. Les deux "obtenus" du compte de demo avaient ete inseres
//     a la main.
//   - deux badges etaient intenables par nature ("Recruteur : tu as
//     parraine un ami", "Soiree legendaire") : ni parrainage ni evenement
//     n'existent dans le produit.
//
// Desormais (migration 0017) chaque badge porte une cible chiffree et sa
// progression se calcule sur les vraies donnees. L'ecran montre donc
// "5 275 / 10 000" au lieu d'un cadenas : on sait ce qu'il reste a faire.
// Les badges en cours passent AVANT les autres — c'est la que se joue
// l'envie de reposter.

import { h, icon } from "../lib/dom.js";
import { loadMyBadges } from "../lib/game.js";

const nf = new Intl.NumberFormat("fr-FR");
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

export function Collection(_params, ctx) {
  const root = h("div", { class: "cl-page" });
  render(null);
  loadMyBadges().then((b) => render(b));
  return root;

  function render(badges) {
    const head = h("header", { class: "cl-head" }, [
      h("button", { class: "ob-back", "aria-label": "Retour", onClick: () => ctx.back("dashboard") }, icon("arrowRight", 18)),
      h("span", { class: "label" }, "Collection"),
    ]);

    if (!badges) {
      root.replaceChildren(h("div", { class: "cl-inner" }, [head, h("p", { class: "rw-empty-msg" }, "Chargement…")]));
      return;
    }
    if (!badges.length) {
      root.replaceChildren(
        h("div", { class: "cl-inner" }, [head, h("p", { class: "rw-empty-msg" }, "Aucun badge pour ce club.")])
      );
      return;
    }

    const obtenus = badges.filter((b) => b.unlocked).length;

    // Les badges en cours d'abord, du plus proche du but au plus loin :
    // c'est celui qu'on peut decrocher ce soir qui donne envie de poster.
    const restants = badges
      .filter((b) => !b.unlocked)
      .sort((a, b) => part(b) - part(a));
    const faits = badges.filter((b) => b.unlocked);

    const prochain = restants[0];

    root.replaceChildren(
      h("div", { class: "cl-inner" }, [
        head,

        h("div", { class: "cl-title-wrap reveal", style: { "--d": "0ms" } }, [
          h("h1", { class: "cl-title" }, "Ta collection"),
          h("p", { class: "cl-sub" }, [
            h("span", { class: "mono cl-count" }, `${obtenus}/${badges.length}`),
            " débloqués",
          ]),
        ]),

        // Barre d'ensemble : une lecture immediate de l'avancement global.
        h("div", { class: "cl-overall reveal", style: { "--d": "50ms" }, "aria-hidden": "true" }, [
          h("span", {
            class: "cl-overall-fill",
            style: { width: `${Math.round((obtenus / badges.length) * 100)}%` },
          }),
        ]),

        prochain
          ? h("p", { class: "cl-next reveal", style: { "--d": "90ms" } }, [
              "Le plus proche : ",
              h("strong", {}, prochain.name),
              ` — il te manque ${nf.format(Math.max(0, prochain.target - prochain.current_value))} ${unite(prochain.metric)}.`,
            ])
          : h("p", { class: "cl-next reveal", style: { "--d": "90ms" } }, "Tout est débloqué. Respect."),

        h(
          "ul",
          { class: "cl-list reveal", style: { "--d": "140ms" } },
          [...restants, ...faits].map(ligne)
        ),
      ])
    );
  }

  function ligne(b) {
    const pct = Math.round(part(b) * 100);
    return h("li", { class: `cl-badge${b.unlocked ? " is-on" : ""}` }, [
      h("span", { class: "cl-badge-icn", "aria-hidden": "true" }, icon(b.icon || "medal", 22)),

      h("div", { class: "cl-badge-main" }, [
        h("div", { class: "cl-badge-top" }, [
          h("span", { class: "cl-badge-name" }, b.name),
          b.unlocked
            ? h("span", { class: "cl-badge-done" }, [icon("check", 13), "Obtenu"])
            : h("span", { class: "cl-badge-count mono" }, `${nf.format(b.current_value)} / ${nf.format(b.target)}`),
        ]),
        h("p", { class: "cl-badge-desc" }, b.description || ""),

        b.unlocked
          ? b.unlocked_at
            ? h("p", { class: "cl-badge-date" }, `Le ${dateFmt.format(new Date(b.unlocked_at))}`)
            : null
          : h("div", { class: "cl-badge-bar", "aria-hidden": "true" }, [
              h("span", { class: "cl-badge-fill", style: { width: `${pct}%` } }),
            ]),
      ]),
    ]);
  }

  // Part accomplie, bornee a 1 : sert au tri et a la largeur de la barre.
  function part(b) {
    if (!b.target) return 0;
    return Math.min(1, (b.current_value || 0) / b.target);
  }

  function unite(metric) {
    if (metric === "views") return "vues";
    if (metric === "redemptions") return "récompense à retirer";
    if (metric === "streak") return "soirées d'affilée";
    return "contenus";
  }
}
