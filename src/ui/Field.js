// Champ de saisie : libelle + champ + aide + erreur.
//
// L'erreur est portee par le composant (`setError`) au lieu d'un
// <p class="ob-msg err"> partage entre tous les champs d'un ecran :
// dans l'inscription, une erreur sur le nombre d'abonnes s'affichait
// sous le champ du pseudo, parce que les deux ecrivaient dans le
// meme noeud.

import { h } from "../lib/dom.js";
import "./Field.css";

let seq = 0;

/**
 * @param {object} o
 * @param {string} o.label
 * @param {string} [o.hint]     aide permanente sous le champ
 * @param {string} [o.prefix]   prefixe fixe dans le cadre (ex. « @ »)
 * @param {string} [o.type]
 * @param {Function} [o.onEnter] appele a la touche Entree
 */
export function Field(o = {}) {
  const {
    label,
    hint = "",
    prefix = null,
    type = "text",
    value = "",
    placeholder = "",
    inputmode,
    autocomplete,
    onEnter,
    onInput,
  } = o;

  const id = `vn-f${++seq}`;

  const input = h("input", {
    id,
    class: "vn-field__input",
    type,
    value: value || null,
    placeholder,
    inputmode: inputmode || null,
    autocomplete: autocomplete || null,
    // Un pseudo n'a ni majuscule automatique ni correction.
    autocapitalize: type === "text" ? "none" : null,
    autocorrect: type === "text" ? "off" : null,
    spellcheck: type === "text" ? "false" : null,
  });

  const hintEl = hint ? h("p", { class: "vn-field__hint" }, hint) : null;
  const errEl = h("p", { class: "vn-field__err", role: "alert", hidden: true });

  const champ = prefix
    ? h("div", { class: "vn-field__wrap" }, [
        h("span", { class: "vn-field__prefix", "aria-hidden": "true" }, prefix),
        input,
      ])
    : input;

  const el = h("div", { class: "vn-field" }, [
    label ? h("label", { class: "vn-field__label", for: id }, label) : null,
    champ,
    hintEl,
    errEl,
  ]);

  if (onEnter) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onEnter(input.value);
    });
  }
  if (onInput) input.addEventListener("input", () => onInput(input.value));

  // Saisir a nouveau efface l'erreur : la laisser affichee pendant
  // qu'on corrige donne l'impression que la correction ne prend pas.
  input.addEventListener("input", () => {
    if (!errEl.hidden) el.setError("");
  });

  el.input = input;
  el.getValue = () => input.value.trim();
  // Pre-remplissage : sert a proposer la valeur actuelle plutot qu'un
  // champ vide quand on MODIFIE une donnee deja saisie (profil > abonnes).
  el.setValue = (v) => {
    input.value = v == null ? "" : String(v);
  };
  el.focus = () => input.focus();

  el.setError = (msg) => {
    const on = Boolean(msg);
    el.classList.toggle("vn-field--err", on);
    errEl.hidden = !on;
    errEl.textContent = msg || "";
    if (on) input.focus();
  };

  return el;
}
