import { createServer } from 'http';

// ---------------------------------------------------------------------------
// Mock Confluence REST API v2 Server
// For testing the WasmEdge Confluence CLI toolkit
// Runs on port 8090 (configurable via MOCK_PORT env)
// ---------------------------------------------------------------------------

const PORT = 8090;

// In-memory data store
const store = {
  pages: {
    '123': { id: '123', status: 'current', title: 'Test Page', spaceId: '456', parentId: '789', parentType: 'page', authorId: 'user1', createdAt: '2025-01-15T10:30:00Z', version: { number: 3, createdAt: '2025-03-01T14:00:00Z', message: 'Updated intro', minorEdit: false, authorId: 'user1' }, body: { storage: { value: '<p>Test page content</p>', representation: 'storage' } }, _links: { webui: '/spaces/DEV/pages/123/Test+Page' } },
    '124': { id: '124', status: 'current', title: 'Another Page', spaceId: '456', parentId: '123', parentType: 'page', authorId: 'user1', createdAt: '2025-02-10T09:00:00Z', version: { number: 1, createdAt: '2025-02-10T09:00:00Z', message: '', minorEdit: false, authorId: 'user1' }, body: { storage: { value: '<p>Another page</p>', representation: 'storage' } }, _links: { webui: '/spaces/DEV/pages/124/Another+Page' } },
    '125': { id: '125', status: 'current', title: 'Third Page', spaceId: '456', parentId: '123', parentType: 'page', authorId: 'user2', createdAt: '2025-03-05T11:00:00Z', version: { number: 2, createdAt: '2025-03-10T15:00:00Z', message: '', minorEdit: true, authorId: 'user2' }, body: { storage: { value: '<p>Third page</p>', representation: 'storage' } }, _links: { webui: '/spaces/DEV/pages/125/Third+Page' } },
    '126': { id: '126', status: 'draft', title: 'Draft Page', spaceId: '457', parentId: null, parentType: 'page', authorId: 'user1', createdAt: '2025-03-15T08:00:00Z', version: { number: 1, createdAt: '2025-03-15T08:00:00Z', message: '', minorEdit: false, authorId: 'user1' }, body: { storage: { value: '<p>Draft</p>', representation: 'storage' } }, _links: { webui: '/spaces/TEST/pages/126/Draft+Page' } },
  },
  spaces: {
    '456': { id: '456', key: 'DEV', name: 'Development', type: 'global', status: 'current', description: { plain: { value: 'Dev team space' } }, homepageId: '123' },
    '457': { id: '457', key: 'TEST', name: 'Testing', type: 'global', status: 'current', description: { plain: { value: 'Test space' } }, homepageId: '126' },
    '458': { id: '458', key: 'PERSONAL', name: 'My Space', type: 'personal', status: 'current', description: { plain: { value: 'Personal space' } }, homepageId: null },
  },
  comments: {
    '555': { id: '555', pageId: '123', body: { storage: { value: '<p>Great work!</p>' } }, authorId: 'user2', createdAt: '2025-03-19T12:00:00Z', version: { number: 1 } },
    '556': { id: '556', pageId: '123', body: { storage: { value: '<p>Thanks!</p>' } }, authorId: 'user1', createdAt: '2025-03-19T13:00:00Z', version: { number: 1 } },
  },
  labels: {
    '123': [
      { id: 'L1', name: 'reviewed', prefix: 'global' },
      { id: 'L2', name: 'approved', prefix: 'global' },
    ],
  },
  versions: {
    '123': [
      { number: 3, createdAt: '2025-03-01T14:00:00Z', message: 'Updated intro', minorEdit: false, authorId: 'user1' },
      { number: 2, createdAt: '2025-02-15T10:00:00Z', message: '', minorEdit: true, authorId: 'user1' },
      { number: 1, createdAt: '2025-01-15T10:30:00Z', message: 'Initial', minorEdit: false, authorId: 'user1' },
    ],
  },
  attachments: {
    '123': [
      { id: 'ATT1', title: 'diagram.png', mediaType: 'image/png', fileSize: 24576, pageId: '123', status: 'current', _links: { download: '/wiki/rest/api/content/123/child/attachment/ATT1/download' } },
    ],
  },
  properties: {
    '123': [
      { id: 'P1', key: 'custom', value: { status: 'reviewed', assignee: 'user@example.com' }, version: { number: 1 } },
      { id: 'P2', key: 'metadata', value: { color: 'blue' }, version: { number: 3 } },
    ],
  },
  nextId: 1000,
};

