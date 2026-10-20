import { describe, it, expect } from 'vitest';
import { signToken, verifyToken } from '../auth.js';

describe('JWT Authentication', () => {
  const secret = 'test-secret-key';
  const email = 'test@example.com';

  it('signs token with email and expiration', () => {
    const token = signToken(email, secret);
    expect(token).toBeTruthy();
    expect(token.split('.')).toHaveLength(2);
  });

  it('verifies valid token', () => {
    const token = signToken(email, secret);
    const verified = verifyToken(token, secret);
    expect(verified).toBe(email);
  });

  it('rejects invalid signature', () => {
    const token = signToken(email, secret);
    const verified = verifyToken(token, 'wrong-secret');
    expect(verified).toBeNull();
  });

  it('rejects expired token', () => {
    const token = signToken(email, secret, -1000); // -1 second TTL
    const verified = verifyToken(token, secret);
    expect(verified).toBeNull();
  });

  it('rejects malformed token', () => {
    expect(verifyToken('invalid', secret)).toBeNull();
    expect(verifyToken('a.b.c', secret)).toBeNull();
    expect(verifyToken(null, secret)).toBeNull();
  });
});
