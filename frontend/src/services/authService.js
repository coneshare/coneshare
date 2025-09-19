const logout = async () => {
  const refreshToken = localStorage.getItem('refresh_token');
  const accessToken = localStorage.getItem('access_token');

  if (!refreshToken || !accessToken) {
    // If tokens are not present, just clear storage and treat as logged out
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    return;
  }

  try {
    await fetch('/api/v1/logout/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refresh: refreshToken }),
    });
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
  logout,
};
