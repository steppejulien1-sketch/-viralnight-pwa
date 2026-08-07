// Ecran — Poster un contenu (story, Reel ou TikTok).
// Trois temps :
//   1) howto   : choix du format + 3 etapes visuelles
//   2) waiting : attente de la confirmation webhook (stub ~4,5 s)
//   3) reward  : gain de points anime (compteur + haptic)
//
// En prod, l'etape "waiting" ecoutera le webhook de la plateforme.
// Le bareme depend du format : voir credit_story (migration 0005).

import { h, icon } from "../lib/dom.js";
import { CLUB, USER, HISTORY, STORY_BASE_POINTS } from "../lib/mock.js";
import { countUp } from "../lib/animations.js";
import { tap, success } from "../lib/haptics.js";
import { creditStory, untilLabel } from "../lib/game.js";

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
      { n: "3", t: "Reviens ici", d: "On détecte ton contenu et on crédite tes points." },
    ];

    function go() {
      tap();
      const lien = kind.id === "story" ? "" : linkInput.value.trim();
      window.open(kind.url, "_blank", "noopener");
      renderWaiting(lien);
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
            "Détection automatique. Rien à copier-coller.",
          ]),
        ]),
      ])
    );
  }

  /* ---------- 2. Attente de confirmation ---------- */
  function renderWaiting(lien) {
    swap(
      h("div", { class: "ps-inner ps-waiting" }, [
        h("div", { class: "ps-radar", "aria-hidden": "true" }, [
          h("span", { class: "ps-radar-ring" }),
          h("span", { class: "ps-radar-ring" }),
          h("span", { class: "ps-radar-core" }, icon(kind.ico, 26)),
        ]),
        h("h2", { class: "ps-wait-title" }, `On cherche ton ${kind.label.toLowerCase()}…`),
        h("p", { class: "ps-wait-sub" }, [
          "Dès que tu tagues ",
          h("strong", {}, `@${CLUB.igHandle}`),
          ", tes points tombent ici.",
        ]),
        h("button", { class: "ps-wait-cancel", onClick: () => ctx.back("dashboard") }, "Plus tard"),
      ])
    );

    // Stub webhook : confirmation apres ~4,5 s.
    setTimeout(() => renderReward(lien), 4500);
  }

  /* ---------- 3. Gain de points ---------- */
  // Le credit se fait EN BASE via credit_story (transaction : story_events +
  // solde + classement). Avant, cette fonction se contentait d'incrementer
  // USER.points en memoire : les points disparaissaient au rafraichissement,
  // alors que la boutique, elle, debitait de vrais points.
  //
  // Repli : si Supabase n'est pas configure ou refuse, on retombe sur le
  // comportement local pour que la demo hors ligne reste jouable.
  async function renderReward(lien) {
    const before = USER.points;

    let gain = STORY_BASE_POINTS;
    let after = before + gain;

    // Depuis la migration 0011, le gain part en attente : le solde
    // DEPENSABLE ne bouge pas tout de suite. On affiche donc le solde
    // renvoye par la base tel quel, sans y ajouter le gain.
    let unlock = null;
    const res = await creditStory(0, kind.id, lien || "");
    if (res && !res.error && typeof res.awarded === "number") {
      gain = res.awarded;
      after = res.balance;
      unlock = res.unlocksAt || null;
      USER.totalEarned = res.lifetime;
    } else {
      USER.totalEarned += gain;
    }

    USER.points = after;
    HISTORY.unshift({
      date: "À l'instant",
      views: 0,
      points: gain,
    });

    success(); // haptic

    const gainEl = h("span", { class: "rw-gain-num mono" }, "0");
    const balEl = h("span", { class: "rw-bal-num mono" }, String(before));

    swap(
      h("div", { class: "ps-inner ps-reward" }, [
        h("div", { class: "rw-burst", "aria-hidden": "true" }),
        h("div", { class: "rw-body" }, [
          h("div", { class: "rw-check pop", style: { "--d": "0ms" } }, icon("check", 34)),
          h("p", { class: "label rw-label pop", style: { "--d": "120ms" } }, `${kind.label} validé${kind.id === "story" ? "e" : ""}`),
          h("div", { class: "rw-gain pop", style: { "--d": "200ms" } }, [
            h("span", { class: "rw-gain-plus" }, "+"),
            gainEl,
            h("span", { class: "rw-gain-unit" }, "pts"),
          ]),
          h(
            "p",
            { class: "rw-mult pop", style: { "--d": "300ms" } },
            unlock
              ? [
                  "Dépensables ",
                  h("span", { class: "rw-mult-x" }, untilLabel(unlock)),
                  " — le temps que ton contenu tourne.",
                ]
              : [
                  "Contenu crédité. ",
                  h("span", { class: "rw-mult-x" }, "Ajoute tes vues"),
                  " pour un gros bonus.",
                ]
          ),

          h("div", { class: "rw-bal card pop", style: { "--d": "400ms" } }, [
            h("span", { class: "label" }, unlock ? "Solde disponible" : "Nouveau solde"),
            h("span", { class: "rw-bal-val" }, [balEl, h("span", { class: "rw-bal-unit" }, " pts")]),
          ]),
        ]),

        h("footer", { class: "ps-foot pop", style: { "--d": "500ms" } }, [
          h(
            "button",
            { class: "btn btn-primary btn-block", onClick: () => ctx.navigate("dashboard") },
            "Voir mon espace"
          ),
        ]),
      ])
    );

    setTimeout(() => {
      countUp(gainEl, gain, { dur: 900 });
      countUp(balEl, after, { dur: 1100 });
    }, 250);
  }
}
