// Ecran — Profil.
// Infos du clubbeur + reglages (haptique). Sobre, informatif.

import { h, icon } from "../lib/dom.js";
import { CLUB, USER } from "../lib/mock.js";
import { TierBadge } from "../components/TierBadge.js";
import { hapticsEnabled, setHaptics, tap } from "../lib/haptics.js";

const nf = new Intl.NumberFormat("fr-FR");

export function Profile(_params, ctx) {
  return h("div", { class: "pf-inner" }, [
    h("header", { class: "bn-head" }, [
      h(
        "button",
        { class: "ob-back", "aria-label": "Retour", onClick: () => ctx.back("dashboard") },
        icon("arrowRight", 18)
      ),
      h("span", { class: "label" }, "Profil"),
    ]),

    // Identite.
    h("section", { class: "pf-id reveal", style: { "--d": "0ms" } }, [
      h("div", { class: "pf-badge" }, [TierBadge(USER.tier, "md")]),
      h("div", {}, [
        h("p", { class: "pf-handle" }, `@${USER.handle || "toi"}`),
        h("p", { class: "pf-tier" }, [`Palier `, h("strong", {}, USER.tier.label)]),
      ]),
    ]),

    // Stats.
    h("section", { class: "pf-stats reveal", style: { "--d": "70ms" } }, [
      stat("Abonnés", nf.format(USER.followers)),
      stat("Multiplicateur", `×${USER.tier.mult}`),
      stat("Solde", nf.format(USER.points)),
    ]),

    // Reglages.
    h("section", { class: "pf-section reveal", style: { "--d": "140ms" } }, [
      h("p", { class: "label pf-section-label" }, "Réglages"),
      toggleRow("Vibrations", hapticsEnabled(), (on) => setHaptics(on)),
      infoRow("Email", USER.email || "—"),
      infoRow("Club", `${CLUB.name} · ${CLUB.city}`),
    ]),

    h("footer", { class: "pf-foot reveal", style: { "--d": "210ms" } }, [
      h(
        "button",
        { class: "btn btn-ghost btn-block", onClick: () => ctx.navigate("landing") },
        "Se déconnecter"
      ),
    ]),
  ]);

  function stat(label, value) {
    return h("div", { class: "pf-stat card" }, [
      h("span", { class: "pf-stat-val mono" }, value),
      h("span", { class: "pf-stat-label" }, label),
    ]);
  }

  function infoRow(label, value) {
    return h("div", { class: "pf-row" }, [
      h("span", { class: "pf-row-label" }, label),
      h("span", { class: "pf-row-val" }, value),
    ]);
  }

  function toggleRow(label, initial, onChange) {
    let on = initial;
    const knob = h("span", { class: "pf-toggle-knob" });
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
      [knob]
    );
    return h("div", { class: "pf-row" }, [h("span", { class: "pf-row-label" }, label), toggle]);
  }
}
