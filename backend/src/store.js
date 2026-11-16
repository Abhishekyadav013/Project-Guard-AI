import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { assessProject } from './riskEngine.js';
import { getDataQuality, validateProject } from './projectData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.PROJECTGUARD_DATA_FILE || path.join(__dirname, '..', 'data', 'store.json');
const dataDir = path.dirname(dataFile);
const makeId = (prefix = 'id') => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const demoNames = [
  ['Indore Ring Road Expansion', 'Road', 'Madhya Pradesh', 'Indore'],
  ['Narmada Bridge Development', 'Bridge', 'Madhya Pradesh', 'Jabalpur'],
  ['District Hospital Expansion', 'Hospital', 'Rajasthan', 'Kota'],
  ['Rural Water Supply Phase II', 'Water Supply', 'Maharashtra', 'Nashik'],
  ['State Highway Improvement Package', 'Highway', 'Uttar Pradesh', 'Varanasi'],
  ['Government School Infrastructure Upgrade', 'School', 'Odisha', 'Cuttack'],
  ['Eastern Rail Overbridge Works', 'Railway', 'West Bengal', 'Howrah'],
  ['Canal Modernization Scheme', 'Irrigation', 'Gujarat', 'Vadodara'],
  ['Substation Capacity Upgrade', 'Power', 'Tamil Nadu', 'Coimbatore'],
  ['District Court Building', 'Government Building', 'Bihar', 'Gaya'],
  ['Coastal Link Road', 'Road', 'Kerala', 'Kollam'],
  ['Riverfront Access Bridge', 'Bridge', 'Assam', 'Guwahati'],
  ['Community Health Centre Network', 'Hospital', 'Jharkhand', 'Ranchi'],
  ['Urban Water Treatment Plant', 'Water Supply', 'Karnataka', 'Mysuru'],
  ['Mountain Highway Safety Works', 'Highway', 'Himachal Pradesh', 'Mandi'],
  ['Model School Campus Phase I', 'School', 'Chhattisgarh', 'Raipur'],
  ['Regional Rail Station Renewal', 'Railway', 'Punjab', 'Ludhiana'],
  ['Lift Irrigation Project', 'Irrigation', 'Telangana', 'Nizamabad'],
  ['Solar Grid Connection Works', 'Power', 'Rajasthan', 'Jodhpur'],
  ['Secretariat Annex Construction', 'Government Building', 'Delhi', 'New Delhi'],
  ['Bypass Road Widening', 'Road', 'Haryana', 'Gurugram'],
  ['High-Level Bridge Package', 'Bridge', 'Andhra Pradesh', 'Vijayawada'],
  ['Medical College Teaching Block', 'Hospital', 'Uttarakhand', 'Dehradun'],
  ['Regional Piped Water Scheme', 'Water Supply', 'Meghalaya', 'Shillong'],
  ['State Highway Renewal Phase III', 'Highway', 'Madhya Pradesh', 'Ujjain'],
  ['Girls School Modernization', 'School', 'Maharashtra', 'Pune'],
  ['Freight Rail Corridor Works', 'Railway', 'Jharkhand', 'Dhanbad'],
  ['Reservoir Feeder Canal', 'Irrigation', 'Odisha', 'Sambalpur'],
  ['Transmission Line Upgrade', 'Power', 'Karnataka', 'Hubballi'],
  ['Public Works Office Complex', 'Government Building', 'Uttar Pradesh', 'Lucknow'],
];

