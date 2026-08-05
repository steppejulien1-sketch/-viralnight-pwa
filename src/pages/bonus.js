// Ecran — Bonus vues.
// Ouvert via push 12h apres la story : "ta story a cartonne ? upload ta
// capture pour un bonus." Drag & drop + file picker, preview, envoi.
// En prod : upload Supabase Storage + OCR du nombre de vues (Edge Function).

import { h, icon } from "../lib/dom.js";
import { CLUB } from "../lib/mock.js";
import { tap, success } from "../lib/haptics.js";

export function Bonus(_params, ctx) {
  const root = h("div", { class: "bn-page" });
  let file = null;
  renderPick();
  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  /* ---------- Choix / drop du fichier ---------- */
  function renderPick() {
    const input = h("input", {
      type: "file",
      accept: "image/*",
      class: "bn-file",
      onChange: (e) => e.target.files[0] && select(e.target.files[0]),
    });

    const drop = h(
      "label",
      {
        class: "bn-drop",
        onDragover: (e) => {
          e.preventDefault();
          drop.classList.add("is-over");
        },
        onDragleave: () => drop.classList.remove("is-over"),
        onDrop: (e) => {
          e.preventDefault();
          drop.classList.remove("is-over");
          const f = e.dataTransfer.files[0];
          if (f) select(f);
        },
      },
      [
        input,
        h("span", { class: "bn-drop-icn", "aria-hidden": "true" }, icon("instagram", 26)),
        h("span", { class: "bn-drop-title" }, "Dépose ta capture"),
        h("span", { class: "bn-drop-sub" }, "ou touche pour choisir dans ta galerie"),
      ]
    );

    swap(
      h("div", { class: "bn-inner" }, [
        header(ctx),
        h("div", { class: "bn-body" }, [
          h("h1", { class: "bn-h1 reveal", style: { "--d": "0ms" } }, "Ta story a cartonné ?"),
          h(
            "p",
            { class: "bn-lead reveal", style: { "--d": "60ms" } },
            "Envoie la capture de tes vues Instagram. Plus tu as fait de vues, plus le bonus grimpe."
          ),
          h("div", { class: "reveal", style: { "--d": "130ms" } }, [drop]),
        ]),
      ])
    );
  }

  function select(f) {
    file = f;
    tap();
    renderPreview();
  }

  /* ---------- Preview + envoi ---------- */
  function renderPreview() {
    const url = URL.createObjectURL(file);

    swap(
      h("div", { class: "bn-inner" }, [
        header(ctx),
        h("div", { class: "bn-body" }, [
          h("h1", { class: "bn-h1" }, "C'est bien ça ?"),
          h("p", { class: "bn-lead" }, "On lit le nombre de vues et on crédite ton bonus."),
          h("div", { class: "bn-preview" }, [
            h("img", { class: "bn-img", src: url, alt: "Ta capture d'écran" }),
          ]),
        ]),
        h("footer", { class: "ps-foot" }, [
          h("button", { class: "btn btn-primary btn-block", onClick: renderSent }, [
            "Envoyer pour vérification",
          ]),
          h(
            "button",
            { class: "bn-change", onClick: renderPick },
            "Choisir une autre capture"
          ),
        ]),
      ])
    );
  }

  /* ---------- Statut "en cours de verification" ---------- */
  function renderSent() {
    success();
    swap(
      h("div", { class: "bn-inner bn-sent" }, [
        header(ctx),
        h("div", { class: "bn-sent-body" }, [
          h("div", { class: "bn-sent-icn pop", style: { "--d": "0ms" } }, icon("check", 30)),
          h("h1", { class: "bn-sent-title pop", style: { "--d": "100ms" } }, "Capture envoyée"),
          h(
            "p",
            { class: "bn-sent-sub pop", style: { "--d": "170ms" } },
            "On vérifie ton nombre de vues. Ton bonus tombe d'ici quelques minutes — tu recevras une notif."
          ),
          h("div", { class: "bn-status card pop", style: { "--d": "250ms" } }, [
            h("span", { class: "bn-status-spin", "aria-hidden": "true" }),
            h("span", {}, "En cours de vérification"),
          ]),
        ]),
        h("footer", { class: "ps-foot pop", style: { "--d": "330ms" } }, [
          h(
            "button",
            { class: "btn btn-ghost btn-block", onClick: () => ctx.navigate("dashboard") },
            "Retour au tableau de bord"
          ),
        ]),
      ])
    );
  }

  function header() {
    return h("header", { class: "bn-head" }, [
      h(
        "button",
        { class: "ob-back", "aria-label": "Retour", onClick: () => ctx.back("dashboard") },
        icon("arrowRight", 18)
      ),
      h("span", { class: "label" }, `Bonus vues · ${CLUB.name}`),
    ]);
  }
}
