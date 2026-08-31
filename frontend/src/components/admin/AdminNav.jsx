import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function AdminNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();

  const navLinks = [
    { to: '/admin/settings', label: t('admin.settingsNav') },
    { to: '/admin/branding', label: t('admin.branding') },
    { to: '/admin/users', label: t('admin.users') },
    { to: '/admin/datarooms', label: t('admin.datarooms') },
    { to: '/admin/login-activity', label: t('admin.loginActivity') },
    { to: '/admin/security-alerts', label: t('admin.securityAlerts') },
  ];

  return (
    <div className="mb-6 border-b pb-4">
      <nav className="flex items-center gap-x-4 text-sm">
        {navLinks.map((link) => (
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
