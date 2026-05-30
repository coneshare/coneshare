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

    const isPublicProtectionError =
      error.response?.status === 401 &&
      ['password', 'email'].includes(error.response?.data?.protectionType);

    const isInitialPasswordPrompt =
      error.response?.status === 401 &&
      originalRequest.url.includes('/view-data/') &&
      error.response?.data?.protectionType === 'password';
          
    // Check if the error is 401, not a retry, and not from a token-related endpoint or public link protect prompt
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url.includes('/token') &&
      !isPublicProtectionError
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
    if (!isInitialPasswordPrompt && errorMessage) {
      toast.error(errorMessage);
    }

    return Promise.reject(error);
  }
);

export const uploadDocument = async (file, path, onProgress) => {
  // Path contract with backend:
  // - root-relative virtual path only (no leading '/')
  // - examples: "foo.txt", "folder/sub/file.pdf"
  // Step 1: Request an upload URL from the backend
  const requestResponse = await api.post('/uploads/document/request/', {
    file_name: file.name,
    file_size: file.size,
    path: path || null,
  });

  const { upload_url, storage_key, unique_name } = requestResponse.data;

  // Step 2: Upload the file directly to the file server
  // We use axios directly here because the URL is not relative to the API base,
  // and we don't need the auth interceptors for this pre-signed URL.
  await axios.put(upload_url, file, {
    headers: {
      'Content-Type': file.type,
    },
    onUploadProgress: (progressEvent) => {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      if (onProgress) {
        onProgress(percentCompleted);
      }
    },
  });

  // Step 3: Finalize the upload with the backend
  return api.post('/uploads/document/finalize/', {
    storage_key,
    unique_name,
    file_size: file.size,
    content_type: file.type,
    path: path || null,
  });
};

export const uploadNewVersion = async (documentId, file) => {
  // Step 1: Request an upload URL
  const requestResponse = await api.post(`/uploads/document/${documentId}/versions/request/`, {
    file_name: file.name,
    file_size: file.size,
  });

  const { upload_url, storage_key } = requestResponse.data;

  // Step 2: Upload the file directly to the file server
  await axios.put(upload_url, file, {
    headers: {
      'Content-Type': file.type,
    },
  });

  // Step 3: Finalize the upload
  return api.post(`/uploads/document/${documentId}/versions/finalize/`, {
    storage_key,
    file_size: file.size,
    content_type: file.type,
  });
};

export const getFolderContents = (id) => api.get(`/folders/${id}/`);

export const getRootFolderContents = () => api.get('/folders/');

export const getRootFolderId = () => api.get('/folders/root/');

export const createFolder = (name, parentId = null) => api.post('/folders/', { name, parent: parentId });

export const ensureFolderPaths = (paths, parentPath = null) =>
  // `paths` and `parentPath` are root-relative folder paths (no leading '/').
  api.post('/folders/ensure-paths/', { paths, parent_path: parentPath });

export const deleteDocument = (id) => api.delete(`/documents/${id}/`);

export const copyDocument = (id) => api.post(`/documents/${id}/copy/`);

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

export const getDocumentDownloadUrl = (id) => api.get(`/documents/${id}/download/`);

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

export const getShareLinkViewData = (
  slug,
  {
    previewToken = null,
    accessToken = null,
    dataroomDocumentId = null,
    parentId = null,
    limit = null,
    offset = null,
  } = {}
) => {
  const params = {};
  if (previewToken) params.previewToken = previewToken;
  if (accessToken) params.accessToken = accessToken;
  if (dataroomDocumentId) params.dataroom_document_id = dataroomDocumentId;
  if (parentId) params.parent_id = parentId;
  if (limit !== null && limit !== undefined) params.limit = limit;
  if (offset !== null && offset !== undefined) params.offset = offset;
  return api.get(`/links/${slug}/view-data/`, { params });
};

export const getShareLinkPublicMeta = (slug) =>
  api.get(`/links/${slug}/public-meta/`);

export const verifyShareLinkPassword = (slug, password) =>
  api.post(`/links/${slug}/verify-password/`, { password });

export const requestShareLinkAccess = (slug, email) =>
  api.post(`/links/${slug}/request-access/`, { email });

