import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import os from 'os';

const dataFile = path.join(os.tmpdir(), `projectguard-auth-test-${process.pid}.json`);
process.env.PROJECTGUARD_DATA_FILE = dataFile;

const { destroySession, getSessionUser, loginAccount, registerAccount } = await import('../src/authService.js');

after(() => {
  if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
});

test('registers accounts with hashed passwords and expiring revocable sessions', async () => {
  const registered = await registerAccount({
    name: 'Test Officer',
    email: 'Officer@Example.Test',
    password: 'a-valid-demo-password',
  });
  assert.equal(registered.user.email, 'officer@example.test');
  assert.ok(!('passwordHash' in registered.user));
  assert.ok(!('passwordSalt' in registered.user));
  assert.equal(getSessionUser(registered.sessionToken).id, registered.user.id);

  const authenticated = await loginAccount({
    email: 'OFFICER@example.test',
    password: 'a-valid-demo-password',
  });
  assert.equal(authenticated.user.id, registered.user.id);
  await assert.rejects(loginAccount({
    email: registered.user.email,
    password: 'incorrect-password',
  }), /incorrect/);

  destroySession(authenticated.sessionToken);
  assert.equal(getSessionUser(authenticated.sessionToken), null);
});

test('rejects invalid registration and incorrect credentials', async () => {
  await assert.rejects(registerAccount({
    name: 'X',
    email: 'not-an-email',
    password: 'short',
  }), /Name must be between/);
  await assert.rejects(loginAccount({
    email: 'missing@example.test',
    password: 'incorrect-password',
  }), /incorrect/);
});