// Paginated pages for --all testing (space "paginated")
const paginatedPages = [];
for (let i = 0; i < 8; i++) {
  paginatedPages.push({
    id: String(200 + i), status: 'current', title: 'Paginated Page ' + i,
    spaceId: 'paginated', parentId: null, parentType: 'page', authorId: 'user1',
    createdAt: '2025-01-01T00:00:00Z', version: { number: 1 },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': data.length });
  res.end(data);
  return true;
}

function collectBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => resolve(body));
  });
}

function parseQuery(url) {
  const q = {};
  const idx = url.indexOf('?');
  if (idx === -1) return q;
  const pairs = url.slice(idx + 1).split('&');
  for (const p of pairs) {
    const [k, v] = p.split('=');
    q[decodeURIComponent(k)] = decodeURIComponent(v || '');
  }
  return q;
}

function parsePath(url) {
  const idx = url.indexOf('?');
  return idx === -1 ? url : url.slice(0, idx);
}

function checkAuth(req, res) {
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Basic ')) {
    json(res, 401, { message: 'Authentication required' });
    return false;
  }
  return true;
}

// Paginate an array of results
function paginate(items, query) {
  const limit = parseInt(query.limit || '5', 10);
  const cursor = query.cursor || null;

  let startIdx = 0;
  if (cursor) {
    startIdx = parseInt(cursor, 10);
  }

  const page = items.slice(startIdx, startIdx + limit);
  const hasMore = startIdx + limit < items.length;

  const result = {
    results: page,
    _links: {}
  };

  if (hasMore) {
    // Preserve original query params (except cursor/limit) in next link
    let nextParams = [];
    for (const k in query) {
      if (k !== 'cursor' && k !== 'limit') {
        nextParams.push(encodeURIComponent(k) + '=' + encodeURIComponent(query[k]));
      }
    }
    nextParams.push('cursor=' + (startIdx + limit));
    nextParams.push('limit=' + limit);
    result._links.next = '?' + nextParams.join('&');
  }

  return result;
}