export const getPublicQnaThreads = (
  slug,
  {
    viewSessionId,
    dataroomDocumentId = null,
    dataroomFolderId = null,
  } = {}
) => {
  const params = {};
  if (viewSessionId) params.view_session_id = viewSessionId;
  if (dataroomDocumentId) params.dataroom_document_id = dataroomDocumentId;
  if (dataroomFolderId) params.dataroom_folder_id = dataroomFolderId;
  return api.get(`/links/${slug}/qna-threads/`, { params });
};

export const createPublicQnaThread = (
  slug,
  {
    viewSessionId,
    subject,
    body,
    dataroomDocumentId = null,
    dataroomFolderId = null,
  }
) => {
  const payload = {
    view_session_id: viewSessionId,
    subject,
    body,
  };
  if (dataroomDocumentId) payload.dataroom_document_id = dataroomDocumentId;
  if (dataroomFolderId) payload.dataroom_folder_id = dataroomFolderId;
  return api.post(`/links/${slug}/qna-threads/`, payload);
};

export const getPublicQnaMessages = (slug, threadId, { viewSessionId } = {}) => {
  const params = {};
  if (viewSessionId) params.view_session_id = viewSessionId;
  return api.get(`/links/${slug}/qna-threads/${threadId}/messages/`, { params });
};

export const createPublicQnaMessage = (slug, threadId, { viewSessionId, body }) =>
  api.post(`/links/${slug}/qna-threads/${threadId}/messages/`, {
    view_session_id: viewSessionId,
    body,
  });

export const getOwnerQnaThreads = ({
  documentId = null,
  dataroomId = null,
  shareLinkId = null,
  status = null,
} = {}) => {
  const params = {};
  if (documentId) params.document_id = documentId;
  if (dataroomId) params.dataroom_id = dataroomId;
  if (shareLinkId) params.share_link_id = shareLinkId;
  if (status && status !== 'all') params.status = status;
  return api.get('/qna-threads/', { params });
};

export const updateOwnerQnaThreadStatus = (threadId, status) =>
  api.patch(`/qna-threads/${threadId}/`, { status });

export const createOwnerQnaMessage = (threadId, body) =>
  api.post(`/qna-threads/${threadId}/messages/`, { body });

export const createViewSession = (data) => api.post('/view-sessions/', data);

export const recordDownload = (viewSessionId, dataroomDocumentId = null) =>
  api.post(
    `/view-sessions/${viewSessionId}/record-download/`,
    dataroomDocumentId ? { dataroom_document_id: dataroomDocumentId } : {}
  );

export const recordDataroomVisit = (viewId, { dataroomDocumentId, dataroomFolderId }) => {
  const payload = {};
  if (dataroomDocumentId) {
    payload.dataroom_document_id = dataroomDocumentId;
  } else if (dataroomFolderId) {
    payload.dataroom_folder_id = dataroomFolderId;
  }
  return api.post(`/view-sessions/${viewId}/record-visit/`, payload);
};

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

// Automations
export const getAutomations = () => api.get('/automations/');
export const createAutomation = (data) => api.post('/automations/', data);
export const updateAutomation = (id, data) => api.patch(`/automations/${id}/`, data);
export const deleteAutomation = (id) => api.delete(`/automations/${id}/`);

export const getAutomationDestinations = () => api.get('/automation-destinations/');
export const createAutomationDestination = (data) => api.post('/automation-destinations/', data);
export const updateAutomationDestination = (id, data) => api.patch(`/automation-destinations/${id}/`, data);
export const deleteAutomationDestination = (id) => api.delete(`/automation-destinations/${id}/`);

export const getAutomationDeliveries = ({ ruleId = null, destinationId = null, page = 1 } = {}) => {
  const params = {};
  if (ruleId) params.rule_id = ruleId;
  if (destinationId) params.destination_id = destinationId;
  params.page = page;
  return api.get('/automation-deliveries/', { params });
};
export const replayAutomationDelivery = (deliveryId) =>
  api.post(`/automation-deliveries/${deliveryId}/replay/`);

