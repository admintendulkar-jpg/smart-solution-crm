import type { Role, Branch } from './constants';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface AuthUser {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  branch: Branch;
  [key: string]: unknown;
}

export interface PublicUser {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: Role;
  branch: Branch;
  active: boolean;
  created_at: string;
}
