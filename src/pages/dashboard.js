// Ecran — Accueil connecte (refonte UI, socle ui/ + patterns/).
//
// ⚠️ AUCUN APPEL SUPABASE N'A CHANGE. Les memes fonctions de
// lib/game.js sont appelees dans le meme ordre : c'est une refonte
// de l'affichage, pas de la logique.
//
// CE QUI CHANGE A L'ECRAN :
//  - le solde passe en display 56px, pose a meme le fond. Il domine
//    par sa TAILLE, pas par une couleur qui lui serait reservee ;
//  - le seul aplat rouge de l'ecran est le bouton « Poster », colle
//    en bas dans la zone du pouce ;
//  - un contenu en attente de validation s'affiche « En attente »
//    au lieu de « +0 » (voir le champ `verified` ajoute a
//    loadMyHistory) ;
//  - les tuiles Classement / Collection sont de vrais <button>.
//
// DONNEES : tout ce qui est chiffre vient de la base, SANS repli.
// Il restait des valeurs de demonstration (480 pts, 2 soirees, un
// catalogue fictif) : un clubbeur dont le profil ne se chargeait pas
// voyait 480 points -- assez pour croire qu'il pouvait prendre une
// recompense -- pendant que la boutique lisait son vrai solde.
// Un solde a zero est vrai ; 480 est faux.

import { h, icon } from "../lib/dom.js";
import { Button, Card, CardHead, Empty, Points, Progress, State } from "../ui/index.js";
import { Screen, Section, Slot, Note } from "../patterns/Screen.js";
import { Rows, Row, Tile } from "../patterns/Rows.js";
import {
  loadStreak,
  loadActiveChallenge,
  loadMyProfile,
  loadMyHistory,
  loadPublicClub,
  loadPublicRewards,
  countdown,
} from "../lib/game.js";
import "./dashboard.css";

