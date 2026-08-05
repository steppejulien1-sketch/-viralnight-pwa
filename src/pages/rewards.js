// Ecran — Recompenses.
// Deux vues : le catalogue du club, puis la confirmation de retrait avec
// un QR code unique a montrer au bar.

import { h, icon } from "../lib/dom.js";
import { CLUB, USER, REWARDS } from "../lib/mock.js";
import { RewardCard } from "../components/RewardCard.js";
import { impact } from "../lib/haptics.js";
import QRCode from "qrcode";

const nf = new Intl.NumberFormat("fr-FR");

// Code de retrait unique (mock). En prod : genere cote serveur, lie a
// une ligne `redemptions` avec RLS.
function redemptionCode() {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `VN-${CLUB.slug.split("-")[0].toUpperCase()}-${rnd}`;
}

export function Rewards(_params, ctx) {
  const root = h("div", { class: "rw-page" });
  renderCatalog();
  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  /* ---------- Catalogue ---------- */
  function renderCatalog() {
    const sorted = [...REWARDS].sort((a, b) => a.cost - b.cost);

    swap(
      h("div", { class: "rw-inner" }, [
        h("header", { class: "rw-head" }, [
          h(
            "button",
            { class: "ob-back", "aria-label": "Retour", onClick: () => ctx.back("dashboard") },
            icon("arrowRight", 18)
          ),
          h("span", { class: "label" }, "Récompenses"),
          h("span", { class: "rw-balance mono" }, `${nf.format(USER.points)} pts`),
        ]),

        h("div", { class: "rw-list" }, [
          h("h1", { class: "rw-h1 reveal", style: { "--d": "0ms" } }, `Ce que ${CLUB.name} t'offre`),
          h(
            "p",
            { class: "rw-lead reveal", style: { "--d": "60ms" } },
            "Échange tes points contre du concret, à retirer sur place."
          ),
          ...sorted.map((r, i) =>
            h(
              "div",
              { class: "reveal", style: { "--d": `${130 + i * 60}ms` } },
              RewardCard(r, USER.points, onRedeem)
            )
          ),
        ]),
      ])
    );
  }

  function onRedeem(reward) {
    impact(); // haptic marque
    USER.points -= reward.cost;
    renderTicket(reward, redemptionCode());
  }

  /* ---------- Ticket de retrait (QR) ---------- */
  async function renderTicket(reward, code) {
    const canvas = h("canvas", { class: "tk-qr", width: "220", height: "220" });

    swap(
      h("div", { class: "rw-inner rw-ticket" }, [
        h("header", { class: "rw-head" }, [
          h("span", {}),
          h("span", { class: "label" }, "À montrer au bar"),
          h(
            "button",
            { class: "ob-back rw-close", "aria-label": "Fermer", onClick: renderCatalog },
            icon("arrowRight", 18)
          ),
        ]),

        h("div", { class: "tk-body" }, [
          h("div", { class: "tk-check pop", style: { "--d": "0ms" } }, icon("check", 26)),
          h("h1", { class: "tk-title pop", style: { "--d": "90ms" } }, reward.title),
          h("p", { class: "tk-sub pop", style: { "--d": "150ms" } }, "Débloqué. Présente ce code au staff."),

          h("div", { class: "tk-card card pop", style: { "--d": "230ms" } }, [
            h("div", { class: "tk-qr-wrap" }, [canvas]),
            h("div", { class: "tk-code mono" }, code),
            h("div", { class: "tk-meta" }, [
              h("span", {}, `${CLUB.name} · ${CLUB.city}`),
              h("span", { class: "tk-valid" }, [
                h("span", { class: "tk-valid-dot" }),
                "Valable ce soir",
              ]),
            ]),
          ]),
        ]),

        h("footer", { class: "ps-foot pop", style: { "--d": "320ms" } }, [
          h(
            "button",
            { class: "btn btn-ghost btn-block", onClick: () => ctx.navigate("dashboard") },
            "Retour au tableau de bord"
          ),
        ]),
      ])
    );

    // QR rendu apres montage du canvas.
    try {
      await QRCode.toCanvas(canvas, code, {
        margin: 0,
        width: 220,
        color: { dark: "#f4f4f5", light: "#00000000" },
      });
    } catch (_) {
      /* si le rendu echoue, le code texte reste lisible dessous */
    }
  }
}
