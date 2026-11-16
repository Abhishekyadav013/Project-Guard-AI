import express from 'express';
import cors from 'cors';
import { assessProject } from './riskEngine.js';
import { getDataQuality, validateProject } from './projectData.js';
import { parseImportContent, previewImport, SAMPLE_CSV } from './importService.js';
import {
  destroySession,
  getSessionUser,
  loginAccount,
  registerAccount,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from './authService.js';
import {
  createProjectRecord,
  getProjectById,
  importProjectRecords,
  listAlerts,
  listProjects,
  markAlertRead,
  readData,
  restoreDemoProjects,
  saveData,
} from './store.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const CLOSED_STATUSES = new Set(['Completed', 'Cancelled']);
const ACTIVE_STATUSES = new Set(['Tendering', 'Awarded', 'Under Construction', 'Active', 'Delayed']);

app.use(cors());
app.use(express.json({ limit: '5mb' }));

const average = (values) => values.length
  ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1))
  : 0;

const asyncRoute = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const buildDashboard = async () => {
  const { projects, alerts } = await readData();
  const distribution = {
    low: projects.filter((project) => project.riskLevel === 'Low').length,
    medium: projects.filter((project) => project.riskLevel === 'Medium').length,
    high: projects.filter((project) => project.riskLevel === 'High').length,
  };
  const updatedProjects = [...projects].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  const qualityScores = projects.map((project) => getDataQuality(project).score);
  return {
    totalProjects: projects.length,
    activeProjects: projects.filter((project) => ACTIVE_STATUSES.has(project.status)).length,
    highRisk: distribution.high,
    mediumRisk: distribution.medium,
    lowRisk: distribution.low,
    averageProgress: average(projects.map((project) => Number(project.actualProgress) || 0)),
    averageFinancialProgress: average(projects.map((project) => Number(project.financialProgress) || 0)),
    delayedProjects: projects.filter((project) => project.status === 'Delayed' || Number(project.delayDays) > 0).length,
    openAlerts: alerts.filter((alert) => !alert.read).length,
    reviewedAlerts: alerts.filter((alert) => alert.read).length,
    distribution,
    totalBudget: projects.reduce((sum, project) => sum + (Number(project.budget) || 0), 0),
    totalSpent: projects.reduce((sum, project) => sum + (Number(project.spent) || 0), 0),
    averageDataQuality: average(qualityScores),
    projectsWithDataWarnings: qualityScores.filter((score) => score < 100).length,
    priorityProjects: [...projects].sort((a, b) => b.riskScore - a.riskScore).slice(0, 6),
    recentlyUpdated: updatedProjects.slice(0, 5),
  };
};

const buildInsights = async () => {
  const projects = await listProjects();
  const riskCauses = new Map();
  const typeRisk = new Map();
  for (const project of projects) {
    for (const item of project.riskDrivers || []) {
      if (item.name === 'Current Indicators') continue;
      riskCauses.set(item.name, (riskCauses.get(item.name) || 0) + 1);
    }
    const type = project.projectType || 'Other';
    const item = typeRisk.get(type) || { projectType: type, count: 0, averageRisk: 0, riskTotal: 0 };
    item.count += 1;
    item.riskTotal += project.riskScore;
    item.averageRisk = Math.round(item.riskTotal / item.count);
    typeRisk.set(type, item);
  }
  return {
    distribution: {
      low: projects.filter((project) => project.riskLevel === 'Low').length,
      medium: projects.filter((project) => project.riskLevel === 'Medium').length,
      high: projects.filter((project) => project.riskLevel === 'High').length,
    },
    riskCauses: [...riskCauses].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    projectTypes: [...typeRisk.values()].sort((a, b) => b.averageRisk - a.averageRisk),
    projects,
  };
};

