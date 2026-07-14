import { describe, it, expect } from 'vitest';
import {
  signSession, verifySession, signFileToken, verifyFileToken,
  getSessionFromRequest, getFileAccessUserId,
} from './session';
import type { Session } from './types';

const session: Session = { userId: 'u1', username: 'alice', domain: 'civil-engineering' };

describe('session tokens', () => {
  it('round-trips through sign/verify', () => {
    const token = signSession(session);
    expect(verifySession(token)).toEqual(session);
  });

  it('rejects a tampered signature', () => {
    const token = signSession(session);
    const last = token.at(-1);
    const tampered = token.slice(0, -1) + (last === 'a' ? 'b' : 'a');
    expect(verifySession(tampered)).toBeNull();
  });

  it('rejects a file-scoped token', () => {
    const fileToken = signFileToken('u1');
    expect(verifySession(fileToken)).toBeNull();
  });
});

describe('file tokens', () => {
  it('round-trips through sign/verify', () => {
    const token = signFileToken('u1');
    expect(verifyFileToken(token)).toBe('u1');
  });

  it('rejects a full session token', () => {
    const token = signSession(session);
    expect(verifyFileToken(token)).toBeNull();
  });
});

describe('getSessionFromRequest', () => {
  it('reads a valid Bearer session token', () => {
    const token = signSession(session);
    const req = new Request('http://test/api/data', { headers: { Authorization: `Bearer ${token}` } });
    expect(getSessionFromRequest(req)).toEqual(session);
  });

  it('returns null with no Authorization header', () => {
    expect(getSessionFromRequest(new Request('http://test/api/data'))).toBeNull();
  });

  it('never accepts a token via the query string', () => {
    const token = signSession(session);
    const req = new Request(`http://test/api/data?token=${token}`);
    expect(getSessionFromRequest(req)).toBeNull();
  });
});

describe('getFileAccessUserId', () => {
  it('accepts a full session via Authorization header', () => {
    const token = signSession(session);
    const req = new Request('http://test/api/files/x', { headers: { Authorization: `Bearer ${token}` } });
    expect(getFileAccessUserId(req)).toBe('u1');
  });

  it('accepts a file-scoped token via the query string', () => {
    const token = signFileToken('u1');
    const req = new Request(`http://test/api/files/x?token=${token}`);
    expect(getFileAccessUserId(req)).toBe('u1');
  });

  it('rejects a full session token presented via the query string', () => {
    const token = signSession(session);
    const req = new Request(`http://test/api/files/x?token=${token}`);
    expect(getFileAccessUserId(req)).toBeNull();
  });

  it('returns null with nothing presented', () => {
    expect(getFileAccessUserId(new Request('http://test/api/files/x'))).toBeNull();
  });
});