// ---------------------------------------------------------------------------
// Error trigger pages: magic IDs return specific HTTP errors
// ---------------------------------------------------------------------------
function checkMagicId(id, res) {
  const code = parseInt(id, 10);
  if (code === 401) { json(res, 401, { message: 'Authentication required' }); return true; }
  if (code === 403) { json(res, 403, { message: 'Permission denied' }); return true; }
  if (code === 404) { json(res, 404, { message: 'No page found with id ' + id }); return true; }
  if (code === 429) { json(res, 429, { message: 'Rate limit exceeded' }); return true; }
  if (code === 500) { json(res, 500, { message: 'Internal server error' }); return true; }
  return false;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handlePages(req, res, path, query) {
  const method = req.method;

  // GET /wiki/api/v2/pages
  if (path === '/wiki/api/v2/pages' && method === 'GET') {
    let pages = Object.values(store.pages);

    // Filter by space-id
    if (query['space-id']) {
      if (query['space-id'] === 'paginated') {
        return json(res, 200, paginate(paginatedPages, query));
      }
      pages = pages.filter(p => p.spaceId === query['space-id']);
    }
    if (query.status) {
      pages = pages.filter(p => p.status === query.status);
    }
    if (query.title) {
      pages = pages.filter(p => p.title.toLowerCase().includes(query.title.toLowerCase()));
    }

    return json(res, 200, paginate(pages, query));
  }

  // GET /wiki/api/v2/pages/:id
  const pageGetMatch = path.match(/^\/wiki\/api\/v2\/pages\/([^\/]+)$/);
  if (pageGetMatch && method === 'GET') {
    const id = pageGetMatch[1];
    if (checkMagicId(id, res)) return;

    const page = store.pages[id];
    if (!page) return json(res, 404, { message: 'No page found with id ' + id });

    // body-format support
    const bodyFormat = query['body-format'] || 'storage';
    const result = JSON.parse(JSON.stringify(page));
    if (bodyFormat !== 'storage') {
      result.body = { [bodyFormat]: { value: result.body.storage.value, representation: bodyFormat } };
    }
    return json(res, 200, result);
  }

  // POST /wiki/api/v2/pages
  if (path === '/wiki/api/v2/pages' && method === 'POST') {
    return collectBody(req).then((rawBody) => {
      const body = JSON.parse(rawBody);
      const id = String(store.nextId++);
      const page = {
        id, status: body.status || 'current', title: body.title,
        spaceId: body.spaceId, parentId: body.parentId || null,
        parentType: 'page', authorId: 'user1',
        createdAt: new Date().toISOString(),
        version: { number: 1 },
        _links: { webui: '/spaces/DEV/pages/' + id }
      };
      store.pages[id] = page;
      return json(res, 200, page);
    });
  }

  // PUT /wiki/api/v2/pages/:id
  const pageUpdateMatch = path.match(/^\/wiki\/api\/v2\/pages\/([^\/]+)$/);
  if (pageUpdateMatch && method === 'PUT') {
    const id = pageUpdateMatch[1];
    if (checkMagicId(id, res)) return;

    const page = store.pages[id];
    if (!page) return json(res, 404, { message: 'No page found with id ' + id });

    return collectBody(req).then((rawBody) => {
      const body = JSON.parse(rawBody);
      page.title = body.title || page.title;
      page.status = body.status || page.status;
      page.version = { number: body.version.number, message: body.version.message || '' };
      if (body.body) page.body = body.body;
      page._links = { webui: '/spaces/DEV/pages/' + id };
      return json(res, 200, page);
    });
  }

  // DELETE /wiki/api/v2/pages/:id
  const pageDeleteMatch = path.match(/^\/wiki\/api\/v2\/pages\/([^\/]+)$/);
  if (pageDeleteMatch && method === 'DELETE') {
    const id = pageDeleteMatch[1];
    if (checkMagicId(id, res)) return;

    const page = store.pages[id];
    if (!page) return json(res, 404, { message: 'No page found with id ' + id });

    const purge = query.purge === 'true';
    // Mark as deleted but keep in store so subsequent tests can still reference it
    if (purge) page._purged = true;

    return json(res, 200, { ok: true });
  }

  return null; // not handled
}

function handlePageChildren(req, res, path, query) {
  // GET /wiki/api/v2/pages/:id/children
  const match = path.match(/^\/wiki\/api\/v2\/pages\/([^\/]+)\/children$/);
  if (!match || req.method !== 'GET') return null;

  const parentId = match[1];
  const children = Object.values(store.pages).filter(p => p.parentId === parentId);
  return json(res, 200, { results: children.map(c => ({ id: c.id, title: c.title, status: c.status, children: [] })) });
}

function handleSpaces(req, res, path, query) {
  const method = req.method;

  // GET /wiki/api/v2/spaces
  if (path === '/wiki/api/v2/spaces' && method === 'GET') {
    let spaces = Object.values(store.spaces);
    if (query.type) spaces = spaces.filter(s => s.type === query.type);
    if (query.status) spaces = spaces.filter(s => s.status === query.status);
    return json(res, 200, paginate(spaces, query));
  }

  // GET /wiki/api/v2/spaces/:id
  const spaceMatch = path.match(/^\/wiki\/api\/v2\/spaces\/([^\/]+)$/);
  if (spaceMatch && method === 'GET') {
    const id = spaceMatch[1];
    const space = store.spaces[id];
    if (!space) return json(res, 404, { message: 'No space found with id ' + id });
    return json(res, 200, space);
  }

  return null;
}

function handleSearch(req, res, path, query) {
  if (path !== '/wiki/api/v2/search' || req.method !== 'GET') return null;

  const cql = query.cql || '';
  // Simple mock: return all pages as search results
  const results = Object.values(store.pages).map(p => ({
    content: { id: p.id, type: 'page', status: p.status, title: p.title },
    url: '/spaces/DEV/pages/' + p.id,
    lastModified: p.createdAt,
    excerpt: p.title + ' content...',
  }));

  const limit = parseInt(query.limit || '5', 10);
  const cursor = query.cursor ? parseInt(query.cursor, 10) : 0;
  const page = results.slice(cursor, cursor + limit);
  const hasMore = cursor + limit < results.length;

  const resp = {
    results: page,
    totalSize: results.length,
    _links: {},
  };
  if (hasMore) {
    resp._links.next = '/wiki/api/v2/search?cql=' + encodeURIComponent(cql) + '&cursor=' + (cursor + limit) + '&limit=' + limit;
  }
  return json(res, 200, resp);
}

function handleComments(req, res, path, query) {
  const method = req.method;

  // GET /wiki/api/v2/footer-comments (page-id filter)
  // Simplified: /wiki/api/v2/pages/:id/footer-comments
  const listMatch = path.match(/^\/wiki\/api\/v2\/pages\/([^\/]+)\/footer-comments$/);
  if (listMatch && method === 'GET') {
    const pageId = listMatch[1];
    const comments = Object.values(store.comments).filter(c => c.pageId === pageId);
    return json(res, 200, paginate(comments, query));
  }

  // POST /wiki/api/v2/footer-comments
  if (path === '/wiki/api/v2/footer-comments' && method === 'POST') {
    return collectBody(req).then((rawBody) => {
      const body = JSON.parse(rawBody);
      const id = String(store.nextId++);
      const comment = {
        id, pageId: body.pageId,
        body: { storage: { value: body.body.storage.value } },
        authorId: 'user1', createdAt: new Date().toISOString(),
        version: { number: 1 },
      };
      store.comments[id] = comment;
      return json(res, 200, comment);
    });
  }

  // DELETE /wiki/api/v2/footer-comments/:id
  const delMatch = path.match(/^\/wiki\/api\/v2\/footer-comments\/([^\/]+)$/);
  if (delMatch && method === 'DELETE') {
    const id = delMatch[1];
    delete store.comments[id];
    return json(res, 200, { ok: true });
  }

  return null;
}

function handleLabels(req, res, path, query) {
  const method = req.method;

  // GET /wiki/api/v2/pages/:id/labels
  const listMatch = path.match(/^\/wiki\/api\/v2\/pages\/([^\/]+)\/labels$/);
  if (listMatch && method === 'GET') {
    const pageId = listMatch[1];
    const labels = store.labels[pageId] || [];
    return json(res, 200, { results: labels });
  }

  // POST /wiki/api/v2/pages/:id/labels
  if (listMatch && method === 'POST') {
    const pageId = listMatch[1];
    return collectBody(req).then((rawBody) => {
      const body = JSON.parse(rawBody);
      if (!store.labels[pageId]) store.labels[pageId] = [];
      const added = [];
      for (const label of (body.labels || body)) {
        const name = typeof label === 'string' ? label : label.name;
        const id = 'L' + store.nextId++;
        store.labels[pageId].push({ id, name, prefix: 'global' });
        added.push(name);
      }
      return json(res, 200, { ok: true, added, pageId, labels: { results: store.labels[pageId] } });
    });
  }

  // DELETE /wiki/api/v2/pages/:id/labels/:name
  const delMatch = path.match(/^\/wiki\/api\/v2\/pages\/([^\/]+)\/labels\/([^\/]+)$/);
  if (delMatch && method === 'DELETE') {
    const pageId = delMatch[1];
    const labelName = delMatch[2];
    if (store.labels[pageId]) {
      store.labels[pageId] = store.labels[pageId].filter(l => l.name !== labelName);
    }
    return json(res, 200, { ok: true, removed: labelName, pageId });
  }

  return null;
}

function handleVersions(req, res, path, query) {
  // GET /wiki/api/v2/pages/:id/versions
  const listMatch = path.match(/^\/wiki\/api\/v2\/pages\/([^\/]+)\/versions$/);
  if (listMatch && req.method === 'GET') {
    const pageId = listMatch[1];
    const versions = store.versions[pageId] || [];
    return json(res, 200, paginate(versions, query));
  }

  // GET /wiki/api/v2/pages/:id/versions/:num  (custom, not standard API — for our CLI)
  const getMatch = path.match(/^\/wiki\/api\/v2\/pages\/([^\/]+)\/versions\/([^\/]+)$/);
  if (getMatch && req.method === 'GET') {
    const pageId = getMatch[1];
    const num = parseInt(getMatch[2], 10);
    const versions = store.versions[pageId] || [];
    const version = versions.find(v => v.number === num);
    if (!version) return json(res, 404, { message: 'Version not found' });

    const page = store.pages[pageId];
    return json(res, 200, {
      id: pageId, title: (page ? page.title : 'Unknown') + ' (v' + num + ')',
      version, body: { storage: { value: '<p>Content at version ' + num + '</p>' } },
    });
  }

  return null;
}

function handleAttachments(req, res, path, query) {
  const method = req.method;

  // GET /wiki/api/v2/pages/:id/attachments
  const listMatch = path.match(/^\/wiki\/api\/v2\/pages\/([^\/]+)\/attachments$/);
  if (listMatch && method === 'GET') {
    const pageId = listMatch[1];
    const attachments = store.attachments[pageId] || [];
    return json(res, 200, paginate(attachments, query));
  }

  // POST /wiki/api/v2/pages/:id/attachments (upload)
  const uploadMatch = path.match(/^\/wiki\/api\/v2\/pages\/([^\/]+)\/attachments$/);
  if (uploadMatch && method === 'POST') {
    const pageId = uploadMatch[1];
    return collectBody(req).then((rawBody) => {
      const body = JSON.parse(rawBody);
      const id = 'ATT' + store.nextId++;
      const att = {
        ok: true, id, title: body.title || 'upload.bin',
        mediaType: body.mediaType || 'application/octet-stream',
        fileSize: body.fileSize || 0, pageId,
      };
      if (!store.attachments[pageId]) store.attachments[pageId] = [];
      store.attachments[pageId].push(att);
      return json(res, 200, att);
    });
  }

  // GET /wiki/api/v2/attachments/:id/download
  const downloadMatch = path.match(/^\/wiki\/api\/v2\/attachments\/([^\/]+)\/download$/);
  if (downloadMatch && method === 'GET') {
    const id = downloadMatch[1];
    // Return fake binary content
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': '12' });
    res.end('fake content');
    return true;
  }

  return null;
}

function handleProperties(req, res, path, query) {
  const method = req.method;

  // GET /wiki/api/v2/pages/:id/properties
  const listMatch = path.match(/^\/wiki\/api\/v2\/pages\/([^\/]+)\/properties$/);
  if (listMatch && method === 'GET') {
    const pageId = listMatch[1];
    const props = store.properties[pageId] || [];

    // If key filter
    if (query.key) {
      const prop = props.find(p => p.key === query.key);
      if (!prop) return json(res, 404, { message: 'Property not found' });
      return json(res, 200, prop);
    }

    return json(res, 200, { results: props.map(p => ({ id: p.id, key: p.key, version: p.version })) });
  }

  // POST/PUT /wiki/api/v2/pages/:id/properties
  if (listMatch && (method === 'POST' || method === 'PUT')) {
    const pageId = listMatch[1];
    return collectBody(req).then((rawBody) => {
      const body = JSON.parse(rawBody);
      if (!store.properties[pageId]) store.properties[pageId] = [];
      const existing = store.properties[pageId].find(p => p.key === body.key);
      if (existing) {
        existing.value = body.value;
        existing.version.number++;
        return json(res, 200, { ok: true, id: existing.id, key: existing.key, version: existing.version });
      } else {
        const id = 'P' + store.nextId++;
        const prop = { id, key: body.key, value: body.value, version: { number: 1 } };
        store.properties[pageId].push(prop);
        return json(res, 200, { ok: true, id, key: body.key, version: prop.version });
      }
    });
  }

  return null;
}

function handleBulk(req, res, path, query) {
  // GET /wiki/api/v2/spaces/:id/pages (for bulk export — returns all pages in space)
  const match = path.match(/^\/wiki\/api\/v2\/spaces\/([^\/]+)\/pages$/);
  if (match && req.method === 'GET') {
    const spaceId = match[1];
    const pages = Object.values(store.pages).filter(p => p.spaceId === spaceId);
    return json(res, 200, { results: pages });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
function route(req, res) {
  // WasmEdge QuickJS may expose lowercase method names
  req.method = String(req.method || '').toUpperCase();
  const path = parsePath(req.url);
  const query = parseQuery(req.url);

  // Auth check (all endpoints require auth)
  if (!checkAuth(req, res)) return;

  // Try each handler
  const result = handlePages(req, res, path, query)
    || handlePageChildren(req, res, path, query)
    || handleSpaces(req, res, path, query)
    || handleSearch(req, res, path, query)
    || handleComments(req, res, path, query)
    || handleLabels(req, res, path, query)
    || handleVersions(req, res, path, query)
    || handleAttachments(req, res, path, query)
    || handleProperties(req, res, path, query)
    || handleBulk(req, res, path, query);

  if (!result && !res.writableEnded) {
    json(res, 404, { message: 'Not found: ' + path });
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
createServer((req, res) => {
  try {
    route(req, res);
  } catch (e) {
    json(res, 500, { message: 'Mock server error: ' + e.message });
  }
}).listen(PORT, () => {
  (typeof print !== 'undefined' ? print : console.log)('Mock Confluence server listening on port ' + PORT);
});