const makeDemoProject = (index) => {
  const [name, projectType, state, district] = demoNames[index];
  const riskBand = index % 5;
  const plannedProgress = riskBand === 0 ? 90 : 40 + ((index * 7) % 46);
  const actualProgress = riskBand === 0
    ? 10
    : riskBand === 1
      ? Math.max(15, plannedProgress - 15)
      : Math.min(100, plannedProgress + (index % 3) * 4);
  const budget = 8_000_000 + index * 725_000;
  const budgetRatio = riskBand === 0 ? 1.1 : riskBand === 1 ? 0.69 : 0.38 + (index % 4) * 0.08;
  const totalMilestones = 6 + (index % 5);
  const delayedMilestones = riskBand === 0 ? totalMilestones : riskBand === 1 ? 2 : index % 3;
  const completedMilestones = Math.min(totalMilestones - delayedMilestones, Math.floor((actualProgress / 100) * totalMilestones));
  const startDate = new Date(Date.UTC(2025, index % 6, 1));
  const endDate = new Date(Date.UTC(2027, 5 + (index % 6), 1));
  const now = new Date();
  const updates = [{
    id: `demo-update-${index + 1}`,
    date: new Date(Date.UTC(2026, index % 10, 5 + (index % 20))).toISOString(),
    title: 'Synthetic monitoring baseline',
    actualProgress,
    financialProgress: Math.round(budgetRatio * 100),
    spent: Math.round(budget * budgetRatio),
    note: 'Demonstration-only synthetic construction monitoring record.',
  }];
  const project = {
    id: `demo-construction-${String(index + 1).padStart(2, '0')}`,
    name,
    projectType,
    department: 'Public Works Department',
    implementingAgency: `${state} Infrastructure Development Agency`,
    location: district,
    district,
    state,
    budget,
    spent: Math.round(budget * budgetRatio),
    plannedProgress,
    actualProgress,
    financialProgress: Math.round(budgetRatio * 100),
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    status: 'Under Construction',
    totalMilestones,
    completedMilestones,
    delayedMilestones,
    contractor: index % 7 === 0 ? '' : `Demonstration Contractor ${String(index + 1).padStart(2, '0')}`,
    revisedCost: index % 6 === 0 ? null : budget * 1.08,
    delayDays: riskBand === 0 ? 60 + index : riskBand === 1 ? 20 + index : 0,
    landAcquisitionStatus: index % 4 === 0 ? 'In progress' : 'Complete',
    tenderStatus: 'Awarded',
    workOrderStatus: 'Issued',
    lastInspectionDate: index % 8 === 0 ? '' : new Date(now.getTime() - (index % 12) * 86_400_000).toISOString(),
    remarks: 'Synthetic demonstration data; not an official project record.',
    dataOrigin: 'Demo / Synthetic Data',
    updatedAt: new Date(now.getTime() - index * 3_600_000).toISOString(),
    updates,
  };
  return withRiskSummary(project);
};

const createSeedProjects = () => demoNames.map((_, index) => makeDemoProject(index));

const withRiskSummary = (project) => ({
  ...project,
  ...assessProject(project),
  dataQuality: getDataQuality(project),
});

