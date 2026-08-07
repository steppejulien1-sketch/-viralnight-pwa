// Section Paramètres (owner) — infos club, couleur d'accent, classement.
// Écrit dans `clubs` (RLS : owner). Certains réglages (couleur, leaderboard)
// se répercutent côté clubbeur.

import { h, icon } from "../../lib/dom.js";
import { supabase } from "../../lib/supabase.js";

export async function SettingsAdmin(mount, club) {
  // Recharge la version fraîche (le club passé au boot peut être partiel).
  const { data } = await supabase
    .from("clubs")
    .select("id, name, city, ig_handle, slug, primary_color, leaderboard_enabled")
    .eq("id", club.id)
    .maybeSingle();
  const c = data || club;

  const f = {
    name: c.name || "",
    city: c.city || "",
    ig_handle: c.ig_handle || "",
    slug: c.slug || "",
    primary_color: c.primary_color || "#ff2d2d",
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

        // Bloc adresse du QR. Separe de l'identite a dessein : changer le
        // nom affiche est sans consequence, changer l'identifiant rend
        // caducs TOUS les QR deja imprimes.
        h("section", { class: "ow-card" }, [
          h("h2", { class: "ow-card-title" }, "Adresse de ton QR"),
          textField("Identifiant", f.slug, (v) => (f.slug = v), "mon-club-ville"),
          h("p", { class: "ow-slug-preview mono" }, apercuLien(f.slug)),
          h("p", { class: "ow-slug-warn" }, [
            icon("lock", 13),
            " Le modifier rend illisibles tous les QR déjà imprimés. À ne faire qu'avant la première impression.",
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

    const slug = normaliserSlug(f.slug);
    if (!slug) {
      msg.textContent = "Identifiant invalide : lettres, chiffres et tirets, 2 caractères minimum.";
      msg.className = "ow-save-msg is-err";
      return;
    }

    const { error } = await supabase
      .from("clubs")
      .update({
        name: f.name.trim(),
        city: f.city.trim(),
        ig_handle: f.ig_handle.trim().replace(/^@/, ""),
        slug,
        primary_color: f.primary_color,
        leaderboard_enabled: f.leaderboard_enabled,
      })
      .eq("id", club.id);

    if (error) {
      // Le slug est unique : deux clubs ne peuvent pas partager une adresse,
      // sinon un QR mènerait chez le voisin.
      msg.textContent = /duplicate|unique/i.test(error.message)
        ? "Cet identifiant est déjà pris par un autre club."
        : "Erreur : " + error.message;
      msg.className = "ow-save-msg is-err";
      return;
    }

    Object.assign(club, { name: f.name, city: f.city, slug });
    f.slug = slug;
    msg.textContent = "Enregistré ✓";
    msg.className = "ow-save-msg is-ok";
  }
}

// Accepte ce que le gerant tape et en fait une adresse valide : accents
// retires, espaces en tirets, minuscules.
function normaliserSlug(v) {
  const s = String(v || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return s.length >= 2 ? s : null;
}

function apercuLien(slug) {
  const s = normaliserSlug(slug) || "…";
  return `${window.location.origin}/?c=${s}`;
}

function textField(label, val, onInput, ph) {
  return h("label", { class: "ow-field" }, [h("span", {}, label), h("input", { class: "ow-input", value: val, placeholder: ph, onInput: (e) => onInput(e.target.value) })]);
}
