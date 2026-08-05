// Ecran 2 — Onboarding express.
// Trois temps, une seule action a la fois :
//   1) form      : handle Instagram + email
//   2) analyzing : "on regarde ton compte" (lookup followers, mocke)
//   3) tier      : revelation du palier attribue, puis -> dashboard
//
// Zero friction : magic link (pas de mot de passe), le palier est deduit
// automatiquement du nombre d'abonnes.

import { h, icon } from "../lib/dom.js";
import { CLUB, USER, TIERS, tierForFollowers, mockFollowers } from "../lib/mock.js";
import { TierBadge } from "../components/TierBadge.js";
import { countUp } from "../lib/animations.js";
import { isConfigured, signInWithEmail } from "../lib/supabase.js";

export function Onboarding(_params, ctx) {
  const root = h("div", { class: "ob" });
  renderForm();
  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  /* ---------- 1. Formulaire ---------- */
  function renderForm() {
    let handle = "";
    let email = "";

    const submit = h(
      "button",
      { class: "btn btn-primary btn-block", disabled: true, onClick: onContinue },
      ["Continuer", icon("arrowRight", 19)]
    );

    function validate() {
      const okHandle = handle.trim().replace(/^@/, "").length >= 2;
      const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
      submit.disabled = !(okHandle && okEmail);
    }

    const handleInput = h("input", {
      class: "field-input",
      type: "text",
      inputmode: "text",
      autocapitalize: "off",
      autocorrect: "off",
      spellcheck: "false",
      placeholder: "ton.pseudo",
      "aria-label": "Ton pseudo Instagram",
      onInput: (e) => {
        handle = e.target.value.replace(/\s/g, "");
        validate();
      },
    });

    const emailInput = h("input", {
      class: "field-input",
      type: "email",
      inputmode: "email",
      autocapitalize: "off",
      autocorrect: "off",
      spellcheck: "false",
      placeholder: "toi@email.com",
      "aria-label": "Ton email",
      onInput: (e) => {
        email = e.target.value;
        validate();
      },
    });

    async function onContinue() {
      USER.handle = handle.trim().replace(/^@/, "");
      USER.email = email.trim();

      // Supabase configure : vrai magic link. Sinon : mode demo direct.
      if (isConfigured) {
        submit.disabled = true;
        submit.textContent = "Envoi du lien…";
        const { error } = await signInWithEmail(USER.email);
        if (!error) {
          renderCheckEmail();
          return;
        }
        // Echec d'envoi : on retombe sur le mode demo pour ne pas bloquer.
      }
      renderAnalyzing();
    }

    swap(
      h("div", { class: "ob-inner" }, [
        h("header", { class: "ob-head" }, [
          h(
            "button",
            { class: "ob-back", "aria-label": "Retour", onClick: () => ctx.back("landing") },
            icon("arrowRight", 18)
          ),
          h("span", { class: "label" }, `${CLUB.name} · ${CLUB.city}`),
        ]),

        h("div", { class: "ob-body" }, [
          h("h1", { class: "ob-title reveal", style: { "--d": "0ms" } }, "Crée ton profil"),
          h(
            "p",
            { class: "ob-sub reveal", style: { "--d": "60ms" } },
            "Deux infos, et c'est parti. On lit ton compte pour fixer ton palier de points."
          ),

          // Champ handle Instagram, avec prefixe @ et icone.
          h("label", { class: "field reveal", style: { "--d": "130ms" } }, [
            h("span", { class: "field-label" }, "Ton Instagram"),
            h("span", { class: "field-wrap" }, [
              icon("instagram", 18, "field-icon"),
              h("span", { class: "field-at" }, "@"),
              handleInput,
            ]),
          ]),

          // Champ email.
          h("label", { class: "field reveal", style: { "--d": "190ms" } }, [
            h("span", { class: "field-label" }, "Ton email"),
            h("span", { class: "field-wrap" }, [emailInput]),
          ]),
        ]),

        h("footer", { class: "ob-foot reveal", style: { "--d": "260ms" } }, [
          submit,
          h("p", { class: "ob-note" }, [
            icon("check", 13),
            "Lien magique par email. Aucun mot de passe à retenir.",
          ]),
        ]),
      ])
    );

    requestAnimationFrame(() => handleInput.focus());
  }

  /* ---------- 1b. Verifie ton email (magic link reel) ---------- */
  function renderCheckEmail() {
    swap(
      h("div", { class: "ob-inner ob-analyzing" }, [
        h("div", { class: "an-core" }, [
          h("div", { class: "rw-check pop", style: { "--d": "0ms" } }, icon("check", 30)),
          h("h2", { class: "an-title", style: { marginTop: "8px" } }, "Regarde tes mails"),
          h("p", { class: "ps-wait-sub", style: { marginTop: "10px" } }, [
            "On a envoyé un lien magique à ",
            h("strong", {}, USER.email),
            ". Clique dessus pour entrer — pas de mot de passe.",
          ]),
          h(
            "button",
            { class: "ps-wait-cancel", style: { marginTop: "26px" }, onClick: () => renderForm() },
            "Changer d'email"
          ),
        ]),
      ])
    );
  }

  /* ---------- 2. Analyse (lookup mocke) ---------- */
  function renderAnalyzing() {
    const steps = [
      `Connexion à @${USER.handle}`,
      "Lecture de ta communauté",
      "Attribution de ton palier",
    ];

    const rows = steps.map((s, i) =>
      h("li", { class: "an-step", style: { "--d": `${i * 480}ms` } }, [
        h("span", { class: "an-spin", "aria-hidden": "true" }),
        h("span", {}, s),
      ])
    );

    swap(
      h("div", { class: "ob-inner ob-analyzing" }, [
        h("div", { class: "an-core" }, [
          h("div", { class: "an-ring", "aria-hidden": "true" }, [h("span", { class: "an-ring-dot" })]),
          h("h2", { class: "an-title" }, "On regarde ton compte"),
          h("p", { class: "an-sub" }, `@${USER.handle}`),
          h("ul", { class: "an-steps" }, rows),
        ]),
      ])
    );

    // Chaque etape se "valide" en cascade, puis on revele le palier.
    rows.forEach((row, i) => setTimeout(() => row.classList.add("done"), 500 + i * 520));
    setTimeout(renderTier, 500 + steps.length * 520 + 350);
  }

  /* ---------- 3. Revelation du palier ---------- */
  function renderTier() {
    const followers = mockFollowers(USER.handle);
    const tier = tierForFollowers(followers);
    USER.followers = followers;
    USER.tier = tier;

    const followersEl = h("span", { class: "tr-foll-num mono" }, "0");

    swap(
      h("div", { class: "ob-inner ob-tier" }, [
        h("div", { class: "tr-body" }, [
          h("p", { class: "label tr-label pop", style: { "--d": "0ms" } }, "Ton palier"),

          h("div", { class: "tr-badge-wrap pop", style: { "--d": "90ms" } }, [TierBadge(tier, "hero")]),

          h("h1", { class: "tr-name pop", style: { "--d": "180ms" } }, tier.label),

          h("p", { class: "tr-foll pop", style: { "--d": "250ms" } }, [
            followersEl,
            " abonnés détectés",
          ]),

          h("div", { class: "tr-explain card pop", style: { "--d": "330ms" } }, [
            h("span", { class: "tr-explain-mult mono" }, `×${tier.mult}`),
            h("p", {}, [
              "Chaque story que tu postes rapporte ",
              h("strong", {}, `${tier.mult} fois plus`),
              " de points. Plus ta communauté grandit, plus tu montes.",
            ]),
          ]),
        ]),

        h("footer", { class: "ob-foot pop", style: { "--d": "430ms" } }, [
          h(
            "button",
            { class: "btn btn-primary btn-block", onClick: () => ctx.navigate("dashboard") },
            ["Voir mon espace", icon("arrowRight", 19)]
          ),
        ]),
      ])
    );

    // Compteur d'abonnes qui monte, pour donner du poids au chiffre.
    setTimeout(() => countUp(followersEl, followers, { dur: 900 }), 350);
  }
}
