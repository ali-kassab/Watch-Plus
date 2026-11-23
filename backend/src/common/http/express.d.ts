import type { Role } from '../../generated/prisma/enums.js';

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
    }
    interface Request {
      requestId?: string;
      user?: User;
      membership?: { id: string; workspaceId: string; role: Role };
    }
  }
}

export {};
