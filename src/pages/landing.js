// Ecran d'accueil apres scan du QR physique du club — v3 "vitrine".
//
// L'ancienne version montrait un nom de club geant et une promesse
// floue ("debloque des trucs gratuits"), puis demandait de s'inscrire.
// On perdait le monde exactement la : personne ne s'engage sans savoir
// ce qu'il y gagne.
//
// Cette version repond a "qu'est-ce que j'y gagne ?" AVANT la question :
// les recompenses reelles sont visibles des le premier ecran, le bareme
// est ecrit noir sur blanc, et un chiffre reel montre que c'est atteignable.
//
// DONNEES : l'ecran s'affiche IMMEDIATEMENT avec les donnees de
// demonstration, puis bascule sur Supabase des que la reponse arrive.
// Jamais d'ecran vide ni de spinner : c'est le premier ecran apres le
// scan, il doit etre lisible a la milliseconde ou on perd la personne.

import { h, icon } from "../lib/dom.js";
import { REWARDS, STORY_BASE_POINTS, POINTS_PER_100_VIEWS } from "../lib/mock.js";
import { loadPublicRewards, loadClubProof } from "../lib/game.js";
import { currentClub, slugDemande } from "../lib/club.js";

const nf = new Intl.NumberFormat("fr-FR");

// Pictogramme par categorie de recompense (enum reward_category en base).
// Repli sur le rang de prix quand la categorie est absente.
const PAR_CATEGORIE = { boisson: "gift", entree: "sparkles", vip: "trophy", exclusif: "medal" };
const PAR_RANG = ["gift", "sparkles", "trophy", "medal"];

