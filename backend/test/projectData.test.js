import test from 'node:test';
import assert from 'node:assert/strict';
import { getDataQuality, validateProject } from '../src/projectData.js';

const validProject = {
  id: 'test-001',
  name: 'Test Road Project',
  projectType: 'Road',
  department: 'Public Works',
  implementingAgency: 'Regional Agency',
  location: 'Indore',
  state: 'Madhya Pradesh',
  district: 'Indore',
  budget: 1_000_000,
  spent: 500_000,
  plannedProgress: 60,
  actualProgress: 50,
  financialProgress: 50,
  startDate: '2025-01-01',
  endDate: '2027-01-01',
  status: 'Under Construction',
  totalMilestones: 5,
  completedMilestones: 2,
  delayedMilestones: 1,
  contractor: 'Demo Contractor',
  lastInspectionDate: '2026-10-01',
};

test('accepts valid construction project data and estimates missing financial progress', () => {
  const { project, errors, warnings } = validateProject({ ...validProject, financialProgress: undefined });
  assert.deepEqual(errors, []);
  assert.equal(project.financialProgress, 50);
  assert.ok(warnings.includes('Financial progress was estimated from expenditure and approved budget.'));
});

test('rejects invalid numbers, dates, and milestone totals', () => {
  const { errors } = validateProject({
    ...validProject,
    budget: -100,
    spent: -10,
    actualProgress: 120,
    plannedProgress: -5,
    startDate: '2026-03-01',
    endDate: '2025-01-01',
    lastInspectionDate: '2026-02-31',
    completedMilestones: 6,
    delayedMilestones: 8,
  });
  assert.ok(errors.some((error) => error.includes('Budget')));
  assert.ok(errors.some((error) => error.includes('Spent')));
  assert.ok(errors.some((error) => error.includes('Actual progress')));
  assert.ok(errors.some((error) => error.includes('Planned progress')));
  assert.ok(errors.some((error) => error.includes('valid date')));
  assert.ok(errors.some((error) => error.includes('after the start date')));
  assert.ok(errors.some((error) => error.includes('Completed milestones')));
  assert.ok(errors.some((error) => error.includes('Delayed milestones')));
});

test('data quality reports missing evidence without treating the project as fully reliable', () => {
  const project = validateProject({ ...validProject, contractor: '', lastInspectionDate: '' }).project;
  const quality = getDataQuality(project);
  assert.ok(quality.score < 100);
  assert.equal(quality.status, 'Warning');
  assert.equal(quality.checks.find((check) => check.label === 'Contractor information').complete, false);
});
