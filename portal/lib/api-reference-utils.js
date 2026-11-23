export const METHOD_BADGE_CLASSES = {
  GET: 'bg-gray-100 text-gray-900 border-gray-300',
  POST: 'bg-gray-900 text-white border-gray-900',
  PATCH: 'bg-gray-700 text-white border-gray-700',
  PUT: 'bg-gray-700 text-white border-gray-700',
  DELETE: 'bg-red-50 text-red-800 border-red-200',
};

export const TIER_LABELS = {
  en: {
    public: 'Public',
    read_only: 'read_only+',
    read_write: 'read_write+',
    full_access: 'full_access',
  },
  zh: {
    public: '公开接口',
    read_only: 'read_only+',
    read_write: 'read_write+',
    full_access: 'full_access',
  },
};

export function resolveSamplePath(path, parameters = []) {
  let resolved = path;
  (parameters || [])
    .filter((param) => param.in === 'path')
    .forEach((param) => {
      const placeholder = param.name === 'slug' ? 'demo-link' : '550e8400-e29b-41d4-a716-446655440000';
      resolved = resolved.replaceAll(`{${param.name}}`, placeholder);
    });
  return resolved;
}

export function buildCodeSnippet(endpoint, baseUrl = 'https://app.coneshare.com', lang = 'curl') {
  const samplePath = resolveSamplePath(endpoint.path, endpoint.parameters);
  const url = `${baseUrl}${samplePath}`;
  const method = endpoint.method || 'GET';
  const isPublic = endpoint.tierHint === 'public';
  const hasBody =
    endpoint.sampleRequestBody !== null &&
    endpoint.sampleRequestBody !== undefined &&
    ['POST', 'PATCH', 'PUT'].includes(method);
  const jsonBody = hasBody ? JSON.stringify(endpoint.sampleRequestBody, null, 2) : null;

  if (lang === 'javascript') {
    const headers = isPublic
      ? hasBody
        ? `{ 'Content-Type': 'application/json' }`
        : null
      : hasBody
        ? `{\n    'Authorization': 'Bearer cs_live_your_api_key',\n    'Content-Type': 'application/json',\n  }`
        : `{\n    'Authorization': 'Bearer cs_live_your_api_key',\n  }`;

    const optionsLines = [`  method: '${method}',`];
    if (headers) {
      optionsLines.push(`  headers: ${headers},`);
    }
    if (jsonBody) {
      const indentedBody = jsonBody.replace(/\n/g, '\n  ');
      optionsLines.push(`  body: JSON.stringify(${indentedBody}),`);
    }
    return `const response = await fetch('${url}', {\n${optionsLines.join('\n')}\n});\n\nconst data = await response.json();\nconsole.log(data);`;
  }

  if (lang === 'python') {
    const lines = ['import requests', ''];
    lines.push(`url = "${url}"`);
    if (!isPublic) {
      lines.push('headers = {"Authorization": "Bearer cs_live_your_api_key"}');
    }
    if (jsonBody) {
      lines.push(`payload = ${jsonBody.replace(/\btrue\b/g, 'True').replace(/\bfalse\b/g, 'False').replace(/\bnull\b/g, 'None')}`);
    }
    const callArgs = ['url'];
    if (!isPublic) callArgs.push('headers=headers');
    if (jsonBody) callArgs.push('json=payload');
    lines.push(`response = requests.${method.toLowerCase()}(${callArgs.join(', ')})`);
    lines.push('response.raise_for_status()');
    lines.push('print(response.json())');
    return lines.join('\n');
  }

  const curlParts = [`curl -X ${method} "${url}"`];
  if (!isPublic) {
    curlParts.push(`  -H "Authorization: Bearer cs_live_your_api_key"`);
  }
  if (jsonBody) {
    curlParts.push(`  -H "Content-Type: application/json"`);
    curlParts.push(`  -d '${jsonBody}'`);
  }
  return curlParts.join(' \\\n');
}

export function filterApiCategories(categories = [], selectedCategoryId = 'all', query = '') {
  const normalizedQuery = String(query || '').trim().toLowerCase();

  return (categories || [])
    .filter((cat) => selectedCategoryId === 'all' || cat.id === selectedCategoryId)
    .map((cat) => {
      if (!normalizedQuery) return cat;
      const matched = (cat.endpoints || []).filter(
        (ep) =>
          ep.path.toLowerCase().includes(normalizedQuery) ||
          ep.summary.toLowerCase().includes(normalizedQuery) ||
          ep.method.toLowerCase().includes(normalizedQuery) ||
          (ep.description || '').toLowerCase().includes(normalizedQuery)
      );
      return { ...cat, endpoints: matched };
    })
    .filter((cat) => (cat.endpoints || []).length > 0);
}
