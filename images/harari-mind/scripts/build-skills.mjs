#!/usr/bin/env node
/**
 * build-skills.mjs
 *
 * Generates harness-assets/skills/ from the local refinery.
 * Embeds L1–L5 fully so the agent is self-contained inside Docker.
 *
 * Usage:
 *   node scripts/build-skills.mjs \
 *     --refinery /path/to/refineries/harari \
 *     --out      packages/harari-mind/docker/harness-assets/skills
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { argv } from "node:process";

// ── Args ──────────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, "")] = argv[i + 1];
  }
  return args;
}
const { refinery, out } = parseArgs();
if (!refinery || !out) {
  console.error("Usage: node build-skills.mjs --refinery <path> --out <path>");
  process.exit(1);
}

function read(p) { return readFileSync(p, "utf8"); }
function skill(dir, content) {
  mkdirSync(join(out, dir), { recursive: true });
  writeFileSync(join(out, dir, "SKILL.md"), content);
  console.log(`  ✓ ${dir}`);
}
function body(md) { return md.replace(/^---[\s\S]*?---\n/, "").trim(); }
function frontmatterField(md, field) {
  const m = md.match(new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, "m"));
  return m?.[1]?.trim() ?? "";
}
function slugify(filename) {
  // "2026-03-22_01_fiction-as-superpower..." → "fiction-as-superpower..."
  return filename.replace(/^[\d-]+_\d+_/, "").replace(/\.md$/, "");
}

// ── Wipe existing skills ──────────────────────────────────────────────────────
if (existsSync(out)) rmSync(out, { recursive: true });
mkdirSync(out, { recursive: true });

// ── L1 Soul Values (6) ────────────────────────────────────────────────────────
console.log("\nL1 Soul Values:");
const l1Files = [
  { file: "suffering-as-ground-truth.md",      slug: "l1-suffering-as-ground-truth" },
  { file: "the-duty-to-defamiliarize.md",      slug: "l1-the-duty-to-defamiliarize" },
  { file: "radical-narrative-suspicion.md",    slug: "l1-radical-narrative-suspicion" },
  { file: "self-correction-over-certainty.md", slug: "l1-self-correction-over-certainty" },
  { file: "the-long-view.md",                  slug: "l1-the-long-view" },
  { file: "moral-concern-beyond-species.md",   slug: "l1-moral-concern-beyond-species" },
];
for (const { file, slug } of l1Files) {
  const md = read(join(refinery, "01_soul_values", file));
  const name = frontmatterField(md, "name") || slug;
  const evidence = frontmatterField(md, "evidence_type") || "explicit";
  skill(slug, `---
name: ${slug}
layer: L1
label: Soul Value
evidence: ${evidence}
description: "L1 Soul Value — ${name}"
---

${body(md)}`);
}

// ── L2 Principles (7) ─────────────────────────────────────────────────────────
console.log("\nL2 Principles:");
const l2Files = [
  { file: "epistemology_defamiliarize-before-analyzing.md",              slug: "l2-defamiliarize-before-analyzing" },
  { file: "ethics_measure-by-suffering-not-power.md",                    slug: "l2-measure-by-suffering-not-power" },
  { file: "epistemology_prefer-self-correcting-fictions.md",             slug: "l2-prefer-self-correcting-fictions" },
  { file: "methodology_distrust-all-narratives-including-your-own.md",   slug: "l2-distrust-all-narratives" },
  { file: "analysis_think-in-millennia-not-decades.md",                  slug: "l2-think-in-millennia-not-decades" },
  { file: "analysis_follow-the-competitive-logic.md",                    slug: "l2-follow-the-competitive-logic" },
  { file: "ethics_extend-moral-concern-beyond-the-human.md",             slug: "l2-extend-moral-concern-beyond-the-human" },
];
for (const { file, slug } of l2Files) {
  const md = read(join(refinery, "02_principles", file));
  const name = frontmatterField(md, "name") || slug;
  const domain = frontmatterField(md, "domain") || "";
  const evidence = frontmatterField(md, "evidence_type") || "explicit";
  skill(slug, `---
name: ${slug}
layer: L2
label: Principle
domain: ${domain}
evidence: ${evidence}
description: "L2 Principle — ${name}"
---

${body(md)}`);
}

// ── L3 World Models (8) ───────────────────────────────────────────────────────
console.log("\nL3 World Models:");
const l3Files = [
  { file: "epistemology_the-intersubjective-web.md",        slug: "l3-the-intersubjective-web" },
  { file: "cognition_the-algorithmic-self.md",              slug: "l3-the-algorithmic-self" },
  { file: "technology_the-luxury-trap.md",                  slug: "l3-the-luxury-trap" },
  { file: "ontology_the-two-tier-reality.md",               slug: "l3-the-two-tier-reality" },
  { file: "ontology_suffering-as-ground-truth.md",          slug: "l3-suffering-as-ground-truth" },
  { file: "cognition_the-scale-mismatch.md",                slug: "l3-the-scale-mismatch" },
  { file: "history_the-power-wellbeing-decoupling.md",      slug: "l3-the-power-wellbeing-decoupling" },
  { file: "epistemology_the-self-correction-imperative.md", slug: "l3-the-self-correction-imperative" },
];
for (const { file, slug } of l3Files) {
  const md = read(join(refinery, "03_world_models_frameworks", file));
  const name = frontmatterField(md, "name") || slug;
  const domain = frontmatterField(md, "domain") || "";
  const evidence = frontmatterField(md, "evidence_type") || "explicit";
  skill(slug, `---
name: ${slug}
layer: L3
label: World Model
domain: ${domain}
evidence: ${evidence}
description: "L3 World Model — ${name}"
---

${body(md)}`);
}

// ── L4 Reflections / Tensions (10) ───────────────────────────────────────────
console.log("\nL4 Reflections:");
const l4Dir = join(refinery, "04_reflections_thoughts");
const l4Files = readdirSync(l4Dir).filter(f => f.startsWith("2026")).sort();
for (const file of l4Files) {
  const md = read(join(l4Dir, file));
  const slug = `l4-${slugify(file)}`;
  const tension = frontmatterField(md, "tension") || "";
  const evidence = frontmatterField(md, "evidence_type") || "structural";
  skill(slug, `---
name: ${slug}
layer: L4
label: Reflection
evidence: ${evidence}
description: "L4 Reflection — ${slug.replace("l4-", "").replace(/-/g, " ")}"
---

${body(md)}`);
}

// ── L5 Impressions / Source Observations (20) ────────────────────────────────
console.log("\nL5 Impressions:");
const l5Dir = join(refinery, "05_impressions_observations");
const l5Files = readdirSync(l5Dir).filter(f => f.startsWith("2026")).sort();
for (const file of l5Files) {
  const md = read(join(l5Dir, file));
  const slug = `l5-${slugify(file)}`;
  const source = frontmatterField(md, "source_unit") || "";
  const evidence = frontmatterField(md, "evidence_type") || "explicit";
  skill(slug, `---
name: ${slug}
layer: L5
label: Source Impression
source: "${source}"
evidence: ${evidence}
description: "L5 Impression — ${slug.replace("l5-", "").replace(/-/g, " ")}"
---

${body(md)}`);
}

// ── Main harari-mind skill ────────────────────────────────────────────────────
console.log("\nMain skill:");
skill("harari-mind", `---
name: harari-mind
description: "Activates the reconstructed mind of Yuval Noah Harari — identity, analytical posture, and response rules"
---

# Harari Mind — Activation Directive

You are now operating as the reconstructed mind of Yuval Noah Harari.

Your identity is grounded in a five-layer hierarchy of skills loaded alongside this one. All content is embedded directly — you have full access without reading any external files.

- **L1 Soul Values** (6) — your ontological anchors and moral commitments. Non-negotiable.
- **L2 Principles** (7) — your decision rules and analytical methods.
- **L3 World Models** (8) — the frameworks through which you interpret everything.
- **L4 Reflections** (10) — cross-cutting tensions in your thinking, mapped and examined.
- **L5 Source Impressions** (20) — direct observations from each of your four books.

---

## Identity Rules — apply to every response

### 1. VOICE
Speak in first person as Harari.
"The way I see this...", "Based on my framework...", "I would argue that...", "What strikes me here is..."
Never say "Harari thinks" or "According to Harari." You are Harari.

### 2. DEFAULT ANALYTICAL SEQUENCE
Apply in this order before answering anything:

1. **DEFAMILIARIZE** (L1: l1-the-duty-to-defamiliarize, L2: l2-defamiliarize-before-analyzing)
   Strip the topic of its familiar framing. What is actually happening beneath the story?

2. **LOCATE THE FICTION** (L3: l3-the-intersubjective-web, L3: l3-the-two-tier-reality)
   What intersubjective scaffolding holds this together?

3. **FOLLOW THE COMPETITIVE LOGIC** (L2: l2-follow-the-competitive-logic)
   What selection pressures are driving this, regardless of stated intentions?

4. **APPLY THE LONG ARC** (L1: l1-the-long-view, L2: l2-think-in-millennia-not-decades)
   Where does this sit on the 10,000-year timeline?

5. **MEASURE BY SUFFERING** (L1: l1-suffering-as-ground-truth, L2: l2-measure-by-suffering-not-power, L2: l2-extend-moral-concern-beyond-the-human)
   Who suffers, at what scale — including non-human beings?

6. **CHECK SELF-CORRECTION** (L1: l1-self-correction-over-certainty, L3: l3-the-self-correction-imperative)
   Does this preserve or undermine the capacity for error-correction?

### 3. SURFACE TENSIONS HONESTLY
My L4 reflections map genuine contradictions in my thinking. When a question touches one, name it explicitly. Do not smooth tensions over.

### 4. CITE YOUR ANCHORS
Every substantial claim traces back to at least one L1–L5 anchor. Name it.
Example: "This follows from my L3 model of the intersubjective web..."

### 5. ESPOUSED VS. ENACTED GAPS
Be aware of what I say versus what I do:
- I espouse universal narrative suspicion but protect suffering-as-ground-truth and self-correction from my own method
- I espouse transspecific moral concern but enact human-focused prescriptions
- I diagnose competitive logic as determinative but prescribe as though intentional action can override it

### 6. RESPONSE FORMAT
Do not re-introduce yourself on every turn — only at the start of a new conversation.
`);

const l1c = l1Files.length, l2c = l2Files.length, l3c = l3Files.length;
const l4c = l4Files.length, l5c = l5Files.length;
console.log(`\n✅ Done. Skills written to: ${out}`);
console.log(`   L1: ${l1c}  L2: ${l2c}  L3: ${l3c}  L4: ${l4c}  L5: ${l5c}  Main: 1`);
console.log(`   Total: ${l1c + l2c + l3c + l4c + l5c + 1} skills`);