const nf = new Intl.NumberFormat("fr-FR");
const dateFmt = new Intl.DateTimeFormat("fr-FR", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

export function Dashboard(_params, ctx) {
  /* ---------- Barre du haut ---------- */

  // Vide au depart : le nom arrive avec le club resolu. Afficher un
  // nom d'etablissement en attendant reviendrait a en inventer un.
  // Le bloc entier reste vide tant que le club n'est pas resolu :
  // afficher la pastille rouge toute seule, sans nom a cote, donne
  // un point rouge orphelin en haut d'ecran.
  const clubName = h("span", { class: "db-club__name" }, "");
  const club = h("span", { class: "db-club", hidden: true }, [
    h("span", { class: "db-club__dot", "aria-hidden": "true" }),
    clubName,
  ]);

  const handleEl = h("span", {}, "");
  const moi = h(
    "button",
    {
      type: "button",
      class: "db-me",
      "aria-label": "Ton profil",
      onClick: () => ctx.navigate("profile"),
    },
    [handleEl, h("span", { class: "db-me__ava", "aria-hidden": "true" }, icon("user", 16))]
  );

  const el = Screen({ headRight: moi });
  el.head.querySelector(".vn-screen__head-main").append(club);

  /* ---------- Emplacements asynchrones ---------- */
  const challengeSlot = Slot();
  const streakSlot = Slot();
  const nextSlot = Slot();
  const histSlot = Slot();
  const compteRecomp = h("span", { class: "vn-label" }, "");

  // Le compteur monte a 0 : il s'anime vers le vrai solde des sa
  // reception, jamais vers une valeur de demonstration.
  const solde = Points(0, { size: "hero" });

  el.body.append(
    challengeSlot,

    // Les NIVEAUX ont ete retires : ils ajoutaient une deuxieme
    // monnaie (le cumul a vie) a cote des points, sans rien
    // debloquer. Le solde et la prochaine recompense suffisent a
    // dire ou on en est. Le streak, lui, reste : il pousse a
    // revenir, donc il remonte a cote du solde.
    h("section", { class: "db-balance" }, [
      h("div", { class: "db-balance__head" }, [
        h("span", { class: "vn-label" }, "Ton solde"),
        streakSlot,
      ]),
      solde,
    ]),

    nextSlot,

    h("div", { class: "db-tiles" }, [
      Tile({
        ico: "trophy",
        title: "Classement",
        sub: "Ta place cette semaine",
        onClick: () => ctx.navigate("leaderboard"),
      }),
      Tile({
        ico: "medal",
        title: "Collection",
        sub: "Tes badges",
        onClick: () => ctx.navigate("collection"),
      }),
    ]),

    Section("Tes soirées", [histSlot], compteRecomp)
  );

  /* ---------- Pied : la seule action de l'ecran ---------- */
  el.foot.append(
    Button({
      label: "Poster ma story",
      ico: icon("instagram", 20),
      block: true,
      onClick: () => ctx.navigate("post"),
    }),
    Note("Le club valide ta capture, puis tes points tombent.")
  );

  /* ---------- Donnees ---------- */
  charger();

  // Flamme de streak : masquee tant qu'il n'y a pas de serie.
  loadStreak()
    .then((s) => {
      if (!s || !s.current_streak) return;
      streakSlot.replaceChildren(
        h("span", { class: "db-streak", title: `Record : ${s.longest_streak}` }, [
          icon("flame", 14),
          `${s.current_streak}`,
          h("span", { class: "db-streak__lbl" }, "soirées"),
        ])
      );
    })
    .catch(() => {});

  // Defi du moment, avec son compte a rebours.
  loadActiveChallenge()
    .then((c) => {
      if (!c) return;
      challengeSlot.replaceChildren(
        Card({ live: true, onClick: () => ctx.navigate("post") }, [
          h("div", { class: "db-chal" }, [
            h("span", { class: "vn-tile__ico", "aria-hidden": "true" }, icon("sparkles", 20)),
            h("div", { class: "db-chal__main" }, [
              h("span", { class: "vn-label" }, "Défi du moment"),
              h("span", { class: "db-chal__title" }, c.title),
              c.description ? h("span", { class: "db-chal__desc" }, c.description) : null,
            ]),
            h("div", { class: "db-chal__right" }, [
              Points(c.bonus_points, { size: "sm", sign: true, unit: false }),
              h("span", { class: "db-chal__time" }, countdown(c.ends_at)),
            ]),
          ]),
        ])
      );
    })
    .catch(() => {});

  return el;

  async function charger() {
    const [me, evts, clubRow] = await Promise.all([
      loadMyProfile().catch(() => null),
      loadMyHistory().catch(() => null),
      loadPublicClub().catch(() => null),
    ]);

    // Profil illisible : on montre zero, pas un solde de
    // demonstration. Un compte vide est un etat legitime, un faux
    // solde ne l'est pas.
    const balance = me?.points_balance ?? 0;
    const soirees = evts ?? [];

    handleEl.textContent = me?.handle ? `@${me.handle}` : "Profil";
    if (clubRow?.name) {
      clubName.textContent = clubRow.name;
      club.hidden = false;
    }

    solde.setValue(balance);
    majHistorique(soirees);

    // Catalogue reel du club. Sans catalogue, la carte « Prochaine
    // recompense » disparait : annoncer un objectif qui n'existe pas
    // dans cette boite serait une promesse que le bar ne peut pas
    // tenir.
    const cat = clubRow ? await loadPublicRewards(clubRow.id).catch(() => null) : null;
    const paliers = (cat || []).slice().sort((a, b) => a.cost_points - b.cost_points);
    majProchaine(paliers, balance);
  }

  function majProchaine(paliers, balance) {
    const next = paliers.find((r) => r.cost_points > balance);
    const atteintes = paliers.filter((r) => r.cost_points <= balance).length;

    compteRecomp.textContent = atteintes
      ? `${atteintes} atteinte${atteintes > 1 ? "s" : ""}`
      : "";

    if (!next) {
      nextSlot.replaceChildren();
      return;
    }

    const manque = next.cost_points - balance;
    nextSlot.replaceChildren(
      Card({ live: true, onClick: () => ctx.navigate("rewards") }, [
        CardHead("Prochaine récompense", true),
        h("p", { class: "vn-h3" }, next.title),
        Progress(balance, next.cost_points),
        h("p", { class: "vn-meta" }, [
          h("strong", {}, `${nf.format(manque)} pts`),
          " à débloquer",
        ]),
      ])
    );
  }

  function majHistorique(evts) {
    if (!evts.length) {
      histSlot.replaceChildren(
        Empty({
          ico: "instagram",
          title: "Ta première story apparaîtra ici",
          sub: "Poste ce soir, tu la retrouveras juste là.",
        })
      );
      return;
    }

    histSlot.replaceChildren(
      Rows(
        evts.map((e) =>
          Row({
            ico: iconeType(e.kind),
            title: capitale(dateFmt.format(new Date(e.mentioned_at))),
            sub: libelleType(e.kind),
            // Un depot non valide vaut 0 point : afficher « +0 »
            // laissait croire a un gain nul alors que le club n'a
            // simplement pas encore regarde la capture.
            value: e.verified
              ? Points(e.awarded_points, { size: "sm", sign: true, unit: false })
              : State("wait"),
          })
        )
      )
    );
  }

  function iconeType(kind) {
    if (kind === "tiktok") return "tiktok";
    if (kind === "reel") return "reel";
    return "instagram";
  }
  function libelleType(kind) {
    if (kind === "tiktok") return "TikTok";
    if (kind === "reel") return "Reel";
    return "Story";
  }
  function capitale(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
