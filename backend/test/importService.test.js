import test from 'node:test';
import assert from 'node:assert/strict';
import { parseImportContent, previewImport } from '../src/importService.js';

test('parses quoted CSV values and escaped quotes', () => {
  const rows = parseImportContent('name,remarks\n"Bridge, Phase 2","The ""north"" section"', 'csv');
  assert.equal(rows[0].name, 'Bridge, Phase 2');
  assert.equal(rows[0].remarks, 'The "north" section');
});

test('rejects empty CSV, malformed JSON, and unsupported formats', () => {
  assert.throws(() => parseImportContent('', 'csv'), /empty/);
  assert.throws(() => parseImportContent('{bad json', 'json'), /valid JSON/);
  assert.throws(() => parseImportContent('data', 'xlsx'), /Only CSV and JSON/);
});

test('flags duplicate IDs and invalid project rows in preview', () => {
  const duplicateRecord = {
    id: 'same-id',
    name: 'Sample project',
    department: 'Works',
    location: 'Indore',
    budget: '1000000',
    spent: '500000',
    plannedProgress: '50',
    actualProgress: '45',
    startDate: '2025-01-01',
    endDate: '2027-01-01',
  };
  const preview = previewImport([
    duplicateRecord,
    { ...duplicateRecord, name: 'Second project' },
    { ...duplicateRecord, id: 'invalid', budget: 'not-money' },
  ], []);
  assert.equal(preview.total, 3);
  assert.equal(preview.valid, 1);
  assert.equal(preview.invalid, 2);
  assert.ok(preview.rows[1].errors.some((error) => error.includes('Duplicate')));
});

test('rejects imports above the configured safe batch size', () => {
  const records = Array.from({ length: 501 }, () => ({}));
  assert.throws(() => parseImportContent(JSON.stringify(records), 'json'), /limited to 500/);
  assert.throws(() => previewImport(records, []), /limited to 500/);
});
