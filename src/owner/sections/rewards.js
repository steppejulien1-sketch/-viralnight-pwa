// Section Boutique (owner) — liste des rewards + créer/éditer/activer.
// Écrit directement dans Supabase (RLS : owner de son club). La PWA
// client voit les changements en temps réel (Realtime sur `rewards`).

import { h, icon } from "../../lib/dom.js";
import { supabase } from "../../lib/supabase.js";

const nf = new Intl.NumberFormat("fr-FR");
const CATEGORIES = [
  { v: "boisson", l: "Boisson" },
  { v: "entree", l: "Entrée" },
  { v: "vip", l: "VIP" },
  { v: "exclusif", l: "Exclusif" },
];
const LEVELS = [
  { v: "", l: "Tous les niveaux" },
  { v: "argent", l: "Argent et +" },
  { v: "or", l: "Or et +" },
  { v: "platine", l: "Platine et +" },
  { v: "legende", l: "Légende" },
];

export async function RewardsAdmin(mount, club) {
  const head = h("div", { class: "ow-head" }, [
    h("div", {}, [h("h1", {}, "Boutique de points"), h("p", { class: "ow-head-sub" }, "Ce que tes clubbeurs peuvent débloquer.")]),
    h("button", { class: "ow-btn ow-btn-primary", onClick: () => openForm(null) }, [icon("gift", 17), "Nouveau reward"]),
  ]);
  const listWrap = h("div", { class: "ow-rewards" }, [h("p", { class: "ow-muted" }, "Chargement…")]);
  mount.replaceChildren(h("div", { class: "ow-section" }, [head, listWrap]));

  await load();

  async function load() {
    const { data, error } = await supabase
      .from("rewards")
      .select("*")
      .eq("club_id", club.id)
      .order("cost_points");
    if (error) {
      listWrap.replaceChildren(h("p", { class: "ow-muted" }, "Erreur de chargement : " + error.message));
      return;
    }
    if (!data.length) {
      listWrap.replaceChildren(h("p", { class: "ow-muted" }, "Aucun reward. Crée le premier avec « Nouveau reward »."));
      return;
    }
    listWrap.replaceChildren(
      h("table", { class: "ow-table" }, [
        h("thead", {}, h("tr", {}, [th("Récompense"), th("Catégorie"), th("Coût"), th("Stock"), th("Niveau"), th("Actif"), th("")])),
        h("tbody", {}, data.map(row)),
      ])
    );
  }

  function row(r) {
    const toggle = h(
      "button",
      {
        class: `ow-toggle${r.active ? " is-on" : ""}`,
        role: "switch",
        "aria-checked": String(r.active),
        onClick: async () => {
          const next = !r.active;
          toggle.classList.toggle("is-on", next);
          await supabase.from("rewards").update({ active: next }).eq("id", r.id);
          r.active = next;
        },
      },
      [h("span", { class: "ow-toggle-knob" })]
    );

    return h("tr", {}, [
      h("td", {}, [h("strong", {}, r.title), h("span", { class: "ow-td-sub" }, r.description || "")]),
      h("td", {}, h("span", { class: `ow-cat ow-cat-${r.category}` }, catLabel(r.category))),
      h("td", { class: "mono" }, `${nf.format(r.cost_points)} pts`),
      h("td", { class: "mono" }, r.stock_limit == null ? "∞" : `${r.stock_remaining}/${r.stock_limit}`),
      h("td", {}, r.required_level ? h("span", { class: "ow-lvl-tag" }, r.required_level) : h("span", { class: "ow-muted" }, "—")),
      h("td", {}, toggle),
      h("td", {}, h("button", { class: "ow-icon-btn", "aria-label": "Éditer", onClick: () => openForm(r) }, icon("arrowRight", 16))),
    ]);
  }

  /* ---------- Formulaire (panneau latéral) ---------- */
  function openForm(existing) {
    const f = {
      title: existing?.title || "",
      description: existing?.description || "",
      cost_points: existing?.cost_points || 300,
      category: existing?.category || "boisson",
      limited: existing?.stock_limit != null,
      stock_limit: existing?.stock_limit || 50,
      required_level: existing?.required_level || "",
    };

    const stockRow = h("div", { class: "ow-form-row", style: { display: f.limited ? "grid" : "none" } }, [
      h("label", { class: "ow-field" }, [h("span", {}, "Stock disponible"), numInput(f.stock_limit, (v) => (f.stock_limit = v))]),
    ]);

    const panel = h("div", { class: "ow-drawer-backdrop", onClick: (e) => e.target === panel && close() }, [
      h("form", { class: "ow-drawer", onSubmit: save }, [
        h("div", { class: "ow-drawer-head" }, [
          h("h2", {}, existing ? "Modifier le reward" : "Nouveau reward"),
          h("button", { type: "button", class: "ow-icon-btn", "aria-label": "Fermer", onClick: close }, icon("arrowRight", 18)),
        ]),
        textField("Titre", f.title, (v) => (f.title = v), "10€ offerts sur ta conso"),
        textField("Description", f.description, (v) => (f.description = v), "Valable au bar, une fois par soirée."),
        h("div", { class: "ow-form-row2" }, [
          h("label", { class: "ow-field" }, [h("span", {}, "Coût (points)"), numInput(f.cost_points, (v) => (f.cost_points = v))]),
          selectField("Catégorie", CATEGORIES, f.category, (v) => (f.category = v)),
        ]),
        selectField("Niveau requis", LEVELS, f.required_level, (v) => (f.required_level = v)),
        h("label", { class: "ow-check" }, [
          h("input", { type: "checkbox", checked: f.limited, onChange: (e) => { f.limited = e.target.checked; stockRow.style.display = f.limited ? "grid" : "none"; } }),
          "Stock limité",
        ]),
        stockRow,
        h("div", { class: "ow-drawer-foot" }, [
          existing ? h("button", { type: "button", class: "ow-btn ow-btn-danger", onClick: del }, "Supprimer") : h("span"),
          h("button", { type: "submit", class: "ow-btn ow-btn-primary" }, existing ? "Enregistrer" : "Créer le reward"),
        ]),
      ]),
    ]);
    document.body.appendChild(panel);
    requestAnimationFrame(() => panel.classList.add("is-open"));

    function close() {
      panel.classList.remove("is-open");
      setTimeout(() => panel.remove(), 250);
    }

    async function save(e) {
      e.preventDefault();
      const payload = {
        club_id: club.id,
        title: f.title.trim(),
        description: f.description.trim() || null,
        cost_points: Number(f.cost_points),
        category: f.category,
        required_level: f.required_level || null,
        stock_limit: f.limited ? Number(f.stock_limit) : null,
        stock_remaining: f.limited ? Number(f.stock_limit) : null,
      };
      if (!payload.title) return;
      if (existing) {
        // On ne réinitialise pas le stock restant si on édite sans toucher au stock.
        if (f.limited && existing.stock_limit === Number(f.stock_limit)) delete payload.stock_remaining;
        await supabase.from("rewards").update(payload).eq("id", existing.id);
      } else {
        await supabase.from("rewards").insert(payload);
      }
      close();
      load();
    }

    async function del() {
      await supabase.from("rewards").delete().eq("id", existing.id);
      close();
      load();
    }
  }
}

/* ---------- helpers ---------- */
function th(t) { return h("th", {}, t); }
function catLabel(v) { return (CATEGORIES.find((c) => c.v === v) || {}).l || v; }
function textField(label, val, onInput, ph) {
  return h("label", { class: "ow-field" }, [h("span", {}, label), h("input", { class: "ow-input", value: val, placeholder: ph, onInput: (e) => onInput(e.target.value) })]);
}
function numInput(val, onInput) {
  return h("input", { class: "ow-input mono", type: "number", min: "0", value: val, onInput: (e) => onInput(e.target.value) });
}
function selectField(label, opts, val, onChange) {
  return h("label", { class: "ow-field" }, [
    h("span", {}, label),
    h("select", { class: "ow-input", onChange: (e) => onChange(e.target.value) }, opts.map((o) => h("option", { value: o.v, selected: o.v === val }, o.l))),
  ]);
}
