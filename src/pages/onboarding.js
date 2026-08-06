// Ecran 2 — Connexion.
//
// Trois voies, par ordre de facilite :
//   1. TikTok   — Login Kit, ouvert a TOUS les comptes.
//   2. Instagram— n'accepte QUE les comptes professionnels (Createur ou
//                 Business) depuis la fermeture de Basic Display le
//                 4 decembre 2024. Un compte perso est refuse par
//                 Instagram ; le message d'erreur explique la bascule,
//                 qui est gratuite et instantanee.
//   3. Email    — lien magique, toujours disponible, aucun reseau requis.
//
// Les deux boutons sociaux sont TOUJOURS affiches, comme le "Continuer
// avec Google" du site B2B : l'utilisateur doit voir ses options d'un
// coup d'oeil. Tant qu'une app n'est pas configuree (cle + redirect_uri),
// le bouton est attenue et annonce "bientot disponible" au tap, plutot
// que de lancer une redirection cassee.
//
// A noter : meme sans connexion sociale, la propriete du compte reste
// prouvee par la mention elle-meme -- seul le proprietaire peut publier
// depuis son compte.

import { h, icon } from "../lib/dom.js";
import { CLUB, USER } from "../lib/mock.js";
import { tap } from "../lib/haptics.js";
import { supabase, isConfigured, signInWithEmail } from "../lib/supabase.js";
import { ensureSession } from "../lib/session.js";
import { availableProviders, startSocialLogin, readSocialReturn } from "../lib/social.js";

const HANDLE_RE = /^[a-zA-Z0-9._]{2,30}$/;

export function Onboarding(_params, ctx) {
  const root = h("div", { class: "ob" });
  start();
  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  async function start() {
    // Retour d'un reseau social. La session est deja ouverte par Supabase
    // (l'edge function a renvoye le navigateur sur le lien d'action), il ne
    // reste qu'a lire le resultat.
    const retour = readSocialReturn();
    if (retour && !retour.ok) return renderConnect(retour.message);

    // Retour de lien magique ou de reseau social : la session existe, on enchaine.
    const s = await ensureSession();
    if (s?.user) return renderHandle(s.user);
    renderConnect();
  }

  // Ecran d'attente neutre pendant un aller-retour reseau.
  function renderPending(txt) {
    swap(
      h("div", { class: "ob-inner" }, [
        h("div", { class: "ob-body ob-connect" }, [
          h("div", { class: "ob-ig-badge", "aria-hidden": "true" }, [icon("instagram", 34)]),
          h("h1", { class: "ob-title" }, txt),
        ]),
      ])
    );
  }

  /* ---------- 1. Identite ---------- */
  function renderConnect(erreur) {
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

    if (erreur) {
      msg.className = "ob-msg err";
      msg.textContent = erreur;
    }

    // Les deux boutons sont toujours visibles. S'ils ne sont pas encore
    // configures, on le dit au tap plutot que de lancer une redirection
    // qui echouerait chez l'utilisateur.
    const providers = availableProviders();
    const social = [
      h(
        "div",
        { class: "ob-social reveal", style: { "--d": "150ms" } },
        providers.map((p) =>
          h(
            "button",
            {
              class: `btn btn-social btn-${p.id} btn-block${p.ready ? "" : " is-soon"}`,
              onClick: async (e) => {
                tap();
                if (!p.ready) {
                  msg.className = "ob-msg err";
                  msg.textContent = `Connexion ${p.label} bientôt disponible. En attendant, reçois un lien par email.`;
                  input.focus();
                  return;
                }
                const bouton = e.currentTarget;
                bouton.disabled = true;
                const err = await startSocialLogin(p.id);
                if (err) {
                  bouton.disabled = false;
                  msg.className = "ob-msg err";
                  msg.textContent = err;
                }
              },
            },
            [icon(p.ico, 19), `Continuer avec ${p.label}`]
          )
        )
      ),
      h("div", { class: "ob-sep reveal", style: { "--d": "180ms" } }, [
        h("span", {}, "ou par email"),
      ]),
    ];

    swap(
      h("div", { class: "ob-inner" }, [
        head(() => ctx.back("landing")),
        h("div", { class: "ob-body ob-connect" }, [
          h("div", { class: "ob-ig-badge reveal", style: { "--d": "0ms" }, "aria-hidden": "true" }, [
            icon("sparkles", 34),
          ]),
          h("h1", { class: "ob-title reveal", style: { "--d": "70ms" } }, "Rejoins le Mirage"),
          h("p", { class: "ob-sub reveal", style: { "--d": "130ms" } }, [
            "Connecte ton réseau, ou reçois un lien par email. ",
            h("strong", {}, "Aucun mot de passe"),
            " à retenir.",
          ]),

          ...social,

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
