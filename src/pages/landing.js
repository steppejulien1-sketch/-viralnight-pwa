// Ecran — Accueil, la vitrine qui suit le scan du QR physique.
// (refonte UI, socle ui/ + patterns/)
//
// ⚠️ AUCUN APPEL SUPABASE N'A CHANGE : memes `currentClub()`,
// `loadPublicRewards()` et `loadClubProof()`. Ces deux dernieres
// n'appellent volontairement PAS `ensureSession()` : cet ecran est vu
// AVANT toute inscription, declencher une connexion pour un visiteur
// qui n'a rien demande serait faux. La RLS autorise clubs et rewards
// actives avec la seule cle anon.
//
// ⚠️ LE BAREME AFFICHE VIENT DE lib/bareme.js, PAS D'UN TEXTE EN DUR.
// La migration 0020 (bareme au FORFAIT) a ete appliquee le 2026-08-14 :
// `phraseBareme()`, `promesseCourte()` et `AU_FORFAIT` ont bascule
// l'ecran tout seuls. Ne JAMAIS reecrire un montant en dur ici — ce
// serait promettre un chiffre que `story_points()` ne verse pas.
//
// RIEN N'EST INVENTE SUR CET ECRAN. L'etagere part vide et ne se
// remplit qu'avec le vrai catalogue du club ; la preuve chiffree reste
// absente tant qu'on n'a pas un vrai chiffre. Sur le PREMIER ecran
// apres le scan, une recompense inventee est la pire des erreurs : on
// s'inscrit pour quelque chose que ce bar ne propose pas.
//
// CE QUI CHANGE A L'ECRAN :
//  - la recompense la plus accessible passe de l'aplat rouge plein a
//    la TEINTE : avec le bouton « Commencer » en aplat juste dessous,
//    deux blocs pleins se disputaient l'oeil ;
//  - le bouton vit dans le pied collant, comme partout ailleurs.

import { h, icon } from "../lib/dom.js";
import { Button, Points, State } from "../ui/index.js";
import { Screen, Section, Note } from "../patterns/Screen.js";
import { AU_FORFAIT, phraseBareme, promesseCourte } from "../lib/bareme.js";
import { loadPublicRewards, loadClubProof } from "../lib/game.js";
import { currentClub, slugDemande, urlDuClub } from "../lib/club.js";
import { supabase, isConfigured } from "../lib/supabase.js";
import "./landing.css";

const nf = new Intl.NumberFormat("fr-FR");

// Pictogramme par categorie (enum reward_category en base). Repli sur
// le rang de prix quand la categorie est absente.
const PAR_CATEGORIE = { boisson: "gift", entree: "sparkles", vip: "trophy", exclusif: "medal" };
const PAR_RANG = ["gift", "sparkles", "trophy", "medal"];

