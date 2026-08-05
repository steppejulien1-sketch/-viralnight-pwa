// Section Paramètres (owner) — infos club, couleur d'accent, classement.
// Écrit dans `clubs` (RLS : owner). Certains réglages (couleur, leaderboard)
// se répercutent côté clubbeur.

import { h, icon } from "../../lib/dom.js";
import { supabase } from "../../lib/supabase.js";

export async function SettingsAdmin(mount, club) {
  // Recharge la version fraîche (le club passé au boot peut être partiel).
  const { data } = await supabase
    .from("clubs")
    .select("id, name, city, ig_handle, primary_color, leaderboard_enabled")
    .eq("id", club.id)
    .maybeSingle();
  const c = data || club;

  const f = {
    name: c.name || "",
    city: c.city || "",
    ig_handle: c.ig_handle || "",
    primary_color: c.primary_color || "#c8ff2f",
    leaderboard_enabled: c.leaderboard_enabled !== false,
  };

  const msg = h("p", { class: "ow-save-msg" });

  const lbToggle = h(
    "button",
    {
      class: `ow-toggle${f.leaderboard_enabled ? " is-on" : ""}`,
      role: "switch",
      "aria-checked": String(f.leaderboard_enabled),
      onClick: () => {
        f.leaderboard_enabled = !f.leaderboard_enabled;
        lbToggle.classList.toggle("is-on", f.leaderboard_enabled);
        lbToggle.setAttribute("aria-checked", String(f.leaderboard_enabled));
      },
    },
    [h("span", { class: "ow-toggle-knob" })]
  );

  const swatch = h("span", { class: "ow-color-swatch", style: { background: f.primary_color } });
  const colorInput = h("input", {
    class: "ow-color-input",
    type: "color",
    value: f.primary_color,
    onInput: (e) => { f.primary_color = e.target.value; swatch.style.background = f.primary_color; },
  });

  mount.replaceChildren(
    h("div", { class: "ow-section" }, [
      h("div", { class: "ow-head" }, [
        h("div", {}, [h("h1", {}, "Paramètres du club"), h("p", { class: "ow-head-sub" }, "Identité et réglages de gamification.")]),
      ]),

      h("div", { class: "ow-settings" }, [
        // Bloc identité.
        h("section", { class: "ow-card" }, [
          h("h2", { class: "ow-card-title" }, "Identité"),
          textField("Nom du club", f.name, (v) => (f.name = v), "Mirage"),
          h("div", { class: "ow-form-row2" }, [
            textField("Ville", f.city, (v) => (f.city = v), "Bruxelles"),
            textField("Compte Instagram", f.ig_handle, (v) => (f.ig_handle = v), "mirage.brussels"),
          ]),
          h("label", { class: "ow-field" }, [
            h("span", {}, "Couleur d'accent"),
            h("div", { class: "ow-color-row" }, [swatch, colorInput, h("span", { class: "ow-muted mono" }, f.primary_color)]),
          ]),
        ]),

        // Bloc gamification.
        h("section", { class: "ow-card" }, [
          h("h2", { class: "ow-card-title" }, "Gamification"),
          h("div", { class: "ow-setting-row" }, [
            h("div", {}, [
              h("strong", {}, "Classement hebdomadaire"),
              h("p", { class: "ow-td-sub" }, "Affiche le top des clubbeurs les plus actifs, remis à zéro chaque lundi."),
            ]),
            lbToggle,
          ]),
        ]),

        h("div", { class: "ow-save-bar" }, [
          h("button", { class: "ow-btn ow-btn-primary", onClick: save }, [icon("check", 17), "Enregistrer"]),
          msg,
        ]),
      ]),
    ])
  );

  async function save() {
    msg.textContent = "Enregistrement…";
    msg.className = "ow-save-msg";
    const { error } = await supabase
      .from("clubs")
      .update({
        name: f.name.trim(),
        city: f.city.trim(),
        ig_handle: f.ig_handle.trim().replace(/^@/, ""),
        primary_color: f.primary_color,
        leaderboard_enabled: f.leaderboard_enabled,
      })
      .eq("id", club.id);
    if (error) {
      msg.textContent = "Erreur : " + error.message;
      msg.className = "ow-save-msg is-err";
      return;
    }
    Object.assign(club, { name: f.name, city: f.city });
    msg.textContent = "Enregistré ✓";
    msg.className = "ow-save-msg is-ok";
  }
}

function textField(label, val, onInput, ph) {
  return h("label", { class: "ow-field" }, [h("span", {}, label), h("input", { class: "ow-input", value: val, placeholder: ph, onInput: (e) => onInput(e.target.value) })]);
}
