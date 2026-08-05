// Ecran 3 — Dashboard perso (v3, gamifié).
// Solde, niveau + STREAK (flamme), défi actif (countdown), prochaine
// récompense, action "Poster ma story", accès Classement + Collection,
// historique.

import { h, icon } from "../lib/dom.js";
import { CLUB, USER, HISTORY, REWARDS, nextReward, levelForPoints } from "../lib/mock.js";
import { PointsCounter } from "../components/PointsCounter.js";
import { loadStreak, loadActiveChallenge, countdown } from "../lib/game.js";

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

  // Emplacements remplis en async (Supabase).
  const challengeSlot = h("div", { class: "db-slot" });
  const streakSlot = h("span", { class: "db-streak-slot" });

  const el = h("div", { class: "db" }, [
    h("header", { class: "db-top" }, [
      h("span", { class: "db-club" }, [h("span", { class: "db-club-dot", "aria-hidden": "true" }), CLUB.name]),
      h(
        "button",
        { class: "db-profile", "aria-label": "Ton profil", onClick: () => ctx.navigate("profile") },
        [h("span", { class: "db-profile-handle" }, `@${USER.handle || "toi"}`), h("span", { class: "db-profile-ava", "aria-hidden": "true" }, icon("instagram", 15))]
      ),
    ]),

    h("main", { class: "db-body" }, [
      challengeSlot,

      h("section", { class: "db-balance reveal", style: { "--d": "0ms" } }, [
        h("p", { class: "label" }, "Ton solde"),
        PointsCounter(USER.points),
      ]),

      // Niveau + streak + progression.
      h("section", { class: "db-level card reveal", style: { "--d": "70ms" } }, [
        h("div", { class: "db-level-head" }, [
          h("span", { class: "db-level-name" }, [h("span", { class: "db-level-star", "aria-hidden": "true" }), level.label]),
          streakSlot,
        ]),
        h("div", { class: "db-bar db-bar-lvl", "aria-hidden": "true" }, [
          h("span", { class: "db-bar-fill db-bar-fill-lvl", style: { width: `${lvlProgress}%` } }),
        ]),
        level.next
          ? h("p", { class: "db-level-next mono" }, `${nf.format(level.next - USER.totalEarned)} pts avant le niveau suivant`)
          : h("p", { class: "db-level-next" }, "Niveau maximum atteint"),
      ]),

      next
        ? h("button", { class: "db-next card reveal", style: { "--d": "140ms" }, onClick: () => ctx.navigate("rewards") }, [
            h("div", { class: "db-next-head" }, [h("span", { class: "label" }, "Prochaine récompense"), h("span", { class: "db-next-arrow" }, icon("chevron", 16))]),
            h("p", { class: "db-next-title" }, next.title),
            h("div", { class: "db-bar", "aria-hidden": "true" }, [h("span", { class: "db-bar-fill", style: { width: `${progress}%` } })]),
            h("div", { class: "db-next-foot" }, [h("span", { class: "mono db-next-remain" }, `${nf.format(remaining)} pts`), h("span", {}, " à débloquer")]),
          ])
        : null,

      h("section", { class: "db-action reveal", style: { "--d": "210ms" } }, [
        h("button", { class: "btn btn-primary btn-block db-post", onClick: () => ctx.navigate("post") }, [icon("instagram", 20), "Poster ma story"]),
        h("p", { class: "db-action-hint" }, [icon("sparkles", 13), "Plus ta story fait de vues, plus tu gagnes"]),
      ]),

      // Accès Classement + Collection.
      h("section", { class: "db-tiles reveal", style: { "--d": "260ms" } }, [
        tile("trophy", "Classement", "Ta place cette semaine", () => ctx.navigate("leaderboard")),
        tile("medal", "Collection", "Tes badges débloqués", () => ctx.navigate("collection")),
      ]),

      h("section", { class: "db-history reveal", style: { "--d": "320ms" } }, [
        h("div", { class: "db-history-head" }, [
          h("span", { class: "label" }, "Tes soirées"),
          h("span", { class: "db-history-count mono" }, `${unlocked} récompense${unlocked > 1 ? "s" : ""} atteinte${unlocked > 1 ? "s" : ""}`),
        ]),
        HISTORY.length
          ? h("ul", { class: "db-events" }, HISTORY.map((e) =>
              h("li", { class: "db-event" }, [
                h("span", { class: "db-event-icn", "aria-hidden": "true" }, icon("instagram", 17)),
                h("span", { class: "db-event-main" }, [h("span", { class: "db-event-date" }, e.date), h("span", { class: "db-event-meta" }, `${nf.format(e.views)} vues`)]),
                h("span", { class: "db-event-pts mono" }, `+${e.points}`),
              ])
            ))
          : h("p", { class: "db-empty" }, "Ta première story apparaîtra ici."),
      ]),
    ]),
  ]);

  // Chargement gamification (streak + défi).
  loadStreak().then((s) => {
    if (s && s.current_streak > 0) {
      streakSlot.replaceChildren(
        h("span", { class: "db-streak", title: `Record : ${s.longest_streak}` }, [icon("flame", 14), `${s.current_streak}`, h("span", { class: "db-streak-lbl" }, "soirées")])
      );
    }
  });
  loadActiveChallenge().then((c) => {
    if (!c) return;
    challengeSlot.replaceChildren(
      h("button", { class: "db-challenge reveal", onClick: () => ctx.navigate("post") }, [
        h("div", { class: "db-chal-left" }, [
          h("span", { class: "db-chal-tag" }, [icon("sparkles", 12), "Défi du moment"]),
          h("p", { class: "db-chal-title" }, c.title),
          h("p", { class: "db-chal-desc" }, c.description || ""),
        ]),
        h("div", { class: "db-chal-right" }, [
          h("span", { class: "db-chal-bonus mono" }, `+${nf.format(c.bonus_points)}`),
          h("span", { class: "db-chal-time mono" }, countdown(c.ends_at)),
        ]),
      ])
    );
  });

  return el;

  function tile(ic, title, sub, onClick) {
    return h("button", { class: "db-tile card", onClick }, [
      h("span", { class: "db-tile-icn", "aria-hidden": "true" }, icon(ic, 20)),
      h("span", { class: "db-tile-txt" }, [h("span", { class: "db-tile-title" }, title), h("span", { class: "db-tile-sub" }, sub)]),
      h("span", { class: "db-tile-arrow", "aria-hidden": "true" }, icon("chevron", 16)),
    ]);
  }
}
