// Ecran 2 — Connexion Instagram.
// Le compte n'est plus "declare" (on pouvait tricher en tapant le pseudo
// de n'importe qui). Il est PROUVE via la connexion Instagram : seul le
// vrai proprietaire peut se connecter. Aucun palier d'abonnes ici — les
// points viendront des vues reelles des stories.
//
// DEMO : la connexion est simulee. En prod, bouton = OAuth Instagram
// (app Meta Developer, comme le "Se connecter avec Google" du site B2B).

import { h, icon } from "../lib/dom.js";
import { CLUB, USER } from "../lib/mock.js";
import { tap } from "../lib/haptics.js";

export function Onboarding(_params, ctx) {
  const root = h("div", { class: "ob" });
  renderConnect();
  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  function renderConnect() {
    function connect() {
      tap();
      // DEMO : simule une connexion Instagram reussie.
      // PROD : lancer l'OAuth Instagram, puis recuperer le handle verifie.
      USER.handle = "toi.insta";
      USER.connected = true;
      renderConnecting();
    }

    swap(
      h("div", { class: "ob-inner" }, [
        h("header", { class: "ob-head" }, [
          h(
            "button",
            { class: "ob-back", "aria-label": "Retour", onClick: () => ctx.back("landing") },
            icon("arrowRight", 18)
          ),
          h("span", { class: "label" }, `${CLUB.name} · ${CLUB.city}`),
        ]),

        h("div", { class: "ob-body ob-connect" }, [
          h("div", { class: "ob-ig-badge reveal", style: { "--d": "0ms" }, "aria-hidden": "true" }, [
            icon("instagram", 34),
          ]),
          h("h1", { class: "ob-title reveal", style: { "--d": "70ms" } }, "Connecte ton Instagram"),
          h("p", { class: "ob-sub reveal", style: { "--d": "130ms" } }, [
            "C'est ce qui prouve que le compte est bien ",
            h("strong", {}, "le tien"),
            ". Ensuite, chaque story qui tague le club te rapporte des points.",
          ]),

          h("ul", { class: "ob-assure reveal", style: { "--d": "200ms" } }, [
            assure("On ne poste jamais à ta place."),
            assure("On lit juste tes stories qui taguent le club."),
            assure("Tu peux te déconnecter quand tu veux."),
          ]),
        ]),

        h("footer", { class: "ob-foot reveal", style: { "--d": "280ms" } }, [
          h("button", { class: "btn btn-ig btn-block", onClick: connect }, [
            icon("instagram", 20),
            "Continuer avec Instagram",
          ]),
          h("p", { class: "ob-note" }, [icon("check", 13), "Gratuit, sans mot de passe à retenir."]),
        ]),
      ])
    );
  }

  function assure(txt) {
    return h("li", { class: "ob-assure-item" }, [
      h("span", { class: "ob-assure-dot", "aria-hidden": "true" }, icon("check", 13)),
      txt,
    ]);
  }

  /* Connexion en cours -> dashboard. */
  function renderConnecting() {
    swap(
      h("div", { class: "ob-inner ob-analyzing" }, [
        h("div", { class: "an-core" }, [
          h("div", { class: "an-ring", "aria-hidden": "true" }, [h("span", { class: "an-ring-dot" })]),
          h("h2", { class: "an-title" }, "Connexion à ton compte"),
          h("p", { class: "an-sub" }, `@${USER.handle}`),
        ]),
      ])
    );
    setTimeout(() => ctx.navigate("dashboard"), 1400);
  }
}
