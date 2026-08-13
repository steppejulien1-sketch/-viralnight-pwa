// Ecran — Classement hebdomadaire du club.
// Top des clubbeurs cette semaine + ma position (toujours affichée, même
// hors du top 10). Reset chaque lundi (week_start_date).

import { h, icon } from "../lib/dom.js";
import { currentClub } from "../lib/club.js";
import { loadLeaderboard } from "../lib/game.js";

const nf = new Intl.NumberFormat("fr-FR");

export function Leaderboard(_params, ctx) {
  const root = h("div", { class: "lb-page" });

  // Le nom du club vient du QR scanne, plus de mock.js : ce classement est
  // celui d'UN club, l'annoncer sous le nom d'un autre n'a aucun sens.
  let club = null;

  render(null);
  // Les deux chargements partent ensemble : le nom du club ne doit pas
  // retarder l'affichage du classement, qui est le contenu de l'ecran.
  Promise.all([currentClub(), loadLeaderboard()]).then(([c, d]) => {
    club = c;
    render(d);
  });
  return root;

  function render(data) {
    const head = h("header", { class: "lb-head" }, [
      h("span", { class: "label" }, "Classement"),
      h("span", {}),
    ]);

    if (!data) {
      root.replaceChildren(h("div", { class: "lb-inner" }, [head, h("p", { class: "rw-empty-msg" }, "Chargement…")]));
      return;
    }

    const top = data.rows.slice(0, 10);
    const me = data.me;
    const meInTop = me && me.rank <= 10;

    root.replaceChildren(
      h("div", { class: "lb-inner" }, [
        head,
        h("div", { class: "lb-title-wrap reveal", style: { "--d": "0ms" } }, [
          h("h1", { class: "lb-title" }, "Cette semaine"),
          h(
            "p",
            { class: "lb-sub" },
            club
              ? `Les clubbeurs les plus actifs au ${club.name}. Remise à zéro lundi.`
              : "Les clubbeurs les plus actifs cette semaine. Remise à zéro lundi."
          ),
        ]),

        // Podium (top 3).
        top.length >= 3
          ? h("div", { class: "lb-podium reveal", style: { "--d": "70ms" } }, [podium(top[1], 2), podium(top[0], 1), podium(top[2], 3)])
          : null,

        // Reste du classement.
        h("ul", { class: "lb-list reveal", style: { "--d": "140ms" } }, top.slice(3).map((r) => rowEl(r))),

        // Ma position si hors top 10.
        !meInTop && me
          ? h("div", { class: "lb-me-fixed" }, [rowEl(me, true)])
          : null,
        !me ? h("p", { class: "lb-you-none" }, "Poste une story cette semaine pour entrer au classement.") : null,
      ])
    );
  }

  function podium(r, place) {
    if (!r) return h("div");
    return h("div", { class: `lb-pod lb-pod-${place}${r.isMe ? " is-me" : ""}` }, [
      h("span", { class: "lb-pod-rank mono" }, `${place}`),
      h("span", { class: "lb-pod-ava", "aria-hidden": "true" }, r.handle.slice(0, 2).toUpperCase()),
      h("span", { class: "lb-pod-handle" }, `@${r.handle}`),
      h("span", { class: "lb-pod-pts mono" }, nf.format(r.points)),
    ]);
  }

  function rowEl(r, fixed = false) {
    return h("li", { class: `lb-row${r.isMe ? " is-me" : ""}${fixed ? " is-fixed" : ""}` }, [
      h("span", { class: "lb-rank mono" }, `${r.rank}`),
      h("span", { class: "lb-ava", "aria-hidden": "true" }, r.handle.slice(0, 2).toUpperCase()),
      h("span", { class: "lb-handle" }, [`@${r.handle}`, r.isMe ? h("span", { class: "lb-you" }, "toi") : null]),
      h("span", { class: "lb-pts mono" }, `${nf.format(r.points)} pts`),
    ]);
  }
}
