// Ecran — Profil (v2).
// Compte connecte + niveau + reglages.
//
// Le nombre d'abonnes est AFFICHE mais n'entre dans AUCUN calcul de
// points : la v2 recompense les VUES REELLES, pas la taille de l'audience.
// Il est lu depuis la base, ou seules les edge functions peuvent l'ecrire
// (migration 0009) -- un clubbeur ne peut pas s'inventer 2 millions d'abonnes.

import { h, icon } from "../lib/dom.js";
import { CLUB, USER, HISTORY, levelForPoints } from "../lib/mock.js";
import { hapticsEnabled, setHaptics, tap } from "../lib/haptics.js";
import { loadMyProfile } from "../lib/game.js";

const nf = new Intl.NumberFormat("fr-FR");

export function Profile(_params, ctx) {
  const level = levelForPoints(USER.totalEarned);

  // Ligne "Abonnes" : masquee tant qu'on n'a pas le chiffre, plutot que
  // d'afficher un tiret qui laisse croire a une erreur.
  const abosRow = h("div", { hidden: true });
  loadMyProfile().then((me) => {
    if (!me || me.follower_count == null) return;
    abosRow.replaceWith(
      infoRow(
        me.follower_source === "tiktok" ? "Abonnés TikTok" : "Abonnés Instagram",
        nf.format(me.follower_count)
      )
    );
  });

  return h("div", { class: "pf-inner" }, [
    h("header", { class: "bn-head" }, [
      h("button", { class: "ob-back", "aria-label": "Retour", onClick: () => ctx.back("dashboard") }, icon("arrowRight", 18)),
      h("span", { class: "label" }, "Profil"),
    ]),

    h("section", { class: "pf-id reveal", style: { "--d": "0ms" } }, [
      h("div", { class: "pf-ava", "aria-hidden": "true" }, icon("instagram", 24)),
      h("div", {}, [
        h("p", { class: "pf-handle" }, `@${USER.handle || "toi"}`),
        h("p", { class: "pf-tier" }, [h("span", { class: "pf-lvl-star", "aria-hidden": "true" }), level.label]),
      ]),
    ]),

    h("section", { class: "pf-stats reveal", style: { "--d": "70ms" } }, [
      stat("Points", nf.format(USER.points)),
      stat("Gagnés en tout", nf.format(USER.totalEarned)),
      stat("Soirées", String(HISTORY.length)),
    ]),

    h("section", { class: "pf-section reveal", style: { "--d": "140ms" } }, [
      h("p", { class: "label pf-section-label" }, "Réglages"),
      toggleRow("Vibrations", hapticsEnabled(), (on) => setHaptics(on)),
      abosRow,
      infoRow("Compte", USER.connected ? "Connecté" : "—"),
      infoRow("Club", `${CLUB.name} · ${CLUB.city}`),
    ]),

    h("footer", { class: "pf-foot reveal", style: { "--d": "210ms" } }, [
      h("button", { class: "btn btn-ghost btn-block", onClick: () => ctx.navigate("landing") }, "Se déconnecter"),
    ]),
  ]);

  function stat(label, value) {
    return h("div", { class: "pf-stat card" }, [
      h("span", { class: "pf-stat-val mono" }, value),
      h("span", { class: "pf-stat-label" }, label),
    ]);
  }
  function infoRow(label, value) {
    return h("div", { class: "pf-row" }, [h("span", { class: "pf-row-label" }, label), h("span", { class: "pf-row-val" }, value)]);
  }
  function toggleRow(label, initial, onChange) {
    let on = initial;
    const toggle = h(
      "button",
      {
        class: `pf-toggle${on ? " is-on" : ""}`,
        role: "switch",
        "aria-checked": String(on),
        "aria-label": label,
        onClick: () => {
          on = !on;
          toggle.classList.toggle("is-on", on);
          toggle.setAttribute("aria-checked", String(on));
          tap();
          onChange(on);
        },
      },
      [h("span", { class: "pf-toggle-knob" })]
    );
    return h("div", { class: "pf-row" }, [h("span", { class: "pf-row-label" }, label), toggle]);
  }
}
