import {
  FileRequestEmbedView,
  buildFileRequestEmbedMetadata,
} from '../../../../components/FeaturesViews';

export const metadata = buildFileRequestEmbedMetadata('zh');

export default function ZhFileRequestEmbedPage() {
  return <FileRequestEmbedView locale="zh" />;
}