const updateAlertForProject = (alerts, project) => {
  const existingIndex = alerts.findIndex((alert) => alert.projectId === project.id && !alert.read);
  if (project.riskLevel === 'Low') {
    if (existingIndex >= 0) alerts[existingIndex].read = true;
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
  if (existingIndex >= 0) {
    alerts[existingIndex] = { ...alerts[existingIndex], ...payload, id: alerts[existingIndex].id };
    return alerts[existingIndex];
  }
  const alert = { id: `alert-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`, ...payload };
  alerts.unshift(alert);
  return alert;
};

const getCookieToken = (req) => {
  const cookie = req.headers.cookie?.split(';').map((item) => item.trim())
    .find((item) => item.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return '';
  try {
    return decodeURIComponent(cookie.slice(SESSION_COOKIE.length + 1));
  } catch {
    return '';
  }
};

const setSessionCookie = (res, token) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}${secure}`);
};

const clearSessionCookie = (res) => {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
};

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'ProjectGuard AI prototype API is running.', prototype: true });
});

app.get('/api/auth/me', asyncRoute(async (req, res) => {
  const user = await getSessionUser(getCookieToken(req));
  if (!user) return res.status(401).json({ success: false, message: 'Sign in to continue.' });
  return res.json({ user });
}));

app.post('/api/auth/register', async (req, res) => {
  try {
    const result = await registerAccount(req.body || {});
    setSessionCookie(res, result.sessionToken);
    return res.status(201).json({ user: result.user });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return res.status(status).json({
      success: false,
      message: status === 503
        ? 'Account storage is not configured or available. Please contact the app administrator.'
        : status >= 500
          ? 'Unable to create the account right now. Check the server logs and try again.'
          : error.message,
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const result = await loginAccount(req.body || {});
    setSessionCookie(res, result.sessionToken);
    return res.json({ user: result.user });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error(error);
    return res.status(status).json({
      success: false,
      message: status === 503
        ? 'Account storage is not configured or available. Please contact the app administrator.'
        : status >= 500
          ? 'Unable to sign in right now. Check the server logs and try again.'
          : error.message,
    });
  }
});

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  await destroySession(getCookieToken(req));
  clearSessionCookie(res);
  return res.json({ success: true });
}));

app.use('/api', asyncRoute(async (req, res, next) => {
  if (req.path === '/health' || req.path === '/auth/me' || req.path.startsWith('/auth/')) return next();
  const user = await getSessionUser(getCookieToken(req));
  if (!user) return res.status(401).json({ success: false, message: 'Your session expired. Please sign in again.' });
  req.user = user;
  return next();
}));

app.get('/api/dashboard', asyncRoute(async (_req, res) => res.json(await buildDashboard())));
app.get('/api/insights', asyncRoute(async (_req, res) => res.json(await buildInsights())));

app.get('/api/projects', asyncRoute(async (_req, res) => res.json({ projects: await listProjects() })));

app.get('/api/projects/:id/updates', asyncRoute(async (req, res) => {
  const project = await getProjectById(req.params.id);
  if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
  return res.json({ updates: project.updates || [] });
}));

app.get('/api/projects/:id', asyncRoute(async (req, res) => {
  const project = await getProjectById(req.params.id);
  if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
  return res.json({ project });
}));

app.post('/api/projects', asyncRoute(async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const result = validateProject({
    ...body,
    spent: body.spent ?? 0,
    actualProgress: body.actualProgress ?? 0,
    totalMilestones: body.totalMilestones ?? 5,
    completedMilestones: body.completedMilestones ?? 0,
    delayedMilestones: body.delayedMilestones ?? 0,
    status: body.status ?? 'Under Construction',
  });
  if (result.errors.length) return res.status(400).json({ success: false, message: result.errors.join(' ') });
  if (req.body?.id && await getProjectById(String(req.body.id))) {
    return res.status(409).json({ success: false, message: 'A project with this ID already exists.' });
  }
  const project = await createProjectRecord({
    ...result.project,
    dataOrigin: 'Demo / Synthetic Data',
  });
  return res.status(201).json({ project, dataQuality: getDataQuality(project) });
}));

app.post('/api/projects/:id/updates', asyncRoute(async (req, res) => {
  const project = await getProjectById(req.params.id);
  if (!project) return res.status(404).json({ success: false, message: 'Project not found.' });
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const updateDate = body.updateDate || new Date().toISOString();
  if (Number.isNaN(new Date(updateDate).getTime())) {
    return res.status(400).json({ success: false, message: 'Update date must be a valid date.' });
  }
  if (body.note !== undefined && (typeof body.note !== 'string' || body.note.length > 2000)) {
    return res.status(400).json({ success: false, message: 'Remarks must be 2,000 characters or fewer.' });
  }
  const nextCandidate = {
    ...project,
    actualProgress: body.actualProgress,
    financialProgress: body.financialProgress ?? project.financialProgress,
    spent: body.spent,
    completedMilestones: body.completedMilestones ?? project.completedMilestones,
    delayedMilestones: body.delayedMilestones ?? project.delayedMilestones,
    status: body.status ?? project.status,
    remarks: body.note ?? project.remarks,
    updatedAt: new Date(updateDate).toISOString(),
  };
  const validation = validateProject(nextCandidate);
  if (validation.errors.length) {
    return res.status(400).json({ success: false, message: validation.errors.join(' ') });
  }
  const previous = { riskScore: project.riskScore, riskLevel: project.riskLevel };
  const update = {
    id: `upd-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    date: new Date(updateDate).toISOString(),
    title: 'Progress update recorded',
    actualProgress: validation.project.actualProgress,
    financialProgress: validation.project.financialProgress,
    spent: validation.project.spent,
    completedMilestones: validation.project.completedMilestones,
    delayedMilestones: validation.project.delayedMilestones,
    status: validation.project.status,
    note: body.note || 'Project progress update recorded.',
  };
  const updatedProject = {
    ...validation.project,
    ...assessProject(validation.project),
    dataQuality: getDataQuality(validation.project),
    updates: [...(project.updates || []), update],
  };
  const { projects, alerts } = await readData();
  const projectIndex = projects.findIndex((item) => item.id === project.id);
  projects[projectIndex] = updatedProject;
  const previousOpenAlert = alerts.find((item) => item.projectId === project.id && !item.read);
  const alert = updateAlertForProject(alerts, updatedProject);
  const changedAlerts = alert ? [alert] : previousOpenAlert?.read ? [previousOpenAlert] : [];
  await saveData({ projects: [updatedProject], alerts: changedAlerts });
  return res.json({
    project: updatedProject,
    alert,
    previousRisk: previous,
    riskChange: {
      score: updatedProject.riskScore - previous.riskScore,
      levelChanged: updatedProject.riskLevel !== previous.riskLevel,
    },
  });
}));

