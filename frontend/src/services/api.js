import axios from 'axios';
import { toast } from 'sonner';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add the auth token header to requests
api.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem('access_token');
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// --- Token Refresh Logic with Race Condition Prevention ---
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor to handle 401 errors and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Check if the error is 401, not a retry, and not from a token-related endpoint or public link
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url.includes('/token') &&
      !originalRequest.url.includes('/links/')
    ) {
      if (isRefreshing) {
        // If a refresh is already in progress, queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers['Authorization'] = 'Bearer ' + token;
            return api(originalRequest);
          })
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refresh_token');
      if (!refreshToken) {
        isRefreshing = false;
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      return new Promise((resolve, reject) => {
        axios.post('/api/v1/token/refresh/', { refresh: refreshToken })
          .then(({ data }) => {
            localStorage.setItem('access_token', data.access);
            if (data.refresh) localStorage.setItem('refresh_token', data.refresh);
            
            api.defaults.headers.common['Authorization'] = 'Bearer ' + data.access;
            originalRequest.headers['Authorization'] = 'Bearer ' + data.access;
            
            processQueue(null, data.access);
            resolve(api(originalRequest));
          })
          .catch((err) => {
            processQueue(err, null);
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            window.location.href = '/login';
            reject(err);
          })
          .finally(() => {
            isRefreshing = false;
          });
      });
    }

    // For other errors, show a toast, preferring 'message' over 'detail'.
    const errorMessage =
      error.response?.data?.message ||
      error.response?.data?.detail ||
      error.message;

    // Avoid showing a toast for the initial password prompt on the viewer page.
    const isPasswordPrompt =
      error.response?.status === 401 &&
      originalRequest.url.includes('/view-data/') &&
      error.response?.data?.protectionType === 'password';

    if (!isPasswordPrompt && errorMessage) {
      toast.error(errorMessage);
    }

    return Promise.reject(error);
  }
);

