// Section Défis (owner) — crée/édite/active des défis ponctuels.
// Écrit dans Supabase (RLS : owner de son club). Le défi actif apparaît
// en temps réel sur le dashboard client (Realtime sur `challenges`).

import { h, icon } from "../../lib/dom.js";
import { supabase } from "../../lib/supabase.js";

const nf = new Intl.NumberFormat("fr-FR");
const dtf = new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

export async function ChallengesAdmin(mount, club) {
  const head = h("div", { class: "ow-head" }, [
    h("div", {}, [h("h1", {}, "Défis"), h("p", { class: "ow-head-sub" }, "Des boosts limités dans le temps pour animer tes soirées.")]),
    h("button", { class: "ow-btn ow-btn-primary", onClick: () => openForm(null) }, [icon("sparkles", 17), "Nouveau défi"]),
  ]);
  const listWrap = h("div", { class: "ow-rewards" }, [h("p", { class: "ow-muted" }, "Chargement…")]);
  mount.replaceChildren(h("div", { class: "ow-section" }, [head, listWrap]));

  await load();

  async function load() {
    const { data, error } = await supabase
      .from("challenges")
      .select("*")
      .eq("club_id", club.id)
      .order("ends_at", { ascending: false });
    if (error) {
      listWrap.replaceChildren(h("p", { class: "ow-muted" }, "Erreur de chargement : " + error.message));
      return;
    }
    if (!data.length) {
      listWrap.replaceChildren(h("p", { class: "ow-muted" }, "Aucun défi. Crée le premier avec « Nouveau défi »."));
      return;
    }
    listWrap.replaceChildren(
      h("table", { class: "ow-table" }, [
        h("thead", {}, h("tr", {}, [th("Défi"), th("Bonus"), th("Fenêtre"), th("État"), th("Actif"), th("")])),
        h("tbody", {}, data.map(row)),
      ])
    );
  }

  function row(c) {
    const now = new Date();
    const start = new Date(c.starts_at);
    const end = new Date(c.ends_at);
    let state = "à venir", cls = "soon";
    if (now >= start && now <= end) { state = "en cours"; cls = "live"; }
    else if (now > end) { state = "terminé"; cls = "over"; }

    const toggle = h(
      "button",
      {
        class: `ow-toggle${c.active ? " is-on" : ""}`,
        role: "switch",
        "aria-checked": String(c.active),
        onClick: async () => {
          const next = !c.active;
          toggle.classList.toggle("is-on", next);
          await supabase.from("challenges").update({ active: next }).eq("id", c.id);
          c.active = next;
        },
      },
      [h("span", { class: "ow-toggle-knob" })]
    );

    return h("tr", {}, [
      h("td", {}, [h("strong", {}, c.title), h("span", { class: "ow-td-sub" }, c.description || "")]),
      h("td", { class: "mono" }, `+${nf.format(c.bonus_points)}`),
      h("td", { class: "ow-td-sub" }, `${dtf.format(start)} → ${dtf.format(end)}`),
      h("td", {}, h("span", { class: `ow-state ow-state-${cls}` }, state)),
      h("td", {}, toggle),
      h("td", {}, h("button", { class: "ow-icon-btn", "aria-label": "Éditer", onClick: () => openForm(c) }, icon("arrowRight", 16))),
    ]);
  }

  /* ---------- Formulaire (panneau latéral) ---------- */
  function openForm(existing) {
    const f = {
      title: existing?.title || "",
      description: existing?.description || "",
      bonus_points: existing?.bonus_points || 500,
      starts_at: toLocal(existing?.starts_at) || toLocal(defaultStart()),
      ends_at: toLocal(existing?.ends_at) || toLocal(defaultEnd()),
      active: existing ? existing.active : true,
    };

    const panel = h("div", { class: "ow-drawer-backdrop", onClick: (e) => e.target === panel && close() }, [
      h("form", { class: "ow-drawer", onSubmit: save }, [
        h("div", { class: "ow-drawer-head" }, [
          h("h2", {}, existing ? "Modifier le défi" : "Nouveau défi"),
          h("button", { type: "button", class: "ow-icon-btn", "aria-label": "Fermer", onClick: close }, icon("arrowRight", 18)),
        ]),
        textField("Titre", f.title, (v) => (f.title = v), "Vendredi survolté"),
        textField("Description", f.description, (v) => (f.description = v), "Poste 2 stories ce vendredi, empoche le bonus."),
        h("label", { class: "ow-field" }, [h("span", {}, "Bonus (points)"), numInput(f.bonus_points, (v) => (f.bonus_points = v))]),
        h("div", { class: "ow-form-row2" }, [
          dtField("Début", f.starts_at, (v) => (f.starts_at = v)),
          dtField("Fin", f.ends_at, (v) => (f.ends_at = v)),
        ]),
        h("label", { class: "ow-check" }, [
          h("input", { type: "checkbox", checked: f.active, onChange: (e) => (f.active = e.target.checked) }),
          "Actif (visible côté clubbeurs)",
        ]),
        h("div", { class: "ow-drawer-foot" }, [
          existing ? h("button", { type: "button", class: "ow-btn ow-btn-danger", onClick: del }, "Supprimer") : h("span"),
          h("button", { type: "submit", class: "ow-btn ow-btn-primary" }, existing ? "Enregistrer" : "Créer le défi"),
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
        bonus_points: Number(f.bonus_points),
        starts_at: new Date(f.starts_at).toISOString(),
        ends_at: new Date(f.ends_at).toISOString(),
        active: f.active,
      };
      if (!payload.title) return;
      if (new Date(payload.ends_at) <= new Date(payload.starts_at)) return;
      if (existing) await supabase.from("challenges").update(payload).eq("id", existing.id);
      else await supabase.from("challenges").insert(payload);
      close();
      load();
    }

    async function del() {
      await supabase.from("challenges").delete().eq("id", existing.id);
      close();
      load();
    }
  }
}

/* ---------- helpers ---------- */
function th(t) { return h("th", {}, t); }
function textField(label, val, onInput, ph) {
  return h("label", { class: "ow-field" }, [h("span", {}, label), h("input", { class: "ow-input", value: val, placeholder: ph, onInput: (e) => onInput(e.target.value) })]);
}
function numInput(val, onInput) {
  return h("input", { class: "ow-input mono", type: "number", min: "0", step: "50", value: val, onInput: (e) => onInput(e.target.value) });
}
function dtField(label, val, onInput) {
  return h("label", { class: "ow-field" }, [h("span", {}, label), h("input", { class: "ow-input mono", type: "datetime-local", value: val, onInput: (e) => onInput(e.target.value) })]);
}

// ISO/Date -> valeur "YYYY-MM-DDTHH:mm" pour input datetime-local (heure locale).
function toLocal(v) {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function defaultStart() {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  return d;
}
function defaultEnd() {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  d.setHours(23, 59, 0, 0);
  return d;
}
