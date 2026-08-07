// Section "À valider" (owner) — la file des contenus declares.
//
// C'est le maillon qui manquait : depuis la migration 0014, poster ne
// credite plus rien. Le clubbeur depose sa capture, et RIEN ne se passe
// tant que le club n'a pas tranche ici. Sans cet ecran, les points ne
// seraient jamais verses.
//
// Le gerant peut corriger le nombre de vues avant de valider : c'est lui
// qui a la capture sous les yeux, le chiffre saisi par le clubbeur n'est
// qu'une declaration.

import { h, icon } from "../../lib/dom.js";
import { supabase } from "../../lib/supabase.js";

const nf = new Intl.NumberFormat("fr-FR");
const dtf = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

// Bareme d'affichage. La base reste seule juge (story_points), ceci ne
// sert qu'a montrer au gerant ce qu'il s'apprete a accorder.
function apercuPoints(kind, vues) {
  const v = Math.max(0, Math.floor(Number(vues) || 0));
  return kind === "story"
    ? 100 + Math.min(Math.floor(v / 100) * 20, 2000)
    : 60 + Math.min(Math.floor(v / 100) * 7, 2000);
}

export async function ReviewAdmin(mount, club) {
  const liste = h("div", { class: "ow-review" }, [h("p", { class: "ow-muted" }, "Chargement…")]);
  const compteur = h("span", { class: "ow-badge" }, "");

  mount.replaceChildren(
    h("div", { class: "ow-section" }, [
      h("div", { class: "ow-head" }, [
        h("div", {}, [
          h("h1", {}, ["À valider", compteur]),
          h("p", { class: "ow-head-sub" }, "Vérifie la capture, corrige les vues si besoin, puis crédite."),
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
    const estim = h("span", { class: "ow-review-pts mono" }, `${nf.format(apercuPoints(r.kind, r.declared_views))} pts`);
    vues.addEventListener("input", () => {
      estim.textContent = `${nf.format(apercuPoints(r.kind, vues.value))} pts`;
    });

    const msg = h("p", { class: "ow-review-msg" });
    const valider = h("button", { class: "ow-btn ow-btn-primary" }, "Valider et créditer");
    const refuser = h("button", { class: "ow-btn" }, "Refuser");

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
          h("label", { class: "ow-review-field" }, [h("span", {}, "Vues constatées"), vues]),
          h("div", { class: "ow-review-gain" }, [h("span", { class: "ow-muted" }, "Crédit"), estim]),
        ]),

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
