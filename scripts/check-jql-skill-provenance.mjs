import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const skillRoot = resolve(repositoryRoot, "skills/judgeval-jql");
const manifest = JSON.parse(
  await readFile(resolve(skillRoot, "source.json"), "utf8"),
);
const expectedPaths = [
  "SKILL.md",
  "full.md",
  "references/python.md",
  "references/typescript.md",
];

if (!/^[0-9a-f]{40}$/.test(manifest.commit)) {
  throw new Error("source.json must record a full immutable source commit SHA");
}

if (
  JSON.stringify(Object.keys(manifest.files).sort()) !==
  JSON.stringify(expectedPaths.sort())
) {
  throw new Error(
    "source.json must hash exactly the four published skill files",
  );
}

for (const [path, expectedHash] of Object.entries(manifest.files)) {
  if (!/^[0-9a-f]{64}$/.test(expectedHash)) {
    throw new Error(`${path} must have a valid SHA-256 hash`);
  }

  const contents = await readFile(resolve(skillRoot, path));
  const actualHash = createHash("sha256").update(contents).digest("hex");
  if (actualHash !== expectedHash) {
    throw new Error(
      `${path} does not match source.json: expected ${expectedHash}, got ${actualHash}`,
    );
  }
}

console.log(
  `Verified ${Object.keys(manifest.files).length} Judgeval JQL artifacts from ${manifest.repository}@${manifest.commit}`,
);
