// auth.js - JWT authentication middleware
import crypto from 'crypto';

export function createAuthMiddleware(getSecret) {
  return async (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || null;
    
    if (!token) {
      return res.status(401).json({ error: 'Missing token' });
    }

    try {
      const secret = await getSecret();
      const email = verifyToken(token, secret);
      
      if (!email) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      req.email = email;
      next();
    } catch (err) {
      res.status(401).json({ error: 'Token verification failed' });
    }
  };
}

export function signToken(email, secret, ttlMs = 1000 * 60 * 60 * 24 * 30) {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + ttlMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  return payload + '.' + sig;
}

export function verifyToken(token, secret) {
  if (!token || !token.includes('.')) return null;
  
  const [payload, sig] = token.split('.');
  const expect = crypto.createHmac('sha256', secret).update(payload).digest('base64url');
  
  if (!sig || sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) {
    return null;
  }

  try {
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return exp > Date.now() ? email : null;
  } catch {
    return null;
  }
}
