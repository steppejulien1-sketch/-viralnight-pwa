// Section "QR code" (owner) — l'affiche a coller au bar.
//
// C'est le pont entre les deux produits : le QR porte l'adresse du club,
// et c'est LUI qui fait apparaitre le bon nom sur l'ecran d'accueil du
// clubbeur. Avant, le slug etait ecrit en dur cote client : tous les QR
// menaient au meme etablissement fictif.
//
// Le QR est genere dans le navigateur (librairie `qrcode`, deja utilisee
// pour les tickets de retrait). Aucun service externe : l'adresse d'un
// club n'a pas a transiter par un generateur tiers.

import { h, icon } from "../../lib/dom.js";
import { supabase } from "../../lib/supabase.js";
import { urlDuClub } from "../../lib/club.js";
import QRCode from "qrcode";

export async function QrAdmin(mount, club) {
  const lien = urlDuClub(club.slug, window.location.origin);

  // Fond blanc et modules noirs : un QR doit rester lisible imprime, et
  // la plupart des lecteurs echouent sur un code clair sur fond sombre.
  const canvas = h("canvas", { class: "ow-qr-canvas", "aria-label": `QR code du ${club.name}` });

  const champLien = h("input", { class: "ow-input ow-qr-link", value: lien, readonly: true });
  const msg = h("p", { class: "ow-qr-msg" });

  async function copier() {
    try {
      await navigator.clipboard.writeText(lien);
      msg.textContent = "Lien copié.";
    } catch {
      champLien.select();
      msg.textContent = "Copie manuelle : le lien est sélectionné.";
    }
  }

  function telecharger() {
    // toDataURL sur un canvas deja dessine : pas de second rendu, donc
    // l'image telechargee est exactement celle affichee.
    const a = h("a", {
      href: canvas.toDataURL("image/png"),
      download: `qr-${club.slug}.png`,
    });
    a.click();
  }

  mount.replaceChildren(
    h("div", { class: "ow-section" }, [
      h("div", { class: "ow-head" }, [
        h("div", {}, [
          h("h1", {}, "QR code"),
          h("p", { class: "ow-head-sub" }, "À coller au bar et à l'entrée. C'est lui qui ouvre ta soirée."),
        ]),
      ]),

      h("div", { class: "ow-qr-wrap" }, [
        h("div", { class: "ow-qr-card" }, [
          h("div", { class: "ow-qr-frame" }, [canvas]),
          h("p", { class: "ow-qr-club" }, club.name),
          h("p", { class: "ow-qr-baseline" }, "Scanne · poste ta soirée · récupère ta récompense"),
        ]),

        h("div", { class: "ow-qr-side" }, [
          h("h2", {}, "Ce que voit ton client"),
          h("ol", { class: "ow-qr-steps" }, [
            h("li", {}, [h("strong", {}, "Il scanne"), " avec l'appareil photo de son téléphone."]),
            h("li", {}, [
              h("strong", {}, `Ton club s'affiche : ${club.name}`),
              ". Pas d'app à installer, pas de compte à créer pour regarder.",
            ]),
            h("li", {}, [h("strong", {}, "Il voit tes récompenses"), " et ce qu'il doit faire pour les obtenir."]),
          ]),

          h("label", { class: "ow-field" }, [
            h("span", {}, "Adresse encodée"),
            h("div", { class: "ow-qr-row" }, [
              champLien,
              h("button", { class: "ow-btn", onClick: copier }, "Copier"),
            ]),
          ]),
          msg,

          h("div", { class: "ow-qr-actions" }, [
            h("button", { class: "ow-btn ow-btn-primary", onClick: telecharger }, [icon("scan", 17), "Télécharger le QR"]),
            h("button", { class: "ow-btn", onClick: () => window.print() }, "Imprimer"),
          ]),

          h("p", { class: "ow-qr-note" }, [
            icon("check", 13),
            " Le QR ne change jamais, même si tu modifies tes récompenses ou le nom affiché. Tu peux l'imprimer une fois pour toutes.",
          ]),
        ]),
      ]),
    ])
  );

  // Genere apres le montage : le canvas doit etre dans le document pour
  // que la librairie puisse le dimensionner.
  await QRCode.toCanvas(canvas, lien, {
    margin: 1,
    width: 320,
    errorCorrectionLevel: "M",
    color: { dark: "#000000", light: "#ffffff" },
  });

  // Le slug est la cle du QR : s'il change, tous les codes imprimes
  // deviennent caducs. On le signale plutot que de laisser la surprise.
  const { data } = await supabase.from("clubs").select("slug").eq("id", club.id).maybeSingle();
  if (data && data.slug !== club.slug) {
    msg.className = "ow-qr-msg err";
    msg.textContent = "L'identifiant du club a changé : réimprime tes QR.";
  }
}
