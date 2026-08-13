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
import { tap } from "../lib/haptics.js";
import { supabase, isConfigured, signInWithEmail } from "../lib/supabase.js";
import { ensureSession } from "../lib/session.js";
import { availableProviders, startSocialLogin, readSocialReturn } from "../lib/social.js";
import { currentClub } from "../lib/club.js";
import { loadPublicRewards, loadMyProfile } from "../lib/game.js";

const HANDLE_RE = /^[a-zA-Z0-9._]{2,30}$/;

export function Onboarding(_params, ctx) {
  const root = h("div", { class: "ob" });

  // Le club vient du QR scanne, plus de nom en dur : l'ecran annoncait
  // "Rejoins le Mirage" et le handle @mirage.brussels a tout le monde,
  // quel que soit l'etablissement scanne.
  let club = null;

  start();
  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  async function start() {
    // Resolu AVANT tout rendu : l'ecran affiche le nom du club des sa
    // premiere image, on ne veut pas afficher un nom puis un autre.
    club = await currentClub();

    // Retour d'un reseau social. La session est deja ouverte par Supabase
    // (l'edge function a renvoye le navigateur sur le lien d'action), il ne
    // reste qu'a lire le resultat.
    const retour = readSocialReturn();
    if (retour && !retour.ok) return renderConnect(retour.message);

    // Retour de lien magique ou de reseau social : la session existe, on enchaine.
    const s = await ensureSession();
    if (s?.user) {
      // Le pseudo deja enregistre vient de la base, plus d'une variable en
      // memoire : il doit survivre a la fermeture de l'app.
      const profil = await loadMyProfile();
      return renderHandle(s.user, profil?.handle || "");
    }
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
          h(
            "h1",
            { class: "ob-title reveal", style: { "--d": "70ms" } },
            club ? `Rejoins le ${club.name}` : "Rejoins ton club"
          ),
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
  function renderHandle(user, handleExistant = "") {
    const input = h("input", {
      class: "ob-input",
      type: "text",
      autocapitalize: "none",
      autocorrect: "off",
      spellcheck: "false",
      placeholder: "ton.pseudo",
      "aria-label": "Ton pseudo Instagram",
      value: handleExistant,
    });
    const msg = h("p", { class: "ob-msg" });
    const btn = h("button", { class: "btn btn-primary btn-block" }, "C'est parti");

    // Repli pour les comptes qu'aucune API ne sert (Instagram perso).
    // Facultatif : le chiffre est decoratif, il ne donne aucun point.
    const abosInput = h("input", {
      class: "ob-input",
      type: "number",
      inputmode: "numeric",
      min: "0",
      placeholder: "1 250",
      "aria-label": "Ton nombre d'abonnés",
    });
    const fileInput = h("input", {
      class: "ob-file",
      type: "file",
      accept: "image/*",
      "aria-label": "Capture de ton profil",
    });
    const fileName = h("span", { class: "ob-file-name" }, "Aucune capture");
    fileInput.addEventListener("change", () => {
      const f = fileInput.files && fileInput.files[0];
      fileName.textContent = f ? f.name : "Aucune capture";
    });

    async function save() {
      const handle = input.value.trim().replace(/^@/, "");
      if (!HANDLE_RE.test(handle)) {
        msg.className = "ob-msg err";
        msg.textContent = "Pseudo invalide : lettres, chiffres, point et underscore.";
        input.focus();
        return;
      }

      const abosRaw = abosInput.value.trim();
      const abos = abosRaw === "" ? null : Number(abosRaw);
      if (abos !== null && (!Number.isFinite(abos) || abos < 0)) {
        msg.className = "ob-msg err";
        msg.textContent = "Nombre d'abonnés invalide.";
        abosInput.focus();
        return;
      }

      tap();
      btn.disabled = true;
      btn.textContent = "Enregistrement…";

      if (isConfigured) {
        // La ligne de profil n'existe pas tant qu'on ne la cree pas : aucun
        // trigger ne la genere a la creation du compte auth. Sans cette
        // insertion, l'UPDATE plus bas -- et declare_followers, qui fait
        // aussi un UPDATE -- portent sur 0 ligne SANS lever d'erreur, et le
        // pseudo est perdu en silence. C'etait le cas depuis l'origine.
        //
        // ON CONFLICT DO NOTHING : on ne retouche pas une ligne existante.
        // C'est aussi ce qu'imposent les droits, le grant UPDATE ne
        // couvrant pas la colonne id (migration 0018). Les colonnes
        // inserables se limitent a (id, handle, email) : impossible de se
        // donner des points en passant par ici.
        const { error: creaErr } = await supabase.from("users").upsert(
          { id: user.id, handle, email: user.email || null },
          { onConflict: "id", ignoreDuplicates: true }
        );
        if (creaErr) {
          btn.disabled = false;
          btn.textContent = "C'est parti";
          msg.className = "ob-msg err";
          msg.textContent = traduire(creaErr.message);
          return;
        }

        let proofPath = null;

        // La capture part dans un bucket PRIVE, dans un dossier nomme par
        // l'id du clubbeur : personne ne voit celle des autres.
        const f = fileInput.files && fileInput.files[0];
        if (f && abos !== null) {
          const ext = (f.name.split(".").pop() || "jpg").toLowerCase().slice(0, 5);
          const path = `${user.id}/profil.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("follower-proofs")
            .upload(path, f, { upsert: true, contentType: f.type || "image/jpeg" });
          // Une capture qui ne part pas ne doit pas bloquer l'inscription.
          if (!upErr) proofPath = path;
        }

        let error = null;
        if (abos !== null) {
          // declare_followers force follower_source = 'declared' : un
          // chiffre saisi a la main ne peut pas se faire passer pour un
          // chiffre verifie par le reseau.
          const r = await supabase.rpc("declare_followers", {
            p_handle: handle,
            p_count: Math.round(abos),
            p_proof: proofPath,
          });
          error = r.error;
        } else {
          // La migration 0004 n'autorise l'ecriture que sur handle et email :
          // impossible de toucher a son solde en passant par ici.
          const r = await supabase.from("users").update({ handle }).eq("id", user.id);
          error = r.error;
        }

        if (error) {
          btn.disabled = false;
          btn.textContent = "C'est parti";
          msg.className = "ob-msg err";
          msg.textContent = traduire(error.message);
          return;
        }
      }

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
          h(
            "p",
            { class: "ob-sub reveal", style: { "--d": "130ms" } },
            club
              ? [
                  "C'est lui qu'on cherche dans les mentions de ",
                  h("strong", {}, `@${club.ig_handle}`),
                  ". Pas besoin de te connecter à Instagram : poster depuis ton compte suffit à prouver que c'est le tien.",
                ]
              : [
                  "C'est lui qu'on cherche dans les mentions de ton club. Pas besoin de te connecter à Instagram : poster depuis ton compte suffit à prouver que c'est le tien.",
                ]
          ),
          h("div", { class: "ob-field reveal", style: { "--d": "190ms" } }, [
            h("div", { class: "ob-at" }, [h("span", { class: "ob-at-sign" }, "@"), input]),
          ]),

          h("div", { class: "ob-declare reveal", style: { "--d": "230ms" } }, [
            h("p", { class: "label ob-declare-label" }, "Tes abonnés — facultatif"),
            h(
              "p",
              { class: "ob-declare-note" },
              "Si tu ne connectes pas ton réseau, tu peux les saisir. Le chiffre sera affiché comme déclaré et ne change rien à tes points."
            ),
            abosInput,
            h("label", { class: "ob-file-row" }, [
              h("span", { class: "ob-file-btn" }, "Joindre une capture"),
              fileName,
              fileInput,
            ]),
          ]),

          h("div", { class: "ob-field" }, [msg]),

          // Rappel de la recompense. L'accueil vend "un verre a 300 pts",
          // puis cet ecran demandait un pseudo sans jamais redire pourquoi
          // — et laissait un grand vide avant le bouton. Le rappel comble
          // le vide ET tient la promesse jusqu'au bout du formulaire.
          rappelRecompense(),
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

  // Bandeau "voila ce que tu viens chercher". Rempli en async : s'il n'y
  // a pas de catalogue, il reste vide plutot que d'annoncer une
  // recompense inventee.
  function rappelRecompense() {
    const slot = h("div", { class: "ob-goal-slot" });

    currentClub()
      .then((club) => (club ? loadPublicRewards(club.id) : null))
      .then((liste) => {
        if (!liste || !liste.length) return;
        const premiere = liste[0];
        slot.replaceChildren(
          h("div", { class: "ob-goal" }, [
            h("span", { class: "ob-goal-ico", "aria-hidden": "true" }, icon("gift", 18)),
            h("div", { class: "ob-goal-txt" }, [
              h("span", { class: "ob-goal-label" }, "Ton premier objectif"),
              h("span", { class: "ob-goal-title" }, premiere.title),
            ]),
            h("span", { class: "ob-goal-cost mono" }, [
              new Intl.NumberFormat("fr-FR").format(premiere.cost_points),
              h("small", {}, "pts"),
            ]),
          ])
        );
      })
      .catch(() => {});

    return slot;
  }

  /* ---------- utilitaires ---------- */
  function head(onBack) {
    return h("header", { class: "ob-head" }, [
      h("button", { class: "ob-back", "aria-label": "Retour", onClick: onBack }, icon("arrowRight", 18)),
      h("span", { class: "label" }, club ? `${club.name} · ${club.city}` : "Ton club"),
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
