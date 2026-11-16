import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { assessProject } from './riskEngine.js';
import { getDataQuality, validateProject } from './projectData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataFile = process.env.PROJECTGUARD_DATA_FILE || path.join(__dirname, '..', 'data', 'store.json');
const dataDir = path.dirname(dataFile);
const SUPABASE_TABLE = 'projectguard_records';
const SUPABASE_BATCH_SIZE = 100;
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

const getSupabaseConfig = () => {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (url && key) return { url: url.replace(/\/+$/, ''), key };
  if (url || key || process.env.VERCEL === '1') {
    const error = new Error('Persistent storage is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    error.status = 503;
    throw error;
  }
  return null;
};

const supabaseRequest = async (config, search, options = {}) => {
  const response = await fetch(`${config.url}/rest/v1/${SUPABASE_TABLE}${search}`, {
    ...options,
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`Supabase storage request failed (${response.status}): ${detail}`);
    error.status = 502;
    try {
      error.code = JSON.parse(detail).code;
    } catch {
      error.code = undefined;
    }
    throw error;
  }
  return response.status === 204 ? null : response.json();
};

const readSupabaseRecords = async (config, kind) => {
  const records = [];
  for (let offset = 0; ; offset += 1000) {
    const rows = await supabaseRequest(
      config,
      `?kind=eq.${kind}&select=id,data&order=id.asc`,
      { headers: { Range: `${offset}-${offset + 999}` } },
    );
    records.push(...rows.map((row) => row.data));
    if (rows.length < 1000) return records;
  }
};

const upsertSupabaseRecords = async (config, kind, records) => {
  for (let offset = 0; offset < records.length; offset += SUPABASE_BATCH_SIZE) {
    const rows = records.slice(offset, offset + SUPABASE_BATCH_SIZE).map((data) => ({
      id: kind === 'session' ? data.tokenHash : data.id,
      kind,
      data,
    }));
    await supabaseRequest(config, '?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
  }
};

const saveSupabaseData = async (config, data) => {
  for (const [kind, records] of [
    ['project', data.projects],
    ['alert', data.alerts],
    ['user', data.users],
    ['session', data.sessions],
  ]) {
    if (records) await upsertSupabaseRecords(config, kind, records);
  }
};

export const removeSession = async (tokenHash) => {
  const config = getSupabaseConfig();
  if (config) {
    await supabaseRequest(config, `?id=eq.${encodeURIComponent(tokenHash)}&kind=eq.session`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    return;
  }
  ensureStore();
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  data.sessions = data.sessions.filter((session) => session.tokenHash !== tokenHash);
  writeFileAtomically(data);
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

const readLocalData = () => {
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

const readSupabaseData = async (config) => {
  const [storedProjects, storedAlerts, users, sessions] = await Promise.all([
    readSupabaseRecords(config, 'project'),
    readSupabaseRecords(config, 'alert'),
    readSupabaseRecords(config, 'user'),
    readSupabaseRecords(config, 'session'),
  ]);
  const existingDemoIds = new Set(storedProjects.map((project) => project.id));
  const addedDemoProjects = createSeedProjects().filter((project) => !existingDemoIds.has(project.id));
  const projects = storedProjects.map((project) => {
    const { project: normalized } = validateProject(project);
    return withRiskSummary({ ...normalized, ...project, dataOrigin: project.dataOrigin || 'Demo / Synthetic Data' });
  });
  projects.push(...addedDemoProjects);
  let alerts = storedAlerts;
  if (!storedProjects.length || addedDemoProjects.length) {
    const seedProjects = !storedProjects.length ? projects : addedDemoProjects;
    const seedAlerts = seedProjects
      .filter((project) => project.riskScore >= 31)
      .map((project) => ({
        id: `demo-alert-${project.id}`,
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
    alerts = [...seedAlerts, ...storedAlerts];
  }
  if (!storedProjects.length || addedDemoProjects.length) {
    await saveSupabaseData(config, { projects, alerts });
  }
  return { projects, alerts, users, sessions };
};

export const readData = async () => {
  const config = getSupabaseConfig();
  return config ? readSupabaseData(config) : readLocalData();
};

export const saveData = async (data) => {
  const config = getSupabaseConfig();
  if (config) return saveSupabaseData(config, data);
  let existing = { users: [], sessions: [] };
  if (fs.existsSync(dataFile)) {
    existing = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  }
  const mergeById = (current = [], updates = [], getId = (record) => record.id) => {
    const records = new Map(current.map((record) => [getId(record), record]));
    for (const record of updates) records.set(getId(record), record);
    return [...records.values()];
  };
  writeFileAtomically({
    projects: mergeById(existing.projects, data.projects),
    alerts: mergeById(existing.alerts, data.alerts),
    users: mergeById(existing.users, data.users),
    sessions: mergeById(existing.sessions, data.sessions, (session) => session.tokenHash),
  });
};

export const listProjects = async () => {
  const { projects } = await readData();
  return [...projects].sort((a, b) => b.riskScore - a.riskScore);
};

export const getProjectById = async (projectId) => (await readData()).projects.find((project) => project.id === projectId) || null;

export const listAlerts = async () => {
  const { alerts } = await readData();
  return [...alerts].sort((a, b) => new Date(b.date) - new Date(a.date));
};

export const markAlertRead = async (alertId) => {
  const { alerts } = await readData();
  const alert = alerts.find((item) => item.id === alertId);
  if (!alert) return null;
  alert.read = true;
  await saveData({ alerts: [alert] });
  return alert;
};

export const createProjectRecord = async (projectInput) => {
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
  await saveData({ projects: [project] });
  return project;
};

export const importProjectRecords = async (incomingProjects) => {
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
  const alerts = [];
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
  await saveData({ projects: created, alerts });
  return created;
};

export const restoreDemoProjects = async () => {
  const { projects } = await readData();
  const existingIds = new Set(projects.map((project) => project.id));
  const restored = createSeedProjects().filter((project) => !existingIds.has(project.id));
  const alerts = [];
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
  await saveData({ projects: restored, alerts });
  return { restored: restored.length, total: projects.length + restored.length };
};

export const upsertProjectAlert = async (project) => {
  const { alerts } = await readData();
  const existingIndex = alerts.findIndex((alert) => alert.projectId === project.id && !alert.read);
  if (project.riskLevel === 'Low') {
    if (existingIndex < 0) return null;
    alerts[existingIndex].read = true;
    await saveData({ alerts: [alerts[existingIndex]] });
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
  }
  await saveData({ alerts: [alert] });
  return alert;
};
