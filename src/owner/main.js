// Dashboard propriétaire (desktop-first).
// Auth Supabase (email/mot de passe) → layout sidebar → sections.
// Partage la base + le design system avec la PWA client.

// Socle de design, partage avec la PWA. Charge ICI (et non par une
// balise <link>) pour que Vite le regroupe avec le reste de la console.
// ⚠️ ui/shell.css n'est PAS importe : il porte .app-viewport et .screen,
// qui n'existent que dans la PWA.
import "../ui/tokens.css";
import "../ui/type.css";
import "../ui/reset.css";
import "./owner.css";

import { h } from "../lib/dom.js";
import { supabase, isConfigured } from "../lib/supabase.js";
import { RewardsAdmin } from "./sections/rewards.js";
import { ChallengesAdmin } from "./sections/challenges.js";
import { SettingsAdmin } from "./sections/settings.js";
import { StatsAdmin } from "./sections/stats.js";
import { ReviewAdmin } from "./sections/review.js";
import { QrAdmin } from "./sections/qr.js";

const mount = document.getElementById("owner");

const SECTIONS = [
  // "À valider" en premier : c'est la seule section qui demande une action
  // du gerant, et rien n'est credite tant qu'il ne l'a pas ouverte.
  { id: "review", label: "À valider", render: ReviewAdmin },
  { id: "rewards", label: "Boutique", render: RewardsAdmin },
  { id: "challenges", label: "Défis", render: ChallengesAdmin },
  { id: "qr", label: "QR code", render: QrAdmin },
  { id: "stats", label: "Statistiques", render: StatsAdmin },
  { id: "settings", label: "Paramètres", render: SettingsAdmin },
];

let club = null;
let current = "review";

start();

async function start() {
  if (!isConfigured) return renderError("Supabase non configuré.");
  const { data } = await supabase.auth.getSession();
  if (data?.session) return boot();
  renderLogin();
}

/* ---------- Login ---------- */
function renderLogin() {
  // ⚠️ NE JAMAIS pre-remplir d'identifiant ici, ni afficher d'aide de
  // demonstration sous le formulaire. Cet ecran a longtemps porte la ligne
  //     "Démo : owner@mirage.club / MirageOwner2026!"
  // en clair dans le bundle PUBLIC de viralnight-pwa.vercel.app/owner.html.
  // Un compte gerant donne owns_club(), donc review_story() -- la fonction
  // qui CREDITE les points -- plus le catalogue, le slug des QR et les
  // captures privees de tous les clubbeurs.
  // La meme correction avait ete faite sur session.js (auto-login clubbeur)
  // sans etre reportee ici. Pour une demo commerciale, passer par une
  // variable d'environnement de build, jamais par du texte en dur.
  let email = "";
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
    // ⚠️ `ig_handle` est INDISPENSABLE depuis la 0026 : une story arrive
    // sans capture, et l'ecran de validation doit dire au gerant sur quel
    // compte Instagram aller verifier la mention. Sans lui, il lit une
    // consigne vague et ne sait pas ou regarder.
    .select("club_id, clubs(id, name, city, slug, ig_handle)")
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
      // ⚠️ PICTOGRAMMES DE NAVIGATION RETIRES, et pas seulement par
      // gout : le jeu d'icones n'a ni engrenage ni graphique, donc
      // « Paramètres » portait la MEME coche que « À valider » et
      // « Statistiques » un trophee. Deux entrees sur six mentaient.
      // Six libelles ecrits en toutes lettres, toujours visibles, se
      // reperent tres bien sans image — et une icone qui ne code rien
      // est exactement ce qui fait « interface generee ».
      s.label
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
