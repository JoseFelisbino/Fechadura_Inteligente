import type { Request, Response } from 'express';
import { parseOrThrow } from '../middlewares/validate';
import { contarAlertasAtivos, listarAlertas, resolverAlerta } from '../services/alerta.service';
import { enviarComando, obterComando } from '../services/comando.service';
import { atualizarConfiguracao, obterConfiguracao } from '../services/configuracao.service';
import { listarLeituras, obterEstado } from '../services/estado.service';
import { acessosPorHora, hojeEmBrasilia, listarEventos, ultimoAcesso } from '../services/evento.service';
import { definirSenha, listarSenhas, obterSenha, removerSenha } from '../services/senha.service';
import { sendData } from '../utils/response';
import {
  acessosPorHoraSchema,
  alertasSchema,
  comandoSchema,
  configuracaoSchema,
  filtroEventosSchema,
  idSchema,
  leiturasSchema,
  senhaSchema,
  slotSchema,
} from '../validators';

// ---------------------------------------------------------------- Estado e leituras

export async function estado(_req: Request, res: Response) {
  const [acesso, alertasAtivos] = await Promise.all([ultimoAcesso(), contarAlertasAtivos()]);
  sendData(res, { ...obterEstado(), ultimoAcesso: acesso, alertasAtivos });
}

export async function leituras(req: Request, res: Response) {
  const { minutos } = parseOrThrow(leiturasSchema, req.query);
  sendData(res, await listarLeituras(minutos));
}

// ---------------------------------------------------------------- Eventos

export async function eventos(req: Request, res: Response) {
  const f = parseOrThrow(filtroEventosSchema, req.query);
  const { itens, ...meta } = await listarEventos({
    de: f.de,
    ate: f.ate,
    tipos: f.tipo,
    page: f.page,
    porPagina: f.porPagina,
  });
  sendData(res, itens, 200, meta);
}

export async function eventosPorHora(req: Request, res: Response) {
  const { data } = parseOrThrow(acessosPorHoraSchema, req.query);
  const dia = data ?? hojeEmBrasilia();
  sendData(res, await acessosPorHora(dia), 200, { data: dia });
}

// ---------------------------------------------------------------- Alertas

export async function alertas(req: Request, res: Response) {
  const { status } = parseOrThrow(alertasSchema, req.query);
  sendData(res, await listarAlertas(status));
}

export async function resolver(req: Request, res: Response) {
  const { id } = parseOrThrow(idSchema, req.params);
  sendData(res, await resolverAlerta(id));
}

// ---------------------------------------------------------------- Senhas

export async function senhas(_req: Request, res: Response) {
  sendData(res, await listarSenhas());
}

export async function senha(req: Request, res: Response) {
  const { slot } = parseOrThrow(slotSchema, req.params);
  sendData(res, await obterSenha(slot));
}

export async function salvarSenha(req: Request, res: Response) {
  const { slot } = parseOrThrow(slotSchema, req.params);
  const { nome, senha: valor } = parseOrThrow(senhaSchema, req.body);
  sendData(res, await definirSenha(slot, nome, valor));
}

export async function apagarSenha(req: Request, res: Response) {
  const { slot } = parseOrThrow(slotSchema, req.params);
  sendData(res, await removerSenha(slot), 202);
}

// ---------------------------------------------------------------- Comandos

export async function novoComando(req: Request, res: Response) {
  const { tipo } = parseOrThrow(comandoSchema, req.body);
  sendData(res, await enviarComando(tipo), 202);
}

export async function comando(req: Request, res: Response) {
  const { id } = parseOrThrow(idSchema, req.params);
  sendData(res, await obterComando(id));
}

// ---------------------------------------------------------------- Configuração

export async function configuracao(_req: Request, res: Response) {
  sendData(res, await obterConfiguracao());
}

export async function salvarConfiguracao(req: Request, res: Response) {
  const dados = parseOrThrow(configuracaoSchema, req.body);
  sendData(res, await atualizarConfiguracao(dados));
}
