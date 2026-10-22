import { ZNameSchema } from '@e-sign/lib/types/name';
import { zEmail } from '@e-sign/lib/utils/zod';
import { Role } from '@prisma/client';
import { z } from 'zod';

export const ZUpdateUserRequestSchema = z.object({
  id: z.number().min(1),
  name: ZNameSchema.nullish(),
  email: zEmail().optional(),
  roles: z.array(z.nativeEnum(Role)).optional(),
});

export const ZUpdateUserResponseSchema = z.void();

export type TUpdateUserRequest = z.infer<typeof ZUpdateUserRequestSchema>;
export type TUpdateUserResponse = z.infer<typeof ZUpdateUserResponseSchema>;
