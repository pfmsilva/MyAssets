/** Release information captured at build time (see next.config.ts). */
export const VERSION = {
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0",
  sha: process.env.NEXT_PUBLIC_GIT_SHA ?? "",
  shortSha: (process.env.NEXT_PUBLIC_GIT_SHA ?? "").slice(0, 7),
  branch: process.env.NEXT_PUBLIC_GIT_BRANCH ?? "",
  buildDate: process.env.NEXT_PUBLIC_BUILD_DATE ?? "",
  env: process.env.NEXT_PUBLIC_VERCEL_ENV ?? "",
};

export function versionLabel() {
  const parts = [`v${VERSION.version}`];
  if (VERSION.shortSha) parts.push(VERSION.shortSha);
  if (VERSION.buildDate) parts.push(new Date(VERSION.buildDate).toLocaleDateString("pt-PT", { timeZone: "Europe/Lisbon" }));
  return parts.join(" · ");
}

export function versionTitle() {
  return [
    `Versão ${VERSION.version}`,
    VERSION.sha ? `commit ${VERSION.sha}${VERSION.branch ? ` (${VERSION.branch})` : ""}` : null,
    VERSION.buildDate ? `build ${new Date(VERSION.buildDate).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" })}` : null,
    VERSION.env ? `ambiente ${VERSION.env}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