export function Landing(_params, ctx) {
  // Donnees de demonstration, normalisees dans la meme forme que la base
  // pour que le rendu n'ait qu'un seul chemin.
  const demo = [...REWARDS]
    .sort((a, b) => a.cost - b.cost)
    .map((r) => ({ id: r.id, title: r.title, cost_points: r.cost, category: null }));

  const rail = h("ul", { class: "lp-rail" }, demo.map(carte));
  const compte = h("span", { class: "lp-shelf-count mono" }, `${demo.length} dispos`);
  // Un seul noeud texte pour toute la phrase : deux noeuds cote a cote
  // laissaient un double espace avant le nom du club.
  // Vides au depart : on n'affiche AUCUN nom de club tant que le QR n'a pas
  // repondu. Ecrire "Mirage" en attendant, c'est afficher le nom d'un
  // etablissement qui n'existe pas.
  const nomClub = h("span", {}, "Bienvenue");
  const tag = h("span", {}, "Tague ton club");
  const ville = h("span", {}, "");

  // Preuve chiffree : vide tant qu'on n'a pas de VRAI chiffre.
  // L'ancienne version affichait "8 400 vues" en dur, identique pour tous les
  // clubs et tous les visiteurs. Une preuve inventee ne vaut pas mieux que
  // la promesse floue qu'on vient de retirer — mieux vaut ne rien montrer.
  const proofSlot = h("div", { class: "lp-proof-slot" });

  const el = h("div", { class: "lp" }, [
    // Lueur rouge unique, en haut a gauche. Une seule couleur sur l'ecran.
    h("div", { class: "lp-atmos", "aria-hidden": "true" }, [h("span", { class: "lp-glow" })]),

    h("header", { class: "lp-top" }, [
      h("span", { class: "lp-brand" }, [h("span", { class: "lp-brand-mark", "aria-hidden": "true" }), "ViralNight"]),
      h("span", { class: "lp-live" }, [h("span", { class: "lp-live-dot", "aria-hidden": "true" }), "En salle"]),
    ]),

    h("main", { class: "lp-body" }, [
      h("section", { class: "lp-hook" }, [
        h("p", { class: "lp-here reveal", style: { "--d": "0ms" } }, [icon("scan", 13), nomClub]),
        h("h1", { class: "lp-title reveal", style: { "--d": "60ms" } }, [
          "Ta story de ce soir vaut ",
          h("em", {}, "un verre"),
          ".",
        ]),
        h("p", { class: "lp-sub reveal", style: { "--d": "120ms" } }, "Poste, on compte les vues, tu retires au bar. C'est tout."),
      ]),

      h("section", { class: "lp-shelf reveal", style: { "--d": "180ms" } }, [
        h("div", { class: "lp-shelf-head" }, [h("span", { class: "label" }, "Ce que tu peux prendre"), compte]),
        rail,
      ]),

      h("section", { class: "lp-how reveal", style: { "--d": "240ms" } }, [
        etape("1", "Poste ta story", tag),
        etape("2", "On compte tes vues", `${STORY_BASE_POINTS} pts d'office, + ${POINTS_PER_100_VIEWS} pts par 100 vues`),
        etape("3", "Tu retires au bar", "Tu montres ton code, c'est réglé"),
      ]),

      proofSlot,
    ]),

    h("footer", { class: "lp-cta" }, [
      h("button", { class: "btn btn-primary btn-block lp-join", onClick: () => ctx.navigate("onboarding") }, [
        "Commencer",
        icon("arrowRight", 19),
      ]),
      h("p", { class: "lp-reassure" }, [ville, "gratuit · aucune app à installer"]),
    ]),
  ]);

  // --- Identification du club a partir du QR ----------------------------
  currentClub()
    .then(async (club) => {
      // Aucun QR scanne, ou QR inconnu : on ne devine pas. L'ecran demande
      // le scan plutot que d'afficher un club au hasard.
      if (!club) {
        el.replaceChildren(sansClub(Boolean(slugDemande())));
        return;
      }

      nomClub.textContent = `Tu es au ${club.name}`;
      ville.textContent = club.city ? `${club.city} · ` : "";
      if (club.ig_handle) tag.textContent = `Tague @${club.ig_handle}`;

      // Preuve reelle du club, en parallele du catalogue.
      loadClubProof(club.id).then((p) => {
        // Sous 3 contenus, le chiffre est trop maigre pour convaincre et
        // designerait presque quelqu'un. On n'affiche rien.
        if (!p || !p.views_total || p.contents < 3) return;
        proofSlot.replaceChildren(preuve(p, club.name));
      });

      const vraies = await loadPublicRewards(club.id);
      // Une liste vide est une reponse valide (le club n'a rien publie) :
      // on garde alors la demo, montrer une vitrine vide serait pire.
      if (!vraies || !vraies.length) return;

      rail.replaceChildren(...vraies.map(carte));
      compte.textContent = `${vraies.length} dispo${vraies.length > 1 ? "s" : ""}`;
    })
    .catch(() => {});

  return el;

  // --- Fabriques ---------------------------------------------------------

  // La premiere (la moins chere) est mise en avant sur toute la largeur :
  // c'est la porte d'entree, celle qui decide de l'inscription. Les
  // suivantes tiennent en grille deux colonnes.
  //
  // Avant, les quatre etaient dans un carrousel horizontal : deux d'entre
  // elles restaient hors ecran, et rien ne disait qu'il fallait faire
  // defiler. On cachait la moitie de l'argument.
  function carte(r, i) {
    const vedette = i === 0;
    return h("li", { class: `lp-reward${vedette ? " is-first" : ""}` }, [
      h(
        "span",
        { class: "lp-reward-icn", "aria-hidden": "true" },
        icon(PAR_CATEGORIE[r.category] || PAR_RANG[i] || "gift", vedette ? 22 : 18)
      ),
      h("span", { class: "lp-reward-txt" }, [
        vedette ? h("span", { class: "lp-reward-tag" }, "Le plus accessible") : null,
        h("span", { class: "lp-reward-title" }, r.title),
      ]),
      h("span", { class: "lp-reward-cost mono" }, [nf.format(r.cost_points), h("small", {}, "pts")]),
    ]);
  }

  // Preuve reelle du club sur 30 jours. Deux chiffres seulement : le volume
  // (« ça tourne ici ») et le meilleur gain (« voilà ce que ça peut donner »).
  function preuve(p, nomClub) {
    const texte = [
      `vues générées par ${p.clubbeurs} clubbeur${p.clubbeurs > 1 ? "s" : ""} du ${nomClub} ce mois-ci.`,
    ];
    if (p.best_points) {
      texte.push(" La meilleure soirée a rapporté ", h("strong", {}, `${nf.format(p.best_points)} pts`), ".");
    }
    return h("section", { class: "lp-proof" }, [
      h("span", { class: "lp-proof-num mono" }, nf.format(p.views_total)),
      h("p", { class: "lp-proof-txt" }, texte),
    ]);
  }

  // Ecran affiche quand on ouvre l'app sans avoir scanne de QR (lien
  // partage, favori, retour sur l'adresse nue). On explique le geste
  // manquant au lieu d'afficher un club invente.
  function sansClub(qrInconnu) {
    return h("div", { class: "lp-noclub" }, [
      h("span", { class: "lp-noclub-ico", "aria-hidden": "true" }, icon("scan", 30)),
      h(
        "h1",
        { class: "lp-noclub-title" },
        qrInconnu ? "Ce QR ne correspond à aucun club" : "Scanne le QR de ton club"
      ),
      h(
        "p",
        { class: "lp-noclub-sub" },
        qrInconnu
          ? "Il a peut-être été remplacé. Demande le QR à jour au bar."
          : "Il est affiché au bar ou à l'entrée. C'est lui qui ouvre la soirée du bon établissement."
      ),
      h("p", { class: "lp-noclub-note" }, "ViralNight · rien à installer"),
    ]);
  }

  function etape(n, titre, detail) {
    return h("div", { class: "lp-step" }, [
      h("span", { class: "lp-step-n mono", "aria-hidden": "true" }, n),
      h("span", { class: "lp-step-txt" }, [
        h("span", { class: "lp-step-title" }, titre),
        h("span", { class: "lp-step-detail" }, detail),
      ]),
    ]);
  }
}
