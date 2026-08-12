import { useTranslation } from 'react-i18next';
import { ShieldCheck, Mail, CalendarOff, Download, Droplets } from 'lucide-react';
import { Badge } from '../ui/Badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/Tooltip';
import { formatDate } from '../../utils/formatters';

function LinkSetting({ icon, text }) {
  return (
    <li className="flex items-center gap-2">
      {icon}
      <span className="text-sm">{text}</span>
    </li>
  );
}

export function LinkSettingsSummary({ link, onClick }) {
  const { t } = useTranslation();
  const settings = [];

  if (link.has_password) {
    settings.push(
      <LinkSetting
        key="password"
        icon={<ShieldCheck className="h-4 w-4 text-gray-500" />}
        text={t('links.passwordProtected')}
      />
    );
  }

  if (link.requires_email) {
    settings.push(
      <LinkSetting
        key="email"
        icon={<Mail className="h-4 w-4 text-gray-500" />}
        text={t('links.requiresEmail')}
      />
    );
  }

  if (link.expires_at) {
    const formattedDateTime = formatDate(link.expires_at, 'PP p');
    settings.push(
      <LinkSetting
        key="expires"
        icon={<CalendarOff className="h-4 w-4 text-gray-500" />}
        text={t('links.expiresOn', { date: formattedDateTime })}
      />
    );    
  }

  if (link.allow_download) {
    settings.push(
      <LinkSetting
        key="download"
        icon={<Download className="h-4 w-4 text-gray-500" />}
        text={t('links.downloadEnabled')}
      />
    );
  }

  if (link.enable_watermark) {
    settings.push(
      <LinkSetting
        key="watermark"
        icon={<Droplets className="h-4 w-4 text-gray-500" />}
        text={t('links.watermarkEnabled')}
      />
    );
  }

  if (settings.length === 0) {
    return <span className="text-sm text-gray-500">—</span>;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild onClick={onClick}>
          <Badge variant="outline" className="cursor-pointer whitespace-nowrap">
            {t('links.settingCount', { count: settings.length })}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <ul className="space-y-2 py-1">{settings}</ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
