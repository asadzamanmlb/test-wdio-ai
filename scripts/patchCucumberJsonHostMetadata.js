/**
 * Overwrite host OS metadata in reports/json/*.json before HTML generation.
 *
 * wdio-cucumberjs-json-reporter often writes platform.version as "Version not known" because
 * session capabilities drop `cjson:metadata` and `browser.requestedCapabilities` may be empty
 * at onRunnerStart. multiple-cucumber-html-reporter ignores `report.generate({ metadata })`
 * when the JSON already has metadata — so we patch the JSON on disk.
 */
const fs = require('fs');
const path = require('path');
const { getCjsonMetadata } = require('../config/cjsonRunMetadata');

/**
 * @param {string} [jsonDir] resolved from cwd if relative
 * @returns {{ files: number, patched: number }}
 */
function patchCucumberJsonHostMetadata(jsonDir) {
  const dir = path.resolve(process.cwd(), jsonDir || path.join('reports', 'json'));
  if (!fs.existsSync(dir)) return { files: 0, patched: 0 };

  const host = getCjsonMetadata();
  let patched = 0;
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

  for (const name of names) {
    const full = path.join(dir, name);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (_) {
      continue;
    }
    const wasArray = Array.isArray(data);
    const arr = wasArray ? data : [data];
    let touched = false;
    for (const feature of arr) {
      if (!feature || typeof feature !== 'object') continue;
      if (!feature.metadata) feature.metadata = {};
      feature.metadata.platform = {
        ...(feature.metadata.platform || {}),
        name: host.platform.name,
        version: host.platform.version,
      };
      feature.metadata.device = host.device;
      touched = true;
    }
    if (touched) {
      const out = wasArray ? arr : arr[0];
      fs.writeFileSync(full, `${JSON.stringify(out, null, 2)}\n`);
      patched += 1;
    }
  }

  return { files: names.length, patched };
}

module.exports = { patchCucumberJsonHostMetadata };
