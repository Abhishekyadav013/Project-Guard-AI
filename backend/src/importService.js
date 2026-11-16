import { getDataQuality, validateProject } from './projectData.js';

const MAX_IMPORT_ROWS = 500;

const parseCsv = (source) => {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const text = source.replace(/^\uFEFF/, '');

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length < 2) throw new Error('CSV must include a header row and at least one project record.');

  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error('CSV column names cannot be empty.');
  return rows.slice(1).map((cells, rowIndex) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? '').trim();
    });
    record._rowNumber = rowIndex + 2;
    return record;
  });
};

export function parseImportContent(content, format) {
  if (typeof content !== 'string' || !content.trim()) throw new Error('The uploaded file is empty.');
  let records;
  if (format === 'json') {
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw new Error('JSON file is not valid JSON.');
    }
    records = Array.isArray(parsed) ? parsed : parsed?.projects;
    if (!Array.isArray(records)) throw new Error('JSON must contain an array of project records or a projects array.');
  } else if (format === 'csv') {
    records = parseCsv(content);
  } else {
    throw new Error('Only CSV and JSON files are supported.');
  }
  if (records.length === 0) throw new Error('No project records were found in the file.');
  if (records.length > MAX_IMPORT_ROWS) throw new Error(`Import is limited to ${MAX_IMPORT_ROWS} records per file.`);
  return records;
}

export function previewImport(records, existingProjects) {
  if (!Array.isArray(records) || records.length === 0) throw new Error('Provide at least one project record to preview.');
  if (records.length > MAX_IMPORT_ROWS) throw new Error(`Import is limited to ${MAX_IMPORT_ROWS} records per file.`);
  const idsInFile = new Set();
  const existingIds = new Set(existingProjects.map((project) => String(project.id)));
  const rows = records.map((record, index) => {
    const result = validateProject(record, { requireImportFields: true });
    const id = record?.id ? String(record.id).trim() : '';
    const duplicate = id && (existingIds.has(id) || idsInFile.has(id));
    if (id) idsInFile.add(id);
    if (duplicate) result.errors.push(`Duplicate project ID: ${id}.`);
    const dataQuality = getDataQuality(result.project);
    return {
      rowNumber: record?._rowNumber || index + 1,
      valid: result.errors.length === 0,
      project: result.project,
      errors: result.errors,
      warnings: result.warnings,
      dataQuality,
    };
  });
  return {
    total: rows.length,
    valid: rows.filter((row) => row.valid).length,
    warning: rows.filter((row) => row.valid && row.warnings.length > 0).length,
    invalid: rows.filter((row) => !row.valid).length,
    rows,
  };
}

export const SAMPLE_CSV = [
  'id,name,projectType,department,implementingAgency,location,district,state,budget,spent,plannedProgress,actualProgress,financialProgress,startDate,endDate,status,totalMilestones,completedMilestones,delayedMilestones,contractor,revisedCost,delayDays,landAcquisitionStatus,tenderStatus,workOrderStatus,lastInspectionDate,remarks',
  'sample-road-001,"Demo, Road Improvement",Road,Public Works Department,State Infrastructure Agency,Indore,Indore,Madhya Pradesh,10000000,4500000,55,48,45,2025-01-01,2027-01-01,Under Construction,8,3,1,Demo Contractor,11000000,12,Complete,Awarded,Issued,2026-10-10,"Synthetic sample only"',
  'sample-water-002,Rural Water Supply Phase II,Water Supply,Water Resources,Regional Water Agency,Nashik,Nashik,Maharashtra,8500000,2200000,40,38,26,2025-03-01,2027-06-30,Under Construction,6,2,0,Demo Contractor,8500000,0,In progress,Awarded,Issued,2026-10-15,"Synthetic sample only"',
].join('\n');
