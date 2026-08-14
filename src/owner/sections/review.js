// Section "À valider" (owner) — la file des contenus declares.
//
// C'est le maillon qui manquait : depuis la migration 0014, poster ne
// credite plus rien. Le clubbeur depose sa capture, et RIEN ne se passe
// tant que le club n'a pas tranche ici. Sans cet ecran, les points ne
// seraient jamais verses.
//
// ⚠️ BAREME AU FORFAIT depuis la migration 0020 (2026-08-14) : le montant
// ne se calcule plus sur les vues. Le champ « vues » est conserve a titre
// indicatif (il alimente l'historique), il n'entre plus dans le credit.
//
// ⚠️ MAIS LE GERANT REFIXE LE MONTANT depuis la migration 0022 (meme
// jour, decision de Julien). Le forfait du type n'est qu'une PROPOSITION,
// pre-remplie dans le champ « Points a crediter » : le gerant valide tel
// quel, ou accorde un autre montant. C'est `p_points` qui part a
// `review_story`, et la base borne la saisie a 2 000.
// 👉 Ne pas re-figer ce champ : la 0020 avait supprime la prise du gerant
// sur le montant sans que ce soit le but, et c'est precisement ce qui
// avait ete rejete.

import { h, icon } from "../../lib/dom.js";
import { supabase } from "../../lib/supabase.js";
import { BAREME, phraseBareme } from "../../lib/bareme.js";

const nf = new Intl.NumberFormat("fr-FR");
const dtf = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// Le montant PROPOSE par defaut au gerant.
//
// ⚠️ Il vient maintenant de la BASE (`suggested_points`, calcule par
// `get_pending_stories` depuis la 0025), pas d'un calcul local. Depuis que
// TikTok est paye aux vues reelles, le refaire ici imposerait de recopier
// le bareme ET de connaitre les vues mesurees — deux occasions de
// diverger. `lib/bareme.js` ne sert plus qu'a ANNONCER le bareme.
function propose(r) {
  const n = Number(r.suggested_points);
  return Number.isFinite(n) ? n : (BAREME[r.kind] || BAREME.story).base;
}

// Borne de saisie cote base (constante `c_max` de la migration 0022).
// Recopiee ici pour que le champ refuse AVANT l'aller-retour reseau ; la
// base reste seule juge et renvoie `points_out_of_range`.
const POINTS_MAX = 2000;