export const uploadDocument = (file, path) => {
  const formData = new FormData();
  formData.append('file', file);

  if (path) {
    formData.append('path', path);
  }

  return api.post('/uploads/document/', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const uploadNewVersion = (documentId, file) => {
  const formData = new FormData();
  formData.append('file', file);

  return api.post(`/documents/${documentId}/versions/`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
};

export const getFolderContents = (id) => api.get(`/folders/${id}/`);

export const getRootFolderContents = () => api.get('/folders/');

export const createFolder = (name, parentId = null) => api.post('/folders/', { name, parent: parentId });

export const ensureFolderPaths = (paths, parentPath = null) =>
  api.post('/folders/ensure-paths/', { paths, parent_path: parentPath });

export const deleteDocument = (id) => api.delete(`/documents/${id}/`);

export const deleteFolder = (id) => api.delete(`/folders/${id}/`);

export const renameDocument = (id, name) => api.patch(`/documents/${id}/`, { name });

export const renameFolder = (id, name) => api.patch(`/folders/${id}/`, { name });

export const updateDocument = (id, data) => api.patch(`/documents/${id}/`, data);

export const updateFolder = (id, data) => api.patch(`/folders/${id}/`, data);

export const deleteMultipleDocuments = (ids) => {
  const promises = ids.map((id) => deleteDocument(id));
  return Promise.allSettled(promises);
};

export const deleteMultipleFolders = (ids) => {
  const promises = ids.map((id) => deleteFolder(id));
  return Promise.allSettled(promises);
};

export const moveItems = ({ documentIds, folderIds, destinationFolderId }) => {
  return api.post('/actions/move/', {
    document_ids: documentIds,
    folder_ids: folderIds,
    destination_folder_id: destinationFolderId,
  });
};

export const getDocumentPreviewData = (id) => api.get(`/documents/${id}/preview-data/`);

export const getDocumentDetails = (id) => api.get(`/documents/${id}/`);

export const getDocumentViews = (documentId, page = 1) =>
  api.get(`/documents/${documentId}/view-sessions/?page=${page}`);

export const getDocumentStats = (documentId) => api.get(`/documents/${documentId}/stats/`);

export const createShareLink = (data) => api.post('/share-links/', data);

export const updateShareLink = (id, data) => api.patch(`/share-links/${id}/`, data);

export const deleteShareLink = (id) => api.delete(`/share-links/${id}/`);

export const getShareLinkDetails = (id) => api.get(`/share-links/${id}/`);

export const getShareLinkViewSessions = (linkId, page = 1) =>
  api.get(`/share-links/${linkId}/view-sessions/?page=${page}`);

export const generateShareLinkPreview = (id) => api.post(`/share-links/${id}/preview/`);

export const getShareLinkViewData = (slug, { previewToken = null, accessToken = null, documentId = null } = {}) => {
  const params = {};
  if (previewToken) params.previewToken = previewToken;
  if (accessToken) params.accessToken = accessToken;
  if (documentId) params.document_id = documentId;
  return api.get(`/links/${slug}/view-data/`, { params });
};

export const verifyShareLinkPassword = (slug, password) =>
  api.post(`/links/${slug}/verify-password/`, { password });

export const requestShareLinkAccess = (slug, email) =>
  api.post(`/links/${slug}/request-access/`, { email });

export const createViewSession = (data) => api.post('/view-sessions/', data);

export const recordDownload = (viewSessionId) => api.post(`/view-sessions/${viewSessionId}/record-download/`);

export const recordPageView = (data, useBeacon = false) => {
  const payload = JSON.stringify(data);
  const url = `${api.defaults.baseURL}/page-views/record/`;

  // Use sendBeacon for maximum reliability during page unload
  if (useBeacon && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon(url, blob);
    return Promise.resolve(); // Return a resolved promise
  }

  // Fallback to fetch with keepalive for other scenarios
  return fetch(url, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true, // Critical for page unload scenarios
  });
};

export const getUser = (id) => api.get(`/users/${id}/`);

export const setPassword = (data) => api.post('/users/set-password/', data);

export const updateUser = (id, data) => {
  const config = {};
  if (data instanceof FormData) {
    // When sending FormData, we must let axios set the Content-Type header
    // itself so it can include the boundary.
    config.headers = {
      'Content-Type': 'multipart/form-data',
    };
  }
  return api.patch(`/users/${id}/`, data, config);
};

// Analytics
export const getDashboardSummary = () => api.get('/analytics/dashboard/');
export const getDailyVisits = () => api.get('/analytics/daily-visits/');
export const getAllActiveLinks = (page = 1) => api.get(`/analytics/links/?page=${page}`);
export const getAllViewSessions = (page = 1) => api.get(`/analytics/view-sessions/?page=${page}`);

// Cloud Imports
export const getCloudProviders = () => api.get('/cloud/providers/');

export const getCloudConnections = () => api.get('/cloud/connections/');

export const getDropboxConnectUrl = () => api.get('/cloud/connect/dropbox/');

export const getGoogleDriveConnectUrl = () => api.get('/cloud/connect/google_drive/');

export const getNextcloudConnectUrl = () => api.get('/cloud/connect/nextcloud/');

export const completeDropboxConnect = ({ code, state }) =>
  api.post('/cloud/callback/dropbox/', { code, state });

export const completeGoogleDriveConnect = ({ code, state }) =>
  api.post('/cloud/callback/google_drive/', { code, state });

export const completeNextcloudConnect = ({ code, state }) =>
  api.post('/cloud/callback/nextcloud/', { code, state });

export const listCloudFiles = (connectionId, path = '/') =>
  api.get(`/cloud/connections/${connectionId}/list/`, { params: { path } });

export const importCloudFile = (connectionId, { fileId, fileName, fileSize }) =>
  api.post(`/cloud/connections/${connectionId}/import/`, {
    file_id: fileId,
    file_name: fileName,
    file_size: fileSize,
  });

// Datarooms
export const getDatarooms = () => api.get('/datarooms/');
export const getDataroom = (id) => api.get(`/datarooms/${id}/`);
export const createDataroom = (data) => api.post('/datarooms/', data);
export const createDataroomFolder = (data) => api.post('/dataroom-folders/', data);
export const updateDataroom = (id, data) => api.patch(`/datarooms/${id}/`, data);
export const deleteDataroom = (id) => api.delete(`/datarooms/${id}/`);
export const addContentToDataroom = (id, data) => api.post(`/datarooms/${id}/add-content/`, data);
export const removeContentFromDataroom = (id, data) => api.post(`/datarooms/${id}/remove-content/`, data);
export const moveDataroomContent = (id, data) => api.post(`/datarooms/${id}/move-content/`, data);
export const getDataroomFolderContents = (folderId) => api.get(`/dataroom-folders/${folderId}/`);
export const getShareLinksForDataroom = (dataroomId) => api.get(`/share-links/?dataroom_id=${dataroomId}`);
export const updateDataroomLinkSettings = (linkId, settings) => api.patch(`/share-links/${linkId}/dataroom-settings/`, settings);
    
export default api;
