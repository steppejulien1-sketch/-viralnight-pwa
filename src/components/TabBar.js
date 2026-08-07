// Barre de navigation basse — les 4 destinations permanentes de l'app.
//
// Avant, chaque ecran se quittait par une fleche retour : la boutique etait
// a deux taps du dashboard et le classement a trois. C'est le catalogue de
// recompenses qui donne envie de poster ; le laisser enterre coutait cher.
//
// Montee UNE SEULE FOIS, en dehors du routeur :
//  - trois ecrans font `root.replaceChildren(...)`, ce qui l'effacerait si
//    elle vivait a l'interieur ;
//  - elle ne doit pas glisser avec la transition d'ecran, sinon elle a l'air
//    de faire partie de la page.
//
// Elle est CACHEE sur landing, onboarding, post et bonus : ce sont des
// parcours a une seule issue, y ajouter des sorties ferait abandonner.

import { h, icon } from "../lib/dom.js";

const ONGLETS = [
  { route: "dashboard", ic: "home", label: "Accueil" },
  { route: "rewards", ic: "gift", label: "Boutique" },
  { route: "leaderboard", ic: "trophy", label: "Classement" },
  { route: "profile", ic: "user", label: "Profil" },
];

// Ecrans sur lesquels la barre s'affiche. `collection` n'est pas un onglet
// mais reste dans l'app : la barre y est visible, aucun onglet actif.
const AVEC_BARRE = new Set(["dashboard", "rewards", "leaderboard", "profile", "collection"]);

export function mountTabBar(ctx, parent = document.body) {
  const boutons = ONGLETS.map((o) =>
    h(
      "button",
      {
        class: "tab",
        onClick: () => {
          if (o.route !== actif) ctx.navigate(o.route);
        },
      },
      [
        h("span", { class: "tab-ic", "aria-hidden": "true" }, icon(o.ic, 21)),
        h("span", { class: "tab-lbl" }, o.label),
      ]
    )
  );

  let actif = null;
  const el = h("nav", { class: "tabbar", "aria-label": "Navigation principale", hidden: true }, boutons);
  parent.appendChild(el);

  return function setRoute(route) {
    const visible = AVEC_BARRE.has(route);
    el.hidden = !visible;
    // Le padding bas des ecrans depend de la presence de la barre.
    document.body.classList.toggle("has-tabbar", visible);
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
