import { EstadoPorta, EstadoTrava, Origem, StatusAlerta, TipoEvento } from '@prisma/client';
import { z } from 'zod';

// ---------------------------------------------------------------- Mensagens do Arduino (MQTT)

export const eventoMqttSchema = z.object({
  id: z.string().trim().min(1).max(80),
  tipo: z.nativeEnum(TipoEvento),
  origem: z.nativeEnum(Origem),
  usuario: z.string().trim().max(32).nullish(),
  timestamp: z.union([z.number().nonnegative(), z.string().max(40)]).optional(),
});

export const estadoMqttSchema = z.object({
  trava: z.nativeEnum(EstadoTrava),
  porta: z.nativeEnum(EstadoPorta),
  distanciaCm: z.number().int().min(0).max(1000).nullish(),
  bloqueado: z.boolean(),
  alarme: z.boolean(),
});

export const statusMqttSchema = z.object({ online: z.boolean() });

export const respostaMqttSchema = z.object({
  id: z.string().min(1).max(64),
  ok: z.boolean(),
  motivo: z.string().max(64).optional(),
});

// ---------------------------------------------------------------- API REST

const dataOpcional = z.coerce.date().optional();

export const filtroEventosSchema = z
  .object({
    de: dataOpcional,
    ate: dataOpcional,
    // um ou vários tipos separados por vírgula
    tipo: z
      .string()
      .optional()
      .transform((v) => (v ? v.split(',').filter(Boolean) : []))
      .pipe(z.array(z.nativeEnum(TipoEvento))),
    page: z.coerce.number().int().min(1).default(1),
    porPagina: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((f) => !f.de || !f.ate || f.de <= f.ate, { message: '"de" deve ser anterior a "ate".', path: ['de'] });

export const acessosPorHoraSchema = z.object({
  data: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.')
    .optional(),
});

export const leiturasSchema = z.object({
  minutos: z.coerce.number().int().min(1).max(1440).default(10),
});

export const alertasSchema = z.object({ status: z.nativeEnum(StatusAlerta).optional() });

export const idSchema = z.object({ id: z.string().uuid('Identificador inválido.') });

export const slotSchema = z.object({ slot: z.coerce.number().int().min(1).max(3) });

export const senhaSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Informe um nome.')
    // a EEPROM do Arduino guarda 16 bytes por nome (acentos ocupam 2)
    .refine((n) => Buffer.byteLength(n, 'utf8') <= 16, 'Nome muito longo (máximo 16 letras sem acento).'),
  senha: z.string().regex(/^\d{4,8}$/, 'A senha deve ter de 4 a 8 dígitos.'),
});

/** Comandos que o app pode mandar direto. Senhas e ajustes têm rotas próprias. */
export const comandoSchema = z.object({
  tipo: z.enum(['ABRIR_PORTA', 'FECHAR_PORTA', 'DESLIGAR_ALARME', 'TESTAR_BUZZER', 'ENVIAR_ESTADO']),
});

export const configuracaoSchema = z
  .object({
    tempoAberturaMs: z.number().int().min(1000).max(60000),
    limiteCm: z.number().int().min(2).max(100),
    tempoMaxAbertaS: z.number().int().min(5).max(3600),
  })
  .partial()
  .refine((c) => Object.keys(c).length > 0, { message: 'Informe ao menos um ajuste.' });
