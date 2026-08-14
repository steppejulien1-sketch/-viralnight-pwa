// Ecran — Poster un contenu (refonte UI, socle ui/ + patterns/).
// Trois temps : instructions → preuve → envoyé.
//
// ⚠️ AUCUN APPEL SUPABASE N'A CHANGE : meme `submitStory()`, donc meme
// upload dans le bucket prive `story-proofs` (chemin
// `{club}/{clubbeur}/{horodatage}`, migration 0015) et meme RPC
// `submit_story`.
//
// ⚠️ LA PREUVE D'ABORD, LES POINTS ENSUITE. Cet ecran attendait autrefois
// 4,5 secondes — une fausse detection — puis creditait tout seul. On
// pouvait gagner des points sans avoir rien publie. Depuis la migration
// 0014, le clubbeur DEPOSE et c'est le club qui valide ; `credit_story`
// n'est plus appelable depuis un navigateur. Ne jamais remettre de credit
// cote client.
//
// ⚠️ BAREME AU FORFAIT (migration 0020, appliquee le 2026-08-14). Le
// montant ne depend plus que du TYPE de contenu. Le champ « Combien de
// vues ? » a disparu : il demandait un effort pour une donnee qu'on jette.
// Toutes les phrases viennent de `phraseBareme()` — ne jamais reecrire un
// montant en dur ici.
//
// CE QUI CHANGE A L'ECRAN :
//  - le gain est annonce franchement, avant de partir poster ;
//  - la capture passe sur Picker : elle MONTRE l'image, au lieu d'afficher
//    un nom de fichier qu'on ne peut pas verifier ;
//  - le bouton garde son libelle pendant l'envoi ;
//  - fin des emprunts a onboarding.css et rewards.css.

import { h, icon } from "../lib/dom.js";
import { Button, Chips, Field, Picker, Points } from "../ui/index.js";
import { Screen, Title, Sub, Note } from "../patterns/Screen.js";
import { BAREME, phraseBareme } from "../lib/bareme.js";
import { currentClub } from "../lib/club.js";
import { tap, success } from "../lib/haptics.js";
import { submitStory } from "../lib/game.js";
import "./post-story.css";

const KINDS = [
  {
    id: "story",
    label: "Story",
    ico: "instagram",
    app: "Instagram",
    url: "https://instagram.com",
    montant: BAREME.story.base,
    why: "Le meilleur montant : une story touche ton cercle proche, c'est ce qui remplit vraiment la salle.",
    step: "Ajoute le sticker mention",
  },
  {
    id: "reel",
    label: "Reel",
    ico: "reel",
    app: "Instagram",
    url: "https://instagram.com",
    montant: BAREME.reel.base,
    why: "Une portée plus large, mais moins ciblée que la story.",
    step: "Mentionne",
  },
  {
    id: "tiktok",
    label: "TikTok",
    ico: "tiktok",
    app: "TikTok",
    url: "https://tiktok.com",
    montant: BAREME.tiktok.base,
    why: "Une portée plus large, mais moins ciblée que la story.",
    step: "Mentionne",
  },
];

