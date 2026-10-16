import type { Role } from '../db/schema.js';

/** The signed-in person, as every route sees it (set by authenticate). */
export interface AuthUser {
  id: string;
  role: Role;
}
