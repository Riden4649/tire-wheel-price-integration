#!/usr/bin/env node
import fs from 'node:fs';

const path = new URL('../app/data/vehicles_2012_2026.json', import.meta.url);
const data = JSON.parse(fs.readFileSync(path, 'utf8'));

const keepCode = new Map([
  ['RAV4 PHV', /\bAXAP\d+/],
  ['アルファードハイブリッド', /\b(?:AAHH|AYH|ATH)\d+/],
  ['アルファードPHEV', /\bAAHP\d+/],
  ['ヴェルファイアハイブリッド', /\b(?:AAHH|AYH|ATH)\d+/],
  ['ヴェルファイアPHEV', /\bAAHP\d+/],
  ['ハリアーPHEV', /\bAXUP\d+/],
  ['エクリプスクロスPHEV', /\bGL3W\b/],
]);

const rejectModels = new Set(['eKカスタム', 'eKスペースカスタム']);
const removed = [];
data.vehicles = data.vehicles.filter((record) => {
  if (rejectModels.has(record.model)) {
    removed.push(record);
    return false;
  }
  const matcher = keepCode.get(record.model);
  if (!matcher) return true;
  const codes = [record.generation, ...(record.model_codes || [])].join(' ');
  if (matcher.test(codes)) return true;
  removed.push(record);
  return false;
});

data.record_count = data.vehicles.length;
fs.writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
console.log(JSON.stringify({ removed: removed.length, recordCount: data.record_count,
  byModel: Object.groupBy(removed, (record) => record.model) }, null, 2));