export function PostStory(_params, ctx) {
  const root = h("div");

  let kind = KINDS[0];
  let ecran = "howto";

  // Le club vient du QR scanne (lib/club.js), il n'est plus ecrit en dur.
  // C'est lui qui porte le handle a taguer : avec la valeur figee de
  // mock.js, un clubbeur d'un autre etablissement etait invite a taguer
  // @mirage.brussels — son contenu n'arrivait jamais a son club, et il
  // n'etait jamais credite.
  let club = null;

  renderHowto();

  // Rendu immediat puis repeinture : le club est presque toujours deja en
  // memoire locale, mais sa resolution reste asynchrone. On ne repeint que
  // si l'utilisateur n'a pas deja avance, sinon on effacerait sa saisie.
  currentClub()
    .then((c) => {
      club = c;
      if (ecran === "howto") renderHowto();
    })
    .catch(() => {});

  return root;

  function swap(node) {
    root.replaceChildren(node);
  }

  /* ================= 1. Instructions ================= */

  function renderHowto() {
    ecran = "howto";

    const el = Screen({ label: "Poster un contenu", onBack: () => ctx.back("dashboard") });

    // Lien du contenu. ⚠️ Une story Instagram n'a PAS d'URL publique : on
    // ne demande le lien que pour les Reels et TikToks. C'est lui qui
    // permet au contenu de remonter au dashboard du gerant (pont B2B).
    const lien = Field({
      label: "Lien de ta publication",
      type: "url",
      inputmode: "url",
      placeholder:
        kind.id === "tiktok"
          ? "https://tiktok.com/@toi/video/..."
          : "https://instagram.com/reel/...",
      hint: "Colle-le pour que ton contenu remonte au club.",
    });

    el.body.append(
      Title(
        club
          ? ["Tague ", h("span", { class: "ps-club" }, `@${club.ig_handle}`), " et gagne tes points"]
          : "Tague ton club et gagne tes points"
      ),

      Chips(
        KINDS.map((k) => ({ value: k.id, label: k.label, ico: icon(k.ico, 17) })),
        {
          value: kind.id,
          ariaLabel: "Format de ton contenu",
          onChange: (v) => {
            kind = KINDS.find((k) => k.id === v) || KINDS[0];
            renderHowto();
          },
        }
      ),

      // Le gain, annonce avant de partir poster.
      h("div", { class: "ps-gain" }, [
        Points(kind.montant, { size: "md", sign: true }),
        h("span", { class: "ps-gain__txt" }, [
          h("span", { class: "vn-label" }, `Par ${kind.label.toLowerCase()}`),
          h("span", { class: "ps-gain__why" }, kind.why),
        ]),
      ]),

      kind.id === "story"
        ? h(
            "p",
            { class: "ps-hint" },
            "Une story n'a pas de lien public : on la détecte via la mention."
          )
        : lien,

      h(
        "ol",
        { class: "ps-steps" },
        [
          { n: "1", t: `Ouvre ${kind.app}`, d: "On t'y emmène en un tap." },
          {
            n: "2",
            t: `Poste ${kind.id === "story" ? "une story" : kind.id === "reel" ? "un Reel" : "un TikTok"}`,
            // ⚠️ Sans club resolu on ne cite AUCUN compte : envoyer taguer
            // le mauvais etablissement coute ses points au clubbeur.
            d: club ? `${kind.step} @${club.ig_handle}.` : `${kind.step} le compte de ton club.`,
          },
          {
            n: "3",
            t: "Reviens avec ta capture",
            d: "Elle prouve que ta publication existe. Le club la regarde, puis tes points tombent.",
          },
        ].map((s) => etape(s))
      )
    );

    el.foot.append(
      Button({
        label: `Ouvrir ${kind.app}`,
        ico: icon(kind.ico, 20),
        block: true,
        onClick: () => {
          tap();
          const url = kind.id === "story" ? "" : lien.getValue();
          window.open(kind.url, "_blank", "noopener");
          renderProof(url);
        },
      }),
      Note("Le club valide ta capture, puis tes points tombent.")
    );

    swap(el);
  }

  /* ================= 2. La preuve ================= */
  // Sans capture, pas de depot : le bouton reste desactive, et la base
  // refuse de toute facon (`proof_required`).

  function renderProof(url) {
    ecran = "proof";

    const el = Screen({ label: "Ta preuve", onBack: () => renderHowto() });

    const msg = h("p", { class: "vn-field__err", role: "alert", hidden: true });

    const btn = Button({
      label: "Envoyer au club",
      block: true,
      disabled: true,
      onClick: () => envoyer(),
    });

    const capture = Picker({
      title: "Ajouter la capture",
      sub: "obligatoire",
      // La capture est la SEULE condition. C'etait deja la seule que la
      // base verifiait.
      onPick: () => {
        btn.disabled = false;
      },
    });

    async function envoyer() {
      tap();
      msg.hidden = true;
      btn.setLoading(true);

      const res = await submitStory({
        kind: kind.id,
        file: capture.getFile(),
        url: url || "",
      });

      if (res?.error) {
        btn.setLoading(false);
        msg.textContent = traduire(res.error);
        msg.hidden = false;
        return;
      }

      capture.destroy();
      success();
      renderSent();
    }

    el.body.append(
      Title(["Montre ta publication, ", h("em", {}, "et c'est plié")]),
      Sub([
        "Ouvre ",
        h("strong", {}, kind.app),
        `, va sur ${kind.id === "story" ? "ta story" : "ta publication"}, et fais une capture d'écran. `,
        h("strong", {}, phraseBareme(kind.id)),
        ", quel que soit le nombre de vues.",
      ]),
      capture,
      h(
        "p",
        { class: "ps-hint" },
        "Le club vérifie que la mention y est. C'est tout ce qu'on regarde."
      ),
      msg
    );

    el.foot.append(btn, Note("Ta capture n'est visible que par le club.", "lock"));
    swap(el);
  }

  /* ================= 3. Envoyé ================= */
  // ⚠️ AUCUN POINT N'EST ANNONCE ICI. Promettre un gain avant que le club
  // ait regarde la preuve, c'est reproduire exactement le probleme d'avant.

  function renderSent() {
    ecran = "sent";

    const el = Screen({ label: "Envoyé" });

    el.body.append(
      h("div", { class: "ps-sent" }, [
        h("div", { class: "ps-sent__check", "aria-hidden": "true" }, icon("check", 32)),
        Title("Envoyé au club"),
        h("p", { class: "ps-sent__sub" }, [
          "Le ",
          h("strong", {}, club?.name || "club"),
          " vérifie ta capture et crédite tes points. En général avant la prochaine soirée.",
        ]),
        h(
          "p",
          { class: "ps-sent__note" },
          "Tu retrouveras ce contenu dans « Tes soirées », marqué en attente."
        ),
      ])
    );

    // `ghost` et pas `primary` : l'aplat de cet ecran est deja pris par la
    // pastille de confirmation, et il n'y a plus rien d'urgent a faire.
    el.foot.append(
      Button({
        label: "Voir mon espace",
        variant: "ghost",
        block: true,
        onClick: () => ctx.navigate("dashboard"),
      })
    );

    swap(el);
  }

  /* ---------- Fabriques ---------- */

  function etape(s) {
    return h("li", { class: "ps-step" }, [
      h("span", { class: "ps-step__n", "aria-hidden": "true" }, s.n),
      h("span", { class: "ps-step__txt" }, [
        h("span", { class: "ps-step__t" }, s.t),
        h("span", { class: "ps-step__d" }, s.d),
      ]),
    ]);
  }

  // Messages d'erreur de submit_story, traduits pour un clubbeur.
  // ⚠️ `views_required` a disparu : la migration 0020 ne peut plus le lever.
  function traduire(code) {
    if (/proof_required/.test(code)) return "Ajoute la capture de ta publication.";
    if (/already_pending/.test(code)) return "Tu as déjà un contenu en attente de validation.";
    if (/invalid_kind/.test(code)) return "Format non reconnu.";
    if (/not_authenticated/.test(code)) return "Reconnecte-toi pour envoyer ton contenu.";
    // submitStory renvoie ce code quand aucun QR n'a jamais ete scanne :
    // sans club, le depot n'a nulle part ou aller.
    if (/club_introuvable/.test(code)) return "Scanne le QR de ton club avant d'envoyer ton contenu.";
    if (/^upload:/.test(code)) return "L'envoi de la capture a échoué. Réessaie.";
    return "Envoi impossible pour le moment. Réessaie dans un instant.";
  }
}
