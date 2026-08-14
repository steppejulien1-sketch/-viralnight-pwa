// Ecran — Collection (refonte UI, socle ui/ + patterns/).
//
// ⚠️ AUCUN APPEL SUPABASE N'A CHANGE : meme `loadMyBadges()`, donc
// meme RPC `get_my_badges` (migration 0017), qui calcule la
// progression a la lecture et pose la date de deblocage.
//
// RAPPEL DE FOND. Cet ecran affichait autrefois une grille de cadenas
// gris, alors qu'AUCUNE fonction n'attribuait les badges : ils ne
// pouvaient jamais se debloquer. Depuis la 0017 chaque badge porte une
// cible chiffree et sa progression est reelle. On montre donc
// « 5 275 / 10 000 » plutot qu'un cadenas : on sait ce qu'il reste a
// faire.
//
// ⚠️ BADGES EN PAUSE. Le passage au bareme forfait a supprime le
// comptage des vues, donc `views_10k` et `views_50k` ne peuvent plus
// avancer. Ils ne sont PAS supprimes (ce serait retirer sans accord un
// objectif que des clubbeurs poursuivaient) mais ils sont attenues,
// sortis du calcul d'avancement et places en fin de liste. Leur
// afficher une jauge a 0 annoncerait une progression qui n'arrivera
// pas.
//
// CE QUI CHANGE A L'ECRAN :
//  - « Chargement… » et « Aucun badge » en texte nu deviennent un
//    squelette et un vrai etat vide (ils empruntaient .rw-empty-msg a
//    la feuille de la BOUTIQUE) ;
//  - la jauge globale et les jauges de badge passent sur Progress ;
//  - aucun aplat rouge : un badge obtenu prend la teinte.

import { h, icon } from "../lib/dom.js";
import { Empty, Progress, Skeleton } from "../ui/index.js";
import { Screen, Title, Section } from "../patterns/Screen.js";
import { loadMyBadges } from "../lib/game.js";
import "./collection.css";

const nf = new Intl.NumberFormat("fr-FR");
const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long" });

// Mesures que l'app ne sait plus alimenter. Voir l'en-tete.
const MESURES_EN_PAUSE = new Set(["views"]);

