// Ecran 3 — Dashboard perso.
// Hierarchie mobile-first : solde de points (le chiffre-roi), palier,
// prochaine recompense avec progression, PUIS l'action unique dominante
// "Poster ma story". L'historique vient en dessous, secondaire.

import { h, icon } from "../lib/dom.js";
import { CLUB, USER, HISTORY, REWARDS, nextReward } from "../lib/mock.js";
import { TierBadge } from "../components/TierBadge.js";
import { PointsCounter } from "../components/PointsCounter.js";

const nf = new Intl.NumberFormat("fr-FR");

export function Dashboard(_params, ctx) {
  const next = nextReward(USER.points);
  const unlocked = REWARDS.filter((r) => r.cost <= USER.points).length;
  const progress = next ? Math.min(100, Math.round((USER.points / next.cost) * 100)) : 100;
  const remaining = next ? next.cost - USER.points : 0;

  return h("div", { class: "db" }, [
    // --- Barre du haut : club + acces profil ---
    h("header", { class: "db-top" }, [
      h("span", { class: "db-club" }, [
        h("span", { class: "db-club-dot", "aria-hidden": "true" }),
        CLUB.name,
      ]),
      h(
        "button",
        {
          class: "db-profile",
          "aria-label": "Ton profil",
          onClick: () => ctx.navigate("profile"),
        },
        [
          h("span", { class: "db-profile-handle" }, `@${USER.handle || "toi"}`),
          h("span", { class: "db-profile-ava mono" }, `×${USER.tier.mult}`),
        ]
      ),
    ]),

    h("main", { class: "db-body" }, [
      // --- Solde (le chiffre-roi) ---
      h("section", { class: "db-balance reveal", style: { "--d": "0ms" } }, [
        h("p", { class: "label" }, "Ton solde"),
        PointsCounter(USER.points),
        h("div", { class: "db-tier-line" }, [
          TierBadge(USER.tier, "sm"),
          h("span", {}, [
            "Palier ",
            h("strong", {}, USER.tier.label),
            ` · chaque story ×${USER.tier.mult}`,
          ]),
        ]),
      ]),

      // --- Prochaine recompense (progression) ---
      next
        ? h(
            "button",
            {
              class: "db-next card reveal",
              style: { "--d": "80ms" },
              onClick: () => ctx.navigate("rewards"),
            },
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

      // --- Action unique dominante ---
      h("section", { class: "db-action reveal", style: { "--d": "150ms" } }, [
        h(
          "button",
          {
            class: "btn btn-primary btn-block db-post",
            onClick: () => ctx.navigate("post"),
          },
          [icon("instagram", 20), "Poster ma story"]
        ),
        h("p", { class: "db-action-hint" }, [
          icon("sparkles", 13),
          "Poste maintenant, la soirée bat son plein",
        ]),
      ]),

      // --- Historique des soirees ---
      h("section", { class: "db-history reveal", style: { "--d": "220ms" } }, [
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
                    h("span", { class: "db-event-meta" }, `${e.kind} · ${nf.format(e.views)} vues`),
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
