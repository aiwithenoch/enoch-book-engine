/* ============================================================================
   verify-book.mjs - the complete authoring gate
   ----------------------------------------------------------------------------
   Runs build, fit checking, screenshots and structural visual checks in one
   command. The first run stops at visual review with exit code 2. An agent must
   open the listed PNGs, especially pages with diagrams, and then rerun with
   --ack-visual.

   Usage:
     node engine/tools/verify-book.mjs books/<slug>
     node engine/tools/verify-book.mjs books/<slug> --ack-visual
     node engine/tools/verify-book.mjs books/<slug> --edition free --ack-visual
   ============================================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const bookDirArg = argv.find((arg) => !arg.startsWith('--'));
if (!bookDirArg) {
  console.error('Usage: node engine/tools/verify-book.mjs books/<slug> [--edition <name>] [--ack-visual]');
  process.exit(1);
}

const bookDir = path.resolve(bookDirArg);
const editionIndex = argv.indexOf('--edition');
const edition = editionIndex === -1 ? null : argv[editionIndex + 1];
const acknowledged = argv.includes('--ack-visual');
const slug = path.basename(bookDir);
const jsonPath = path.join(bookDir, 'book.json');
if (!fs.existsSync(jsonPath)) {
  console.error(`No book.json in ${bookDir}`);
  process.exit(1);
}

const book = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const generated = path.join(bookDir, edition ? `book-${edition}.html` : 'book.html');
const toolsDir = path.dirname(fileURLToPath(import.meta.url));
const node = process.execPath;

const run = (label, tool, args) => {
  console.log(`\n== ${label} ==`);
  const result = spawnSync(node, [path.join(toolsDir, tool), ...args], { stdio: 'inherit' });
  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
};

let status = run('build', 'build-book.mjs', [bookDir, ...(edition ? ['--edition', edition] : [])]);
if (status === 0) status = run('fit check', 'check.mjs', [generated]);
if (status === 0) status = run('screenshots', 'shot.mjs', [generated]);
if (status === 0) status = run('visual QA', 'visual-check.mjs', [generated, ...(acknowledged ? ['--ack-visual'] : [])]);

if (status === 2) {
  console.log(`\n${slug}: screenshots are ready for the required visual review. After opening them, rerun:`);
  console.log(`npm run verify -- books/${slug} --ack-visual`);
}
process.exitCode = status;
