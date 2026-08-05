// Ecran — Collection (badges / achievements).
// Grille : badges débloqués en couleur, verrouillés en silhouette grisée
// avec leur condition de déblocage.

import { h, icon } from "../lib/dom.js";
import { loadBadges } from "../lib/game.js";

export function Collection(_params, ctx) {
  const root = h("div", { class: "cl-page" });
  render(null);
  loadBadges().then((d) => render(d));
  return root;

  function render(data) {
    const head = h("header", { class: "lb-head" }, [
      h("button", { class: "ob-back", "aria-label": "Retour", onClick: () => ctx.back("dashboard") }, icon("arrowRight", 18)),
      h("span", { class: "label" }, "Collection"),
      h("span", {}),
    ]);

    if (!data) {
      root.replaceChildren(h("div", { class: "cl-inner" }, [head, h("p", { class: "rw-empty-msg" }, "Chargement…")]));
      return;
    }

    const total = data.all.length;
    const got = data.all.filter((b) => data.unlocked.has(b.id)).length;

    root.replaceChildren(
      h("div", { class: "cl-inner" }, [
        head,
        h("div", { class: "cl-title-wrap reveal", style: { "--d": "0ms" } }, [
          h("h1", { class: "cl-title" }, "Ta collection"),
          h("p", { class: "cl-sub" }, [h("span", { class: "mono cl-count" }, `${got}/${total}`), " badges débloqués"]),
        ]),
        h(
          "div",
          { class: "cl-grid reveal", style: { "--d": "80ms" } },
          data.all.map((b) => {
            const on = data.unlocked.has(b.id);
            return h("div", { class: `cl-badge${on ? " is-on" : " is-locked"}` }, [
              h("span", { class: "cl-badge-icn", "aria-hidden": "true" }, icon(on ? b.icon || "medal" : "lock", 26)),
              h("span", { class: "cl-badge-name" }, b.name),
              h("span", { class: "cl-badge-desc" }, b.description || ""),
            ]);
          })
        ),
      ])
    );
  }
}
