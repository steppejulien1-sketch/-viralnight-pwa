// Section "À valider" (owner) — la file des contenus declares.
//
// C'est le maillon qui manquait : depuis la migration 0014, poster ne
// credite plus rien. Le clubbeur depose sa capture, et RIEN ne se passe
// tant que le club n'a pas tranche ici. Sans cet ecran, les points ne
// seraient jamais verses.
//
// ⚠️ BAREME AU FORFAIT depuis la migration 0020 (2026-08-14).
// Le gerant NE FIXE PLUS LE MONTANT. Avant, il corrigeait le nombre de
// vues et c'est ce chiffre qui determinait le credit ; desormais le
// montant ne depend que du TYPE de contenu. Il lui reste la seule
// decision qui compte : valider, ou refuser.
// Le champ « vues » est conserve a titre indicatif (il alimente
// l'historique), mais il n'a plus aucun effet sur le credit.

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

// Apercu du credit. La base reste seule juge (`story_points`), ceci ne
// sert qu'a montrer au gerant ce qu'il s'apprete a accorder.
//
// ⚠️ Le bareme etait RECOPIE ICI en dur — une quatrieme copie, apres
// mock.js, post-story.js et la fonction SQL. Il lit maintenant
// lib/bareme.js, pour qu'il ne puisse plus diverger.
function apercuPoints(kind) {
  return (BAREME[kind] || BAREME.story).base;
}

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
          h("p", { class: "ow-head-sub" }, `Vérifie que la mention y est, puis crédite. ${phraseBareme("story")}, quel que soit le nombre de vues.`),
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
    const vues = h("input", {
      class: "ow-input ow-review-views",
      type: "number",
      min: "0",
      value: String(r.declared_views ?? 0),
      "aria-label": "Vues constatées",
    });
    // ⚠️ Le montant NE DEPEND PLUS de ce champ : plus d'ecouteur sur la
    // saisie. Le laisser recalculer donnerait au gerant l'illusion qu'il
    // fixe encore le credit.
    const estim = h("span", { class: "ow-review-pts mono" }, `${nf.format(apercuPoints(r.kind))} pts`);

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
            vues.value = String(lu);
            // Sans cet evenement, l'estimation de points resterait sur
            // l'ancienne valeur : elle ecoute "input".
            vues.dispatchEvent(new Event("input"));
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

    async function trancher(ok) {
      valider.disabled = true;
      refuser.disabled = true;
      msg.textContent = ok ? "Crédit en cours…" : "Refus en cours…";
      const { error } = await supabase.rpc("review_story", {
        p_story: r.story_id,
        p_approve: ok,
        p_views: ok ? Math.max(0, Math.round(Number(vues.value) || 0)) : null,
      });
      if (error) {
        valider.disabled = false;
        refuser.disabled = false;
        msg.className = "ow-review-msg err";
        msg.textContent = error.message;
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
          h("label", { class: "ow-review-field" }, [
            h("span", {}, "Vues constatées "),
            h("span", { class: "ow-muted" }, "(pour info)"),
            vues,
          ]),
          h("div", { class: "ow-review-gain" }, [
            h("span", { class: "ow-muted" }, "Crédit — forfait"),
            estim,
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
