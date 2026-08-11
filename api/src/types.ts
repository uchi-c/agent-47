export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'STAFF';
  organizationId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      agentOrganizationId?: string;
    }
  }
}
