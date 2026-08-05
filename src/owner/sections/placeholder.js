// Sections à venir (Défis, Stats, Paramètres) — placeholder de nav.
import { h } from "../../lib/dom.js";

export function Placeholder(title, sub, mount) {
  mount.replaceChildren(
    h("div", { class: "ow-section" }, [
      h("div", { class: "ow-head" }, [h("div", {}, [h("h1", {}, title), h("p", { class: "ow-head-sub" }, sub)])]),
      h("div", { class: "ow-empty-box" }, "Section à construire à l'étape suivante."),
    ])
  );
}
