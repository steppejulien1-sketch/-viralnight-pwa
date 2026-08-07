// Section Statistiques (owner) — ce que le club a reellement gagne.
//
// Le gerant achete de la visibilite. Sa question tient en une phrase :
// "combien de vues mes clients m'ont rapporte, et combien ca m'a coute ?"
// L'ecran repond dans cet ordre : portee d'abord, cout ensuite.
//
// Deux fonctions SQL SECURITY DEFINER font les agregats cote base
// (migrations 0006 puis 0012) : get_club_stats et get_club_activity.
// Elles verifient owns_club() — un gerant ne peut pas lire les chiffres
// d'un autre club en changeant l'uuid dans la requete.

import { h, icon } from "../../lib/dom.js";
import { supabase } from "../../lib/supabase.js";

const nf = new Intl.NumberFormat("fr-FR");
const jourCourt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const jourLong = new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "long" });

const PERIODES = [
  { jours: 7, label: "7 jours" },
  { jours: 30, label: "30 jours" },
  { jours: 90, label: "90 jours" },
];

export async function StatsAdmin(mount, club) {
  let jours = 30;

  const filtres = h("div", { class: "ow-filters" }, PERIODES.map(bouton));
  const corps = h("div", { class: "ow-stats-body" }, [h("p", { class: "ow-muted" }, "Chargement…")]);

  mount.replaceChildren(
    h("div", { class: "ow-section" }, [
      h("div", { class: "ow-head" }, [
        h("div", {}, [
          h("h1", {}, "Statistiques"),
          h("p", { class: "ow-head-sub" }, "Ce que tes clients ont publié, et ce que ça t'a coûté."),
        ]),
        filtres,
      ]),
      corps,
    ])
  );

  await charger();

  function bouton(p) {
    const b = h(
      "button",
      {
        class: `ow-filter${p.jours === jours ? " is-on" : ""}`,
        "aria-pressed": String(p.jours === jours),
        onClick: async () => {
          if (jours === p.jours) return;
          jours = p.jours;
          filtres.querySelectorAll(".ow-filter").forEach((el, i) => {
            const on = PERIODES[i].jours === jours;
            el.classList.toggle("is-on", on);
            el.setAttribute("aria-pressed", String(on));
          });
          await charger();
        },
      },
      p.label
    );
    return b;
  }

  async function charger() {
    corps.replaceChildren(h("p", { class: "ow-muted" }, "Chargement…"));

    const [stats, activite] = await Promise.all([
      supabase.rpc("get_club_stats", { p_club: club.id, p_days: jours }),
      supabase.rpc("get_club_activity", { p_club: club.id, p_days: Math.min(jours, 90) }),
    ]);

    if (stats.error) {
      corps.replaceChildren(h("p", { class: "ow-muted" }, "Erreur de chargement : " + stats.error.message));
      return;
    }

    const s = (Array.isArray(stats.data) ? stats.data[0] : stats.data) || {};
    const jourslist = activite.data || [];

    if (!Number(s.contents_total)) {
      corps.replaceChildren(
        h("div", { class: "ow-empty-box" }, [
          h("p", {}, "Aucun contenu publié sur cette période."),
          h("p", { class: "ow-muted" }, "Les chiffres apparaîtront dès la première story taguée."),
        ])
      );
      return;
    }

    corps.replaceChildren(
      // 1. La portee : le chiffre pour lequel le club paye.
      heroPortee(s),
      // 2. Le detail de ce qui a ete publie.
      tuiles(s),
      // 3. L'evolution jour par jour. Une seule mesure par graphique :
      //    vues et nombre de contenus n'ont pas la meme echelle, les
      //    superposer sur deux axes ferait dire n'importe quoi a la courbe.
      graphique(jourslist),
      // 4. Repartition par format.
      formats(s)
    );
  }

  function heroPortee(s) {
    const vues = Number(s.views_total || 0);
    const contenus = Number(s.contents_total || 0);
    const parContenu = contenus ? Math.round(vues / contenus) : 0;
    return h("section", { class: "ow-hero" }, [
      h("p", { class: "ow-hero-label" }, `Vues générées sur ${jours} jours`),
      h("p", { class: "ow-hero-num mono" }, nf.format(vues)),
      h("p", { class: "ow-hero-sub" }, [
        `${nf.format(contenus)} contenu${contenus > 1 ? "s" : ""} publié${contenus > 1 ? "s" : ""}, `,
        h("strong", {}, `${nf.format(parContenu)} vues`),
        " en moyenne par contenu.",
      ]),
    ]);
  }

  function tuiles(s) {
    const pts = Number(s.points_awarded || 0);
    const vues = Number(s.views_total || 0);
    // Combien de points il faut distribuer pour 1 000 vues : c'est le seul
    // ratio comparable a un cout pub, et celui que le gerant reconnait.
    const pour1000 = vues ? Math.round((pts / vues) * 1000) : 0;

    return h("section", { class: "ow-tiles" }, [
      tuile("Clubbeurs actifs", nf.format(s.active_clubbeurs || 0), "Ont publié au moins une fois"),
      tuile("Points distribués", nf.format(pts), `${nf.format(pour1000)} pts pour 1 000 vues`),
      tuile("Récompenses retirées", nf.format(s.rewards_redeemed || 0), "Échangées au bar"),
      tuile(
        "Points en circulation",
        nf.format(s.points_outstanding || 0),
        "Distribués, pas encore dépensés",
        true
      ),
    ]);
  }

  function tuile(label, valeur, note, alerte = false) {
    return h("div", { class: `ow-tile${alerte ? " is-note" : ""}` }, [
      h("p", { class: "ow-tile-label" }, label),
      h("p", { class: "ow-tile-val mono" }, valeur),
      h("p", { class: "ow-tile-note" }, note),
    ]);
  }

  // --- Graphique : vues par jour -----------------------------------------
  // Aire + ligne, une seule serie (donc pas de legende : le titre la nomme).
  // Survol : repere vertical + infobulle, comme attendu d'un graphique HTML.
  function graphique(jourslist) {
    const W = 720;
    const H = 200;
    const PAD_B = 26; // place pour les dates
    const PAD_T = 12;

    const vues = jourslist.map((d) => Number(d.views || 0));
    const max = Math.max(1, ...vues);
    const n = jourslist.length;

    const x = (i) => (n <= 1 ? W / 2 : (i / (n - 1)) * W);
    const y = (v) => PAD_T + (1 - v / max) * (H - PAD_T - PAD_B);

    const points = vues.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const ligne = `M${points.join("L")}`;
    const aire = `${ligne}L${x(n - 1).toFixed(1)},${H - PAD_B}L${x(0).toFixed(1)},${H - PAD_B}Z`;

    // Graduation basse : 3 reperes suffisent, un par jour serait illisible.
    const reperes = n > 1 ? [0, Math.floor((n - 1) / 2), n - 1] : [0];
    const dates = reperes
      .map((i) => {
        const ancre = i === 0 ? "start" : i === n - 1 ? "end" : "middle";
        return `<text class="ow-chart-x" x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="${ancre}">${jourCourt.format(new Date(jourslist[i].day))}</text>`;
      })
      .join("");

    // ⚠️ Tout le SVG est construit en une passe : le helper h() appelle
    // createElement, qui produit des noeuds HTML. Un <line> ou un <circle>
    // fabrique ainsi ne s'affiche PAS dans un SVG — il faut createElementNS.
    // On serialise, puis on recupere les noeuds a piloter par querySelector.
    const zone = h("div", { class: "ow-chart-zone" });
    zone.innerHTML =
      `<svg class="ow-chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"` +
      ` aria-label="Vues par jour sur ${jours} jours. Maximum ${nf.format(max)} vues.">` +
      `<defs><linearGradient id="owFill" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="var(--accent)" stop-opacity=".28"/>` +
      `<stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>` +
      `</linearGradient></defs>` +
      `<path class="ow-chart-area" d="${aire}"/>` +
      `<path class="ow-chart-line" d="${ligne}"/>` +
      `<line class="ow-chart-cursor" y1="${PAD_T}" y2="${H - PAD_B}" opacity="0"/>` +
      `<circle class="ow-chart-dot" r="5" opacity="0"/>` +
      dates +
      `</svg>`;

    const curseur = zone.querySelector(".ow-chart-cursor");
    const marqueur = zone.querySelector(".ow-chart-dot");
    const bulle = h("div", { class: "ow-chart-tip", hidden: true });
    zone.append(bulle);

    zone.addEventListener("pointermove", (e) => {
      const r = zone.getBoundingClientRect();
      const ratio = (e.clientX - r.left) / r.width;
      const i = Math.max(0, Math.min(n - 1, Math.round(ratio * (n - 1))));
      const d = jourslist[i];

      const px = (x(i) / W) * 100;
      curseur.setAttribute("x1", x(i));
      curseur.setAttribute("x2", x(i));
      curseur.setAttribute("opacity", "1");
      marqueur.setAttribute("cx", x(i));
      marqueur.setAttribute("cy", y(Number(d.views || 0)));
      marqueur.setAttribute("opacity", "1");

      bulle.hidden = false;
      bulle.style.left = `${px}%`;
      bulle.replaceChildren(
        h("span", { class: "ow-tip-day" }, jourLong.format(new Date(d.day))),
        h("span", { class: "ow-tip-val mono" }, `${nf.format(d.views || 0)} vues`),
        h("span", { class: "ow-tip-sub" }, `${nf.format(d.contents || 0)} contenu${Number(d.contents) > 1 ? "s" : ""} · ${nf.format(d.points || 0)} pts`)
      );
    });
    zone.addEventListener("pointerleave", () => {
      curseur.setAttribute("opacity", "0");
      marqueur.setAttribute("opacity", "0");
      bulle.hidden = true;
    });

    return h("section", { class: "ow-chart" }, [
      h("div", { class: "ow-chart-head" }, [
        h("h2", {}, "Vues par jour"),
        h("span", { class: "ow-muted" }, `pic à ${nf.format(max)}`),
      ]),
      zone,
    ]);
  }

  // --- Repartition par format --------------------------------------------
  // L'identite vient du LIBELLE, pas de la couleur : le dashboard tient sur
  // une seule teinte, et trois rouges differents ne se distingueraient pas.
  function formats(s) {
    const lignes = [
      { nom: "Story", n: Number(s.contents_story || 0) },
      { nom: "Reel", n: Number(s.contents_reel || 0) },
      { nom: "TikTok", n: Number(s.contents_tiktok || 0) },
    ].sort((a, b) => b.n - a.n);

    const total = lignes.reduce((t, l) => t + l.n, 0) || 1;

    return h("section", { class: "ow-formats" }, [
      h("h2", {}, "Formats publiés"),
      h(
        "ul",
        { class: "ow-format-list" },
        lignes.map((l, i) =>
          h("li", { class: `ow-format${i === 0 ? " is-first" : ""}` }, [
            h("span", { class: "ow-format-nom" }, l.nom),
            h("span", { class: "ow-format-bar" }, [
              h("span", { class: "ow-format-fill", style: { width: `${Math.round((l.n / total) * 100)}%` } }),
            ]),
            h("span", { class: "ow-format-n mono" }, `${nf.format(l.n)}`),
            h("span", { class: "ow-format-pct mono" }, `${Math.round((l.n / total) * 100)} %`),
          ])
        )
      ),
    ]);
  }
}
