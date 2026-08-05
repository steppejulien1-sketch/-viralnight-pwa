// Dashboard propriétaire (desktop-first).
// Auth Supabase (email/mot de passe) → layout sidebar → sections.
// Partage la base + le design system avec la PWA client.

import "./owner.css";
import { h, icon } from "../lib/dom.js";
import { supabase, isConfigured } from "../lib/supabase.js";
import { RewardsAdmin } from "./sections/rewards.js";
import { ChallengesAdmin } from "./sections/challenges.js";
import { SettingsAdmin } from "./sections/settings.js";
import { Placeholder } from "./sections/placeholder.js";

const mount = document.getElementById("owner");

const SECTIONS = [
  { id: "rewards", label: "Boutique", icon: "gift", render: RewardsAdmin },
  { id: "challenges", label: "Défis", icon: "sparkles", render: ChallengesAdmin },
  { id: "stats", label: "Statistiques", icon: "scan", render: (c) => Placeholder("Statistiques", "Rédemptions, points distribués, activité.", c) },
  { id: "settings", label: "Paramètres", icon: "check", render: SettingsAdmin },
];

let club = null;
let current = "rewards";

start();

async function start() {
  if (!isConfigured) return renderError("Supabase non configuré.");
  const { data } = await supabase.auth.getSession();
  if (data?.session) return boot();
  renderLogin();
}

/* ---------- Login ---------- */
function renderLogin() {
  let email = "owner@mirage.club";
  let pass = "";
  const msg = h("p", { class: "ow-login-msg" });

  async function submit(e) {
    e.preventDefault();
    msg.textContent = "Connexion…";
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) {
      msg.textContent = "Identifiants incorrects.";
      return;
    }
    boot();
  }

  mount.replaceChildren(
    h("div", { class: "ow-login" }, [
      h("form", { class: "ow-login-card", onSubmit: submit }, [
        h("div", { class: "ow-login-brand" }, [h("span", { class: "ow-logo-mark" }), "ViralNight"]),
        h("h1", {}, "Espace club"),
        h("p", { class: "ow-login-sub" }, "Connecte-toi pour gérer ta boutique."),
        field("Email", "email", "owner@ton-club.com", (v) => (email = v), email),
        field("Mot de passe", "password", "••••••••", (v) => (pass = v)),
        h("button", { class: "ow-btn ow-btn-primary", type: "submit" }, "Se connecter"),
        msg,
        h("p", { class: "ow-login-demo" }, "Démo : owner@mirage.club / MirageOwner2026!"),
      ]),
    ])
  );

  function field(label, type, ph, onInput, val = "") {
    return h("label", { class: "ow-field" }, [
      h("span", {}, label),
      h("input", {
        class: "ow-input",
        type,
        placeholder: ph,
        value: val,
        onInput: (e) => onInput(e.target.value),
      }),
    ]);
  }
}

/* ---------- Boot : charge le club de l'owner ---------- */
async function boot() {
  const { data: session } = await supabase.auth.getSession();
  const uid = session.session.user.id;

  const { data: link } = await supabase
    .from("club_owners")
    .select("club_id, clubs(id, name, city, slug)")
    .eq("user_id", uid)
    .limit(1)
    .maybeSingle();

  if (!link) return renderError("Ce compte n'est rattaché à aucun club.");
  club = link.clubs;
  renderShell();
}

/* ---------- Layout ---------- */
function renderShell() {
  const content = h("main", { class: "ow-content" });

  const nav = SECTIONS.map((s) =>
    h(
      "button",
      {
        class: `ow-nav-item${s.id === current ? " is-active" : ""}`,
        onClick: () => {
          current = s.id;
          document.querySelectorAll(".ow-nav-item").forEach((n) => n.classList.remove("is-active"));
          navRefs[s.id].classList.add("is-active");
          s.render(content, club);
        },
      },
      [icon(s.icon, 18), s.label]
    )
  );
  const navRefs = Object.fromEntries(SECTIONS.map((s, i) => [s.id, nav[i]]));

  mount.replaceChildren(
    h("div", { class: "ow-shell" }, [
      h("aside", { class: "ow-side" }, [
        h("div", { class: "ow-brand" }, [h("span", { class: "ow-logo-mark" }), "ViralNight"]),
        h("p", { class: "ow-club" }, [h("span", { class: "ow-club-dot" }), `${club.name} · ${club.city}`]),
        h("nav", { class: "ow-nav" }, nav),
        h("button", { class: "ow-signout", onClick: async () => { await supabase.auth.signOut(); renderLogin(); } }, "Déconnexion"),
      ]),
      content,
    ])
  );

  SECTIONS.find((s) => s.id === current).render(content, club);
}

function renderError(txt) {
  mount.replaceChildren(h("div", { class: "ow-login" }, [h("p", { class: "ow-login-msg" }, txt)]));
}
