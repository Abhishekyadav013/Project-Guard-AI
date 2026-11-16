import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { readData, saveData } from './store.js';

const scrypt = promisify(scryptCallback);
export const SESSION_COOKIE = 'projectguard_session';
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

const hashToken = (token) => createHash('sha256').update(token).digest('hex');
const publicUser = ({ id, name, email, createdAt }) => ({ id, name, email, createdAt });
const authError = (message, status) => Object.assign(new Error(message), { status });

export async function registerAccount({ name, email, password }) {
  const cleanName = typeof name === 'string' ? name.trim() : '';
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (cleanName.length < 2 || cleanName.length > 100) {
    throw authError('Name must be between 2 and 100 characters.', 400);
  }
  if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw authError('Enter a valid email address.', 400);
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw authError('Password must be between 8 and 128 characters.', 400);
  }

  let data = readData();
  if (data.users.some((user) => user.email === cleanEmail)) {
    throw authError('An account with this email already exists.', 409);
  }
  const salt = randomBytes(16).toString('hex');
  const passwordHash = (await scrypt(password, salt, 64)).toString('hex');
  data = readData();
  if (data.users.some((existingUser) => existingUser.email === cleanEmail)) {
    throw authError('An account with this email already exists.', 409);
  }
  const user = {
    id: `user-${randomBytes(12).toString('hex')}`,
    name: cleanName,
    email: cleanEmail,
    passwordSalt: salt,
    passwordHash,
    createdAt: new Date().toISOString(),
  };
  data.users.push(user);
  const sessionToken = await createSession(data, user.id);
  return { user: publicUser(user), sessionToken };
}

export async function loginAccount({ email, password }) {
  const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const data = readData();
  const user = data.users.find((item) => item.email === cleanEmail);
  if (!user || typeof password !== 'string') throw authError('Email or password is incorrect.', 401);

  const candidate = (await scrypt(password, user.passwordSalt, 64)).toString('hex');
  const candidateBuffer = Buffer.from(candidate, 'hex');
  const storedBuffer = Buffer.from(user.passwordHash, 'hex');
  if (candidateBuffer.length !== storedBuffer.length || !timingSafeEqual(candidateBuffer, storedBuffer)) {
    throw authError('Email or password is incorrect.', 401);
  }
  const currentData = readData();
  if (!currentData.users.some((currentUser) => currentUser.id === user.id)) {
    throw authError('Email or password is incorrect.', 401);
  }
  const sessionToken = await createSession(currentData, user.id);
  return { user: publicUser(user), sessionToken };
}

const createSession = async (data, userId) => {
  const sessionToken = randomBytes(32).toString('base64url');
  const now = Date.now();
  data.sessions = data.sessions.filter((session) => new Date(session.expiresAt).getTime() > now);
  data.sessions.push({
    tokenHash: hashToken(sessionToken),
    userId,
    expiresAt: new Date(now + SESSION_MAX_AGE_SECONDS * 1000).toISOString(),
  });
  saveData(data);
  return sessionToken;
};

export function getSessionUser(sessionToken) {
  if (typeof sessionToken !== 'string' || !sessionToken) return null;
  const data = readData();
  const tokenHash = hashToken(sessionToken);
  const session = data.sessions.find((item) => {
    const storedHash = Buffer.from(item.tokenHash, 'hex');
    const candidateHash = Buffer.from(tokenHash, 'hex');
    return storedHash.length === candidateHash.length && timingSafeEqual(storedHash, candidateHash);
  });
  if (!session || new Date(session.expiresAt).getTime() <= Date.now()) return null;
  const user = data.users.find((item) => item.id === session.userId);
  return user ? publicUser(user) : null;
}

export function destroySession(sessionToken) {
  if (typeof sessionToken !== 'string' || !sessionToken) return;
  const data = readData();
  const tokenHash = hashToken(sessionToken);
  data.sessions = data.sessions.filter((session) => session.tokenHash !== tokenHash);
  saveData(data);
}
