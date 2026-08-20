import axios from 'axios';
import { toast } from 'sonner';
import { getLocalizedErrorMessage } from '../utils/errorTranslator';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add the auth token header and language preference to requests
api.interceptors.request.use(
  (config) => {
    const lang = localStorage.getItem('i18nextLng') || 'en';
    config.headers['Accept-Language'] = lang;
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
      ['password', 'email', 'nda'].includes(error.response?.data?.protectionType);

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

    // For other errors, show a toast, preferring translated/mapped error messages.
    const errorMessage = getLocalizedErrorMessage(error);

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

export const getDocumentPreviewData = (id, versionId = null) => {
  const params = {};
  if (versionId) params.version_id = versionId;
  return api.get(`/documents/${id}/preview-data/`, { params });
};

export const rebuildDocumentPreview = (id, versionId = null) => {
  const data = {};
  if (versionId) data.version_id = versionId;
  return api.post(`/documents/${id}/rebuild-preview/`, data);
};

export const promoteDocumentVersion = (documentId, versionId) =>
  api.post(`/documents/${documentId}/promote_version/`, { version_id: versionId });

export const getDocumentVersions = (documentId, page = 1) =>
  api.get(`/documents/${documentId}/versions/`, { params: { page } });

export const getDocumentDownloadUrl = (id) => api.get(`/documents/${id}/download/`);

export const getDocumentDetails = (id) => api.get(`/documents/${id}/`);

export const getDocumentStatus = (id) => api.get(`/documents/${id}/status/`);

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
    viewSessionId = null,
  } = {}
) => {
  const params = {};
  if (previewToken) params.previewToken = previewToken;
  if (accessToken) params.accessToken = accessToken;
  if (dataroomDocumentId) params.dataroom_document_id = dataroomDocumentId;
  if (parentId) params.parent_id = parentId;
  if (limit !== null && limit !== undefined) params.limit = limit;
  if (offset !== null && offset !== undefined) params.offset = offset;
  if (viewSessionId) params.view_session_id = viewSessionId;
  return api.get(`/links/${slug}/view-data/`, { params });
};

export const getShareLinkPublicMeta = (slug) =>
  api.get(`/links/${slug}/public-meta/`);

export const verifyShareLinkPassword = (slug, password) =>
  api.post(`/links/${slug}/verify-password/`, { password });

export const acceptShareLinkNda = (slug, data) =>
  api.post(`/links/${slug}/accept-nda/`, data);

export const requestShareLinkAccess = (slug, email) =>
  api.post(`/links/${slug}/request-access/`, { email });

export const confirmShareLinkEmailAccess = (slug, token) =>
  api.post(`/links/${slug}/verify-access-token/confirm/`, { token });

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

export const getPublicQnaSummary = (
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
  return api.get(`/links/${slug}/qna-summary/`, { params });
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

export const createOwnerQnaThread = ({
  shareLinkId,
  subject,
  body,
  dataroomDocumentId = null,
  dataroomFolderId = null,
}) => {
  const payload = {
    share_link_id: shareLinkId,
    subject,
    body,
  };
  if (dataroomDocumentId) payload.dataroom_document_id = dataroomDocumentId;
  if (dataroomFolderId) payload.dataroom_folder_id = dataroomFolderId;
  return api.post('/qna-threads/', payload);
};

export const createOwnerQnaMessage = (threadId, body) =>
  api.post(`/qna-threads/${threadId}/messages/`, { body });

export const createViewSession = (data) => api.post('/view-sessions/', data);

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

export const recordLinkClick = (data, useBeacon = false) => {
  const payload = JSON.stringify(data);
  const url = `${api.defaults.baseURL}/link-clicks/record/`;

  // Use sendBeacon for maximum reliability during page unload
  if (useBeacon && navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'application/json' });
    navigator.sendBeacon(url, blob);
    return Promise.resolve();
  }

  return fetch(url, {
    method: 'POST',
    body: payload,
    headers: { 'Content-Type': 'application/json' },
    keepalive: true,
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

export const deleteCloudConnection = (connectionId) => api.delete(`/cloud/connections/${connectionId}/`);

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

export const refreshCloudDocument = (documentId) =>
  api.post(`/cloud/documents/${documentId}/refresh/`);

export const importCloudVersion = (documentId, { connectionId, fileId, fileName, fileSize }) =>
  api.post(`/cloud/documents/${documentId}/import_version/`, {
    connection_id: connectionId,
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
export const updateDataroomBranding = (id, { name, bannerFile, removeBanner = false, brandPrimaryColor, brandSecondaryColor, brandAccentColor, showFileIndex, enableQna }) => {
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
  if (enableQna !== undefined) {
    formData.append('enable_qna', enableQna ? 'true' : 'false');
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
export const ensureDataroomFolderPaths = (dataroomId, paths, parentFolderId = null) =>
  api.post(`/datarooms/${dataroomId}/ensure-paths/`, { paths, parent_folder_id: parentFolderId });

export const uploadDataroomDocument = async (dataroomId, file, destinationFolderId = null, path = null, onProgress = null) => {
  const requestResponse = await api.post(`/datarooms/${dataroomId}/uploads/request/`, {
    file_name: file.name,
    file_size: file.size,
    destination_folder_id: destinationFolderId || null,
    path: path || null,
  });

  const { upload_url, storage_key, unique_name } = requestResponse.data;

  await axios.put(upload_url, file, {
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress(percentCompleted);
      }
    },
  });

  return api.post(`/datarooms/${dataroomId}/uploads/finalize/`, {
    storage_key,
    unique_name,
    file_size: file.size,
    content_type: file.type || 'application/octet-stream',
    destination_folder_id: destinationFolderId || null,
    path: path || null,
  });
};
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

export const listCloudFolders = (connectionId, path = '/') =>
  api.get(`/cloud/connections/${connectionId}/folders/`, { params: { path } });

export const exportFileRequestUploads = (requestId, data) =>
  api.post(`/file-requests/${requestId}/exports/`, data);

export const getFileRequestExports = (requestId) =>
  api.get(`/file-requests/${requestId}/exports/`);


// Admin
export const getAdminBranding = () => api.get('/admin/organization/');
export const updateAdminBranding = (data) => api.patch('/admin/organization/', data, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const getAdminSettings = () => api.get('/admin/settings/');
export const updateAdminSetting = (key, value) => api.patch(`/admin/settings/${key}/`, { value });
export const getAdminUsers = (page = 1) => api.get(`/admin/users/?page=${page}`);
export const getAdminUserDetails = (id) => api.get(`/admin/users/${id}/`);
export const getAdminUserShareLinks = (id, page = 1) => api.get(`/admin/users/${id}/share-links/?page=${page}`);
export const getAdminUserDatarooms = (id, page = 1) => api.get(`/admin/users/${id}/datarooms/?page=${page}`);
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
    
// Trash
export const getTrashItems = (page = 1) => api.get(`/trash/?page=${page}`);
export const restoreTrashItem = (id) => api.post(`/trash/${id}/restore/`);
export const permanentDeleteTrashItem = (id) => api.delete(`/trash/${id}/permanent/`);
export const emptyTrash = () => api.delete('/trash/empty/');

// API Keys
export const getApiKeys = () => api.get('/api-keys/');
export const createApiKey = (data) => api.post('/api-keys/', data);
export const deleteApiKey = (id) => api.delete(`/api-keys/${id}/`);

export default api;
