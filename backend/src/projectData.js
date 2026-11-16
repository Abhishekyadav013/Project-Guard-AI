export const PROJECT_STATUSES = [
  'Planned',
  'Tendering',
  'Awarded',
  'Under Construction',
  'Active',
  'Delayed',
  'On Hold',
  'Completed',
  'Cancelled',
];

const optionalTextFields = [
  'projectType',
  'implementingAgency',
  'district',
  'state',
  'contractor',
  'landAcquisitionStatus',
  'tenderStatus',
  'workOrderStatus',
  'remarks',
];

const isValidDate = (value) => {
  if (typeof value !== 'string' || !value.trim()) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return date.toISOString().slice(0, 10) === value;
  return true;
};

const parseNumber = (value) => {
  if (value === '' || value === null || value === undefined) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
};

export function validateProject(input, { requireImportFields = false } = {}) {
  const errors = [];
  const warnings = [];
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const project = { ...source };

  for (const field of ['name', 'department', 'location']) {
    if (typeof source[field] !== 'string' || !source[field].trim()) {
      if (field === 'department' && !requireImportFields) project.department = 'Unspecified';
      else if (field === 'location' && !requireImportFields) project.location = 'Unspecified';
      else errors.push(`${field} is required.`);
    } else if (source[field].trim().length > 160) {
      errors.push(`${field} must be 160 characters or fewer.`);
    } else {
      project[field] = source[field].trim();
    }
  }

  project.projectType = String(source.projectType || 'Other').trim() || 'Other';
  project.implementingAgency = String(source.implementingAgency || source.department || 'Unspecified').trim();
  for (const field of optionalTextFields) {
    if (field in source) project[field] = String(source[field] ?? '').trim();
  }

  const budget = parseNumber(source.budget);
  const spent = parseNumber(source.spent);
  const plannedProgress = parseNumber(source.plannedProgress);
  const actualProgress = parseNumber(source.actualProgress);
  const financialProgress = parseNumber(source.financialProgress);
  const totalMilestones = parseNumber(source.totalMilestones ?? 5);
  const completedMilestones = parseNumber(source.completedMilestones ?? 0);
  const delayedMilestones = parseNumber(source.delayedMilestones ?? 0);
  const revisedCost = parseNumber(source.revisedCost);
  const delayDays = parseNumber(source.delayDays ?? 0);

  if (budget === undefined || budget <= 0) errors.push('Budget must be a valid number greater than zero.');
  if (spent === undefined || spent < 0) errors.push('Spent must be a valid number greater than or equal to zero.');
  if (plannedProgress === undefined || plannedProgress < 0 || plannedProgress > 100) {
    errors.push('Planned progress must be between 0 and 100.');
  }
  if (actualProgress === undefined || actualProgress < 0 || actualProgress > 100) {
    errors.push('Actual progress must be between 0 and 100.');
  }
  if (financialProgress !== undefined && (financialProgress < 0 || financialProgress > 100)) {
    errors.push('Financial progress must be between 0 and 100.');
  }
  if (!isValidDate(source.startDate)) errors.push('Start date must be a valid date.');
  if (!isValidDate(source.endDate)) errors.push('End date must be a valid date.');
  if (isValidDate(source.startDate) && isValidDate(source.endDate) && new Date(source.endDate) <= new Date(source.startDate)) {
    errors.push('Completion date must be after the start date.');
  }
  if (!Number.isInteger(totalMilestones) || totalMilestones < 1) errors.push('Total milestones must be a positive whole number.');
  if (!Number.isInteger(completedMilestones) || completedMilestones < 0) errors.push('Completed milestones must be a non-negative whole number.');
  if (!Number.isInteger(delayedMilestones) || delayedMilestones < 0) errors.push('Delayed milestones must be a non-negative whole number.');
  if (Number.isInteger(totalMilestones) && Number.isInteger(completedMilestones) && completedMilestones > totalMilestones) {
    errors.push('Completed milestones cannot exceed total milestones.');
  }
  if (Number.isInteger(totalMilestones) && Number.isInteger(delayedMilestones) && delayedMilestones > totalMilestones) {
    errors.push('Delayed milestones cannot exceed total milestones.');
  }
  if (revisedCost !== undefined && revisedCost <= 0) errors.push('Revised cost must be greater than zero when provided.');
  if (!Number.isInteger(delayDays) || delayDays < 0) errors.push('Delay days must be a non-negative whole number.');
  if (!PROJECT_STATUSES.includes(source.status || 'Active')) {
    errors.push(`Status must be one of: ${PROJECT_STATUSES.join(', ')}.`);
  }
  if (source.lastInspectionDate && !isValidDate(source.lastInspectionDate)) {
    errors.push('Last inspection date must be a valid date.');
  }

  if (requireImportFields) {
    for (const field of ['budget', 'spent', 'plannedProgress', 'actualProgress', 'startDate', 'endDate']) {
      if (source[field] === '' || source[field] === undefined || source[field] === null) {
        errors.push(`${field} is required for import.`);
      }
    }
  }

  if (budget !== undefined) project.budget = budget;
  if (spent !== undefined) project.spent = spent;
  if (plannedProgress !== undefined) project.plannedProgress = plannedProgress;
  if (actualProgress !== undefined) project.actualProgress = actualProgress;
  project.financialProgress = financialProgress ?? (budget > 0 ? Math.min(100, (spent / budget) * 100) : 0);
  project.totalMilestones = totalMilestones ?? 5;
  project.completedMilestones = completedMilestones ?? 0;
  project.delayedMilestones = delayedMilestones ?? 0;
  project.revisedCost = revisedCost ?? null;
  project.delayDays = delayDays ?? 0;
  project.startDate = isValidDate(source.startDate) ? new Date(source.startDate).toISOString() : '';
  project.endDate = isValidDate(source.endDate) ? new Date(source.endDate).toISOString() : '';
  project.status = source.status || 'Active';
  project.updatedAt = source.updatedAt || new Date().toISOString();
  project.updates = Array.isArray(source.updates) ? source.updates : [];

  if (source.financialProgress === '' || source.financialProgress === null || source.financialProgress === undefined) {
    warnings.push('Financial progress was estimated from expenditure and approved budget.');
  }
  for (const field of ['contractor', 'implementingAgency', 'state', 'district', 'lastInspectionDate']) {
    if (!project[field]) warnings.push(`${field} information is missing.`);
  }

  return { project, errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

export function getDataQuality(project) {
  const checks = [
    { label: 'Budget available', complete: Number(project.budget) > 0 },
    { label: 'Progress available', complete: Number.isFinite(Number(project.actualProgress)) && Number.isFinite(Number(project.plannedProgress)) },
    { label: 'Dates valid', complete: isValidDate(project.startDate) && isValidDate(project.endDate) },
    { label: 'Milestones available', complete: Number(project.totalMilestones) > 0 },
    { label: 'Contractor information', complete: Boolean(project.contractor) },
    { label: 'Implementing agency', complete: Boolean(project.implementingAgency) },
    { label: 'Recent inspection', complete: Boolean(project.lastInspectionDate && isValidDate(project.lastInspectionDate)) },
  ];
  const complete = checks.filter((check) => check.complete).length;
  return {
    score: Math.round((complete / checks.length) * 100),
    status: complete === checks.length ? 'Valid' : complete >= 4 ? 'Warning' : 'Invalid',
    checks,
  };
}
