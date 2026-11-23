import { ApiReferenceView, buildApiReferenceMetadata } from '../../components/ApiReferenceViews';

export const metadata = buildApiReferenceMetadata('en');

export default function ApiReferencePage() {
  return <ApiReferenceView locale="en" />;
}
