/**
 * Zod request/response shapes for the auth domain.
 * Matches the Python Pydantic schemas in app/schemas/user.py.
 */
import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email(),
  full_name: z.string().max(255).optional().nullable(),
  password: z.string().min(8).max(128),
});

export const refreshSchema = z.object({
  refresh_token: z.string().min(1),
});

export const loginFormSchema = z.object({
  username: z.string().email(),
  password: z.string().min(1),
});

export type SignupBody = z.infer<typeof signupSchema>;
export type RefreshBody = z.infer<typeof refreshSchema>;
export type LoginForm = z.infer<typeof loginFormSchema>;

/**
 * Strip private columns + serialise to the snake_case shape the existing
 * React frontend expects (it was built against the Python backend).
 */
export function toUserOut(u: {
  id: number;
  email: string;
  fullName: string | null;
  isActive: boolean;
  isSuperuser: boolean;
  createdAt: Date;
}) {
  return {
    id: u.id,
    email: u.email,
    full_name: u.fullName,
    is_active: u.isActive,
    is_superuser: u.isSuperuser,
    created_at: u.createdAt.toISOString(),
  };
}
