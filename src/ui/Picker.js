// Depot de capture d'ecran.
//
// Montre l'image choisie, au lieu de son seul nom de fichier :
// « IMG_4821.PNG » ne permet pas de verifier qu'on a pris la bonne
// capture, et c'est cette image qui decide du gain.
//
// ⚠️ L'URL d'objet est revoquee au remplacement et a la
// destruction. L'ancien ecran bonus en creait une par apercu sans
// jamais les liberer.

import { h, icon } from "../lib/dom.js";
import { tap } from "../lib/haptics.js";
import "./Picker.css";

/**
 * @param {object} o
 * @param {string} o.title      libelle de la zone vide
 * @param {string} [o.sub]      precision sous le libelle
 * @param {Function} [o.onPick] (File|null) => void
 */
export function Picker(o = {}) {
  const { title = "Ajouter la capture", sub = "", onPick } = o;

  const input = h("input", {
    class: "vn-picker__input",
    type: "file",
    accept: "image/*",
    "aria-label": title,
  });

  const zone = h("span", { class: "vn-picker__zone" });
  const el = h("label", { class: "vn-picker" }, [input, zone]);

  let fichier = null;
  let apercuUrl = null;

  vide();

  input.addEventListener("change", () => {
    const f = input.files && input.files[0];
    if (!f) return;
    tap();
    poser(f);
    onPick?.(f);
  });

  function vide() {
    zone.replaceChildren(
      h("span", { class: "vn-picker__ico", "aria-hidden": "true" }, icon("scan", 26)),
      h("span", { class: "vn-picker__title" }, title),
      sub ? h("span", { class: "vn-picker__sub" }, sub) : null
    );
    el.classList.remove("vn-picker--set");
  }

  function poser(f) {
    liberer();
    fichier = f;
    apercuUrl = URL.createObjectURL(f);
    zone.replaceChildren(
      h("img", { class: "vn-picker__preview", src: apercuUrl, alt: "Ta capture" }),
      h("span", { class: "vn-picker__bar" }, [
        h("span", { class: "vn-picker__check", "aria-hidden": "true" }, icon("check", 16)),
        h("span", {}, "Capture ajoutée"),
        h("span", { class: "vn-picker__change" }, "Changer"),
      ])
    );
    el.classList.add("vn-picker--set");
  }

  function liberer() {
    if (apercuUrl) URL.revokeObjectURL(apercuUrl);
    apercuUrl = null;
  }

  el.getFile = () => fichier;
  el.reset = () => {
    liberer();
    fichier = null;
    input.value = "";
    vide();
  };
  // A appeler quand l'ecran est demonte.
  el.destroy = liberer;

  return el;
}
