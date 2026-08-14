// Barre d'onglets basse — les 4 destinations permanentes.
//
// Montee UNE SEULE FOIS, en dehors du routeur :
//  - plusieurs ecrans font `root.replaceChildren(...)`, ce qui
//    l'effacerait si elle vivait a l'interieur ;
//  - elle ne doit pas glisser avec la transition d'ecran, sinon elle
//    a l'air de faire partie de la page.
//
// Cachee sur landing, onboarding et post : ce sont des parcours a une
// seule issue, y ajouter des sorties fait abandonner.

import { h, icon } from "../lib/dom.js";
import { tap } from "../lib/haptics.js";
import "./TabBar.css";

const ONGLETS = [
  { route: "dashboard", ic: "home", label: "Accueil" },
  { route: "rewards", ic: "gift", label: "Boutique" },
  { route: "leaderboard", ic: "trophy", label: "Classement" },
  { route: "profile", ic: "user", label: "Profil" },
];

// `collection` n'est pas un onglet mais reste dans l'app : la barre y
// est visible, aucun onglet actif.
const AVEC_BARRE = new Set(["dashboard", "rewards", "leaderboard", "profile", "collection"]);

export function mountTabBar(ctx, parent = document.body) {
  let actif = null;

  const boutons = ONGLETS.map((o) =>
    h(
      "button",
      {
        type: "button",
        class: "vn-tab",
        onClick: () => {
          if (o.route === actif) return;
          tap();
          ctx.navigate(o.route);
        },
      },
      [
        h("span", { class: "vn-tab__ic", "aria-hidden": "true" }, icon(o.ic, 22)),
        h("span", { class: "vn-tab__lbl" }, o.label),
      ]
    )
  );

  const el = h(
    "nav",
    { class: "vn-tabbar", "aria-label": "Navigation principale", hidden: true },
    boutons
  );
  parent.appendChild(el);

  return function setRoute(route) {
    const visible = AVEC_BARRE.has(route);
    el.hidden = !visible;
    document.body.classList.toggle("vn-has-tabbar", visible);

    if (!visible) {
      actif = null;
      return;
    }
    actif = route;
    ONGLETS.forEach((o, i) => {
      const on = o.route === route;
      boutons[i].classList.toggle("is-on", on);
      // aria-current annonce l'onglet actif aux lecteurs d'ecran ;
      // la couleur seule ne suffit pas.
      if (on) boutons[i].setAttribute("aria-current", "page");
      else boutons[i].removeAttribute("aria-current");
    });
  };
}
