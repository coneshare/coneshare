import { Link, useLocation } from 'react-router-dom';

const NAV_LINKS = [
  { to: '/admin/settings', label: 'Settings' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/login-activity', label: 'Login Activity' },
  { to: '/admin/security-alerts', label: 'Security Alerts' },
];

export function AdminNav() {
  const { pathname } = useLocation();

  return (
    <div className="mb-6 border-b pb-4">
      <nav className="flex items-center gap-x-4 text-sm">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.to}
            to={link.to}
            className={
              pathname === link.to
                ? 'font-semibold text-primary'
                : 'text-muted-foreground transition-colors hover:text-primary'
            }
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
