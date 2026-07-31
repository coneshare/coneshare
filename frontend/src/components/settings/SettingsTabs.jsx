import { NavLink } from 'react-router-dom';

export function SettingsTabs() {
  const tabs = [
    { to: '/settings', label: 'Profile', end: true },
    { to: '/settings/password', label: 'Password' },
    { to: '/settings/integrations', label: 'Integrations' },
    { to: '/settings/api-keys', label: 'API Keys' },
  ];

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
      <nav className="-mb-px flex space-x-8" aria-label="Tabs">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              `border-b-2 py-4 px-1 text-sm font-medium transition-colors ${
                isActive
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
