import { useEffect, useMemo, useState } from 'react';
import Modal from './components/Modal';
import RiskBadge from './components/RiskBadge';
import AuthPage from './components/AuthPage';
import { IconChart, IconFolder, IconPlus, IconShield } from './components/Icons';
import {
  addProjectUpdate,
  createProject,
  getCurrentUser,
  logout,
  fetchInsights,
  fetchAlerts,
  fetchDashboard,
  fetchProject,
  fetchProjects,
  importProjects,
  markAlertReviewed,
  previewImport as requestImportPreview,
  restoreDemoProjects,
} from './api';

const ROLE_OPTIONS = ['Monitoring Officer', 'Project Officer', 'Senior Officer', 'Admin'];

const initialProjectForm = {
  name: '',
  projectType: 'Road',
  department: '',
  implementingAgency: '',
  location: '',
  district: '',
  state: '',
  budget: '',
  startDate: '',
  endDate: '',
  plannedProgress: 0,
  totalMilestones: 5,
  contractor: '',
  revisedCost: '',
  landAcquisitionStatus: 'Not assessed',
  tenderStatus: 'Not started',
  workOrderStatus: 'Not issued',
};

const formatDate = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatCurrency = (value) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const getScoreLabel = (value) => {
  if (value >= 61) return 'High';
  if (value >= 31) return 'Medium';
  return 'Low';
};

