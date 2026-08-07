// Ecran — Poster un contenu (story, Reel ou TikTok).
// Trois temps :
//   1) howto  : choix du format + 3 etapes visuelles
//   2) preuve : capture OBLIGATOIRE + nombre de vues
//   3) envoye : accuse de reception, en attente de validation du club
//
// ⚠️ CE QUI A CHANGE, ET POURQUOI.
// L'ecran attendait 4,5 secondes (une fausse detection) puis creditait les
// points tout seul. Trois problemes :
//   - on pouvait gagner des points SANS avoir rien publie ;
//   - la capture etait facultative, alors que c'est elle qui porte le nombre
//     de vues, donc le montant du gain ;
//   - le club payait des recompenses sur des chiffres jamais regardes.
// Desormais le clubbeur DEPOSE une preuve, et c'est le club qui valide.
// Le verrou est en base (migration 0014) : credit_story n'est plus
// appelable depuis le navigateur, submit_story refuse un depot sans capture.

import { h, icon } from "../lib/dom.js";
import { CLUB } from "../lib/mock.js";
import { tap, success } from "../lib/haptics.js";
import { submitStory } from "../lib/game.js";

// Les trois formats acceptes. Le bareme affiche ici doit rester aligne sur
// celui de la fonction SQL credit_story (migration 0005) : c'est elle qui
// fait foi, ces valeurs ne servent qu'a l'affichage.
const KINDS = [
  {
    id: "story",
    label: "Story",
    ico: "instagram",
    app: "Instagram",
    url: "https://instagram.com",
    per100: 20,
    why: "Le meilleur taux : une story touche ton cercle proche, c'est ce qui remplit vraiment.",
    step: "Ajoute le sticker mention",
  },
  {
    id: "reel",
    label: "Reel",
    ico: "reel",
    app: "Instagram",
    url: "https://instagram.com",
    per100: 7,
    why: "Payé au volume : la portée est plus large, mais moins ciblée.",
    step: "Mentionne",
  },
  {
    id: "tiktok",
    label: "TikTok",
    ico: "tiktok",
    app: "TikTok",
    url: "https://tiktok.com",
    per100: 7,
    why: "Payé au volume : la portée est plus large, mais moins ciblée.",
    step: "Mentionne",
  },
];