export function Collection(_params, ctx) {
  // Pas de classe de page : le routeur pose deja .screen, et
  // .vn-screen se charge de la mise en page.
  const root = h("div");

  render(null);
  loadMyBadges()
    .then((b) => render(b))
    .catch(() => render([]));

  return root;

  function render(badges) {
    const el = Screen({ label: "Collection", onBack: () => ctx.back("dashboard") });

    // --- Chargement ---
    if (!badges) {
      el.body.append(
        Title("Ta collection"),
        h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, [
          Skeleton({ width: "56%" }),
          Skeleton({ card: true }),
          Skeleton({ card: true }),
          Skeleton({ card: true }),
        ])
      );
      root.replaceChildren(el);
      return;
    }

    // --- Aucun badge configure pour ce club ---
    if (!badges.length) {
      el.body.append(
        Title("Ta collection"),
        Empty({
          ico: "medal",
          title: "Pas encore de badges ici",
          sub: "Ce club n'en propose pas pour le moment. Tes points, eux, continuent de compter.",
        })
      );
      root.replaceChildren(el);
      return;
    }

    const enPause = badges.filter((b) => MESURES_EN_PAUSE.has(b.metric));
    const actifs = badges.filter((b) => !MESURES_EN_PAUSE.has(b.metric));

    const obtenus = actifs.filter((b) => b.unlocked);
    // ⚠️ Le denominateur ne compte QUE les badges atteignables. Inclure
    // ceux en pause rendrait le 100 % impossible a atteindre — une
    // barre qui ne peut pas se remplir est une promesse cassee.
    const total = actifs.length;

    // Les badges en cours d'abord, du plus proche du but au plus loin :
    // c'est celui qu'on peut decrocher ce soir qui donne envie de poster.
    const enCours = actifs.filter((b) => !b.unlocked).sort((a, b) => part(b) - part(a));
    const prochain = enCours[0];

    const compteur = h("span", { class: "cl-head-count" }, [
      h("span", { class: "cl-count" }, `${obtenus.length}/${total}`),
      h("span", { class: "vn-label" }, "débloqués"),
    ]);

    el.body.append(
      Title("Ta collection"),
      compteur,
      Progress(obtenus.length, total, { label: "Badges débloqués" }),

      prochain
        ? h("p", { class: "cl-next" }, [
            "Le plus proche : ",
            h("strong", {}, prochain.name),
            ` — il te manque ${nf.format(Math.max(0, prochain.target - prochain.current_value))} ${unite(prochain.metric)}.`,
          ])
        : h("p", { class: "cl-next" }, "Tout est débloqué. Respect."),

      // ⚠️ `.map(ligne)` passerait l'INDEX en deuxieme argument, qui
      // atterrirait dans le parametre `pause` : tous les badges sauf
      // le premier s'affichaient « En pause ». Toujours envelopper.
      h("ul", { class: "cl-list" }, [...enCours, ...obtenus].map((b) => ligne(b)))
    );

    // Les badges en pause vivent dans leur propre section, sous une
    // etiquette qui dit ce qui leur arrive. Melanges aux autres, ils
    // ressembleraient a des badges qu'on n'a simplement pas encore.
    if (enPause.length) {
      el.body.append(
        Section("En pause", [
          h("p", { class: "cl-next" }, "Ces badges comptaient les vues. Ils ne progressent plus pour le moment."),
          h("ul", { class: "cl-list" }, enPause.map((b) => ligne(b, true))),
        ])
      );
    }

    root.replaceChildren(el);
  }

  /* ---------- Fabriques ---------- */

  function ligne(b, pause = false) {
    const classes = ["cl-badge", b.unlocked ? "is-on" : "", pause ? "is-paused" : ""]
      .filter(Boolean)
      .join(" ");

    // ⚠️ Pas de Card ici : .vn-card impose `flex-direction: column`,
    // et une ligne de badge est horizontale. Les deux regles ont la
    // meme specificite, donc le gagnant dependrait de l'ordre de
    // chargement des feuilles. La ligne porte donc sa propre surface,
    // definie dans collection.css avec les memes jetons.
    return h("li", { class: classes }, [
      h("span", { class: "cl-badge__ico", "aria-hidden": "true" }, icon(b.icon || "medal", 22)),

      h("div", { class: "cl-badge__main" }, [
        h("div", { class: "cl-badge__top" }, [
          h("span", { class: "cl-badge__name" }, b.name),
          etiquette(b, pause),
        ]),

        b.description ? h("p", { class: "cl-badge__desc" }, b.description) : null,

        // Ni jauge ni date pour un badge en pause : il n'avance pas.
        pause
          ? null
          : b.unlocked
            ? b.unlocked_at
              ? h("p", { class: "cl-badge__date" }, `Le ${dateFmt.format(new Date(b.unlocked_at))}`)
              : null
            : h("div", { class: "cl-badge__bar" }, [Progress(b.current_value || 0, b.target)]),
      ]),
    ]);
  }

  function etiquette(b, pause) {
    if (pause) return h("span", { class: "cl-badge__paused" }, "En pause");
    if (b.unlocked) {
      return h("span", { class: "cl-badge__done" }, [icon("check", 13), "Obtenu"]);
    }
    return h(
      "span",
      { class: "cl-badge__count" },
      `${nf.format(b.current_value || 0)} / ${nf.format(b.target)}`
    );
  }

  // Part accomplie, bornee a 1 : sert au tri des badges en cours.
  function part(b) {
    if (!b.target) return 0;
    return Math.min(1, (b.current_value || 0) / b.target);
  }

  function unite(metric) {
    if (metric === "redemptions") return "récompense à retirer";
    if (metric === "streak") return "soirées d'affilée";
    return "contenus";
  }
}
