const { createHash } = require('node:crypto');
const manifest = require('../../dashboard/app/release-manifest.json');

function currentRelease() {
  const release = manifest.releases.find((item) => item.version === manifest.currentVersion);
  if (!release || release.status !== manifest.status) {
    throw new Error('Le manifeste de version FyxBot est incohérent.');
  }
  return Object.freeze({
    product: manifest.product,
    version: release.version,
    status: release.status,
    statusLabel: release.statusLabel,
    releasedAt: release.releasedAt,
    changelogPath: manifest.changelogPath,
  });
}

function publishedReleases() {
  return manifest.releases
    .filter((release) => release.status === 'available')
    .map((release) => {
      const fingerprint = createHash('sha256').update(JSON.stringify(release)).digest('hex').slice(0, 16);
      return {
        id: `${release.version}-${fingerprint}`,
        version: release.version,
        date: release.dateLabel,
        title: release.title,
        changes: release.changes.map(([icon, title, description]) => ({
          section: `${icon} ${title}`,
          text: description,
        })),
      };
    });
}

module.exports = { currentRelease, publishedReleases, releaseManifest: manifest };
