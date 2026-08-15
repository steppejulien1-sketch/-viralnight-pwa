// Pose le secret partage du pont retour cote Supabase (PWA) et deploie
// la fonction `credit-story`.
//
// ⚠️ Le meme secret doit etre pose cote Vercel (B2B) sous le nom
// PWA_BRIDGE_SECRET, avec PWA_FUNCTIONS_URL. Cette partie-la demande un
// jeton Vercel : elle reste manuelle.

const { execFileSync } = require("child_process");
const V = require("./lib_vn.cjs");

const SECRET = process.argv[2];
if (!SECRET || SECRET.length < 16) {
  console.log("usage : node outils/poser_pont_retour.cjs <secret>");
  process.exit(1);
}

V.mgmt(`/projects/${V.REF}/secrets`, [{ name: "B2B_BRIDGE_SECRET", value: SECRET }]);
const noms = V.mgmt(`/projects/${V.REF}/secrets`).map((s) => s.name);
console.log("secret pose :", noms.includes("B2B_BRIDGE_SECRET") ? "OUI" : "NON");

console.log("\ndeploiement de credit-story…");
execFileSync(
  "npx",
  ["-y", "supabase@latest", "functions", "deploy", "credit-story", "--project-ref", V.REF],
  { stdio: "inherit", cwd: `${__dirname}/..`, env: { ...process.env, SUPABASE_ACCESS_TOKEN: V.SBP }, shell: true }
);