const writeFileAtomically = (payload) => {
  const temporaryFile = `${dataFile}.${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(payload, null, 2), { flag: 'wx' });
  fs.renameSync(temporaryFile, dataFile);
};

const ensureStore = () => {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(dataFile)) {
    const projects = createSeedProjects();
    const alerts = projects
      .filter((project) => project.riskScore >= 31)
      .map((project) => ({
        id: makeId('alert'),
        projectId: project.id,
        projectName: project.name,
        level: project.riskLevel,
        score: project.riskScore,
        title: `${project.riskLevel} risk review: ${project.name}`,
        message: project.riskSummary,
        recommendedReview: project.recommendedReview,
        date: project.updatedAt,
        read: false,
      }));
    writeFileAtomically({ projects, alerts, users: [], sessions: [] });
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  } catch (error) {
    throw new Error(`Project data file is unreadable or invalid JSON; it was left unchanged. ${error.message}`);
  }
  if (!parsed || !Array.isArray(parsed.projects) || !Array.isArray(parsed.alerts)) {
    throw new Error('Project data file has an invalid structure; it was left unchanged.');
  }

  const existingDemoIds = new Set(parsed.projects.map((project) => project.id));
  const addedDemoProjects = createSeedProjects().filter((project) => !existingDemoIds.has(project.id));
  const normalizedProjects = parsed.projects.map((project) => {
    const { project: normalized } = validateProject(project);
    return withRiskSummary({ ...normalized, ...project, dataOrigin: project.dataOrigin || 'Demo / Synthetic Data' });
  });
  if (addedDemoProjects.length) normalizedProjects.push(...addedDemoProjects);
  if (addedDemoProjects.length || !Array.isArray(parsed.users) || !Array.isArray(parsed.sessions)
    || parsed.projects.some((project) => !project.projectType || !project.dataOrigin)) {
    const newAlerts = addedDemoProjects
      .filter((project) => project.riskScore >= 31)
      .map((project) => ({
        id: makeId('alert'),
        projectId: project.id,
        projectName: project.name,
        level: project.riskLevel,
        score: project.riskScore,
        title: `${project.riskLevel} risk review: ${project.name}`,
        message: project.riskDrivers.map((item) => item.message).join(' '),
        recommendedReview: project.recommendedReview,
        date: project.updatedAt,
        read: false,
      }));
    writeFileAtomically({
      projects: normalizedProjects,
      alerts: [...newAlerts, ...parsed.alerts],
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    });
  }
};

export const readData = () => {
  ensureStore();
  const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const projects = parsed.projects.map((project) => withRiskSummary(project));
  return {
    projects,
    alerts: parsed.alerts,
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
  };
};

export const saveData = (data) => {
  let existing = { users: [], sessions: [] };
  if (fs.existsSync(dataFile)) {
    existing = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  }
  writeFileAtomically({
    projects: data.projects ?? existing.projects ?? [],
    alerts: data.alerts ?? existing.alerts ?? [],
    users: data.users ?? existing.users ?? [],
    sessions: data.sessions ?? existing.sessions ?? [],
  });
};

export const listProjects = () => {
  const { projects } = readData();
  return [...projects].sort((a, b) => b.riskScore - a.riskScore);
};

export const getProjectById = (projectId) => readData().projects.find((project) => project.id === projectId) || null;

export const listAlerts = () => {
  const { alerts } = readData();
  return [...alerts].sort((a, b) => new Date(b.date) - new Date(a.date));
};

export const markAlertRead = (alertId) => {
  const { projects, alerts } = readData();
  const alert = alerts.find((item) => item.id === alertId);
  if (!alert) return null;
  alert.read = true;
  saveData({ projects, alerts });
  return alert;
};

export const createProjectRecord = (projectInput) => {
  const { projects, alerts } = readData();
  const now = new Date().toISOString();
  const { project: normalized } = validateProject(projectInput);
  const actualProgress = Number(normalized.actualProgress ?? 0);
  const spent = Number(normalized.spent ?? 0);
  const project = withRiskSummary({
    ...normalized,
    id: projectInput.id || makeId('proj'),
    dataOrigin: projectInput.dataOrigin || 'Demo / Synthetic Data',
    updatedAt: now,
    updates: [{
      id: makeId('upd'),
      date: now,
      title: 'Initial baseline recorded',
      actualProgress,
      financialProgress: normalized.financialProgress,
      spent,
      note: normalized.remarks || 'Initial project baseline recorded in the demo workspace.',
    }],
  });
  projects.unshift(project);
  saveData({ projects, alerts });
  return project;
};

export const importProjectRecords = (incomingProjects) => {
  const { projects, alerts } = readData();
  const created = incomingProjects.map((input) => {
    const now = new Date().toISOString();
    const { project: normalized } = validateProject(input, { requireImportFields: true });
    const imported = withRiskSummary({
      ...normalized,
      id: input.id || makeId('proj'),
      dataOrigin: input.dataOrigin || 'User Imported',
      updatedAt: now,
      updates: [{
        id: makeId('upd'),
        date: now,
        title: 'Imported project baseline',
        actualProgress: normalized.actualProgress,
        financialProgress: normalized.financialProgress,
        spent: normalized.spent,
        note: normalized.remarks || 'Record imported by user.',
      }],
    });
    return imported;
  });
  projects.unshift(...created);
  for (const project of created.filter((item) => item.riskLevel !== 'Low')) {
    alerts.unshift({
      id: makeId('alert'),
      projectId: project.id,
      projectName: project.name,
      level: project.riskLevel,
      score: project.riskScore,
      title: `${project.riskLevel} risk review: ${project.name}`,
      message: project.riskDrivers.map((item) => item.message).join(' '),
      recommendedReview: project.recommendedReview,
      date: project.updatedAt,
      read: false,
    });
  }
  saveData({ projects, alerts });
  return created;
};

export const restoreDemoProjects = () => {
  const { projects, alerts } = readData();
  const existingIds = new Set(projects.map((project) => project.id));
  const restored = createSeedProjects().filter((project) => !existingIds.has(project.id));
  projects.push(...restored);
  for (const project of restored.filter((item) => item.riskLevel !== 'Low')) {
    alerts.unshift({
      id: makeId('alert'),
      projectId: project.id,
      projectName: project.name,
      level: project.riskLevel,
      score: project.riskScore,
      title: `${project.riskLevel} risk review: ${project.name}`,
      message: project.riskDrivers.map((item) => item.message).join(' '),
      recommendedReview: project.recommendedReview,
      date: project.updatedAt,
      read: false,
    });
  }
  saveData({ projects, alerts });
  return { restored: restored.length, total: projects.length };
};

export const upsertProjectAlert = (project) => {
  const { projects, alerts } = readData();
  const existingIndex = alerts.findIndex((alert) => alert.projectId === project.id && !alert.read);
  if (project.riskLevel === 'Low') {
    if (existingIndex >= 0) alerts[existingIndex].read = true;
    saveData({ projects, alerts });
    return null;
  }
  const payload = {
    projectId: project.id,
    projectName: project.name,
    level: project.riskLevel,
    score: project.riskScore,
    title: `${project.riskLevel} risk review: ${project.name}`,
    message: project.riskDrivers.map((item) => item.message).join(' '),
    recommendedReview: project.recommendedReview,
    date: new Date().toISOString(),
    read: false,
  };
  let alert;
  if (existingIndex >= 0) {
    alert = { ...alerts[existingIndex], ...payload, id: alerts[existingIndex].id };
    alerts[existingIndex] = alert;
  } else {
    alert = { id: makeId('alert'), ...payload };
    alerts.unshift(alert);
  }
  saveData({ projects, alerts });
  return alert;
};
