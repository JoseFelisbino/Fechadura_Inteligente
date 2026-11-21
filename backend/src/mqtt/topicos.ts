/** Tópicos MQTT da fechadura (um único dispositivo). */
export const TOPICOS = {
  eventos: 'fechadura/eventos', // Arduino -> backend
  estado: 'fechadura/estado', // Arduino -> backend, a cada 2 s
  status: 'fechadura/status', // { online } com retain; LWT = { online: false }
  comandos: 'fechadura/comandos', // backend -> Arduino
  resposta: 'fechadura/comandos/resposta', // Arduino -> backend
} as const;

export const ASSINATURAS = [TOPICOS.eventos, TOPICOS.estado, TOPICOS.status, TOPICOS.resposta];
