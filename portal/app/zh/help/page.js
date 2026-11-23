import { HelpIndexView, buildHelpIndexMetadata } from '../../../components/HelpViews';

export const metadata = buildHelpIndexMetadata('zh');

export default function ZhHelpPage() {
  return <HelpIndexView locale="zh" />;
}
