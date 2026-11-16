const API_BASE = '/api';

const request = async (path, options = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || 'Request failed.');
    error.status = response.status;
    throw error;
  }

  return data;
};

export const getCurrentUser = () => request('/auth/me');
export const login = (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
export const register = (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
export const logout = () => request('/auth/logout', { method: 'POST' });
export const fetchDashboard = () => request('/dashboard');
export const fetchProjects = () => request('/projects');
export const fetchProject = (projectId) => request(`/projects/${projectId}`);
export const createProject = (payload) => request('/projects', {
  method: 'POST',
  body: JSON.stringify(payload),
});
export const addProjectUpdate = (projectId, payload) => request(`/projects/${projectId}/updates`, {
  method: 'POST',
  body: JSON.stringify(payload),
});
export const fetchAlerts = () => request('/alerts');
export const markAlertReviewed = (alertId) => request(`/alerts/${alertId}/read`, {
  method: 'PATCH',
});
export const fetchInsights = () => request('/insights');
export const previewImport = (content, format) => request('/import/preview', {
  method: 'POST',
  body: JSON.stringify({ content, format }),
});
export const importProjects = (records) => request('/import/projects', {
  method: 'POST',
  body: JSON.stringify({ records }),
});
export const restoreDemoProjects = () => request('/demo/restore', { method: 'POST' });
