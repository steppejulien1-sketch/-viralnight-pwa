// Ecran — Profil (refonte UI, socle ui/ + patterns/).
//
// ⚠️ AUCUN APPEL SUPABASE N'A CHANGE dans les LECTURES : memes
// `loadMyProfile`, `loadPendingPoints`, `loadMyHistory`, `currentClub`.
//
// ⚠️ UNE CORRECTION DE COMPORTEMENT, ELLE, EST VOLONTAIRE.
// « Se deconnecter » ne deconnectait pas : le bouton se contentait de
// `ctx.navigate("landing")`. La session Supabase restait ouverte, et
// revenir sur l'accueil reconnectait aussitot. Sur un telephone prete
// ou partage, c'est le compte de quelqu'un d'autre qui reste
// accessible. L'ecran appelle maintenant `signOut()` de lib/session.js,
// qui existait deja et n'etait appele nulle part.
//
// LE NOMBRE D'ABONNES est AFFICHE mais n'entre dans AUCUN calcul de
// points. Il est lu depuis la base, ou seules les edge functions
// peuvent l'ecrire (migration 0009) : un clubbeur ne peut pas
// s'inventer deux millions d'abonnes. Un chiffre saisi a la main est
// affiche « declare » et ne doit jamais passer pour verifie.
//
// CE QUI CHANGE A L'ECRAN :
//  - l'en-tete n'est plus emprunte a la feuille du BONUS (.bn-head) ;
//  - le degrade Instagram quitte l'avatar : tout le monde ne s'est pas
//    connecte par Instagram ;
//  - la ligne ENTIERE d'un reglage est cliquable (56 px), au lieu du
//    seul interrupteur de 30 px de haut.

import { h, icon } from "../lib/dom.js";
import { Button, Field, Picker, Sheet } from "../ui/index.js";
import { Screen, Section } from "../patterns/Screen.js";
import { currentClub } from "../lib/club.js";
import { hapticsEnabled, setHaptics, tap } from "../lib/haptics.js";
import { signOut } from "../lib/session.js";
import { loadMyProfile, loadPendingPoints, loadMyHistory, untilLabel, declareFollowers } from "../lib/game.js";
import "./profile.css";

const nf = new Intl.NumberFormat("fr-FR");

