import { ApiReferenceView, buildApiReferenceMetadata } from '../../../components/ApiReferenceViews';

export const metadata = buildApiReferenceMetadata('zh');

export default function ZhApiReferencePage() {
  return <ApiReferenceView locale="zh" />;
}
