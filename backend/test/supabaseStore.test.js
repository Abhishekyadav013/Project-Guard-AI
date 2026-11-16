import test, { after } from 'node:test';
import assert from 'node:assert/strict';

const originalFetch = globalThis.fetch;
const originalUrl = process.env.SUPABASE_URL;
const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const originalVercel = process.env.VERCEL;
const records = new Map();

process.env.SUPABASE_URL = 'https://projectguard-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
delete process.env.VERCEL;

globalThis.fetch = async (request, options = {}) => {
  const url = new URL(request);
  const method = options.method || 'GET';
  const kind = url.searchParams.get('kind')?.replace(/^eq\./, '');
  if (method === 'GET') {
    const range = options.headers?.Range || '0-999';
    const [start, end] = range.split('-').map(Number);
    const rows = [...records.values()].filter((row) => row.kind === kind);
    return new Response(JSON.stringify(rows.slice(start, end + 1)), { status: 200 });
  }
  if (method === 'POST') {
    const incoming = JSON.parse(options.body);
    for (const row of incoming) {
      if (row.kind === 'user' && [...records.values()].some((stored) => (
        stored.kind === 'user' && stored.data.email === row.data.email && stored.id !== row.id
      ))) {
        return new Response(JSON.stringify({
          code: '23505',
          message: 'duplicate key violates projectguard_records_user_email_unique',
        }), { status: 409 });
      }
      records.set(row.id, row);
    }
    return new Response(null, { status: 201 });
  }
  if (method === 'DELETE') {
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    const row = records.get(id);
    if (row?.kind === kind) records.delete(id);
    return new Response(null, { status: 204 });
  }
  throw new Error(`Unexpected mocked Supabase method: ${method}`);
};

const { destroySession, getSessionUser, loginAccount, registerAccount } = await import('../src/authService.js');
const { readData } = await import('../src/store.js');

after(() => {
  globalThis.fetch = originalFetch;
  if (originalUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = originalUrl;
  if (originalKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  if (originalVercel === undefined) delete process.env.VERCEL;
  else process.env.VERCEL = originalVercel;
});

test('Supabase storage seeds data and persists account and session records across requests', async () => {
  const initialData = await readData();
  assert.equal(initialData.projects.length, 30);

  const registered = await registerAccount({
    name: 'Persistent User',
    email: 'Persistent@Example.Test',
    password: 'a-valid-demo-password',
  });
  assert.equal((await getSessionUser(registered.sessionToken)).id, registered.user.id);

  const storedUser = records.get(registered.user.id);
  assert.equal(storedUser.kind, 'user');
  assert.notEqual(storedUser.data.passwordHash, 'a-valid-demo-password');
  assert.ok(!JSON.stringify(storedUser).includes(registered.sessionToken));
  assert.ok([...records.values()].some((row) => (
    row.kind === 'session' && row.data.userId === registered.user.id
  )));

  const loggedIn = await loginAccount({
    email: 'PERSISTENT@example.test',
    password: 'a-valid-demo-password',
  });
  assert.equal(loggedIn.user.id, registered.user.id);

  await destroySession(registered.sessionToken);
  assert.equal(await getSessionUser(registered.sessionToken), null);
});

test('requires Supabase storage on Vercel instead of falling back to local files', async () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const vercel = process.env.VERCEL;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.VERCEL = '1';
  try {
    await assert.rejects(readData(), (error) => error.status === 503 && error.message.includes('SUPABASE_URL'));
  } finally {
    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = key;
    if (vercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = vercel;
  }
});
