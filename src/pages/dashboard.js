// Ecran 3 — Dashboard perso (v2).
// Plus de palier d'abonnes. On montre : le solde (chiffre-roi), le NIVEAU
// (activite cumulee) avec sa progression, la prochaine recompense, l'action
// unique "Poster ma story", puis l'historique (vues reelles + points).

import { h, icon } from "../lib/dom.js";
import { CLUB, USER, HISTORY, REWARDS, nextReward, levelForPoints } from "../lib/mock.js";
import { PointsCounter } from "../components/PointsCounter.js";

const nf = new Intl.NumberFormat("fr-FR");

export function Dashboard(_params, ctx) {
  const next = nextReward(USER.points);
  const unlocked = REWARDS.filter((r) => r.cost <= USER.points).length;
  const progress = next ? Math.min(100, Math.round((USER.points / next.cost) * 100)) : 100;
  const remaining = next ? next.cost - USER.points : 0;

  const level = levelForPoints(USER.totalEarned);
  const lvlProgress = level.next
    ? Math.min(100, Math.round(((USER.totalEarned - level.min) / (level.next - level.min)) * 100))
    : 100;

  return h("div", { class: "db" }, [
    h("header", { class: "db-top" }, [
      h("span", { class: "db-club" }, [h("span", { class: "db-club-dot", "aria-hidden": "true" }), CLUB.name]),
      h(
        "button",
        { class: "db-profile", "aria-label": "Ton profil", onClick: () => ctx.navigate("profile") },
        [
          h("span", { class: "db-profile-handle" }, `@${USER.handle || "toi"}`),
          h("span", { class: "db-profile-ava", "aria-hidden": "true" }, icon("instagram", 15)),
        ]
      ),
    ]),

    h("main", { class: "db-body" }, [
      // Solde.
      h("section", { class: "db-balance reveal", style: { "--d": "0ms" } }, [
        h("p", { class: "label" }, "Ton solde"),
        PointsCounter(USER.points),
      ]),

      // Niveau + progression.
      h("section", { class: "db-level card reveal", style: { "--d": "70ms" } }, [
        h("div", { class: "db-level-head" }, [
          h("span", { class: "db-level-name" }, [h("span", { class: "db-level-star", "aria-hidden": "true" }), level.label]),
          level.next
            ? h("span", { class: "db-level-next mono" }, `${nf.format(level.next - USER.totalEarned)} pts → niveau suivant`)
            : h("span", { class: "db-level-next" }, "Niveau max"),
        ]),
        h("div", { class: "db-bar db-bar-lvl", "aria-hidden": "true" }, [
          h("span", { class: "db-bar-fill db-bar-fill-lvl", style: { width: `${lvlProgress}%` } }),
        ]),
      ]),

      // Prochaine recompense.
      next
        ? h(
            "button",
            { class: "db-next card reveal", style: { "--d": "140ms" }, onClick: () => ctx.navigate("rewards") },
            [
              h("div", { class: "db-next-head" }, [
                h("span", { class: "label" }, "Prochaine récompense"),
                h("span", { class: "db-next-arrow" }, icon("arrowRight", 16)),
              ]),
              h("p", { class: "db-next-title" }, next.title),
              h("div", { class: "db-bar", "aria-hidden": "true" }, [
                h("span", { class: "db-bar-fill", style: { width: `${progress}%` } }),
              ]),
              h("div", { class: "db-next-foot" }, [
                h("span", { class: "mono db-next-remain" }, `${nf.format(remaining)} pts`),
                h("span", {}, " à débloquer"),
              ]),
            ]
          )
        : null,

      // Action unique.
      h("section", { class: "db-action reveal", style: { "--d": "210ms" } }, [
        h("button", { class: "btn btn-primary btn-block db-post", onClick: () => ctx.navigate("post") }, [
          icon("instagram", 20),
          "Poster ma story",
        ]),
        h("p", { class: "db-action-hint" }, [icon("sparkles", 13), "Plus ta story fait de vues, plus tu gagnes"]),
      ]),

      // Historique.
      h("section", { class: "db-history reveal", style: { "--d": "280ms" } }, [
        h("div", { class: "db-history-head" }, [
          h("span", { class: "label" }, "Tes soirées"),
          h("span", { class: "db-history-count mono" }, `${unlocked} récompense${unlocked > 1 ? "s" : ""} atteinte${unlocked > 1 ? "s" : ""}`),
        ]),
        HISTORY.length
          ? h(
              "ul",
              { class: "db-events" },
              HISTORY.map((e) =>
                h("li", { class: "db-event" }, [
                  h("span", { class: "db-event-icn", "aria-hidden": "true" }, icon("instagram", 17)),
                  h("span", { class: "db-event-main" }, [
                    h("span", { class: "db-event-date" }, e.date),
                    h("span", { class: "db-event-meta" }, `${nf.format(e.views)} vues`),
                  ]),
                  h("span", { class: "db-event-pts mono" }, `+${e.points}`),
                ])
              )
            )
          : h("p", { class: "db-empty" }, "Ta première story apparaîtra ici."),
      ]),
    ]),
  ]);
}
