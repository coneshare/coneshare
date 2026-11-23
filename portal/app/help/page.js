import { HelpIndexView, buildHelpIndexMetadata } from '../../components/HelpViews';

export const metadata = buildHelpIndexMetadata('en');

export default function HelpPage() {
  return <HelpIndexView locale="en" />;
}
