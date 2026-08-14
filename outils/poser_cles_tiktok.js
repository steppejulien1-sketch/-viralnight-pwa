// A lancer quand Julien aura rempli C:\Users\stepp\tiktok-cles.txt.
// Pose les deux secrets cote Supabase, puis verifie que la fonction ne
// repond plus `not_configured`. Les valeurs ne sont JAMAIS affichees.
const fs = require("fs");
const V = require("./lib_vn");

const CHEMIN = "C:/Users/stepp/tiktok-cles.txt";

(async () => {
  if (!fs.existsSync(CHEMIN)) {
    console.log("Fichier absent :", CHEMIN, "\n-> voir C:\\Users\\stepp\\tiktok-app-a-creer.txt");
    process.exit(1);
  }
  const txt = fs.readFileSync(CHEMIN, "utf8");
  if (!txt.trim()) {
    console.log("Fichier VIDE (le Bloc-notes n'ecrit qu'au Ctrl+S).");
    process.exit(1);
  }
  const lire = (n) => {
    const m = new RegExp(`^${n}\\s*=\\s*(\\S+)`, "m").exec(txt);
    return m ? m[1] : null;
  };
  const key = lire("TIKTOK_CLIENT_KEY");
  const secret = lire("TIKTOK_CLIENT_SECRET");
  if (!key || !secret) {
    console.log("Format attendu :\n  TIKTOK_CLIENT_KEY=...\n  TIKTOK_CLIENT_SECRET=...");
    process.exit(1);
  }
  console.log(`cle lue (${key.length} caracteres), secret lu (${secret.length} caracteres)`);

  V.mgmt(`/projects/${V.REF}/secrets`, [
    { name: "TIKTOK_CLIENT_KEY", value: key },
    { name: "TIKTOK_CLIENT_SECRET", value: secret },
  ]);
  const noms = V.mgmt(`/projects/${V.REF}/secrets`).map((s) => s.name);
  console.log("secrets TikTok poses :", noms.filter((n) => n.startsWith("TIKTOK")).join(", "));

  // La fonction doit cesser de repondre `not_configured`.
  const r = await fetch(`${V.BASE}/functions/v1/tiktok-auth`, {
    method: "POST",
    headers: { apikey: V.ANON, Authorization: `Bearer ${V.ANON}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const t = await r.text();
  console.log("tiktok-auth ->", r.status, t.slice(0, 200));
  console.log(t.includes("not_configured")
    ? "⚠️ toujours not_configured : les secrets mettent ~30 s a se propager, relancer."
    : "✅ la fonction est configuree.");
  console.log("\n⚠️ Il reste VITE_TIKTOK_CLIENT_KEY a poser sur Vercel (jeton requis).");
})();