export function Profile(_params, ctx) {
  // ⚠️ Les chiffres partent VIDES, pas sur des valeurs de
  // demonstration. Cet ecran affichait 480 pts / 1 240 cumules /
  // 2 soirees en attendant la reponse de Supabase : des chiffres faux
  // mais parfaitement credibles, qui laissaient croire un instant a un
  // solde qu'on n'a pas. Un tiret dit « je ne sais pas encore » ;
  // 480 raconte une histoire.
  const handleEl = h("p", { class: "pf-handle" }, "Profil");
  const clubEl = h("p", { class: "pf-club", hidden: true });

  // Profil charge : garde le pseudo et les abonnes sous la main, pour que
  // la feuille de saisie parte de ce qui est deja enregistre.
  let moi = null;

  const soldeVal = valeur();
  const cumulVal = valeur();
  const soireesVal = valeur();

  // Lignes remplies en asynchrone : masquees tant qu'on n'a rien a y
  // mettre, plutot qu'affichees avec un tiret qui ressemble a une
  // panne.
  const attenteRow = ligne("En attente", "", { hidden: true, live: true });
  // ⚠️ TOUJOURS VISIBLE, contrairement aux autres lignes asynchrones : sa
  // raison d'etre est justement d'etre proposee a qui n'a rien renseigne.
  // Masquee, elle laissait les 8 comptes deja inscrits sans aucun moyen de
  // declarer leurs abonnes — la donnee ne pouvait jamais exister.
  const abosRow = ligne("Abonnés", "Renseigner", { action: ouvrirAbonnes });
  const compteRow = ligne("Compte", "—");
  // Pas de ligne « Club » dans les reglages : le club est deja sous le
  // pseudo, en haut. L'ecrire deux fois sur le meme ecran donne
  // l'impression que ce sont deux informations differentes.

  const el = Screen({ label: "Profil" });

  el.body.append(
    h("section", { class: "pf-id" }, [
      h("span", { class: "pf-ava", "aria-hidden": "true" }, icon("user", 26)),
      h("span", { class: "pf-id__txt" }, [handleEl, clubEl]),
    ]),

    h("section", { class: "pf-stats" }, [
      stat("Points", soldeVal, true),
      stat("Gagnés en tout", cumulVal),
      stat("Soirées", soireesVal),
    ]),

    Section("Réglages", [
      h("div", { class: "pf-rows" }, [
        interrupteur("Vibrations", hapticsEnabled(), setHaptics),
        attenteRow,
        abosRow,
        compteRow,
      ]),
    ]),

    // ⚠️ La deconnexion N'EST PAS dans le pied colle. Le pied est la
    // zone du pouce, reservee a l'action principale de l'ecran — et le
    // profil n'en a pas. Y epingler la seule action destructive de
    // l'app en ferait la plus facile a toucher par erreur, une main
    // prise, dans le noir. Elle vit donc dans le flux, apres les
    // reglages, avec de l'air autour.
    h("div", { class: "pf-out" }, [
      Button({
        label: "Se déconnecter",
        variant: "ghost",
        block: true,
        onClick: deconnexion,
      }),
      h("p", { class: "pf-legal" }, "Tes points restent sur ton compte."),
    ])
  );

  /* ---------- Donnees ---------- */

  currentClub()
    .then((c) => {
      if (!c) return;
      const ville = c.city ? ` · ${c.city}` : "";
      clubEl.textContent = `${c.name}${ville}`;
      clubEl.hidden = false;
    })
    .catch(() => {});

  loadMyProfile()
    .then((me) => {
      if (!me) return;

      if (me.handle) handleEl.textContent = `@${me.handle}`;
      if (me.points_balance != null) soldeVal.textContent = nf.format(me.points_balance);
      if (me.lifetime_points != null) cumulVal.textContent = nf.format(me.lifetime_points);
      compteRow.setValue(me.handle ? "Connecté" : "—");

      moi = me;
      afficherAbonnes(me);
    })
    .catch(() => {});

  // Points gagnes mais pas encore depensables (migration 0011).
  loadPendingPoints()
    .then((p) => {
      if (!p || !p.pending) return;
      attenteRow.setValue(`${nf.format(p.pending)} pts · ${untilLabel(p.nextUnlock)}`);
    })
    .catch(() => {});

  // Une story publiee = une soiree.
  loadMyHistory()
    .then((evts) => {
      if (evts) soireesVal.textContent = String(evts.length);
    })
    .catch(() => {});

  return el;

  /* ---------- Abonnés ---------- */

  // Un chiffre saisi a la main est affiche comme tel : il ne doit jamais
  // se faire passer pour une donnee verifiee par le reseau.
  function afficherAbonnes(me) {
    if (me?.follower_count == null) {
      abosRow.setLabel("Abonnés");
      abosRow.setValue("Renseigner");
      return;
    }
    abosRow.setLabel(
      me.follower_source === "tiktok"
        ? "Abonnés TikTok"
        : me.follower_source === "instagram"
          ? "Abonnés Instagram"
          : "Abonnés"
    );
    abosRow.setValue(
      me.follower_source === "declared"
        ? `${nf.format(me.follower_count)} · déclaré`
        : nf.format(me.follower_count)
    );
  }

  // Feuille de saisie. ⚠️ Le pseudo part avec : `declare_followers` le
  // reecrit (c'est sa signature d'origine, cote inscription). L'envoyer
  // vide effacerait le pseudo — on renvoie donc celui deja connu.
  function ouvrirAbonnes() {
    tap();
    if (!moi?.handle) return; // profil pas encore charge : rien a reecrire

    const champ = Field({
      label: "Ton nombre d'abonnés",
      type: "number",
      inputmode: "numeric",
      hint: "Affiché sur ton profil. Ça ne change pas tes points.",
    });
    if (moi.follower_count != null) champ.setValue?.(String(moi.follower_count));

    const preuve = Picker({ title: "Capture de ton profil", sub: "facultatif" });
    const btn = Button({
      label: "Enregistrer",
      block: true,
      onClick: async () => {
        const n = Number(champ.getValue());
        if (!Number.isFinite(n) || n < 0) {
          champ.setError("Indique un nombre.");
          return;
        }
        btn.setLoading(true);
        const r = await declareFollowers({ handle: moi.handle, count: n, file: preuve.getFile() });
        btn.setLoading(false);
        if (r.error) {
          champ.setError(traduireAbo(r.error));
          return;
        }
        moi = { ...moi, ...r.profil };
        afficherAbonnes(moi);
        feuille.close();
      },
    });

    const feuille = Sheet({
      title: "Tes abonnés",
      body: h("div", { class: "pf-abo" }, [champ, preuve]),
      actions: [btn],
    });
  }

  function traduireAbo(code) {
    const c = String(code || "");
    if (c.includes("invalid_count")) return "Ce nombre n'est pas plausible.";
    if (c.includes("invalid_handle")) return "Ton pseudo n'est pas valide.";
    if (c.includes("not_authenticated")) return "Reconnecte-toi pour enregistrer.";
    return "Enregistrement impossible pour le moment.";
  }

  /* ---------- Fabriques ---------- */

  async function deconnexion() {
    // ⚠️ La session d'abord, la navigation ensuite. L'inverse laissait
    // le compte ouvert.
    await signOut().catch(() => {});
    ctx.navigate("landing");
  }

  function valeur() {
    return h("span", { class: "pf-stat__val" }, "—");
  }

  function stat(label, valEl, live = false) {
    return h("div", { class: `pf-stat${live ? " pf-stat--live" : ""}` }, [
      valEl,
      h("span", { class: "pf-stat__lbl" }, label),
    ]);
  }

  // Ligne d'information. `setValue` la revele : une ligne masquee ne
  // prend aucune place, donc l'ecran ne saute pas quand la reponse
  // arrive.
  function ligne(label, val, { hidden = false, live = false, action = null } = {}) {
    const lblEl = h("span", { class: "pf-row__lbl" }, label);
    const valEl = h("span", { class: `pf-row__val${live ? " pf-row__val--live" : ""}` }, val);
    // Une ligne qui MENE quelque part est un bouton, sur toute sa hauteur
    // (56 px) : meme regle que l'interrupteur juste en dessous.
    const row = action
      ? h("button", { class: "pf-row pf-row--act", type: "button", onClick: action }, [
          lblEl,
          h("span", { class: "pf-row__go" }, [valEl, icon("arrowRight", 16)]),
        ])
      : h("div", { class: "pf-row", hidden: hidden || false }, [lblEl, valEl]);

    row.setValue = (v) => {
      valEl.textContent = v;
      row.hidden = false;
    };
    row.setLabel = (s) => {
      lblEl.textContent = s;
    };
    return row;
  }

  // Reglage a bascule. ⚠️ C'est la LIGNE qui est le bouton, pas
  // l'interrupteur : 56 px de haut sur toute la largeur, contre 30 px
  // sur 50 px avant.
  function interrupteur(label, initial, onChange) {
    let on = initial;

    const bouton = h("span", { class: `pf-toggle${on ? " is-on" : ""}` }, [
      h("span", { class: "pf-toggle__knob" }),
    ]);

    const row = h(
      "button",
      {
        type: "button",
        class: "pf-row",
        role: "switch",
        "aria-checked": String(on),
        onClick: () => {
          on = !on;
          bouton.classList.toggle("is-on", on);
          row.setAttribute("aria-checked", String(on));
          // Le retour haptique part APRES l'ecriture du reglage :
          // sinon, en le desactivant, on vibre une derniere fois.
          onChange(on);
          if (on) tap();
        },
      },
      [h("span", { class: "pf-row__lbl" }, label), bouton]
    );

    return row;
  }
}
