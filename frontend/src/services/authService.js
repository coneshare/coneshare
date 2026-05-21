import api from './api';

const storeTokens = (data) => {
  if (data.access) localStorage.setItem('access_token', data.access);
  if (data.refresh) localStorage.setItem('refresh_token', data.refresh);
};

const login = async (email, password) => {
  const response = await api.post('/token/', { email, password });
  storeTokens(response.data);
  return response.data;
};

const logout = async () => {
  const refreshToken = localStorage.getItem('refresh_token');
  try {
    if (refreshToken) {
      await api.post('/logout/', { refresh: refreshToken });
    }
  } catch (error) {
    // Log the error but proceed with cleanup
    console.error('Logout failed:', error);
  } finally {
    // Always clear local storage on logout
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }
};

const requestSignup = async ({ email, password, name = '' }) => {
  const response = await api.post('/signup/', { email, password, name });
  return response.data;
};

const verifySignup = async ({ uid, token }) => {
  const response = await api.post('/signup/verify/', { uid, token });
  storeTokens(response.data);
  return response.data;
};

const getPublicSettings = async () => {
  const response = await api.get('/public/settings/');
  return response.data;
};

export const authService = {
  login,
  logout,
  requestSignup,
  verifySignup,
  getPublicSettings,
};
