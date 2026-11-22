/**
 * CloudFront Function (Viewer Request) for serving Next.js `output: 'export'`
 * static HTML files stored under `/site/` in Cloudflare R2.
 */
function handler(event) {
  var request = event.request;
  var uri = request.uri;

  if (uri === '/') {
    request.uri = '/index.html';
    return request;
  }

  var lastSegment = uri.split('/').pop();
  if (lastSegment.indexOf('.') !== -1) {
    return request;
  }

  request.uri = uri.replace(/\/+$/, '') + '.html';
  return request;
}
