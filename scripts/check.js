'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TARGET_DIRS = ['src', 'scripts'];
const TARGET_FILES = ['error_gen.js'];

const collectJsFiles = ({ dir }) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectJsFiles({ dir: fullPath }));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
};

const runCheck = ({ file }) => {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: ROOT,
    encoding: 'utf8'
  });

  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }

  return result.status ?? 1;
};

const main = () => {
  const files = [
    ...TARGET_FILES.map((fileName) => path.join(ROOT, fileName)),
    ...TARGET_DIRS.flatMap((dirName) => {
      return collectJsFiles({ dir: path.join(ROOT, dirName) });
    })
  ];

  let failed = false;

  for (const file of files) {
    const status = runCheck({ file });

    if (status !== 0) {
      failed = true;
    }
  }

  if (failed) {
    process.exitCode = 1;
    return;
  }

  console.log(`Checked ${files.length} JavaScript files.`);
};

main();
