const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '..');
const roots = ['src', 'scripts'];

function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return javascriptFiles(target);
      return entry.isFile() && entry.name.endsWith('.js') ? [target] : [];
    });
}

const files = roots
  .flatMap((directory) => javascriptFiles(path.join(projectRoot, directory)))
  .sort((left, right) => left.localeCompare(right, 'fr'));

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
  if (result.status === 0) continue;
  process.stderr.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  process.exit(result.status || 1);
}

console.log(`[FyxBot] Syntaxe valide pour ${files.length} fichiers JavaScript.`);