export function Landing(_params, ctx) {
  const root = h("div");

  // --- Noeuds remplis quand le club repond -----------------------------
  // Vides au depart : on n'affiche AUCUN nom d'etablissement tant que le
  // QR n'a pas repondu. Ecrire « Mirage » en attendant, c'est afficher
  // le nom d'un club ou l'on n'est pas.
  const ici = h("p", { class: "lp-here", hidden: true }, [icon("scan", 14), h("span", {})]);
  const rail = h("ul", { class: "lp-rail" });
  const compte = h("span", { class: "vn-label" }, "");
  const tagDetail = h("span", { class: "lp-step__detail" }, "Tague le compte de ton club");
  const proofSlot = h("div", { class: "vn-slot" });
  const ville = h("span", {}, "");

  const el = Screen({ headRight: State("live") });

  // Marque a gauche de la barre du haut.
  el.head.querySelector(".vn-screen__head-main").append(
    h("span", { class: "lp-brand" }, [
      h("span", { class: "lp-brand__mark", "aria-hidden": "true" }),
      "ViralNight",
    ])
  );

  el.body.append(
    h("span", { class: "lp-glow", "aria-hidden": "true" }),

    h("section", { class: "lp-hook" }, [
      ici,
      h("h1", { class: "lp-title" }, ["Ta story de ce soir vaut ", h("em", {}, "un verre"), "."]),
      h("p", { class: "vn-screen__sub" }, promesseCourte()),
    ]),

    Section("Ce que tu peux prendre", [rail], compte),

    Section(null, [
      h("div", { class: "lp-steps" }, [
        etape("1", "Poste ta story", tagDetail),
        // ⚠️ L'intitule suit le bareme, comme la phrase. « On compte tes
        // vues » n'a plus de sens depuis le forfait (migration 0020) :
        // il n'y a plus rien a compter, le club valide et c'est tout.
        etape(
          "2",
          AU_FORFAIT ? "Le club valide" : "On compte tes vues",
          h("span", { class: "lp-step__detail" }, phraseBareme("story"))
        ),
        etape("3", "Tu retires au bar", h("span", { class: "lp-step__detail" }, "Tu montres ton code, c'est réglé")),
      ]),
    ]),

    proofSlot
  );

  el.foot.append(
    Button({
      label: "Commencer",
      icoRight: icon("arrowRight", 19),
      block: true,
      onClick: () => ctx.navigate("onboarding"),
    }),
    h("p", { class: "vn-screen__note" }, [ville, "gratuit · aucune app à installer"])
  );

  root.append(el);

  // --- Identification du club a partir du QR ---------------------------
  currentClub()
    .then(async (club) => {
      // Aucun QR scanne, ou QR inconnu : on ne devine pas.
      if (!club) {
        root.replaceChildren(sansClub(Boolean(slugDemande())));
        return;
      }

      ici.querySelector("span").textContent = `Tu es au ${club.name}`;
      ici.hidden = false;
      ville.textContent = club.city ? `${club.city} · ` : "";
      if (club.ig_handle) tagDetail.textContent = `Tague @${club.ig_handle}`;

      // Preuve reelle du club, en parallele du catalogue.
      loadClubProof(club.id)
        .then((p) => {
          // Sous 3 contenus, le chiffre est trop maigre pour convaincre
          // et designerait presque quelqu'un. On n'affiche rien.
          if (!p || !p.contents || p.contents < 3) return;
          proofSlot.replaceChildren(preuve(p, club.name));
        })
        .catch(() => {});

      const vraies = await loadPublicRewards(club.id);
      // Liste vide = reponse VALIDE : ce club n'a encore rien publie.
      // On le dit, au lieu d'afficher le catalogue d'un autre bar.
      if (!vraies || !vraies.length) {
        rail.replaceChildren(etagereVide());
        return;
      }

      rail.replaceChildren(...vraies.map((r, i) => carte(r, i)));
      compte.textContent = `${vraies.length} dispo${vraies.length > 1 ? "s" : ""}`;
    })
    .catch(() => {});

  return root;

  /* ---------- Fabriques ---------- */

  function carte(r, i) {
    const vedette = i === 0;
    return h("li", { class: `lp-reward${vedette ? " is-first" : ""}` }, [
      h(
        "span",
        { class: "lp-reward__ico", "aria-hidden": "true" },
        icon(PAR_CATEGORIE[r.category] || PAR_RANG[i] || "gift", vedette ? 20 : 18)
      ),
      h("span", { class: "lp-reward__txt" }, [
        vedette ? h("span", { class: "lp-reward__tag" }, "Le plus accessible") : null,
        h("span", { class: "lp-reward__title" }, r.title),
      ]),
      h("span", { class: "lp-reward__cost" }, [
        Points(r.cost_points, { size: "sm", off: !vedette }),
      ]),
    ]);
  }

  // Etagere sans catalogue. Meme forme que les vraies lignes, sans
  // annoncer une seule recompense inventee.
  function etagereVide() {
    return h("li", { class: "lp-reward" }, [
      h("span", { class: "lp-reward__ico", "aria-hidden": "true" }, icon("gift", 18)),
      h("span", { class: "lp-reward__txt" }, [
        h("span", { class: "lp-reward__title" }, "Les récompenses de ce club arrivent bientôt."),
      ]),
    ]);
  }

  // Preuve reelle du club sur 30 jours.
  //
  // ⚠️ ELLE COMPTE DES CONTENUS, PLUS DES VUES (migration 0020).
  //
  // ⚠️ LE TOTAL DE VUES NE GRANDIT PLUS, et il faut savoir pourquoi
  // exactement. Ce n'est PAS la base qui a cesse de l'enregistrer :
  // `submit_story` accepte toujours un `p_views` et `review_story` le
  // conserve. C'est le FRONT qui n'en envoie plus — `post-story.js` a
  // retire le champ « combien de vues ? » au passage au forfait, donc tout
  // depot reel enregistre 0. Seul le gerant peut encore en saisir une, a
  // la validation.
  //
  // Deux raisons de ne pas afficher ce total, et les deux tiennent :
  // il est fige, ET le peu qui l'alimente est DECLARE, plus verifie par
  // personne depuis qu'il ne vaut plus un point. Un nombre de contenus,
  // lui, est constate et continue de grandir.
  //
  // Le meilleur gain a saute pour une raison qui, elle, a bougé : au
  // forfait pur il valait 100 pts comme tous les autres. Depuis la 0022 le
  // gerant peut accorder davantage, donc l'ecart redevient possible — a
  // rouvrir seulement si les montants libres se generalisent.
  function preuve(p, nomClub) {
    return h("section", { class: "lp-proof" }, [
      h("span", { class: "lp-proof__num" }, nf.format(p.contents)),
      h("p", { class: "lp-proof__txt" }, [
        `contenus publiés par ${p.clubbeurs} clubbeur${p.clubbeurs > 1 ? "s" : ""} du ${nomClub} ce mois-ci.`,
      ]),
    ]);
  }

  function sansClub(qrInconnu) {
    const vide = Screen({});
    vide.head.querySelector(".vn-screen__head-main").append(
      h("span", { class: "lp-brand" }, [
        h("span", { class: "lp-brand__mark", "aria-hidden": "true" }),
        "ViralNight",
      ])
    );

    const msgPosition = h("p", { class: "lp-noclub__sub", hidden: true });

    vide.body.append(
      h("div", { class: "lp-noclub" }, [
        h("span", { class: "lp-noclub__ico", "aria-hidden": "true" }, icon("scan", 30)),
        h(
          "h1",
          { class: "lp-title" },
          qrInconnu ? "Ce QR ne correspond à aucun club" : "Scanne le QR de ton club"
        ),
        h(
          "p",
          { class: "lp-noclub__sub" },
          qrInconnu
            ? "Il a peut-être été remplacé. Demande le QR à jour au bar."
            : "Il est affiché au bar ou à l'entrée. C'est lui qui ouvre la soirée du bon établissement."
        ),
        msgPosition,
      ])
    );

    // Repli demande par Julien : avant de forcer a chercher un QR,
    // proposer la position -- si un club est enregistre a moins de
    // 300 m (nearest_club_slug, migration 0037), on saute direct au
    // meme resultat qu'un scan reussi. Anonyme (cle anon), comme le
    // reste de cet ecran : pas besoin de compte pour ca.
    if (!qrInconnu && isConfigured && navigator.geolocation) {
      const boutonPosition = Button({
        label: "Utiliser ma position",
        variant: "ghost",
        block: true,
        onClick: (e) => essayerPosition(e.currentTarget),
      });
      vide.foot.append(boutonPosition, Note("ViralNight · rien à installer", null));
    } else {
      vide.foot.append(Note("ViralNight · rien à installer", null));
    }

    function essayerPosition(bouton) {
      bouton.setLoading?.(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { data, error } = await supabase.rpc("nearest_club_slug", {
            p_lat: pos.coords.latitude,
            p_lng: pos.coords.longitude,
          });
          bouton.setLoading?.(false);
          if (error || !data) {
            // Rien a moins de 300 m : pas une erreur a proprement
            // parler, juste aucun club assez proche. Le scan reste le
            // chemin normal, pas la peine d'inventer un message alarmant.
            msgPosition.textContent = "Aucun club trouvé à proximité. Scanne son QR à la place.";
            msgPosition.hidden = false;
            return;
          }
          window.location.href = urlDuClub(data);
        },
        () => {
          // Permission refusee ou position indisponible : silencieux,
          // "scanne le QR" (deja affiche au-dessus) reste la reponse.
          bouton.setLoading?.(false);
        },
        { timeout: 8000 }
      );
    }

    return vide;
  }

  function etape(n, titre, detail) {
    return h("div", { class: "lp-step" }, [
      h("span", { class: "lp-step__n", "aria-hidden": "true" }, n),
      h("span", { class: "lp-step__txt" }, [
        h("span", { class: "lp-step__title" }, titre),
        detail,
      ]),
    ]);
  }
}
