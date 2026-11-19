import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { userRepository } from '../repositories/user.repository';
import type { JwtPayload } from '../types';
import { HttpError } from '../utils/http-error';
import type { LoginInput } from '../validators/auth.validator';

export const PASSWORD_ROUNDS = 12;

// Hash fixo usado quando o e-mail não existe, para que o tempo de resposta
// não revele quais e-mails estão cadastrados.
const DUMMY_HASH = bcrypt.hashSync('usuario-inexistente', 10);

export function hashPassword(password: string) {
  return bcrypt.hash(password, PASSWORD_ROUNDS);
}

export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN_SECONDS,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof decoded !== 'object' || typeof decoded.sub !== 'string') return null;
    const role = (decoded as Record<string, unknown>).role;
    if (role !== 'ADMIN' && role !== 'VIEWER') return null;
    return { sub: decoded.sub, role };
  } catch {
    return null;
  }
}

export const authService = {
  async login({ email, password }: LoginInput) {
    const user = await userRepository.findByEmailWithHash(email);
    const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !ok) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha inválidos.');
    }
    const token = signAccessToken({ sub: user.id, role: user.role });
    const { passwordHash: _omit, ...publicUser } = user;
    void _omit;
    return { token, user: publicUser };
  },

  async me(userId: string) {
    const user = await userRepository.findPublicById(userId);
    if (!user) throw HttpError.unauthorized('Usuário não encontrado.');
    return user;
  },
};
