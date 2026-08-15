// Ecran — Classement hebdomadaire du club (refonte UI, socle ui/ +
// patterns/).
//
// ⚠️ AUCUN APPEL SUPABASE N'A CHANGE : meme `currentClub()`, meme
// `loadLeaderboard()` (qui passe par la fonction SECURITY DEFINER
// `get_leaderboard`, seule facon de lire le handle des autres
// clubbeurs malgre la RLS de `users`).
//
// CE QUI CHANGE A L'ECRAN :
//  - « Chargement… » en texte nu devient un squelette de liste, donc
//    l'ecran ne saute plus quand les donnees arrivent ;
//  - le podium et les lignes partagent enfin le meme gabarit ;
//  - un seul aplat rouge sur l'ecran : l'avatar du premier. Ma propre
//    ligne prend la TEINTE — « c'est toi » est un etat, pas une
//    action ;
//  - ma position epinglee se cale AU-DESSUS de la barre d'onglets.
//    Elle etait collee a `--safe-bottom`, donc a moitie cachee
//    derriere la barre.

import { h } from "../lib/dom.js";
import { Empty, Points, Skeleton } from "../ui/index.js";
import { Screen, Title, Sub } from "../patterns/Screen.js";
import { Rows, Row } from "../patterns/Rows.js";
import { currentClub } from "../lib/club.js";
import { loadLeaderboard } from "../lib/game.js";
import "./leaderboard.css";

// Au-dela, on ne montre plus : le classement d'un club de quartier
// n'a pas vocation a etre un annuaire.
const TOP = 10;

export function Leaderboard(_params, _ctx) {
  // Pas de classe de page : le routeur pose deja .screen, et
  // .vn-screen se charge de la mise en page.
  const root = h("div");

  // Le nom du club vient du QR scanne : ce classement est celui d'UN
  // club, l'annoncer sous le nom d'un autre n'aurait aucun sens.
  let club = null;

  render(null);

  // Les deux chargements partent ensemble : le nom du club ne doit pas
  // retarder l'affichage du classement, qui est le contenu de l'ecran.
  Promise.all([currentClub(), loadLeaderboard()])
    .then(([c, d]) => {
      club = c;
      render(d);
    })
    .catch(() => render({ rows: [], me: null }));

  return root;

  function render(data) {
    const el = Screen({ label: "Classement" });

    el.body.append(
      Title("Cette semaine"),
      Sub(
        club
          ? `Les clubbeurs les plus actifs au ${club.name}. Remise à zéro lundi.`
          : "Les clubbeurs les plus actifs cette semaine. Remise à zéro lundi."
      )
    );

    // --- Chargement : un squelette, jamais un chiffre invente ---
    if (!data) {
      el.body.append(
        h("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } }, [
          Skeleton({ card: true }),
          Skeleton({ width: "82%" }),
          Skeleton({ width: "64%" }),
          Skeleton({ width: "71%" }),
        ])
      );
      root.replaceChildren(el);
      return;
    }

    const top = data.rows.slice(0, TOP);
    const moi = data.me;
    const moiDansLeTop = Boolean(moi && moi.rank <= TOP);

    // --- Personne n'a encore poste cette semaine ---
    if (!top.length) {
      el.body.append(
        Empty({
          title: "Le classement est vide",
          sub: "Personne n'a encore posté cette semaine. La première story prend la première place.",
        })
      );
      root.replaceChildren(el);
      return;
    }

    // --- Podium : seulement s'il y a vraiment trois places ---
    // A deux clubbeurs, un podium a trois marches dont une vide
    // annonce une affluence qui n'existe pas.
    if (top.length >= 3) {
      el.body.append(
        h("div", { class: "lb-podium" }, [
          podium(top[1], 2),
          podium(top[0], 1),
          podium(top[2], 3),
        ])
      );
    }

    // --- Le reste de la liste ---
    const reste = top.length >= 3 ? top.slice(3) : top;
    if (reste.length) {
      el.body.append(Rows(reste.map((r) => ligne(r))));
    }

    // --- Ma position, epinglee si je suis hors du top ---
    if (moi && !moiDansLeTop) {
      el.body.append(h("div", { class: "lb-pinned" }, [Rows([ligne(moi)])]));
    }

    // --- Pas encore classe ---
    if (!moi) {
      el.body.append(
        h("div", { class: "lb-none" }, [
          Empty({
            title: "Tu n'es pas encore classé",
            sub: "Poste une story cette semaine et tu apparais ici.",
          }),
        ])
      );
    }

    root.replaceChildren(el);
  }

  /* ---------- Fabriques ---------- */

  function podium(r, place) {
    // Garde-fou : appele avec un trou dans la liste, on rend une
    // colonne vide plutot que de planter sur r.handle.
    if (!r) return h("div");
    return h("div", { class: `lb-pod lb-pod--${place}${r.isMe ? " is-me" : ""}` }, [
      h("span", { class: "lb-pod__rank" }, `${place}`),
      h("span", { class: "lb-pod__ava", "aria-hidden": "true" }, initiales(r.handle)),
      h("span", { class: "lb-pod__handle" }, `@${r.handle}`),
      Points(r.points, { size: "sm", unit: false, off: !r.isMe && place !== 1 }),
    ]);
  }

  function ligne(r) {
    return Row({
      class: r.isMe ? "is-me" : "",
      lead: h("span", { class: "lb-lead" }, [
        h("span", { class: "lb-rank" }, `${r.rank}`),
        h("span", { class: "lb-ava", "aria-hidden": "true" }, initiales(r.handle)),
      ]),
      title: h("span", {}, [
        `@${r.handle}`,
        // « toi » ecrit en toutes lettres : la teinte seule ne suffit
        // pas, le rouge sur noir se lit mal en biais.
        r.isMe ? h("span", { class: "lb-you" }, "toi") : null,
      ]),
      value: Points(r.points, { size: "sm", off: !r.isMe }),
    });
  }

  function initiales(handle) {
    return String(handle || "??")
      .slice(0, 2)
      .toUpperCase();
  }
}
