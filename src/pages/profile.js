// Ecran — Profil (v2).
// Compte connecte + statistiques + reglages.
//
// Le nombre d'abonnes est AFFICHE mais n'entre dans AUCUN calcul de
// points : la v2 recompense les VUES REELLES, pas la taille de l'audience.
// Il est lu depuis la base, ou seules les edge functions peuvent l'ecrire
// (migration 0009) -- un clubbeur ne peut pas s'inventer 2 millions d'abonnes.

import { h, icon } from "../lib/dom.js";
import { currentClub } from "../lib/club.js";
import { hapticsEnabled, setHaptics, tap } from "../lib/haptics.js";
import { loadMyProfile, loadPendingPoints, loadMyHistory, untilLabel } from "../lib/game.js";

const nf = new Intl.NumberFormat("fr-FR");

export function Profile(_params, ctx) {
  // Les chiffres partent VIDES, pas sur des valeurs de demonstration.
  // Cet ecran affichait 480 pts / 1 240 cumules / 2 soirees en attendant la
  // reponse de Supabase : des chiffres faux, mais parfaitement credibles,
  // qui laissaient croire pendant un instant a un solde qu'on n'a pas. Un
  // tiret dit "je ne sais pas encore" ; 480 raconte une histoire.
  const handleEl = h("p", { class: "pf-handle" }, "@toi");
  const soldeEl = h("span", { class: "pf-stat-val mono" }, "—");
  const cumulEl = h("span", { class: "pf-stat-val mono" }, "—");
  const soireesEl = h("span", { class: "pf-stat-val mono" }, "—");
  const compteRow = h("div", { hidden: true });

  // Club : la ligne reste masquee tant qu'il n'est pas resolu. On ne
  // remplace pas le noeud (le routeur peut ne pas l'avoir encore insere
  // quand la promesse retombe) : on remplit sa valeur en place.
  const clubVal = h("span", { class: "pf-row-val" }, "");
  const clubRow = h("div", { class: "pf-row", hidden: true }, [
    h("span", { class: "pf-row-label" }, "Club"),
    clubVal,
  ]);
  currentClub().then((c) => {
    if (!c) return;
    clubVal.textContent = `${c.name} · ${c.city}`;
    clubRow.hidden = false;
  });

  // Ligne "Abonnes" : masquee tant qu'on n'a pas le chiffre, plutot que
  // d'afficher un tiret qui laisse croire a une erreur.
  const abosRow = h("div", { hidden: true });

  // Points gagnes mais pas encore depensables (migration 0011). Masque
  // quand il n'y en a pas, plutot que d'afficher un zero sans objet.
  const attenteRow = h("div", { hidden: true });
  loadPendingPoints().then((p) => {
    if (!p || !p.pending) return;
    attenteRow.replaceWith(
      infoRow("En attente", `${nf.format(p.pending)} pts · ${untilLabel(p.nextUnlock)}`)
    );
  });
  // Solde, cumul, pseudo et niveau reels.
  loadMyProfile().then((me) => {
    if (!me) return;

    if (me.handle) handleEl.textContent = `@${me.handle}`;
    if (me.points_balance != null) soldeEl.textContent = nf.format(me.points_balance);
    if (me.lifetime_points != null) cumulEl.textContent = nf.format(me.lifetime_points);
    compteRow.replaceWith(infoRow("Compte", me.handle ? "Connecté" : "—"));

    if (me.follower_count == null) return;
    // Un chiffre saisi a la main est affiche comme tel : il ne doit
    // jamais se faire passer pour une donnee verifiee par le reseau.
    const libelle =
      me.follower_source === "tiktok"
        ? "Abonnés TikTok"
        : me.follower_source === "instagram"
          ? "Abonnés Instagram"
          : "Abonnés";
    const valeur =
      me.follower_source === "declared"
        ? `${nf.format(me.follower_count)} · déclaré`
        : nf.format(me.follower_count);
    abosRow.replaceWith(infoRow(libelle, valeur));
  });

  // Nombre reel de soirees (une story publiee = une soiree).
  loadMyHistory().then((evts) => {
    if (evts) soireesEl.textContent = String(evts.length);
  });

  return h("div", { class: "pf-inner" }, [
    h("header", { class: "bn-head" }, [
      h("span", { class: "label" }, "Profil"),
    ]),

    h("section", { class: "pf-id reveal", style: { "--d": "0ms" } }, [
      h("div", { class: "pf-ava", "aria-hidden": "true" }, icon("instagram", 24)),
      h("div", {}, [handleEl]),
    ]),

    h("section", { class: "pf-stats reveal", style: { "--d": "70ms" } }, [
      stat("Points", soldeEl),
      stat("Gagnés en tout", cumulEl),
      stat("Soirées", soireesEl),
    ]),

    h("section", { class: "pf-section reveal", style: { "--d": "140ms" } }, [
      h("p", { class: "label pf-section-label" }, "Réglages"),
      toggleRow("Vibrations", hapticsEnabled(), (on) => setHaptics(on)),
      attenteRow,
      abosRow,
      compteRow,
      clubRow,
    ]),

    h("footer", { class: "pf-foot reveal", style: { "--d": "210ms" } }, [
      h("button", { class: "btn btn-ghost btn-block", onClick: () => ctx.navigate("landing") }, "Se déconnecter"),
    ]),
  ]);

  // `valeur` est un element vivant, pas une chaine : son contenu est
  // reecrit quand la reponse de Supabase arrive.
  function stat(label, valeur) {
    return h("div", { class: "pf-stat card" }, [valeur, h("span", { class: "pf-stat-label" }, label)]);
  }
  function infoRow(label, value) {
    return h("div", { class: "pf-row" }, [h("span", { class: "pf-row-label" }, label), h("span", { class: "pf-row-val" }, value)]);
  }
  function toggleRow(label, initial, onChange) {
    let on = initial;
    const toggle = h(
      "button",
      {
        class: `pf-toggle${on ? " is-on" : ""}`,
        role: "switch",
        "aria-checked": String(on),
        "aria-label": label,
        onClick: () => {
          on = !on;
          toggle.classList.toggle("is-on", on);
          toggle.setAttribute("aria-checked", String(on));
          tap();
          onChange(on);
        },
      },
      [h("span", { class: "pf-toggle-knob" })]
    );
    return h("div", { class: "pf-row" }, [h("span", { class: "pf-row-label" }, label), toggle]);
  }
}