export function PostStory(_params, ctx) {
  const root = h("div", { class: "ps" });
  let kind = KINDS[0];
  renderHowto();
  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  /* ---------- 1. Instructions ---------- */
  function renderHowto() {
    const steps = [
      { n: "1", t: `Ouvre ${kind.app}`, d: "On t'y emmène en un tap." },
      {
        n: "2",
        t: `Poste ${kind.id === "story" ? "une story" : kind.id === "reel" ? "un Reel" : "un TikTok"}`,
        d: `${kind.step} @${CLUB.igHandle}.`,
      },
      { n: "3", t: "Reviens avec ta capture", d: "Elle montre tes vues : c'est elle qui fixe ton gain." },
    ];

    function go() {
      tap();
      const lien = kind.id === "story" ? "" : linkInput.value.trim();
      window.open(kind.url, "_blank", "noopener");
      renderProof(lien);
    }

    // Lien du contenu. Une story Instagram n'a PAS d'URL publique : on ne
    // demande donc le lien que pour les Reels et TikToks. C'est lui qui
    // permet au contenu de remonter sur le dashboard du gerant.
    const linkInput = h("input", {
      class: "ob-input",
      type: "url",
      inputmode: "url",
      autocapitalize: "none",
      spellcheck: "false",
      placeholder: kind.id === "tiktok" ? "https://tiktok.com/@toi/video/..." : "https://instagram.com/reel/...",
      "aria-label": "Lien de ta publication",
    });

    // Choix du format : il change le bareme, donc il est annonce avant le
    // parcours et pas cache dans un reglage.
    const picker = h(
      "div",
      { class: "ps-kinds reveal", style: { "--d": "40ms" }, role: "tablist" },
      KINDS.map((k) =>
        h(
          "button",
          {
            class: "ps-kind" + (k.id === kind.id ? " on" : ""),
            role: "tab",
            "aria-selected": k.id === kind.id ? "true" : "false",
            onClick: () => {
              if (k.id === kind.id) return;
              tap();
              kind = k;
              renderHowto();
            },
          },
          [icon(k.ico, 17), h("span", {}, k.label)]
        )
      )
    );

    swap(
      h("div", { class: "ps-inner" }, [
        h("header", { class: "ps-head" }, [
          h(
            "button",
            { class: "ob-back", "aria-label": "Retour", onClick: () => ctx.back("dashboard") },
            icon("arrowRight", 18)
          ),
          h("span", { class: "label" }, "Poster un contenu"),
        ]),

        h("div", { class: "ps-body" }, [
          h("h1", { class: "ps-title reveal", style: { "--d": "0ms" } }, [
            "Tague ",
            h("span", { class: "ps-club" }, `@${CLUB.igHandle}`),
            " et gagne tes points",
          ]),

          picker,

          h("p", { class: "ps-sub reveal", style: { "--d": "90ms" } }, [
            h("strong", {}, `${kind.per100} pts`),
            " pour 100 vues. ",
            kind.why,
          ]),

          kind.id === "story"
            ? h(
                "p",
                { class: "ps-hint reveal", style: { "--d": "110ms" } },
                "Une story n'a pas de lien public : on la détecte via la mention."
              )
            : h("div", { class: "ps-link reveal", style: { "--d": "110ms" } }, [
                h("span", { class: "label" }, "Lien de ta publication"),
                linkInput,
                h(
                  "span",
                  { class: "ps-link-note" },
                  "Colle-le pour que ton contenu remonte au club."
                ),
              ]),

          h(
            "ol",
            { class: "ps-steps" },
            steps.map((s, i) =>
              h("li", { class: "ps-step reveal", style: { "--d": `${130 + i * 70}ms` } }, [
                h("span", { class: "ps-step-n mono" }, s.n),
                h("span", { class: "ps-step-main" }, [
                  h("span", { class: "ps-step-t" }, s.t),
                  h("span", { class: "ps-step-d" }, s.d),
                ]),
              ])
            )
          ),
        ]),

        h("footer", { class: "ps-foot reveal", style: { "--d": "380ms" } }, [
          h("button", { class: "btn btn-primary btn-block", onClick: go }, [
            icon(kind.ico, 20),
            `Ouvrir ${kind.app}`,
          ]),
          h("p", { class: "ob-note" }, [
            icon("check", 13),
            "Le club valide ta capture, puis tes points tombent.",
          ]),
        ]),
      ])
    );
  }

  /* ---------- 2. La preuve : capture OBLIGATOIRE + vues ---------- */
  // C'est le coeur du changement. Sans capture, pas de depot : le bouton
  // reste desactive et la base refuse de toute facon (proof_required).
  function renderProof(lien) {
    const fileInput = h("input", {
      class: "ps-file",
      type: "file",
      accept: "image/*",
      // capture="environment" ouvre l'appareil photo sur mobile ; on garde
      // aussi la galerie, la capture d'ecran y est deja.
      "aria-label": "Capture de tes vues",
    });
    const apercu = h("div", { class: "ps-shot" }, [
      h("span", { class: "ps-shot-ico", "aria-hidden": "true" }, icon("scan", 22)),
      h("span", { class: "ps-shot-txt" }, "Ajouter la capture"),
    ]);

    const vuesInput = h("input", {
      class: "ob-input",
      type: "number",
      inputmode: "numeric",
      min: "0",
      placeholder: "Ex. 1 240",
      "aria-label": "Nombre de vues",
    });

    const msg = h("p", { class: "ob-msg" });
    const btn = h("button", { class: "btn btn-primary btn-block", disabled: true }, "Envoyer au club");

    let fichier = null;

    function verifier() {
      const v = Number(vuesInput.value.trim());
      btn.disabled = !(fichier && Number.isFinite(v) && v >= 0 && vuesInput.value.trim() !== "");
    }

    fileInput.addEventListener("change", () => {
      fichier = fileInput.files && fileInput.files[0];
      if (fichier) {
        apercu.classList.add("is-set");
        apercu.replaceChildren(
          h("span", { class: "ps-shot-ico", "aria-hidden": "true" }, icon("check", 22)),
          h("span", { class: "ps-shot-txt" }, fichier.name)
        );
      }
      verifier();
    });
    vuesInput.addEventListener("input", verifier);

    async function envoyer() {
      tap();
      btn.disabled = true;
      btn.textContent = "Envoi…";
      msg.className = "ob-msg";
      msg.textContent = "";

      const res = await submitStory({
        kind: kind.id,
        views: Number(vuesInput.value.trim()),
        file: fichier,
        url: lien || "",
      });

      if (res?.error) {
        btn.disabled = false;
        btn.textContent = "Envoyer au club";
        msg.className = "ob-msg err";
        msg.textContent = traduire(res.error);
        return;
      }
      success();
      renderSent();
    }

    btn.addEventListener("click", envoyer);

    swap(
      h("div", { class: "ps-inner" }, [
        h("header", { class: "ps-head" }, [
          h("button", { class: "ob-back", "aria-label": "Retour", onClick: () => renderHowto() }, icon("arrowRight", 18)),
          h("span", { class: "label" }, "Ta preuve"),
        ]),

        h("div", { class: "ps-body" }, [
          h("h1", { class: "ps-title reveal", style: { "--d": "0ms" } }, [
            "Montre tes vues, ",
            h("em", {}, "on compte"),
          ]),
          h("p", { class: "ps-sub reveal", style: { "--d": "60ms" } }, [
            "Ouvre ",
            h("strong", {}, kind.app),
            `, va sur ${kind.id === "story" ? "ta story" : "ta publication"}, et fais une capture de l'écran des vues.`,
          ]),

          h("label", { class: "ps-shot-wrap reveal", style: { "--d": "120ms" } }, [apercu, fileInput]),

          h("div", { class: "ps-field reveal", style: { "--d": "180ms" } }, [
            h("span", { class: "label" }, "Combien de vues ?"),
            vuesInput,
            h("span", { class: "ps-field-note" }, "Le club vérifie sur ta capture. Un chiffre gonflé fait refuser le contenu."),
          ]),

          msg,
        ]),

        h("footer", { class: "ps-foot" }, [
          btn,
          h("p", { class: "ob-note" }, [
            icon("lock", 13),
            "Ta capture n'est visible que par le club.",
          ]),
        ]),
      ])
    );

    vuesInput.focus();
  }

  /* ---------- 3. Envoye : en attente de validation ---------- */
  // Aucun point n'est annonce ici. Promettre un gain avant que le club ait
  // regarde la preuve, c'est reproduire exactement le probleme d'avant.
  function renderSent() {
    swap(
      h("div", { class: "ps-inner ps-sent" }, [
        h("div", { class: "ps-body ps-sent-body" }, [
          h("div", { class: "rw-check pop", style: { "--d": "0ms" } }, icon("check", 34)),
          h("h2", { class: "ps-wait-title pop", style: { "--d": "120ms" } }, "Envoyé au club"),
          h("p", { class: "ps-wait-sub pop", style: { "--d": "200ms" } }, [
            "Le ",
            h("strong", {}, CLUB.name),
            " vérifie ta capture et crédite tes points. En général avant la prochaine soirée.",
          ]),
          h("p", { class: "ps-sent-note pop", style: { "--d": "280ms" } },
            "Tu retrouveras ce contenu dans « Tes soirées », marqué en attente."),
        ]),
        h("footer", { class: "ps-foot pop", style: { "--d": "360ms" } }, [
          h("button", { class: "btn btn-primary btn-block", onClick: () => ctx.navigate("dashboard") }, "Voir mon espace"),
        ]),
      ])
    );
  }

  // Messages d'erreur de submit_story, traduits pour un clubbeur.
  function traduire(code) {
    if (/proof_required/.test(code)) return "Ajoute la capture de tes vues.";
    if (/views_required/.test(code)) return "Indique ton nombre de vues.";
    if (/already_pending/.test(code)) return "Tu as déjà un contenu en attente de validation.";
    if (/invalid_kind/.test(code)) return "Format non reconnu.";
    if (/not_authenticated/.test(code)) return "Reconnecte-toi pour envoyer ton contenu.";
    return "Envoi impossible pour le moment. Réessaie dans un instant.";
  }
}
