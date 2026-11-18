import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().max(254).email(),
  password: z.string().min(10).max(128),
  name: z.string().trim().min(1).max(100),
});

export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().max(254).email(),
  password: z.string().min(10).max(128),
});

export type LoginInput = z.infer<typeof loginSchema>;
