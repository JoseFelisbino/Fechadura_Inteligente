import { prisma } from '../config/prisma';

const publicUser = { id: true, name: true, email: true, role: true, createdAt: true, updatedAt: true } as const;

export const userRepository = {
  findByEmailWithHash(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },
  findPublicById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: publicUser });
  },
};
