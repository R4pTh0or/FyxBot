const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { currentRelease, publishedReleases, releaseManifest } = require('../src/services/releaseManifest');

const root = path.resolve(__dirname, '..');

test('utilise une version FyxBot unique pour le bot, le panel et le changelog', () => {
  const botPackage = require('../package.json');
  const panelPackage = require('../dashboard/package.json');
  const current = currentRelease();

  assert.equal(releaseManifest.currentVersion, botPackage.version);
  assert.equal(releaseManifest.currentVersion, panelPackage.version);
  assert.equal(current.version, releaseManifest.currentVersion);
  assert.equal(current.status, 'available');
  assert.match(readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8'), new RegExp(`^## \\[${current.version.replaceAll('.', '\\.') }\\]`, 'm'));
  const discordRelease = publishedReleases()[0];
  assert.equal(discordRelease.version, current.version);
  assert.equal(discordRelease.title, releaseManifest.releases[0].title);
  assert.ok(discordRelease.changes.length > 0);
});

test('conserve un manifeste de versions ordonné, complet et sans doublon', () => {
  const versions = releaseManifest.releases.map((release) => release.version);
  assert.equal(new Set(versions).size, versions.length);
  assert.equal(versions[0], releaseManifest.currentVersion);
  for (const release of releaseManifest.releases) {
    assert.match(release.version, /^\d+\.\d+\.\d+$/);
    assert.equal(Number.isNaN(Date.parse(release.releasedAt)), false);
    assert.ok(release.title && release.intro && release.changes.length > 0);
  }
});
