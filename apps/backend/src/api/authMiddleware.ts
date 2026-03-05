import { Request, Response, NextFunction } from 'express';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error('[Auth] FATAL: API_KEY environment variable is not set. Refusing to start.');
  process.exit(1);
}

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  if (req.headers['x-api-key'] !== API_KEY) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
}
