/**
 * Ponto único de publicação no broker. O cliente MQTT registra a função real ao conectar;
 * nos testes, ela é substituída por uma função falsa.
 */
type Publicador = (topico: string, mensagem: string) => boolean;

let publicador: Publicador = () => false;

export const transporte = {
  definir(fn: Publicador) {
    publicador = fn;
  },
  publicar(topico: string, mensagem: string): boolean {
    return publicador(topico, mensagem);
  },
};
