import { z } from 'zod'
import { ROLES } from '../constants'

export const loginCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
})

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1).optional(), // optional if sent via cookie
})

export const createApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string()).min(1),
  expiresInDays: z.number().int().min(1).max(365).optional(),
})

export const inviteUserSchema = z.object({
  email: z.string().email(),
  role: z.enum(ROLES),
})

export const updateMemberRoleSchema = z.object({
  role: z.enum(ROLES),
})
