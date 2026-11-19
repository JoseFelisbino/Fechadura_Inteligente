import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/config/prisma';
import { app, CSRF, createUser, loginAgent, resetDb } from './helpers';

beforeEach(resetDb);
afterAll(() => prisma.$disconnect());

describe('Autenticação do painel', () => {
  it('faz login válido, define cookie HttpOnly e não retorna o hash da senha', async () => {
    const { email, password } = await createUser('ADMIN');
    const res = await request(app).post('/api/auth/login').set(CSRF).send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(email);
    expect(res.body.data.passwordHash).toBeUndefined();
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('access_token=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
  });

  it('rejeita senha inválida com 401', async () => {
    const { email } = await createUser('ADMIN');
    const res = await request(app).post('/api/auth/login').set(CSRF).send({ email, password: 'errada-123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejeita e-mail inexistente com a mesma mensagem', async () => {
    const res = await request(app).post('/api/auth/login').set(CSRF).send({ email: 'nao@existe.com', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe('E-mail ou senha inválidos.');
  });

  it('rejeita login com formato inválido (400)', async () => {
    const res = await request(app).post('/api/auth/login').set(CSRF).send({ email: 'invalido' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(Array.isArray(res.body.error.details)).toBe(true);
  });

  it('exige cabeçalho anti-CSRF em requisições que alteram estado', async () => {
    const { email, password } = await createUser('ADMIN');
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_REJECTED');
  });

  it('retorna o usuário em /auth/me e encerra a sessão no logout', async () => {
    const { agent, user } = await loginAgent('VIEWER');
    const me = await agent.get('/api/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.id).toBe(user.id);

    const out = await agent.post('/api/auth/logout').set(CSRF);
    expect(out.status).toBe(200);
    expect(String(out.headers['set-cookie'])).toMatch(/access_token=;/);
  });
});

describe('Rotas privadas', () => {
  it.each([
    '/api/auth/me',
    '/api/devices',
    '/api/monitored-points',
    '/api/events',
    '/api/alerts',
    '/api/alerts/active',
    '/api/stream',
  ])('bloqueia %s sem autenticação', async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejeita token adulterado', async () => {
    const res = await request(app).get('/api/devices').set('Cookie', 'access_token=abc.def.ghi');
    expect(res.status).toBe(401);
  });

  it('impede que VIEWER execute operações administrativas', async () => {
    const { agent } = await loginAgent('VIEWER');
    const res = await agent.post('/api/devices').set(CSRF).send({ name: 'ESP32' });
    expect(res.status).toBe(403);
  });
});