export async function ReviewAdmin(mount, club) {
  const liste = h("div", { class: "ow-review" }, [h("p", { class: "ow-muted" }, "Chargement…")]);
  const compteur = h("span", { class: "ow-badge" }, "");

  // La lecture automatique de capture est une COMMODITE, pas un maillon du
  // parcours : le gerant lit le chiffre a l'oeil et le saisit, comme avant.
  // Si le service de vision est indisponible (pas de credits, pas de cle),
  // on retire les boutons de TOUTES les cartes plutot que d'en laisser un
  // par contenu qui echouera pareil.
  let ocrIndispo = false;
  const avisOcr = h("p", { class: "ow-muted ow-review-ocr-avis", hidden: true });

  function couperOcr(raison) {
    if (ocrIndispo) return;
    ocrIndispo = true;
    liste.querySelectorAll(".ow-review-ocr").forEach((n) => n.remove());
    avisOcr.textContent = `Lecture automatique des captures ${raison}. Sans effet sur le crédit, qui est forfaitaire.`;
    avisOcr.hidden = false;
  }

  mount.replaceChildren(
    h("div", { class: "ow-section" }, [
      h("div", { class: "ow-head" }, [
        h("div", {}, [
          h("h1", {}, ["À valider", compteur]),
          h("p", { class: "ow-head-sub" }, `Vérifie que la mention y est, puis crédite. ${phraseBareme("story")} par défaut — tu peux ajuster le montant avant de valider.`),
          avisOcr,
        ]),
      ]),
      liste,
    ])
  );

  await charger();

  async function charger() {
    const { data, error } = await supabase.rpc("get_pending_stories", { p_club: club.id });
    if (error) {
      liste.replaceChildren(h("p", { class: "ow-muted" }, "Erreur de chargement : " + error.message));
      return;
    }
    const rows = data || [];
    compteur.textContent = rows.length ? String(rows.length) : "";
    compteur.hidden = !rows.length;

    if (!rows.length) {
      liste.replaceChildren(
        h("div", { class: "ow-empty-box" }, [
          h("p", {}, "Rien à valider."),
          h("p", { class: "ow-muted" }, "Les contenus déclarés par tes clients arrivent ici."),
        ])
      );
      return;
    }
    liste.replaceChildren(...rows.map(carte));
  }

  function carte(r) {
    // ⚠️ CHAMP VIDE, PAS « 0 ». Le clubbeur ne declare plus ses vues
    // depuis le passage au forfait : `declared_views` vaut 0 pour tout
    // depot reel. Afficher « 0 » se lirait « cette story n'a fait aucune
    // vue », ce qui est faux — personne n'a rien mesure. Le gerant lit le
    // chiffre sur la capture affichee a cote, s'il le veut.
    const vues = h("input", {
      class: "ow-input ow-review-views",
      type: "number",
      min: "0",
      placeholder: "non renseigné",
      value: r.declared_views ? String(r.declared_views) : "",
      "aria-label": "Vues constatées",
    });
    // ⚠️ Le montant ne se DEDUIT plus des vues (0020) mais il se SAISIT
    // (0022). Pas d'ecouteur reliant les deux champs : le nombre de vues
    // ne doit plus jamais piloter le credit, sinon on reintroduit le seul
    // chiffre du produit qu'un clubbeur pouvait gonfler.
    const socle = propose(r);
    const points = h("input", {
      class: "ow-input ow-review-points mono",
      type: "number",
      min: "0",
      max: String(POINTS_MAX),
      step: "10",
      value: String(socle),
      "aria-label": "Points à créditer",
    });

    // Repli visible des qu'on s'ecarte du forfait : le gerant doit pouvoir
    // revenir a la valeur promise au clubbeur sans avoir a la retenir.
    const revenir = h(
      "button",
      {
        class: "ow-review-reset",
        type: "button",
        hidden: true,
        onClick: () => {
          points.value = String(socle);
          points.dispatchEvent(new Event("input"));
        },
      },
      `revenir à ${nf.format(socle)}`
    );
    // ⚠️ Le mot « forfait » ne convient plus a tous les contenus : un
    // TikTok dont les vues ont ete mesurees vaut 60 + 7 pts / 100 vues
    // (0025). On DIT d'ou vient le montant propose — sinon le gerant voit
    // 410 pts sans comprendre pourquoi, et se met a corriger a la main un
    // chiffre pourtant juste.
    const mesure = r.views_source === "tiktok_api" && r.verified_views != null;
    const rappel = h(
      "span",
      { class: "ow-review-forfait" },
      mesure
        ? `${nf.format(socle)} pts · ${nf.format(r.verified_views)} vues comptées par TikTok`
        : `forfait ${nf.format(socle)} pts`
    );

    points.addEventListener("input", () => {
      const v = Number(points.value);
      const ecart = Number.isFinite(v) && v !== socle;
      revenir.hidden = !ecart;
      rappel.hidden = ecart;
      points.classList.toggle("is-custom", ecart);
    });

    const msg = h("p", { class: "ow-review-msg" });
    const valider = h("button", { class: "ow-btn ow-btn-primary" }, "Valider et créditer");
    const refuser = h("button", { class: "ow-btn" }, "Refuser");

    // --- Lecture assistee de la capture -------------------------------
    // L'OCR ne decide RIEN : il propose un chiffre, le gerant tranche.
    // Il ecrit dans une colonne separee (ocr_views) et n'ecrase jamais la
    // declaration du clubbeur.
    const ocrTexte = h("span", { class: "ow-review-ocr-val" }, "");
    const ocrBtn = h("button", { class: "ow-btn ow-review-ocr-btn" }, "Lire la capture");
    const ocrBloc = h("div", { class: "ow-review-ocr" }, [ocrBtn, ocrTexte]);

    // Les erreurs du service de vision arrivent en anglais et en jargon
    // ("You have no credits remaining..."). Un gerant de club n'a pas a
    // lire ca : on traduit ce qui revient souvent, et on garde un repli
    // court pour le reste.
    function traduireOcr(err) {
      const s = String(err || "").toLowerCase();
      if (s.includes("credit") || s.includes("quota") || s.includes("billing"))
        return "service de lecture indisponible (crédits épuisés)";
      if (s.includes("rate limit") || s.includes("429"))
        return "trop de lectures d'un coup, réessaie dans un instant";
      if (s.includes("api key") || s.includes("unauthorized") || s.includes("401"))
        return "service de lecture mal configuré";
      if (s.includes("aucun nombre")) return "aucun nombre de vues trouvé sur la capture";
      if (s.includes("indisponible")) return err;
      return "lecture impossible pour le moment";
    }

    function afficherOcr(lu, err) {
      if (lu == null) {
        ocrTexte.className = "ow-review-ocr-val ow-muted";
        ocrTexte.textContent = err ? traduireOcr(err) : "";
        return;
      }
      const declare = Number(r.declared_views) || 0;
      const ecart = lu - declare;
      const appliquer = h(
        "button",
        {
          class: "ow-review-ocr-apply",
          onClick: () => {
            // ⚠️ Remplit le champ « vues » UNIQUEMENT. Le credit ne s'en
            // deduit plus (0020) : reporter ce chiffre sur les points
            // rebrancherait le calcul aux vues par la bande.
            vues.value = String(lu);
          },
        },
        "appliquer"
      );
      ocrTexte.className = "ow-review-ocr-val" + (ecart !== 0 ? " is-diff" : "");
      ocrTexte.replaceChildren(
        h("span", { class: "mono" }, `Lu sur l'image : ${nf.format(lu)}`),
        ecart !== 0
          ? h("span", { class: "ow-review-ocr-gap" }, `${ecart > 0 ? "+" : ""}${nf.format(ecart)} vs déclaré`)
          : h("span", { class: "ow-review-ocr-ok" }, "conforme"),
        appliquer
      );
    }

    // Resultat d'une lecture precedente, s'il y en a eu une.
    if (r.ocr_views != null || r.ocr_error) afficherOcr(r.ocr_views ?? null, r.ocr_error || null);

    ocrBtn.addEventListener("click", async () => {
      ocrBtn.disabled = true;
      ocrBtn.textContent = "Lecture…";
      const { data, error } = await supabase.functions.invoke("ocr-screenshot", {
        body: { story_id: r.story_id },
      });
      ocrBtn.disabled = false;
      ocrBtn.textContent = "Relire la capture";
      if (error) {
        couperOcr("est indisponible");
        return;
      }
      // Panne de service : inutile de proposer le bouton sur les autres
      // contenus, ils echoueront de la meme facon.
      const s = String(data?.erreur || "").toLowerCase();
      if (s.includes("credit") || s.includes("quota") || s.includes("billing")) {
        couperOcr("est suspendue (crédits épuisés)");
        return;
      }
      if (s.includes("api key") || s.includes("unauthorized") || s.includes("401")) {
        couperOcr("n'est pas configurée");
        return;
      }
      afficherOcr(data?.vues ?? null, data?.erreur || null);
    });

    // La capture vit dans un bucket prive : on genere une URL signee,
    // valable une heure. Pas de lien permanent qui traine.
    const visuel = h("div", { class: "ow-review-shot" }, [h("span", { class: "ow-muted" }, "Chargement de la capture…")]);
    supabase.storage
      .from("story-proofs")
      .createSignedUrl(r.proof_path, 3600)
      .then(({ data, error }) => {
        if (error || !data?.signedUrl) {
          visuel.replaceChildren(h("span", { class: "ow-muted" }, "Capture illisible."));
          return;
        }
        visuel.replaceChildren(
          h("a", { href: data.signedUrl, target: "_blank", rel: "noopener" }, [
            h("img", { src: data.signedUrl, alt: `Capture envoyée par @${r.handle}`, loading: "lazy" }),
          ])
        );
      });

    // Les erreurs de `review_story` remontent en codes bruts
    // (`points_out_of_range`…). Un gerant de club n'a pas a les decoder.
    function traduireErreur(err) {
      const s = String(err || "");
      if (s.includes("points_out_of_range"))
        return `Montant refusé : il doit être compris entre 0 et ${nf.format(POINTS_MAX)} points.`;
      if (s.includes("already_reviewed"))
        return "Ce contenu a déjà été traité (peut-être depuis un autre onglet).";
      if (s.includes("not_owner")) return "Ce contenu n'appartient pas à ton club.";
      if (s.includes("unknown_story")) return "Ce contenu n'existe plus.";
      if (s.includes("invalid_kind")) return "Type de contenu inconnu, impossible de créditer.";
      return s;
    }

    async function trancher(ok) {
      // Garde-fou de saisie AVANT l'aller-retour : la base refuserait de
      // toute facon, autant le dire tout de suite et garder la valeur a
      // l'ecran pour qu'il la corrige.
      const montant = Math.round(Number(points.value));
      if (ok && (!Number.isFinite(montant) || montant < 0 || montant > POINTS_MAX)) {
        msg.className = "ow-review-msg err";
        msg.textContent = `Montant invalide : entre 0 et ${nf.format(POINTS_MAX)} points.`;
        points.focus();
        return;
      }

      valider.disabled = true;
      refuser.disabled = true;
      msg.className = "ow-review-msg";
      msg.textContent = ok ? "Crédit en cours…" : "Refus en cours…";
      const { error } = await supabase.rpc("review_story", {
        p_story: r.story_id,
        p_approve: ok,
        p_views: ok ? Math.max(0, Math.round(Number(vues.value) || 0)) : null,
        // ⚠️ C'EST CE PARAMETRE QUI PORTE LA DECISION DU GERANT (0022).
        // L'envoyer a null retomberait sur le forfait cote base.
        p_points: ok ? montant : null,
      });
      if (error) {
        valider.disabled = false;
        refuser.disabled = false;
        msg.className = "ow-review-msg err";
        msg.textContent = traduireErreur(error.message);
        return;
      }
      await charger();
    }

    valider.addEventListener("click", () => trancher(true));
    refuser.addEventListener("click", () => trancher(false));

    return h("article", { class: "ow-review-card" }, [
      visuel,
      h("div", { class: "ow-review-main" }, [
        h("div", { class: "ow-review-top" }, [
          h("span", { class: "ow-review-handle" }, `@${r.handle || "clubbeur"}`),
          h("span", { class: "ow-review-kind" }, libelle(r.kind)),
          h("span", { class: "ow-review-date" }, dtf.format(new Date(r.submitted_at))),
        ]),

        r.url
          ? h("a", { class: "ow-review-link", href: r.url, target: "_blank", rel: "noopener" }, [
              icon("arrowRight", 14),
              "Ouvrir la publication",
            ])
          : h("p", { class: "ow-review-nolink" }, "Story : pas de lien public, la capture fait foi."),

        h("div", { class: "ow-review-row" }, [
          // ⚠️ Les deux champs ont la MEME structure (libelle / champ /
          // note) : sans ca le libelle en deux morceaux passait a la ligne
          // et decalait le champ « vues » d'une hauteur de ligne par
          // rapport au montant. Les deux se lisent maintenant sur une
          // seule ligne de base.
          h("label", { class: "ow-review-field" }, [
            h("span", {}, "Vues constatées"),
            vues,
            h("span", { class: "ow-review-note ow-review-forfait" }, "sans effet sur le crédit"),
          ]),
          h("label", { class: "ow-review-field ow-review-gain" }, [
            h("span", {}, "Points à créditer"),
            points,
            h("span", { class: "ow-review-note" }, [rappel, revenir]),
          ]),
        ]),

        ocrBloc,

        h("div", { class: "ow-review-actions" }, [valider, refuser]),
        msg,
      ]),
    ]);
  }

  function libelle(k) {
    if (k === "tiktok") return "TikTok";
    if (k === "reel") return "Reel";
    return "Story";
  }
}
