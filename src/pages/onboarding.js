// Ecran 2 — Connexion.
//
// POURQUOI PAS "SE CONNECTER AVEC INSTAGRAM" :
// l'API Instagram Basic Display est fermee depuis decembre 2024, et son
// remplacant (Instagram API with Instagram Login) n'accepte que les comptes
// PROFESSIONNELS. Un clubbeur en compte perso ne peut donc pas s'y
// connecter. Supabase n'a pas non plus de provider Instagram.
//
// La propriete du compte est prouvee autrement, et mieux : seul le
// proprietaire peut publier une story qui tague le club. C'est la mention
// elle-meme qui fait foi, pas un jeton OAuth. On demande donc juste une
// identite (email, lien magique) et le pseudo, confirme a la premiere
// mention detectee.

import { h, icon } from "../lib/dom.js";
import { CLUB, USER } from "../lib/mock.js";
import { tap } from "../lib/haptics.js";
import { supabase, isConfigured, signInWithEmail } from "../lib/supabase.js";
import { ensureSession } from "../lib/session.js";

const HANDLE_RE = /^[a-zA-Z0-9._]{2,30}$/;

export function Onboarding(_params, ctx) {
  const root = h("div", { class: "ob" });
  start();
  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  async function start() {
    // Retour de lien magique : la session existe deja, on enchaine.
    const s = await ensureSession();
    if (s?.user) return renderHandle(s.user);
    renderConnect();
  }

  /* ---------- 1. Identite ---------- */
  function renderConnect() {
    const input = h("input", {
      class: "ob-input",
      type: "email",
      inputmode: "email",
      autocomplete: "email",
      placeholder: "ton@email.com",
      "aria-label": "Ton adresse email",
    });
    const msg = h("p", { class: "ob-msg" });
    const btn = h("button", { class: "btn btn-primary btn-block" }, "Recevoir mon lien");

    async function send() {
      const email = input.value.trim();
      if (!email || !email.includes("@")) {
        msg.className = "ob-msg err";
        msg.textContent = "Il manque une adresse email valide.";
        input.focus();
        return;
      }
      tap();
      btn.disabled = true;
      btn.textContent = "Envoi…";
      msg.className = "ob-msg";
      msg.textContent = "";

      if (!isConfigured) {
        // Mode demo hors ligne : on n'invente pas une connexion reussie.
        btn.disabled = false;
        btn.textContent = "Recevoir mon lien";
        msg.className = "ob-msg err";
        msg.textContent = "Connexion indisponible : l'app n'est pas reliée à sa base.";
        return;
      }

      const { error } = await signInWithEmail(email);
      btn.disabled = false;
      btn.textContent = "Recevoir mon lien";
      if (error) {
        msg.className = "ob-msg err";
        msg.textContent = traduire(error);
        return;
      }
      renderSent(email);
    }

    btn.addEventListener("click", send);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") send();
    });

    swap(
      h("div", { class: "ob-inner" }, [
        head(() => ctx.back("landing")),
        h("div", { class: "ob-body ob-connect" }, [
          h("div", { class: "ob-ig-badge reveal", style: { "--d": "0ms" }, "aria-hidden": "true" }, [
            icon("sparkles", 34),
          ]),
          h("h1", { class: "ob-title reveal", style: { "--d": "70ms" } }, "Rejoins le Mirage"),
          h("p", { class: "ob-sub reveal", style: { "--d": "130ms" } }, [
            "Ton email, et c'est parti. ",
            h("strong", {}, "Aucun mot de passe"),
            " : tu reçois un lien, tu cliques, tu es connecté.",
          ]),

          h("div", { class: "ob-field reveal", style: { "--d": "190ms" } }, [input, msg]),

          h("ul", { class: "ob-assure reveal", style: { "--d": "240ms" } }, [
            assure("On ne poste jamais à ta place."),
            assure("On lit juste les stories qui taguent le club."),
            assure("Ton email ne sert qu'à te reconnaître."),
          ]),
        ]),
        h("footer", { class: "ob-foot reveal", style: { "--d": "300ms" } }, [
          btn,
          h("p", { class: "ob-note" }, [icon("check", 13), "Gratuit, rien à installer."]),
        ]),
      ])
    );
  }

  /* ---------- 2. Lien envoye ---------- */
  function renderSent(email) {
    swap(
      h("div", { class: "ob-inner" }, [
        head(() => renderConnect()),
        h("div", { class: "ob-body ob-connect" }, [
          h("div", { class: "ob-ig-badge reveal", "aria-hidden": "true" }, [icon("check", 34)]),
          h("h1", { class: "ob-title reveal", style: { "--d": "70ms" } }, "Regarde tes mails"),
          h("p", { class: "ob-sub reveal", style: { "--d": "130ms" } }, [
            "On vient d'envoyer un lien à ",
            h("strong", {}, email),
            ". Clique dessus depuis ce téléphone et tu reviens ici connecté.",
          ]),
          h(
            "p",
            { class: "ob-note reveal", style: { "--d": "200ms" } },
            "Rien reçu ? Vérifie les spams, ou reviens en arrière pour corriger l'adresse."
          ),
        ]),
      ])
    );
  }

  /* ---------- 3. Pseudo Instagram ---------- */
  function renderHandle(user) {
    const input = h("input", {
      class: "ob-input",
      type: "text",
      autocapitalize: "none",
      autocorrect: "off",
      spellcheck: "false",
      placeholder: "ton.pseudo",
      "aria-label": "Ton pseudo Instagram",
      value: USER.handle && USER.handle !== "toi.insta" ? USER.handle : "",
    });
    const msg = h("p", { class: "ob-msg" });
    const btn = h("button", { class: "btn btn-primary btn-block" }, "C'est parti");

    async function save() {
      const handle = input.value.trim().replace(/^@/, "");
      if (!HANDLE_RE.test(handle)) {
        msg.className = "ob-msg err";
        msg.textContent = "Pseudo invalide : lettres, chiffres, point et underscore.";
        input.focus();
        return;
      }
      tap();
      btn.disabled = true;
      btn.textContent = "Enregistrement…";

      if (isConfigured) {
        // La migration 0004 n'autorise l'ecriture que sur handle et email :
        // impossible de toucher a son solde en passant par ici.
        const { error } = await supabase
          .from("users")
          .update({ handle })
          .eq("id", user.id);
        if (error) {
          btn.disabled = false;
          btn.textContent = "C'est parti";
          msg.className = "ob-msg err";
          msg.textContent = traduire(error.message);
          return;
        }
      }

      USER.handle = handle;
      USER.connected = true;
      ctx.navigate("dashboard");
    }

    btn.addEventListener("click", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") save();
    });

    swap(
      h("div", { class: "ob-inner" }, [
        head(() => ctx.back("landing")),
        h("div", { class: "ob-body ob-connect" }, [
          h("div", { class: "ob-ig-badge reveal", "aria-hidden": "true" }, [icon("instagram", 34)]),
          h("h1", { class: "ob-title reveal", style: { "--d": "70ms" } }, "Ton pseudo Instagram"),
          h("p", { class: "ob-sub reveal", style: { "--d": "130ms" } }, [
            "C'est lui qu'on cherche dans les mentions de ",
            h("strong", {}, `@${CLUB.igHandle}`),
            ". Pas besoin de te connecter à Instagram : poster depuis ton compte suffit à prouver que c'est le tien.",
          ]),
          h("div", { class: "ob-field reveal", style: { "--d": "190ms" } }, [
            h("div", { class: "ob-at" }, [h("span", { class: "ob-at-sign" }, "@"), input]),
            msg,
          ]),
        ]),
        h("footer", { class: "ob-foot reveal", style: { "--d": "260ms" } }, [
          btn,
          h("p", { class: "ob-note" }, [
            icon("check", 13),
            "Tu pourras le changer depuis ton profil.",
          ]),
        ]),
      ])
    );
  }

  /* ---------- utilitaires ---------- */
  function head(onBack) {
    return h("header", { class: "ob-head" }, [
      h("button", { class: "ob-back", "aria-label": "Retour", onClick: onBack }, icon("arrowRight", 18)),
      h("span", { class: "label" }, `${CLUB.name} · ${CLUB.city}`),
    ]);
  }

  function assure(txt) {
    return h("li", { class: "ob-assure-item" }, [
      h("span", { class: "ob-assure-dot", "aria-hidden": "true" }, icon("check", 13)),
      h("span", {}, txt),
    ]);
  }
}

// Les erreurs Supabase arrivent en anglais et sont trop techniques.
function traduire(m) {
  const s = String(m || "").toLowerCase();
  if (s.includes("rate limit") || s.includes("too many"))
    return "Trop de tentatives. Réessaie dans une minute.";
  if (s.includes("invalid") && s.includes("email")) return "Cette adresse email n'est pas valide.";
  if (s.includes("duplicate") || s.includes("unique"))
    return "Ce pseudo est déjà pris sur ce club.";
  if (s.includes("permission") || s.includes("denied"))
    return "Action non autorisée.";
  return "Ça n'a pas marché. Réessaie dans un instant.";
}