function App() {
  const [selectedRole, setSelectedRole] = useState('Monitoring Officer');
  const [authUser, setAuthUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [dashboard, setDashboard] = useState(null);
  const [projects, setProjects] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorText, setErrorText] = useState('');
  const [savingProject, setSavingProject] = useState(false);
  const [savingUpdate, setSavingUpdate] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importFileName, setImportFileName] = useState('');
  const [importMessage, setImportMessage] = useState('');
  const [riskChange, setRiskChange] = useState(null);
  const [alertLevelFilter, setAlertLevelFilter] = useState('all');
  const [alertStateFilter, setAlertStateFilter] = useState('all');
  const [projectTypeFilter, setProjectTypeFilter] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [districtFilter, setDistrictFilter] = useState('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [projectSort, setProjectSort] = useState('risk');
  const [insights, setInsights] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [newProjectForm, setNewProjectForm] = useState(initialProjectForm);
  const [updateForm, setUpdateForm] = useState({
    updateDate: new Date().toISOString().slice(0, 10),
    actualProgress: 0,
    financialProgress: 0,
    spent: 0,
    completedMilestones: 0,
    delayedMilestones: 0,
    status: 'Under Construction',
    note: '',
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const loadData = async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const [dashboardData, projectsData, alertsData] = await Promise.all([
        fetchDashboard(),
        fetchProjects(),
        fetchAlerts(),
      ]);
      setDashboard(dashboardData);
      setProjects(projectsData.projects || []);
      setAlerts(alertsData.alerts || []);
      setInsights(await fetchInsights());
      setErrorText('');
    } catch (error) {
      setErrorText(error.message || 'Unable to load ProjectGuard AI data.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    getCurrentUser()
      .then(({ user }) => setAuthUser(user))
      .catch(() => setAuthUser(null))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (authUser) loadData(true);
    else setLoading(false);
  }, [authUser]);

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      setAuthUser(null);
      setDashboard(null);
      setProjects([]);
      setAlerts([]);
      setActiveTab('overview');
    }
  };

  const projectTypes = useMemo(() => [...new Set(projects.map((project) => project.projectType).filter(Boolean))].sort(), [projects]);
  const projectStates = useMemo(() => [...new Set(projects.map((project) => project.state).filter(Boolean))].sort(), [projects]);
  const projectDistricts = useMemo(() => [...new Set(projects
    .filter((project) => stateFilter === 'all' || project.state === stateFilter)
    .map((project) => project.district).filter(Boolean))].sort(), [projects, stateFilter]);
  const departments = useMemo(() => [...new Set(projects.map((project) => project.department).filter(Boolean))].sort(), [projects]);

  const filteredProjects = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    const filtered = (projects || []).filter((project) => {
      const matchesQuery =
        !query ||
        String(project.name || '').toLowerCase().includes(query) ||
        String(project.department || '').toLowerCase().includes(query) ||
        String(project.location || '').toLowerCase().includes(query) ||
        String(project.projectType || '').toLowerCase().includes(query) ||
        String(project.state || '').toLowerCase().includes(query);

      const matchesRisk = riskFilter === 'all' || project.riskLevel === riskFilter;
      const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
      const matchesType = projectTypeFilter === 'all' || project.projectType === projectTypeFilter;
      const matchesState = stateFilter === 'all' || project.state === stateFilter;
      const matchesDistrict = districtFilter === 'all' || project.district === districtFilter;
      const matchesDepartment = departmentFilter === 'all' || project.department === departmentFilter;

      return matchesQuery && matchesRisk && matchesStatus && matchesType && matchesState && matchesDistrict && matchesDepartment;
    });
    return filtered.sort((a, b) => {
      if (projectSort === 'progress') return Number(a.actualProgress) - Number(b.actualProgress);
      if (projectSort === 'delay') return Number(b.delayDays || b.scheduleSlippageDays) - Number(a.delayDays || a.scheduleSlippageDays);
      if (projectSort === 'expenditure') return Number(b.spent) - Number(a.spent);
      return b.riskScore - a.riskScore;
    });
  }, [projects, searchTerm, riskFilter, statusFilter, projectTypeFilter, stateFilter, districtFilter, departmentFilter, projectSort]);

  const filteredAlerts = useMemo(() => alerts.filter((alert) => (
    (alertLevelFilter === 'all' || alert.level === alertLevelFilter)
    && (alertStateFilter === 'all' || (alertStateFilter === 'open' ? !alert.read : alert.read))
  )), [alerts, alertLevelFilter, alertStateFilter]);

  const handleImportPreview = async (event) => {
    const file = event.target.files?.[0];
    setImportPreview(null);
    setImportMessage('');
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'json'].includes(extension) || file.size > 2 * 1024 * 1024) {
      setImportMessage('Choose a CSV or JSON file under 2 MB.');
      event.target.value = '';
      return;
    }
    setImportBusy(true);
    setImportFileName(file.name);
    try {
      const preview = await requestImportPreview(await file.text(), extension);
      setImportPreview(preview.preview);
    } catch (error) {
      setImportMessage(error.message || 'Unable to preview this file.');
    } finally {
      setImportBusy(false);
      event.target.value = '';
    }
  };

  const handleImportProjects = async () => {
    if (!importPreview) return;
    setImportBusy(true);
    setImportMessage('');
    try {
      const records = importPreview.rows.filter((row) => row.valid).map((row) => row.project);
      const result = await importProjects(records);
      setImportMessage(`Imported ${result.imported} project(s). ${result.skipped} invalid record(s) were skipped.`);
      setImportPreview(null);
      await loadData();
    } catch (error) {
      setImportMessage(error.message || 'Unable to import projects.');
    } finally {
      setImportBusy(false);
    }
  };

  const handleRestoreDemo = async () => {
    setImportBusy(true);
    try {
      const result = await restoreDemoProjects();
      setImportMessage(result.restored ? `Restored ${result.restored} missing synthetic demo project(s).` : 'The synthetic demo dataset is already complete.');
      await loadData();
    } catch (error) {
      setImportMessage(error.message || 'Unable to restore the demo dataset.');
    } finally {
      setImportBusy(false);
    }
  };

  const resetProjectFilters = () => {
    setSearchTerm('');
    setRiskFilter('all');
    setStatusFilter('all');
    setProjectTypeFilter('all');
    setStateFilter('all');
    setDistrictFilter('all');
    setDepartmentFilter('all');
    setProjectSort('risk');
  };

  const openProject = async (projectId) => {
    try {
      const data = await fetchProject(projectId);
      setSelectedProject(data.project);
      setUpdateForm({
        updateDate: new Date().toISOString().slice(0, 10),
        actualProgress: Number(data.project.actualProgress || 0),
        financialProgress: Number(data.project.financialProgress || 0),
        spent: Number(data.project.spent || 0),
        completedMilestones: Number(data.project.completedMilestones || 0),
        delayedMilestones: Number(data.project.delayedMilestones || 0),
        status: data.project.status || 'Under Construction',
        note: '',
      });
      setRiskChange(null);
      setActiveTab('projects');
    } catch (error) {
      setErrorText(error.message || 'Unable to load project details.');
    }
  };

  const handleProjectCreate = async (event) => {
    event.preventDefault();
    setSavingProject(true);
    setErrorText('');
    try {
      const payload = {
        ...newProjectForm,
        implementingAgency: newProjectForm.implementingAgency || newProjectForm.department,
        budget: Number(newProjectForm.budget),
        plannedProgress: Number(newProjectForm.plannedProgress),
        totalMilestones: Number(newProjectForm.totalMilestones || 5),
        actualProgress: 0,
        spent: 0,
      };
      const response = await createProject(payload);
      setProjects((current) => [response.project, ...current]);
      setProjectModalOpen(false);
      setNewProjectForm(initialProjectForm);
      setSelectedProject(response.project);
      setActiveTab('projects');
      await loadData();
    } catch (error) {
      setErrorText(error.message || 'Unable to create project.');
    } finally {
      setSavingProject(false);
    }
  };

  const handleProjectUpdate = async (event) => {
    event.preventDefault();
    if (!selectedProject) return;

    setSavingUpdate(true);
    setErrorText('');
    try {
      const result = await addProjectUpdate(selectedProject.id, {
        updateDate: updateForm.updateDate,
        actualProgress: Number(updateForm.actualProgress),
        financialProgress: Number(updateForm.financialProgress),
        spent: Number(updateForm.spent),
        completedMilestones: Number(updateForm.completedMilestones),
        delayedMilestones: Number(updateForm.delayedMilestones),
        status: updateForm.status,
        note: updateForm.note,
      });

      const refreshedProject = result.project;
      setSelectedProject(refreshedProject);
      setRiskChange({ previous: result.previousRisk, current: { riskScore: refreshedProject.riskScore, riskLevel: refreshedProject.riskLevel } });
      setProjects((current) => current.map((project) => project.id === refreshedProject.id ? refreshedProject : project));
      await loadData();
      setUpdateForm({
        updateDate: new Date().toISOString().slice(0, 10),
        actualProgress: Number(refreshedProject.actualProgress || 0),
        financialProgress: Number(refreshedProject.financialProgress || 0),
        spent: Number(refreshedProject.spent || 0),
        completedMilestones: Number(refreshedProject.completedMilestones || 0),
        delayedMilestones: Number(refreshedProject.delayedMilestones || 0),
        status: refreshedProject.status || 'Under Construction',
        note: '',
      });
    } catch (error) {
      setErrorText(error.message || 'Unable to submit project update.');
    } finally {
      setSavingUpdate(false);
    }
  };

  const markReviewed = async (alertId) => {
    try {
      await markAlertReviewed(alertId);
      await loadData();
    } catch (error) {
      setErrorText(error.message || 'Unable to update alert state.');
    }
  };

  const overviewCards = dashboard
    ? [
        { label: 'Total projects', value: dashboard.totalProjects, subtitle: 'Monitored portfolio' },
        { label: 'Active projects', value: dashboard.activeProjects, subtitle: 'Currently live' },
        { label: 'High risk', value: dashboard.highRisk, subtitle: 'Needs attention' },
      { label: 'Medium risk', value: dashboard.mediumRisk, subtitle: 'Monitor closely' },
      { label: 'Low risk', value: dashboard.lowRisk, subtitle: 'Routine monitoring' },
      { label: 'Average progress', value: `${dashboard.averageProgress}%`, subtitle: 'Physical progress' },
      { label: 'Delayed projects', value: dashboard.delayedProjects, subtitle: 'Delay reported or status delayed' },
      { label: 'Open alerts', value: dashboard.openAlerts, subtitle: 'Awaiting review' },
    ]
    : [];

  if (!authChecked) {
    return <div className="auth-loading" role="status">Checking your ProjectGuard session…</div>;
  }
  if (!authUser) {
    return <AuthPage onAuthenticated={setAuthUser} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-icon"><IconShield /></div>
          <div>
            <div className="eyebrow">Project monitoring</div>
            <h1>ProjectGuard AI</h1>
          </div>
        </div>

        <div className="role-panel">
          <label htmlFor="role">Demo role</label>
          <select id="role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>{role}</option>
            ))}
          </select>
        </div>
        <div className="signed-in-user">
          <span className="user-avatar" aria-hidden="true">{authUser.name?.slice(0, 1).toUpperCase()}</span>
          <span><strong>{authUser.name}</strong><small>{authUser.email}</small></span>
          <button type="button" className="logout-button" onClick={handleLogout}>Sign out</button>
        </div>

        <nav className="nav-menu">
          {['overview', 'projects', 'alerts', 'insights', 'import'].map((tab) => (
            <button
              key={tab}
              type="button"
              className={`nav-link ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'overview' ? 'Overview' : tab === 'projects' ? 'Projects' : tab === 'alerts' ? 'Early warnings' : tab === 'insights' ? 'Risk insights' : 'Data import'}
            </button>
          ))}
        </nav>

        <button type="button" className="primary-button add-project" onClick={() => setProjectModalOpen(true)}>
          <IconPlus /> New project
        </button>
      </aside>

      <main className="main-panel">
        <div className="demo-banner">
          <strong>DEMO MODE · Demo / Synthetic Construction Data</strong>
          <span>Sample records only. Not official MoSPI or live PAIMANA data.</span>
        </div>
        {loading ? <div className="empty-state">Loading portfolio data…</div> : null}
        {!loading && errorText ? (
          <div className="error-banner" role="alert">
            <span>{errorText}</span>
            <button type="button" className="secondary-button" onClick={() => loadData(true)}>Retry</button>
          </div>
        ) : null}

        {!loading && !errorText && activeTab === 'overview' && dashboard && (
          <>
            <header className="page-header">
              <div>
                <div className="eyebrow">Workspace</div>
                <h2>{selectedRole} dashboard</h2>
              </div>
              <button type="button" className="primary-button" onClick={() => setProjectModalOpen(true)}>
                <IconPlus /> Add project
              </button>
            </header>

            <section className="card-grid">
              {overviewCards.map((card) => (
                <article key={card.label} className="stat-card">
                  <div className="stat-label">{card.label}</div>
                  <div className="stat-value">{card.value}</div>
                  <div className="stat-subtitle">{card.subtitle}</div>
                </article>
              ))}
            </section>

            <section className="panel-grid two-up">
              <div className="panel-card">
                <div className="panel-header">
                  <h3>Projects needing attention</h3>
                </div>
                <div className="priority-list">
                  {projects.slice(0, 6).map((project) => (
                    <button key={project.id} type="button" className="priority-row" onClick={() => openProject(project.id)}>
                      <div>
                        <strong>{project.name}</strong>
                        <div className="muted-text">{project.department}</div>
                      </div>
                      <div className="priority-meta">
                        <RiskBadge level={project.riskLevel} />
                        <span>{project.riskScore}/100</span>
                      </div>
                    </button>
                  ))}
                  {projects.length === 0 && <p className="empty-state">No projects yet. Add a project to begin monitoring.</p>}
                </div>
              </div>

              <div className="panel-card">
                <div className="panel-header">
                  <h3>Risk distribution</h3>
                </div>
                <div className="distribution-chart">
                  {['Low', 'Medium', 'High'].map((level) => {
                    const value = dashboard.distribution[level.toLowerCase()] || 0;
                    const percent = totalProjectsDisplay(dashboard, projects) ? (value / totalProjectsDisplay(dashboard, projects)) * 100 : 0;
                    return (
                      <div key={level} className="distribution-bar-wrap">
                        <div className="distribution-label-row">
                          <span>{level}</span>
                          <span>{value}</span>
                        </div>
                        <div className="distribution-bar">
                          <span style={{ width: `${percent}%` }} className={`bar ${level.toLowerCase()}`} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="panel-grid two-up">
              <div className="panel-card">
                <div className="panel-header">
                  <h3>Recent open warnings</h3>
                </div>
                <div className="warning-list">
                  {alerts.filter((alert) => !alert.read).slice(0, 4).map((alert) => (
                    <div key={alert.id} className="warning-item">
                      <div className="warning-head">
                        <RiskBadge level={alert.level} />
                        <span>{formatDate(alert.date)}</span>
                      </div>
                      <strong>{alert.title}</strong>
                      <p>{alert.message}</p>
                      <div className="warning-actions">
                        <button type="button" className="text-action" onClick={() => openProject(alert.projectId)}>
                          View project
                        </button>
                        <button type="button" className="text-action" onClick={() => markReviewed(alert.id)}>
                          Reviewed
                        </button>
                      </div>
                    </div>
                  ))}
                  {alerts.every((alert) => alert.read) && <p className="empty-state">No open warnings. You’re all caught up.</p>}
                </div>
              </div>

              <div className="panel-card">
                <div className="panel-header">
                  <h3>Portfolio health</h3>
                </div>
                <div className="insight-summary">
                  <div><span>Average physical progress</span><strong>{dashboard.averageProgress}%</strong></div>
                  <div><span>Average financial progress</span><strong>{dashboard.averageFinancialProgress}%</strong></div>
                  <div><span>Data quality average</span><strong>{dashboard.averageDataQuality}%</strong></div>
                </div>
                <p className="muted-text quality-note">
                  {dashboard.projectsWithDataWarnings} project(s) have incomplete information that may limit risk assessment.
                </p>
                <div className="insight-box">
                  <IconChart />
                  <p>
                    Prototype rule-based risk scores are prioritization indicators. Review project context, field evidence, and recent milestones before acting.
                  </p>
                </div>
                <div className="insight-box muted-box">
                  <IconFolder />
                  <p>
                    Risk weights and thresholds are prototype assumptions, not official MoSPI standards. No live PAIMANA connection or trained ML model is used.
                  </p>
                </div>
              </div>
            </section>

            <section className="panel-card recent-projects">
              <div className="panel-header"><h3>Recently updated projects</h3></div>
              <div className="gap-list">
                {(dashboard.recentlyUpdated || []).map((project) => (
                  <button key={project.id} type="button" className="gap-row row-button" onClick={() => openProject(project.id)}>
                    <span><strong>{project.name}</strong><span className="muted-text"> · {project.actualProgress}% physical · {project.financialProgress}% financial</span></span>
                    <span>{formatDate(project.updatedAt)}</span>
                  </button>
                ))}
              </div>
            </section>
          </>
        )}

        {!loading && !errorText && activeTab === 'projects' && (
          <>
            <header className="page-header">
              <div>
                <div className="eyebrow">Portfolio</div>
                <h2>Projects</h2>
              </div>
              <button type="button" className="primary-button" onClick={() => setProjectModalOpen(true)}>
                <IconPlus /> Create project
              </button>
            </header>

            <div className="filter-bar">
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                aria-label="Search projects"
                placeholder="Search project, department or location"
              />
              <select aria-label="Filter by risk" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
                <option value="all">All risk levels</option>
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
              <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                {['Planned', 'Tendering', 'Awarded', 'Under Construction', 'Active', 'Delayed', 'On Hold', 'Completed', 'Cancelled'].map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>
              <select aria-label="Filter by project type" value={projectTypeFilter} onChange={(event) => setProjectTypeFilter(event.target.value)}>
                <option value="all">All project types</option>
                {projectTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
              <select aria-label="Filter by state" value={stateFilter} onChange={(event) => { setStateFilter(event.target.value); setDistrictFilter('all'); }}>
                <option value="all">All states</option>
                {projectStates.map((state) => <option key={state} value={state}>{state}</option>)}
              </select>
              <select aria-label="Filter by district" value={districtFilter} onChange={(event) => setDistrictFilter(event.target.value)}>
                <option value="all">All districts</option>
                {projectDistricts.map((district) => <option key={district} value={district}>{district}</option>)}
              </select>
              <select aria-label="Filter by department" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
                <option value="all">All departments</option>
                {departments.map((department) => <option key={department} value={department}>{department}</option>)}
              </select>
              <select aria-label="Sort projects" value={projectSort} onChange={(event) => setProjectSort(event.target.value)}>
                <option value="risk">Sort: highest risk</option>
                <option value="progress">Sort: lowest progress</option>
                <option value="delay">Sort: most delay</option>
                <option value="expenditure">Sort: highest expenditure</option>
              </select>
              <button type="button" className="ghost-button" onClick={resetProjectFilters}>Reset filters</button>
            </div>

            <div className="project-list">
              {filteredProjects.map((project) => (
                <article key={project.id} className="project-card">
                  <div className="project-card-head">
                    <div>
                      <h3>{project.name}</h3>
                      <div className="muted-text">{project.projectType || 'Other'} · {project.department} · {[project.district, project.state].filter(Boolean).join(', ') || project.location}</div>
                    </div>
                    <RiskBadge level={project.riskLevel} />
                  </div>
                  <div className="project-metrics">
                    <div>
                      <span>Risk score</span>
                      <strong>{project.riskScore}</strong>
                    </div>
                    <div>
                      <span>Progress</span>
                      <strong>{project.actualProgress}%</strong>
                    </div>
                    <div>
                      <span>Budget used</span>
                      <strong>{project.budgetUsed}%</strong>
                    </div>
                    <div>
                      <span>Financial progress</span>
                      <strong>{project.financialProgress}%</strong>
                    </div>
                    <div>
                      <span>Schedule delay</span>
                      <strong>{project.scheduleSlippageDays || project.delayDays || 0} days</strong>
                    </div>
                  </div>
                  <div className={`quality-pill ${project.dataQuality?.status?.toLowerCase() || 'warning'}`}>
                    Data quality {project.dataQuality?.score ?? 0}% · {project.dataQuality?.status || 'Warning'}
                  </div>
                  <p className="project-summary">{project.riskSummary}</p>
                  <div className="project-actions">
                    <button type="button" className="secondary-button" onClick={() => openProject(project.id)}>
                      Open detail
                    </button>
                  </div>
                </article>
              ))}
              {filteredProjects.length === 0 && (
                <p className="empty-state">
                  {projects.length === 0 ? 'No projects yet. Create a project to get started.' : 'No projects match these search and filter settings.'}
                </p>
              )}
            </div>
          </>
        )}

        {!loading && !errorText && activeTab === 'alerts' && (
          <>
            <header className="page-header">
              <div>
                <div className="eyebrow">Monitoring</div>
                <h2>Early warnings</h2>
              </div>
            </header>

            <div className="filter-bar alert-filters">
              <select aria-label="Filter alerts by risk" value={alertLevelFilter} onChange={(event) => setAlertLevelFilter(event.target.value)}>
                <option value="all">All risk levels</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
              <select aria-label="Filter alerts by review state" value={alertStateFilter} onChange={(event) => setAlertStateFilter(event.target.value)}>
                <option value="all">All alerts</option>
                <option value="open">Open</option>
                <option value="reviewed">Reviewed</option>
              </select>
            </div>

            <div className="alert-list">
              {filteredAlerts.map((alert) => (
                <article key={alert.id} className={`alert-card ${alert.read ? 'read' : ''}`}>
                  <div className="alert-header">
                    <RiskBadge level={alert.level || getScoreLabel(alert.score || 0)} />
                    <span>{formatDate(alert.date)}</span>
                  </div>
                  <h3>{alert.title}</h3>
                  <div className="muted-text">{alert.projectName}</div>
                  <p>{alert.message}</p>
                  {alert.recommendedReview?.length > 0 && (
                    <div className="alert-recommendation">
                      <strong>Recommended review</strong>
                      <ul>{alert.recommendedReview.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  )}
                  <div className="warning-actions">
                    <button type="button" className="text-action" onClick={() => openProject(alert.projectId)}>
                      Open project
                    </button>
                    {!alert.read && (
                      <button type="button" className="text-action" onClick={() => markReviewed(alert.id)}>
                        Mark reviewed
                      </button>
                    )}
                  </div>
                </article>
              ))}
              {filteredAlerts.length === 0 && <p className="empty-state">No alerts match these filters.</p>}
            </div>
          </>
        )}

        {!loading && !errorText && activeTab === 'insights' && (
          <>
            <header className="page-header">
              <div>
                <div className="eyebrow">Decision support</div>
                <h2>Risk insights</h2>
              </div>
            </header>

            <div className="panel-grid two-up">
              <div className="panel-card">
                <div className="panel-header"><h3>Portfolio risk mix</h3></div>
                <div className="insight-summary">
                  {projects.length > 0 ? (
                    <>
                      <div><span>Low</span><strong>{dashboard.distribution.low}</strong></div>
                      <div><span>Medium</span><strong>{dashboard.distribution.medium}</strong></div>
                      <div><span>High</span><strong>{dashboard.distribution.high}</strong></div>
                    </>
                  ) : (
                    <p>No data available.</p>
                  )}
                </div>
              </div>

              <div className="panel-card">
                <div className="panel-header"><h3>How to use the score</h3></div>
                <ul className="bullet-list">
                  <li>Use the score as a prioritization signal, not a definitive failure prediction.</li>
                  <li>Review the main drivers before deciding on intervention steps.</li>
                  <li>Check current field conditions and latest milestone data before escalating action.</li>
                </ul>
              </div>
            </div>

            <section className="panel-grid two-up top-space">
              <div className="panel-card">
                <div className="panel-header"><h3>Common risk causes</h3></div>
                <div className="gap-list">
                  {(insights?.riskCauses || []).map((cause) => (
                    <div className="gap-row" key={cause.name}><strong>{cause.name}</strong><span>{cause.count} project(s)</span></div>
                  ))}
                  {!insights?.riskCauses?.length && <p className="empty-state">No material risk drivers in the current portfolio.</p>}
                </div>
              </div>
              <div className="panel-card">
                <div className="panel-header"><h3>Project-type risk</h3></div>
                <div className="gap-list">
                  {(insights?.projectTypes || []).slice(0, 8).map((item) => (
                    <div className="gap-row" key={item.projectType}>
                      <strong>{item.projectType} · {item.count}</strong>
                      <span>Average risk {item.averageRisk}/100</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="panel-card top-space">
              <div className="panel-header"><h3>Planned vs actual progress gaps</h3></div>
              <div className="gap-list">
                {projects.slice(0, 6).map((project) => (
                  <div key={project.id} className="gap-row">
                    <div>
                      <strong>{project.name}</strong>
                      <div className="muted-text">Plan {project.plannedProgress}% • Actual {project.actualProgress}%</div>
                    </div>
                    <span>{project.progressGap} pts gap</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {!loading && !errorText && activeTab === 'import' && (
          <>
            <header className="page-header">
              <div>
                <div className="eyebrow">Data management</div>
                <h2>Import construction projects</h2>
                <p className="muted-text">Upload CSV or JSON records, review validation results, then import valid rows.</p>
              </div>
              <a className="secondary-button download-link" href="/api/import/sample-csv" download>
                Download sample CSV
              </a>
            </header>
            <section className="panel-card import-panel">
              <div className="demo-banner inline-banner">
                <strong>Data source note</strong>
                <span>Imported rows are user-provided; the sample file is synthetic demo data.</span>
              </div>
              <label className="upload-field">
                Choose CSV or JSON file
                <input type="file" accept=".csv,.json,text/csv,application/json" onChange={handleImportPreview} />
              </label>
              {importFileName && <p className="muted-text">Selected: {importFileName}</p>}
              {importBusy && <p role="status">Processing file…</p>}
              {importMessage && <p className="import-message" role="status">{importMessage}</p>}
              {importPreview && (
                <>
                  <div className="import-summary">
                    <div><span>Records</span><strong>{importPreview.total}</strong></div>
                    <div><span>Valid</span><strong>{importPreview.valid}</strong></div>
                    <div><span>With warnings</span><strong>{importPreview.warning}</strong></div>
                    <div><span>Invalid</span><strong>{importPreview.invalid}</strong></div>
                  </div>
                  <div className="import-rows">
                    {importPreview.rows.map((row) => (
                      <article key={`${row.rowNumber}-${row.project.id || row.project.name}`} className={`import-row ${row.valid ? 'valid' : 'invalid'}`}>
                        <div className="project-card-head">
                          <strong>Row {row.rowNumber}: {row.project.name || 'Unnamed project'}</strong>
                          <span>{row.valid ? (row.warnings.length ? 'Valid · warnings' : 'Valid') : 'Invalid'}</span>
                        </div>
                        {row.errors.map((error) => <p className="validation-error" key={error}>{error}</p>)}
                        {row.warnings.map((warning) => <p className="validation-warning" key={warning}>{warning}</p>)}
                      </article>
                    ))}
                  </div>
                  <div className="modal-actions">
                    <button type="button" className="ghost-button" onClick={() => setImportPreview(null)}>Cancel import</button>
                    <button type="button" className="primary-button" onClick={handleImportProjects} disabled={!importPreview.valid || importBusy}>
                      Import {importPreview.valid} valid record(s)
                    </button>
                  </div>
                </>
              )}
            </section>
            <section className="panel-card top-space">
              <div className="panel-header"><h3>Restore synthetic demo dataset</h3></div>
              <p className="muted-text">Adds any missing sample projects without replacing or deleting your existing projects or updates.</p>
              <button type="button" className="secondary-button" onClick={handleRestoreDemo} disabled={importBusy}>Restore missing demo projects</button>
            </section>
          </>
        )}
      </main>

      {projectModalOpen && (
        <Modal title="Create project" onClose={() => setProjectModalOpen(false)}>
          <form className="stacked-form" onSubmit={handleProjectCreate}>
            <div className="field-grid">
              <label>
                Project name
                <input value={newProjectForm.name} onChange={(event) => setNewProjectForm({ ...newProjectForm, name: event.target.value })} required />
              </label>
              <label>
                Project type
                <input list="project-types" value={newProjectForm.projectType} onChange={(event) => setNewProjectForm({ ...newProjectForm, projectType: event.target.value })} required />
                <datalist id="project-types">
                  {['Road', 'Highway', 'Bridge', 'Railway', 'Hospital', 'School', 'Water Supply', 'Irrigation', 'Power', 'Government Building', 'Other'].map((type) => <option key={type} value={type} />)}
                </datalist>
              </label>
              <label>
                Department
                <input value={newProjectForm.department} onChange={(event) => setNewProjectForm({ ...newProjectForm, department: event.target.value })} required />
              </label>
              <label>
                Implementing agency
                <input value={newProjectForm.implementingAgency} onChange={(event) => setNewProjectForm({ ...newProjectForm, implementingAgency: event.target.value })} />
              </label>
              <label>
                Location
                <input value={newProjectForm.location} onChange={(event) => setNewProjectForm({ ...newProjectForm, location: event.target.value })} required />
              </label>
              <label>
                District
                <input value={newProjectForm.district} onChange={(event) => setNewProjectForm({ ...newProjectForm, district: event.target.value })} />
              </label>
              <label>
                State
                <input value={newProjectForm.state} onChange={(event) => setNewProjectForm({ ...newProjectForm, state: event.target.value })} />
              </label>
              <label>
                Approved budget
                <input type="number" min="1" value={newProjectForm.budget} onChange={(event) => setNewProjectForm({ ...newProjectForm, budget: event.target.value })} required />
              </label>
              <label>
                Start date
                <input type="date" value={newProjectForm.startDate} onChange={(event) => setNewProjectForm({ ...newProjectForm, startDate: event.target.value })} required />
              </label>
              <label>
                Completion date
                <input type="date" value={newProjectForm.endDate} onChange={(event) => setNewProjectForm({ ...newProjectForm, endDate: event.target.value })} required />
              </label>
              <label>
                Planned progress
                <input type="number" min="0" max="100" value={newProjectForm.plannedProgress} onChange={(event) => setNewProjectForm({ ...newProjectForm, plannedProgress: event.target.value })} required />
              </label>
              <label>
                Total milestones
                <input type="number" min="1" value={newProjectForm.totalMilestones} onChange={(event) => setNewProjectForm({ ...newProjectForm, totalMilestones: event.target.value })} required />
              </label>
              <label>
                Contractor
                <input value={newProjectForm.contractor} onChange={(event) => setNewProjectForm({ ...newProjectForm, contractor: event.target.value })} />
              </label>
              <label>
                Revised cost (optional)
                <input type="number" min="0" value={newProjectForm.revisedCost} onChange={(event) => setNewProjectForm({ ...newProjectForm, revisedCost: event.target.value })} />
              </label>
              <label>
                Land acquisition
                <input value={newProjectForm.landAcquisitionStatus} onChange={(event) => setNewProjectForm({ ...newProjectForm, landAcquisitionStatus: event.target.value })} />
              </label>
              <label>
                Tender status
                <input value={newProjectForm.tenderStatus} onChange={(event) => setNewProjectForm({ ...newProjectForm, tenderStatus: event.target.value })} />
              </label>
              <label>
                Work order status
                <input value={newProjectForm.workOrderStatus} onChange={(event) => setNewProjectForm({ ...newProjectForm, workOrderStatus: event.target.value })} />
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="ghost-button" onClick={() => setProjectModalOpen(false)}>Cancel</button>
              <button type="submit" className="primary-button" disabled={savingProject}>
                {savingProject ? 'Saving…' : 'Save project'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selectedProject && (
        <Modal title={selectedProject.name} onClose={() => setSelectedProject(null)}>
          <div className="project-detail-layout">
            <div className="detail-project-heading">
              <span>{selectedProject.id} · {selectedProject.projectType || 'Other'} · {selectedProject.status}</span>
              <span>{[selectedProject.district, selectedProject.state].filter(Boolean).join(', ') || selectedProject.location}</span>
              <span className="muted-text">{selectedProject.dataOrigin || 'Demo / Synthetic Data'}</span>
            </div>
            <div className="detail-summary">
              <div className="summary-row">
                <span>Risk band</span>
                <RiskBadge level={selectedProject.riskLevel} />
              </div>
              <div className="summary-row">
                <span>Risk score</span>
                <strong>{selectedProject.riskScore}/100</strong>
              </div>
              <div className="summary-row">
                <span>Schedule</span>
                <strong>{selectedProject.timelineElapsed}% elapsed</strong>
              </div>
              <div className="summary-row">
                <span>Budget used</span>
                <strong>{selectedProject.budgetUsed}%</strong>
              </div>
              <div className="summary-row">
                <span>Physical / financial</span>
                <strong>{selectedProject.actualProgress}% / {selectedProject.financialProgress}%</strong>
              </div>
              <div className="summary-row">
                <span>Milestones</span>
                <strong>{selectedProject.completedMilestones}/{selectedProject.totalMilestones} complete</strong>
              </div>
            </div>

            <div className="detail-section">
              <h4>Risk summary</h4>
              <p>{selectedProject.riskSummary}</p>
              {riskChange && (
                <div className="risk-change" role="status">
                  Previous risk: {riskChange.previous.riskScore} · {riskChange.previous.riskLevel}
                  <span aria-hidden="true"> → </span>
                  New risk: {riskChange.current.riskScore} · {riskChange.current.riskLevel}
                </div>
              )}
            </div>

            <div className="detail-section">
              <h4>Risk drivers</h4>
              <ul>
                {(selectedProject.riskDrivers || []).map((driver) => (
                  <li key={driver.name}><strong>{driver.name} · {driver.severity}</strong>: {driver.message}</li>
                ))}
              </ul>
            </div>

            <div className="detail-section">
              <h4>Recommended review</h4>
              <ul>{(selectedProject.recommendedReview || []).map((item) => <li key={item}>{item}</li>)}</ul>
            </div>

            <div className="detail-section">
              <h4>Project information</h4>
              <div className="detail-summary detail-info">
                <div><span>Department</span><strong>{selectedProject.department}</strong></div>
                <div><span>Implementing agency</span><strong>{selectedProject.implementingAgency || 'Not provided'}</strong></div>
                <div><span>Contractor</span><strong>{selectedProject.contractor || 'Not provided'}</strong></div>
                <div><span>Approved / revised cost</span><strong>{formatCurrency(selectedProject.budget)} / {selectedProject.revisedCost ? formatCurrency(selectedProject.revisedCost) : 'Not provided'}</strong></div>
                <div><span>Tender / work order</span><strong>{selectedProject.tenderStatus || 'Not provided'} / {selectedProject.workOrderStatus || 'Not provided'}</strong></div>
                <div><span>Land acquisition</span><strong>{selectedProject.landAcquisitionStatus || 'Not provided'}</strong></div>
                <div><span>Schedule</span><strong>{formatDate(selectedProject.startDate)} – {formatDate(selectedProject.endDate)}</strong></div>
                <div><span>Last inspection</span><strong>{formatDate(selectedProject.lastInspectionDate)}</strong></div>
              </div>
            </div>

            <div className="detail-section">
              <h4>Data quality · {selectedProject.dataQuality?.score ?? 0}% · {selectedProject.dataQuality?.status || 'Warning'}</h4>
              <ul className="quality-checks">
                {(selectedProject.dataQuality?.checks || []).map((check) => (
                  <li key={check.label} className={check.complete ? 'check-complete' : 'check-missing'}>
                    {check.complete ? '✓' : '⚠'} {check.label}
                  </li>
                ))}
              </ul>
            </div>

            <form className="stacked-form" onSubmit={handleProjectUpdate}>
              <h4>Record progress update</h4>
              <div className="field-grid">
                <label>
                  Update date
                  <input type="date" value={updateForm.updateDate} onChange={(event) => setUpdateForm({ ...updateForm, updateDate: event.target.value })} required />
                </label>
                <label>
                  Physical progress (%)
                  <input type="number" min="0" max="100" value={updateForm.actualProgress} onChange={(event) => setUpdateForm({ ...updateForm, actualProgress: event.target.value })} required />
                </label>
                <label>
                  Financial progress (%)
                  <input type="number" min="0" max="100" value={updateForm.financialProgress} onChange={(event) => setUpdateForm({ ...updateForm, financialProgress: event.target.value })} required />
                </label>
                <label>
                  Expenditure
                  <input type="number" min="0" value={updateForm.spent} onChange={(event) => setUpdateForm({ ...updateForm, spent: event.target.value })} required />
                </label>
                <label>
                  Completed milestones
                  <input type="number" min="0" max={selectedProject.totalMilestones} value={updateForm.completedMilestones} onChange={(event) => setUpdateForm({ ...updateForm, completedMilestones: event.target.value })} required />
                </label>
                <label>
                  Delayed milestones
                  <input type="number" min="0" value={updateForm.delayedMilestones} onChange={(event) => setUpdateForm({ ...updateForm, delayedMilestones: event.target.value })} required />
                </label>
                <label>
                  Project status
                  <select value={updateForm.status} onChange={(event) => setUpdateForm({ ...updateForm, status: event.target.value })}>
                    {['Planned', 'Tendering', 'Awarded', 'Under Construction', 'Active', 'Delayed', 'On Hold', 'Completed', 'Cancelled'].map((status) => <option key={status} value={status}>{status}</option>)}
                  </select>
                </label>
              </div>
              <label>
                Progress note
                <textarea value={updateForm.note} onChange={(event) => setUpdateForm({ ...updateForm, note: event.target.value })} rows="3" placeholder="Add a short note about site progress or issue status." />
              </label>
              <div className="modal-actions">
                <button type="submit" className="primary-button" disabled={savingUpdate}>
                  {savingUpdate ? 'Saving…' : 'Save update'}
                </button>
              </div>
            </form>

            <div className="detail-section">
              <h4>Progress history</h4>
              {(selectedProject.updates || []).slice().reverse().map((update) => (
                <div key={update.id} className="update-item">
                  <div className="update-topline">
                    <strong>{update.title}</strong>
                    <span>{formatDate(update.date)}</span>
                  </div>
                  <div className="muted-text">
                    Physical {update.actualProgress ?? '—'}% · Financial {update.financialProgress ?? '—'}% · Spent {formatCurrency(update.spent)}
                    {update.completedMilestones !== undefined ? ` · Milestones ${update.completedMilestones}/${selectedProject.totalMilestones}` : ''}
                    {update.status ? ` · ${update.status}` : ''}
                  </div>
                  <p>{update.note}</p>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function totalProjectsDisplay(dashboard, projects) {
  return dashboard?.totalProjects || projects.length || 0;
}

export default App;