export const getShareLinks = () => api.get('/share-links/');

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
export const getDataroom = (id, params) => api.get(`/datarooms/${id}/`, { params });
export const createDataroom = (data) => api.post('/datarooms/', data);
export const createDataroomFolder = (data) => api.post('/dataroom-folders/', data);
export const renameDataroomFolder = (id, name) => api.patch(`/dataroom-folders/${id}/`, { name });
export const renameDataroomDocument = (id, name) => api.patch(`/dataroom-documents/${id}/`, { name });
export const updateDataroomFolder = (id, data) => api.patch(`/dataroom-folders/${id}/`, data);
export const updateDataroomDocument = (id, data) => api.patch(`/dataroom-documents/${id}/`, data);
export const updateDataroom = (id, data) => api.patch(`/datarooms/${id}/`, data);
export const updateDataroomBranding = (id, { name, bannerFile, removeBanner = false, brandPrimaryColor, brandSecondaryColor, brandAccentColor, showFileIndex }) => {
  const formData = new FormData();
  if (name !== undefined) {
    formData.append('name', name);
  }
  if (bannerFile) {
    formData.append('branding_banner', bannerFile);
  }
  formData.append('remove_branding_banner', removeBanner ? 'true' : 'false');
  if (brandPrimaryColor !== undefined) {
    formData.append('brand_primary_color', brandPrimaryColor || '');
  }
  if (brandSecondaryColor !== undefined) {
    formData.append('brand_secondary_color', brandSecondaryColor || '');
  }
  if (brandAccentColor !== undefined) {
    formData.append('brand_accent_color', brandAccentColor || '');
  }
  if (showFileIndex !== undefined) {
    formData.append('show_file_index', showFileIndex ? 'true' : 'false');
  }
  return api.patch(`/datarooms/${id}/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
export const deleteDataroom = (id) => api.delete(`/datarooms/${id}/`);
export const addContentToDataroom = (id, data) => api.post(`/datarooms/${id}/add-content/`, data);
export const removeContentFromDataroom = (id, data) => api.post(`/datarooms/${id}/remove-content/`, data);
export const moveDataroomContent = (id, data) => api.post(`/datarooms/${id}/move-content/`, data);
export const reorderDataroomItems = (id, data) => api.post(`/datarooms/${id}/reorder-items/`, data);
export const getDataroomFolderContents = (folderId) => api.get(`/dataroom-folders/${folderId}/`);
export const getShareLinksForDataroom = (dataroomId) => api.get(`/share-links/?dataroom_id=${dataroomId}`);
export const updateDataroomLinkSettings = (linkId, settings) => api.patch(`/share-links/${linkId}/dataroom-settings/`, settings);
export const getDataroomViewSessions = (dataroomId, page = 1) => api.get(`/datarooms/${dataroomId}/view-sessions/?page=${page}`);

export const downloadDataroomFolder = (slug, folderId, viewSessionId = null) => {
  const params = {};
  if (viewSessionId) {
    params.view_session_id = viewSessionId;
  }
  return api.get(`/links/${slug}/download-folder/${folderId}/`, {
    responseType: 'blob',
    params,
  });
};

// File Requests
export const getFileRequests = (page = 1) => api.get(`/file-requests/?page=${page}`);
export const getFileRequest = (id) => api.get(`/file-requests/${id}/`);
export const createFileRequest = (data) => api.post('/file-requests/', data);
export const updateFileRequest = (id, data) => api.patch(`/file-requests/${id}/`, data);
export const deleteFileRequest = (id) => api.delete(`/file-requests/${id}/`);

// Public File Requests
export const getPublicFileRequest = (slug) => api.get(`/public/file-requests/${slug}/`);
export const requestPublicUpload = (slug, data) => api.post(`/public/file-requests/${slug}/request-upload/`, data);
export const finalizePublicUpload = (slug, data) => api.post(`/public/file-requests/${slug}/finalize-upload/`, data);


// Admin
export const getAdminSettings = () => api.get('/admin/settings/');
export const updateAdminSetting = (key, value) => api.patch(`/admin/settings/${key}/`, { value });
export const getAdminUsers = () => api.get('/admin/users/');
export const createAdminUser = (data) => api.post('/admin/users/', data);
export const updateAdminUser = (id, data) => api.patch(`/admin/users/${id}/`, data);
export const deleteAdminUser = (id) => api.delete(`/admin/users/${id}/`);
export const getAdminLoginActivities = (page = 1) => api.get(`/admin/login-activities/?page=${page}`);
export const getAdminSecurityThreatEvents = ({ page = 1, status = '', severity = '', eventType = '' } = {}) => {
  const params = { page };
  if (status) params.status = status;
  if (severity) params.severity = severity;
  if (eventType) params.event_type = eventType;
  return api.get('/admin/security-threat-events/', { params });
};
    
export default api;
