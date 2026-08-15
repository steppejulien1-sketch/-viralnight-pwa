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
// ⚠️ PLUS AUCUNE CAPTURE D'ECRAN (migrations 0026 puis 0028). Le second
// ecran n'est plus « ta preuve » mais une CONFIRMATION. Ce qui verifie :
// le compte TikTok connecte (l'API retrouve la video chez son auteur), le
// lien public pour un Reel, la mention recue par le club pour une story.
//
// CE QUI CHANGE A L'ECRAN :
//  - le gain est annonce franchement, avant de partir poster ;
//  - le bouton garde son libelle pendant l'envoi ;
//  - fin des emprunts a onboarding.css et rewards.css.

import { h, icon } from "../lib/dom.js";
import { Button, Chips, Field, Points } from "../ui/index.js";
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
            t: "Reviens nous le dire",
            // ⚠️ L'etape 3 demandait une capture d'ecran (0028 l'a
            // supprimee). Laisser cette consigne aurait envoye les gens
            // chercher une image que l'ecran suivant ne demande plus.
            d:
              kind.id === "story"
                ? "Le club voit ta mention arriver sur son compte, puis tes points tombent."
                : "Le club ouvre ton lien et vérifie la mention, puis tes points tombent.",
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
          const url = kind.id === "story" ? "" : lien.getValue();
          // ⚠️ LE LIEN EST LA SEULE PIECE d'un reel ou d'un TikTok depuis
          // la 0028 (plus aucune capture). Il n'etait valide NULLE PART :
          // ni ici, ni en base. Sans ce controle, le contenu arrivait chez
          // le gerant sans aucun moyen de le verifier — et la base le
          // refuserait maintenant (`url_required`), mais tout a la fin du
          // parcours, ce qui est le pire moment pour l'apprendre.
          if (kind.id !== "story" && !/^https?:\/\/\S+$/i.test(url)) {
            lien.setError(`Colle le lien de ta publication ${kind.app}.`);
            lien.focus?.();
            return;
          }
          tap();
          window.open(kind.url, "_blank", "noopener");
          renderProof(url);
        },
      }),
      Note("Le club vérifie, puis tes points tombent.")
    );

    swap(el);
  }

  /* ================= 2. La preuve ================= */
  //
  // ⚠️ PLUS AUCUNE CAPTURE, QUEL QUE SOIT LE FORMAT (0026 puis 0028).
  // Julien : « retire la capture pour les reels et les TikToks, ça
  // marchera mieux si les gens se connectent avec une clé API TikTok, et
  // pour Instagram on regardera la mention ».
  //
  // Ce qui vérifie quoi, désormais :
  //   TikTok → le compte connecté. `tiktok-views` retrouve la vidéo DANS
  //            les siennes : elle existe ET elle est à lui, et on en tire
  //            les vues réelles (0025) ;
  //   Reel   → le lien public, que le gérant ouvre ;
  //   Story  → la mention reçue sur l'Instagram du club.
  //
  // Cet écran n'est donc plus une preuve à fournir : c'est une
  // CONFIRMATION, « j'ai posté ».

  function renderProof(url) {
    ecran = "proof";

    const el = Screen({ label: "Dernière étape", onBack: () => renderHowto() });

    const msg = h("p", { class: "vn-field__err", role: "alert", hidden: true });

    const btn = Button({
      label: "J'ai posté, envoyer au club",
      block: true,
      onClick: () => envoyer(),
    });

    async function envoyer() {
      tap();
      msg.hidden = true;
      btn.setLoading(true);

      const res = await submitStory({
        kind: kind.id,
        url: url || "",
      });

      if (res?.error) {
        btn.setLoading(false);
        msg.textContent = traduire(res.error);
        msg.hidden = false;
        return;
      }

      success();
      renderSent();
    }

    el.body.append(
      // ⚠️ « et c'est plié » retire. La barre du haut dit deja
      // « Dernière étape » : la formule ne portait aucune information
      // de plus, elle mettait juste un clin d'oeil sur un ecran qu'on
      // traverse a chaque publication. La voix du produit reste sur
      // l'accueil, qu'on ne voit qu'une fois ; a l'interieur de l'app
      // les textes disent ce qu'ils font.
      Title("Préviens le club"),
      Sub(
        kind.id === "story"
          ? [
              "Rien à envoyer : ta mention arrive directement sur ",
              h("strong", {}, club?.ig_handle ? `@${club.ig_handle}` : "le compte du club"),
              ". Le club la voit et te crédite ",
              h("strong", {}, phraseBareme("story")),
              ".",
            ]
          : [
              "Rien à envoyer : le club ouvre ton lien et vérifie la mention. ",
              h("strong", {}, phraseBareme(kind.id)),
              ".",
            ]
      ),
      h(
        "p",
        { class: "ps-hint" },
        "Si la mention n'y est pas, le club ne pourra pas te créditer."
      ),
      msg
    );

    el.foot.append(
      btn,
      Note(
        kind.id === "story"
          ? "Le club vérifie dans ses mentions Instagram."
          : "Le club vérifie ta publication depuis ton lien.",
        "lock"
      )
    );
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
          kind.id === "story"
            ? " vérifie la mention dans ses stories et crédite tes points. En général avant la prochaine soirée."
            : " ouvre ton lien, vérifie la mention et crédite tes points. En général avant la prochaine soirée.",
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
  // ⚠️ `views_required` a disparu (0020) et `proof_required` aussi (0028).
  // `url_required` les remplace : c'est le lien qui porte la preuve d'un
  // reel ou d'un TikTok.
  function traduire(code) {
    if (/url_required/.test(code)) return "Colle le lien de ta publication.";
    if (/already_pending/.test(code)) return "Tu as déjà un contenu en attente de validation.";
    if (/invalid_kind/.test(code)) return "Format non reconnu.";
    if (/not_authenticated/.test(code)) return "Reconnecte-toi pour envoyer ton contenu.";
    // submitStory renvoie ce code quand aucun QR n'a jamais ete scanne :
    // sans club, le depot n'a nulle part ou aller.
    if (/club_introuvable/.test(code)) return "Scanne le QR de ton club avant d'envoyer ton contenu.";
    return "Envoi impossible pour le moment. Réessaie dans un instant.";
  }
}
