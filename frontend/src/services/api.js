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

// Response interceptor to handle 401 errors and token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Check if the error is 401 and it's not a retry request
    if (error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true; // Mark request to avoid infinite loops

      try {
        const refreshToken = localStorage.getItem('refresh_token');
        if (!refreshToken) {
          // If no refresh token, just clean up and redirect
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
          return Promise.reject(error);
        }

        const { data } = await axios.post('/api/v1/token/refresh/', {
          refresh: refreshToken,
        });

        localStorage.setItem('access_token', data.access);
        originalRequest.headers['Authorization'] = `Bearer ${data.access}`;
        
        // Retry the original request with the new token
        return api(originalRequest);
      } catch (refreshError) {
        // If refresh fails, clear tokens and redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    // For other errors, show a toast
    if (error.response?.data?.detail) {
      toast.error(error.response.data.detail);
    } else if (error.message) {
      toast.error(error.message);
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

export const getFolderContents = (id) => api.get(`/folders/${id}/`);

export const getRootFolderContents = () => api.get('/folders/');

export const createFolderFromPath = (path) => api.post('/folders/from_path/', { path });

export const deleteDocument = (id) => api.delete(`/documents/${id}/`);

export const deleteFolder = (id) => api.delete(`/folders/${id}/`);

export default api;
