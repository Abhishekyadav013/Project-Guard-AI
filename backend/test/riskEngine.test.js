import test from 'node:test';
import assert from 'node:assert/strict';
import { assessProject } from '../src/riskEngine.js';

const baseProject = {
  budget: 10_000_000,
  spent: 4_000_000,
  plannedProgress: 60,
  actualProgress: 55,
  financialProgress: 40,
  startDate: '2025-01-01',
  endDate: '2027-01-01',
  status: 'Under Construction',
  totalMilestones: 8,
  completedMilestones: 4,
  delayedMilestones: 0,
};

test('returns bounded, explainable rule-based risk and recommendations', () => {
  const result = assessProject(baseProject, new Date('2026-01-01'));
  assert.ok(result.riskScore >= 0 && result.riskScore <= 100);
  assert.ok(['Low', 'Medium', 'High'].includes(result.riskLevel));
  assert.ok(result.riskDrivers.every((item) => item.name && item.severity && item.message));
  assert.ok(result.recommendedReview.length > 0);
});

test('flags high financial progress compared with physical progress', () => {
  const result = assessProject({ ...baseProject, financialProgress: 80, actualProgress: 35 }, new Date('2026-01-01'));
  assert.ok(result.riskDrivers.some((item) => item.name.includes('Cost') || item.name.includes('Financial')));
});

test('completed and cancelled projects are not assigned active delivery risk', () => {
  assert.equal(assessProject({ ...baseProject, status: 'Completed' }).riskScore, 0);
  assert.equal(assessProject({ ...baseProject, status: 'Cancelled' }).riskScore, 0);
});
