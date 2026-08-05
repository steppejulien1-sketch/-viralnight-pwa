// Carte de recompense du catalogue. Deux etats : accessible (assez de
// points -> bouton Debloquer) ou hors de portee (barre + points manquants).

import { h, icon } from "../lib/dom.js";

const nf = new Intl.NumberFormat("fr-FR");

export function RewardCard(reward, points, onRedeem) {
  const affordable = points >= reward.cost;
  const progress = Math.min(100, Math.round((points / reward.cost) * 100));
  const remaining = reward.cost - points;

  return h("div", { class: `rc card${affordable ? " is-open" : ""}` }, [
    h("div", { class: "rc-top" }, [
      h("div", { class: "rc-info" }, [
        h("p", { class: "rc-title" }, reward.title),
        h("p", { class: "rc-desc" }, reward.desc),
      ]),
      h("div", { class: "rc-cost" }, [
        h("span", { class: "rc-cost-num mono" }, nf.format(reward.cost)),
        h("span", { class: "rc-cost-unit" }, "pts"),
      ]),
    ]),

    affordable
      ? h(
          "button",
          { class: "btn btn-primary btn-block rc-btn", onClick: () => onRedeem(reward) },
          [icon("gift", 18), "Débloquer maintenant"]
        )
      : h("div", { class: "rc-locked" }, [
          h("div", { class: "rc-bar", "aria-hidden": "true" }, [
            h("span", { class: "rc-bar-fill", style: { width: `${progress}%` } }),
          ]),
          h("p", { class: "rc-remaining" }, [
            h("span", { class: "mono" }, `${nf.format(remaining)} pts`),
            " avant de débloquer",
          ]),
        ]),
  ]);
}
