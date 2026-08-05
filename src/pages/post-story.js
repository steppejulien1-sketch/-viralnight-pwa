// Ecran — Poster ma story.
// Trois temps :
//   1) howto   : 3 etapes visuelles pour poster la story taguee
//   2) waiting : attente de la confirmation webhook (stub ~4,5 s)
//   3) reward  : gain de points anime (compteur + haptic)
//
// En prod, l'etape "waiting" ecoutera le webhook Instagram cote serveur.

import { h, icon } from "../lib/dom.js";
import { CLUB, USER, HISTORY, STORY_BASE_POINTS } from "../lib/mock.js";
import { countUp } from "../lib/animations.js";
import { tap, success } from "../lib/haptics.js";

export function PostStory(_params, ctx) {
  const root = h("div", { class: "ps" });
  renderHowto();
  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  /* ---------- 1. Instructions ---------- */
  function renderHowto() {
    const steps = [
      { n: "1", t: "Ouvre Instagram", d: "On t'y emmène en un tap." },
      {
        n: "2",
        t: "Poste une story",
        d: `Ajoute le sticker mention @${CLUB.igHandle} sur ta story.`,
      },
      { n: "3", t: "Reviens ici", d: "On détecte ta story et on crédite tes points." },
    ];

    function go() {
      tap();
      // Ouvre Instagram (best effort) puis passe en attente.
      window.open("https://instagram.com", "_blank", "noopener");
      renderWaiting();
    }

    swap(
      h("div", { class: "ps-inner" }, [
        h("header", { class: "ps-head" }, [
          h(
            "button",
            { class: "ob-back", "aria-label": "Retour", onClick: () => ctx.back("dashboard") },
            icon("arrowRight", 18)
          ),
          h("span", { class: "label" }, "Poster ma story"),
        ]),

        h("div", { class: "ps-body" }, [
          h("h1", { class: "ps-title reveal", style: { "--d": "0ms" } }, [
            "Tague ",
            h("span", { class: "ps-club" }, `@${CLUB.igHandle}`),
            " et gagne tes points",
          ]),
          h(
            "p",
            { class: "ps-sub reveal", style: { "--d": "60ms" } },
            "Trois étapes, trente secondes. Ta story rapporte selon les vues qu'elle fait."
          ),

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
            icon("instagram", 20),
            "Ouvrir Instagram",
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
  function renderWaiting() {
    swap(
      h("div", { class: "ps-inner ps-waiting" }, [
        h("div", { class: "ps-radar", "aria-hidden": "true" }, [
          h("span", { class: "ps-radar-ring" }),
          h("span", { class: "ps-radar-ring" }),
          h("span", { class: "ps-radar-core" }, icon("instagram", 26)),
        ]),
        h("h2", { class: "ps-wait-title" }, "On cherche ta story…"),
        h("p", { class: "ps-wait-sub" }, [
          "Dès que tu tagues ",
          h("strong", {}, `@${CLUB.igHandle}`),
          ", tes points tombent ici.",
        ]),
        h("button", { class: "ps-wait-cancel", onClick: () => ctx.back("dashboard") }, "Plus tard"),
      ])
    );

    // Stub webhook : confirmation apres ~4,5 s.
    setTimeout(renderReward, 4500);
  }

  /* ---------- 3. Gain de points ---------- */
  function renderReward() {
    const gain = STORY_BASE_POINTS;
    const before = USER.points;
    const after = before + gain;
    USER.points = after;
    USER.totalEarned += gain;
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
          h("p", { class: "label rw-label pop", style: { "--d": "120ms" } }, "Story validée"),
          h("div", { class: "rw-gain pop", style: { "--d": "200ms" } }, [
            h("span", { class: "rw-gain-plus" }, "+"),
            gainEl,
            h("span", { class: "rw-gain-unit" }, "pts"),
          ]),
          h("p", { class: "rw-mult pop", style: { "--d": "300ms" } }, [
            "Story créditée. ",
            h("span", { class: "rw-mult-x" }, "Ajoute tes vues"),
            " pour un gros bonus.",
          ]),

          h("div", { class: "rw-bal card pop", style: { "--d": "400ms" } }, [
            h("span", { class: "label" }, "Nouveau solde"),
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
