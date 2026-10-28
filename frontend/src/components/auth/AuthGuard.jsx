import { Navigate, Outlet, useLocation } from 'react-router-dom';

export function AuthGuard() {
  const token = localStorage.getItem('access_token') || localStorage.getItem('refresh_token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

export default AuthGuard;
