// Writes psql variables (the checkbox payloads) from assets/legal-docs.js, so tests always use the real fingerprints.
const w = {}; eval(require('fs').readFileSync(__dirname + '/../../assets/legal-docs.js', 'utf8').replace('window.', 'w.'));
const d = w.PorchlightLegal.docs, q = (s) => s.replace(/'/g, "''");
const mk = (keys) => q(JSON.stringify(keys.map((k) => ({ doc_key: k, version: d[k].version, sha256: d[k].hash, text: 'I agree to the ' + d[k].title + ' for this booking.' }))));
const lines = [
  "\\set owner_docs '" + mk(['terms', 'privacy', 'owner', 'animals', 'home-safety']) + "'",
  "\\set owner_overnight '" + mk(['terms', 'privacy', 'owner', 'animals', 'home-safety', 'overnight']) + "'",
  "\\set sitter_app '" + mk(['terms', 'privacy', 'bgcheck']) + "'",
  "\\set stale '" + q(JSON.stringify([{ doc_key: 'terms', version: d.terms.version, sha256: '0'.repeat(64), text: 'I agree to the terms.' }])) + "'"
];
process.stdout.write(lines.join('\n') + '\n');
