// Carte de recompense — la seule.
//
// Elle lit la VRAIE forme de donnees (`cost_points`, `category`,
// `stock_remaining`), celle de la table `rewards`. L'ancien composant
// components/RewardCard.js attendait `reward.cost` et `reward.desc` :
// branche tel quel, il aurait affiche « NaN pts » partout. C'est
// probablement pour ca qu'il n'a jamais ete importe et que la carte a
// ete reecrite dans la page.

import { h, icon } from "../lib/dom.js";
import { Button, Card, Points, Progress } from "../ui/index.js";
import "./RewardCard.css";

const nf = new Intl.NumberFormat("fr-FR");

const CATEGORIES = {
  boisson: "Boisson",
  entree: "Entrée",
  vip: "VIP",
  exclusif: "Exclusif",
};

/**
 * Etat d'une recompense pour un solde donne.
 * Les NIVEAUX sont desactives : une recompense ne depend plus que
 * des points et du stock. Une deuxieme condition, invisible et lente
 * a atteindre, decourageait sans rien apporter.
 */
export function etatRecompense(r, balance) {
  const assezDePoints = balance >= r.cost_points;
  const enStock = r.stock_remaining == null || r.stock_remaining > 0;
  return { assezDePoints, enStock, ouverte: assezDePoints && enStock };
}

/**
 * @param {object} r        ligne de la table rewards
 * @param {number} balance  solde du clubbeur
 * @param {Function} onRedeem (reward) => void
 */
export function RewardCard(r, balance, onRedeem) {
  const e = etatRecompense(r, balance);
  const manque = Math.max(0, r.cost_points - balance);

  return Card({ live: e.ouverte }, [
    h("div", { class: "vn-reward" }, [
      h("div", { class: "vn-reward__top" }, [
        h("div", { class: "vn-reward__info" }, [
          h("p", { class: "vn-reward__title" }, r.title),
          r.description ? h("p", { class: "vn-reward__desc" }, r.description) : null,
        ]),
        // Prix en encre rouge s'il est atteignable, gris sinon :
        // sans ca tout le catalogue s'allume et plus rien ne ressort.
        h("div", { class: "vn-reward__cost" }, [
          Points(r.cost_points, { size: "md", off: !e.ouverte }),
        ]),
      ]),

      h("div", { class: "vn-reward__meta" }, [
        r.category
          ? h("span", { class: "vn-reward__cat" }, CATEGORIES[r.category] || r.category)
          : null,
        r.stock_remaining != null
          ? h(
              "span",
              { class: "vn-reward__stock" },
              `${r.stock_remaining} restante${r.stock_remaining > 1 ? "s" : ""}`
            )
          : null,
      ]),

      corps(),
    ]),
  ]);

  function corps() {
    if (e.ouverte) {
      return Button({
        label: "Débloquer",
        ico: icon("gift", 18),
        block: true,
        onClick: () => onRedeem(r),
      });
    }
    if (!e.enStock) {
      return h("p", { class: "vn-reward__out" }, "Stock épuisé — reviens plus tard.");
    }
    return h("div", { class: "vn-reward__gap" }, [
      Progress(balance, r.cost_points),
      h("p", { class: "vn-reward__remain" }, [
        "Il te manque ",
        h("strong", {}, `${nf.format(manque)} pts`),
      ]),
    ]);
  }
}
