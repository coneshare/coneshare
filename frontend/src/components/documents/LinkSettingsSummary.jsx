import { ShieldCheck, Mail, CalendarOff, Download, Droplets } from 'lucide-react';
import { Badge } from '../ui/Badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/Tooltip';

function LinkSetting({ icon, text }) {
  return (
    <li className="flex items-center gap-2">
      {icon}
      <span className="text-sm">{text}</span>
    </li>
  );
}

export function LinkSettingsSummary({ link, onClick }) {
  const settings = [];

  if (link.has_password) {
    settings.push(
      <LinkSetting
        key="password"
        icon={<ShieldCheck className="h-4 w-4 text-gray-500" />}
        text="Password protected"
      />
    );
  }

  if (link.requires_email) {
    settings.push(
      <LinkSetting
        key="email"
        icon={<Mail className="h-4 w-4 text-gray-500" />}
        text="Requires email to view"
      />
    );
  }

  if (link.expires_at) {
    const formattedDateTime = new Date(link.expires_at).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    settings.push(
      <LinkSetting
        key="expires"
        icon={<CalendarOff className="h-4 w-4 text-gray-500" />}
        text={`Expires on ${formattedDateTime}`}
      />
    );    
  }

  if (link.allow_download) {
    settings.push(
      <LinkSetting
        key="download"
        icon={<Download className="h-4 w-4 text-gray-500" />}
        text="Download enabled"
      />
    );
  }

  if (link.enable_watermark) {
    settings.push(
      <LinkSetting
        key="watermark"
        icon={<Droplets className="h-4 w-4 text-gray-500" />}
        text="Watermark enabled"
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
            {settings.length} Setting{settings.length !== 1 ? 's' : ''}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <ul className="space-y-2 py-1">{settings}</ul>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
