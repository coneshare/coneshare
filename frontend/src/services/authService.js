import api from './api';

const login = async (email, password) => {
  const response = await api.post('/token/', { email, password });
  if (response.data.access && response.data.refresh) {
    localStorage.setItem('access_token', response.data.access);
    localStorage.setItem('refresh_token', response.data.refresh);
  }
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

export const authService = {
  login,
  logout,
};
