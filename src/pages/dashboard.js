// Ecran 3 — Dashboard perso (v4, branche sur Supabase).
// Solde, niveau + STREAK (flamme), defi actif (countdown), prochaine
// recompense, action "Poster ma story", acces Classement + Collection,
// historique.
//
// DONNEES : tout ce qui est chiffre vient de la base. Avant, cet ecran
// lisait mock.js et annoncait 480 pts pendant que la boutique en lisait
// 180 : deux soldes differents dans la meme app. Les valeurs de
// demonstration ne servent plus que de repli hors ligne.

import { h, icon } from "../lib/dom.js";
import { CLUB, USER, HISTORY, REWARDS, levelForPoints } from "../lib/mock.js";
import { PointsCounter } from "../components/PointsCounter.js";
import {
  loadStreak,
  loadActiveChallenge,
  loadMyProfile,
  loadMyHistory,
  loadPublicClub,
  loadPublicRewards,
  countdown,
} from "../lib/game.js";

const nf = new Intl.NumberFormat("fr-FR");
const dateFmt = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

export function Dashboard(_params, ctx) {
  // Emplacements remplis en async.
  const challengeSlot = h("div", { class: "db-slot" });
  const streakSlot = h("span", { class: "db-streak-slot" });
  const nextSlot = h("div", { class: "db-slot" });
  const histSlot = h("div", { class: "db-slot" });

  // Compteur monte a 0 : il s'anime vers le vrai solde des sa reception.
  const counter = PointsCounter(0, { animate: false });

  const niveauNom = h("span", { class: "db-level-name" }, [
    h("span", { class: "db-level-star", "aria-hidden": "true" }),
    "—",
  ]);
  const niveauBarre = h("span", { class: "db-bar-fill db-bar-fill-lvl", style: { width: "0%" } });
  const niveauReste = h("p", { class: "db-level-next mono" }, "");
  const compteRecomp = h("span", { class: "db-history-count mono" }, "");
  const handleEl = h("span", { class: "db-profile-handle" }, `@${USER.handle || "toi"}`);
  const clubEl = h("span", { class: "db-club" }, [
    h("span", { class: "db-club-dot", "aria-hidden": "true" }),
    CLUB.name,
  ]);

  const el = h("div", { class: "db" }, [
    h("header", { class: "db-top" }, [
      clubEl,
      h(
        "button",
        { class: "db-profile", "aria-label": "Ton profil", onClick: () => ctx.navigate("profile") },
        [handleEl, h("span", { class: "db-profile-ava", "aria-hidden": "true" }, icon("instagram", 15))]
      ),
    ]),

    h("main", { class: "db-body" }, [
      challengeSlot,

      h("section", { class: "db-balance reveal", style: { "--d": "0ms" } }, [
        h("p", { class: "label" }, "Ton solde"),
        counter,
      ]),

      h("section", { class: "db-level card reveal", style: { "--d": "70ms" } }, [
        h("div", { class: "db-level-head" }, [niveauNom, streakSlot]),
        h("div", { class: "db-bar db-bar-lvl", "aria-hidden": "true" }, [niveauBarre]),
        niveauReste,
      ]),

      nextSlot,

      h("section", { class: "db-action reveal", style: { "--d": "210ms" } }, [
        h("button", { class: "btn btn-primary btn-block db-post", onClick: () => ctx.navigate("post") }, [
          icon("instagram", 20),
          "Poster ma story",
        ]),
        h("p", { class: "db-action-hint" }, [icon("sparkles", 13), "Plus ta story fait de vues, plus tu gagnes"]),
      ]),

      h("section", { class: "db-tiles reveal", style: { "--d": "260ms" } }, [
        tile("trophy", "Classement", "Ta place cette semaine", () => ctx.navigate("leaderboard")),
        tile("medal", "Collection", "Tes badges débloqués", () => ctx.navigate("collection")),
      ]),

      h("section", { class: "db-history reveal", style: { "--d": "320ms" } }, [
        h("div", { class: "db-history-head" }, [h("span", { class: "label" }, "Tes soirées"), compteRecomp]),
        histSlot,
      ]),
    ]),
  ]);

  // --- Donnees -----------------------------------------------------------
  charger();

  // Flamme de streak : masquee tant qu'il n'y a pas de serie en cours.
  loadStreak().then((s) => {
    if (!s || !s.current_streak) return;
    streakSlot.replaceChildren(
      h("span", { class: "db-streak", title: `Record : ${s.longest_streak}` }, [
        icon("flame", 14),
        `${s.current_streak}`,
        h("span", { class: "db-streak-lbl" }, "soirées"),
      ])
    );
  });

  // Defi du moment : bandeau en haut d'ecran, avec son compte a rebours.
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

  async function charger() {
    // Repli hors ligne : sans Supabase, on affiche la demonstration plutot
    // qu'un ecran a zero qui ferait croire a un compte vide.
    const [me, evts, club] = await Promise.all([
      loadMyProfile().catch(() => null),
      loadMyHistory().catch(() => null),
      loadPublicClub().catch(() => null),
    ]);

    const solde = me?.points_balance ?? USER.points;
    const cumul = me?.lifetime_points ?? USER.totalEarned;
    const soirees = evts ?? HISTORY.map((e) => ({ ...e, _demo: true }));

    if (me?.handle) handleEl.textContent = `@${me.handle}`;
    if (club?.name) clubEl.replaceChildren(h("span", { class: "db-club-dot", "aria-hidden": "true" }), club.name);

    counter.setValue(solde);
    majNiveau(cumul);
    majHistorique(soirees);

    // Catalogue reel pour la prochaine recompense ; repli sur mock.js.
    const cat = club ? await loadPublicRewards(club.id).catch(() => null) : null;
    const paliers = (cat?.length ? cat : REWARDS.map((r) => ({ title: r.title, cost_points: r.cost })))
      .slice()
      .sort((a, b) => a.cost_points - b.cost_points);

    majProchaine(paliers, solde);
  }

  function majNiveau(cumul) {
    const lvl = levelForPoints(cumul);
    const pct = lvl.next ? Math.min(100, Math.round(((cumul - lvl.min) / (lvl.next - lvl.min)) * 100)) : 100;
    niveauNom.replaceChildren(h("span", { class: "db-level-star", "aria-hidden": "true" }), lvl.label);
    niveauBarre.style.width = `${pct}%`;
    niveauReste.textContent = lvl.next
      ? `${nf.format(lvl.next - cumul)} pts avant le niveau suivant`
      : "Niveau maximum atteint";
  }

  function majProchaine(paliers, solde) {
    const next = paliers.find((r) => r.cost_points > solde);
    const atteintes = paliers.filter((r) => r.cost_points <= solde).length;

    compteRecomp.textContent = atteintes
      ? `${atteintes} récompense${atteintes > 1 ? "s" : ""} atteinte${atteintes > 1 ? "s" : ""}`
      : "";

    if (!next) {
      nextSlot.replaceChildren();
      return;
    }
    const pct = Math.min(100, Math.round((solde / next.cost_points) * 100));
    nextSlot.replaceChildren(
      h("button", { class: "db-next card", onClick: () => ctx.navigate("rewards") }, [
        h("div", { class: "db-next-head" }, [
          h("span", { class: "label" }, "Prochaine récompense"),
          h("span", { class: "db-next-arrow" }, icon("chevron", 16)),
        ]),
        h("p", { class: "db-next-title" }, next.title),
        h("div", { class: "db-bar", "aria-hidden": "true" }, [
          h("span", { class: "db-bar-fill", style: { width: `${pct}%` } }),
        ]),
        h("div", { class: "db-next-foot" }, [
          h("span", { class: "mono db-next-remain" }, `${nf.format(next.cost_points - solde)} pts`),
          h("span", {}, " à débloquer"),
        ]),
      ])
    );
  }

  function majHistorique(evts) {
    if (!evts.length) {
      histSlot.replaceChildren(h("p", { class: "db-empty" }, "Ta première story apparaîtra ici."));
      return;
    }
    histSlot.replaceChildren(
      h(
        "ul",
        { class: "db-events" },
        evts.map((e) => {
          // Deux formes possibles : la ligne Supabase (mentioned_at,
          // awarded_points) et celle de demonstration (date, points).
          const quand = e.mentioned_at ? capitale(dateFmt.format(new Date(e.mentioned_at))) : e.date;
          const pts = e.awarded_points ?? e.points;
          const detail = e.views != null ? `${nf.format(e.views)} vues` : libelleType(e.kind);
          return h("li", { class: "db-event" }, [
            h("span", { class: "db-event-icn", "aria-hidden": "true" }, icon(iconeType(e.kind), 17)),
            h("span", { class: "db-event-main" }, [
              h("span", { class: "db-event-date" }, quand),
              h("span", { class: "db-event-meta" }, detail),
            ]),
            h("span", { class: "db-event-pts mono" }, `+${nf.format(pts)}`),
          ]);
        })
      )
    );
  }

  function tile(ic, title, sub, onClick) {
    return h("button", { class: "db-tile card", onClick }, [
      h("span", { class: "db-tile-icn", "aria-hidden": "true" }, icon(ic, 20)),
      h("span", { class: "db-tile-txt" }, [
        h("span", { class: "db-tile-title" }, title),
        h("span", { class: "db-tile-sub" }, sub),
      ]),
      h("span", { class: "db-tile-arrow", "aria-hidden": "true" }, icon("chevron", 16)),
    ]);
  }

  function iconeType(kind) {
    if (kind === "tiktok") return "tiktok";
    if (kind === "reel") return "reel";
    return "instagram";
  }
  function libelleType(kind) {
    if (kind === "tiktok") return "TikTok";
    if (kind === "reel") return "Reel";
    return "Story";
  }
  function capitale(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