app.get('/api/alerts', asyncRoute(async (req, res) => {
  let alerts = await listAlerts();
  if (['Low', 'Medium', 'High'].includes(req.query.level)) alerts = alerts.filter((alert) => alert.level === req.query.level);
  if (req.query.state === 'open') alerts = alerts.filter((alert) => !alert.read);
  if (req.query.state === 'reviewed') alerts = alerts.filter((alert) => alert.read);
  res.json({ alerts });
}));

app.patch('/api/alerts/:id/read', asyncRoute(async (req, res) => {
  const alert = await markAlertRead(req.params.id);
  if (!alert) return res.status(404).json({ success: false, message: 'Alert not found.' });
  return res.json({ alert });
}));

app.get('/api/import/sample-csv', (_req, res) => {
  res.type('text/csv').attachment('projectguard-synthetic-sample.csv').send(SAMPLE_CSV);
});

app.post('/api/demo/restore', asyncRoute(async (_req, res) => {
  return res.json({ success: true, ...await restoreDemoProjects() });
}));

app.post('/api/import/preview', asyncRoute(async (req, res) => {
  let records;
  try {
    records = Array.isArray(req.body?.records)
      ? req.body.records
      : parseImportContent(req.body?.content, req.body?.format);
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  return res.json({ preview: previewImport(records, await listProjects()) });
}));

app.post('/api/import/projects', asyncRoute(async (req, res) => {
  const records = req.body?.records;
  if (!Array.isArray(records) || records.length === 0) {
    return res.status(400).json({ success: false, message: 'Provide at least one valid project record to import.' });
  }
  const preview = previewImport(records, await listProjects());
  const validRecords = preview.rows.filter((row) => row.valid).map((row) => row.project);
  if (!validRecords.length) {
    return res.status(400).json({ success: false, message: 'No valid records are available to import.', preview });
  }
  const projects = await importProjectRecords(validRecords);
  return res.status(201).json({
    success: true,
    imported: projects.length,
    skipped: preview.invalid,
    projects,
    preview,
  });
}));

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ success: false, message: 'Request body must contain valid JSON.' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, message: 'Request is too large. Import files must be under 5 MB.' });
  }
  console.error(err);
  const status = err?.status === 503 ? 503 : 500;
  return res.status(status).json({
    success: false,
    message: status === 503
      ? 'Persistent storage is not configured or available. Check the backend configuration and server logs.'
      : 'Unable to process the request. Check the server logs and preserve the existing project data file.',
  });
});

app.listen(PORT, () => {
  console.log(`ProjectGuard AI backend listening on http://localhost:${PORT}`);
});
