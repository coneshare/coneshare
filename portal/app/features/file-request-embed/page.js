import {
  FileRequestEmbedView,
  buildFileRequestEmbedMetadata,
} from '../../../components/FeaturesViews';

export const metadata = buildFileRequestEmbedMetadata('en');

export default function FileRequestEmbedPage() {
  return <FileRequestEmbedView locale="en" />;
}
