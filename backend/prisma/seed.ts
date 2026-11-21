import { prisma } from '../src/config/prisma';
import { garantirDadosIniciais } from '../src/services/configuracao.service';

/** Cria a configuração padrão e a senha do slot 1 (a mesma que o firmware grava no primeiro boot). */
garantirDadosIniciais()
  .then(() => console.log('Dados iniciais OK.'))
  .finally(() => prisma.$disconnect());
