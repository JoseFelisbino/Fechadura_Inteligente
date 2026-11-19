/**
 * Tópicos MQTT por dispositivo:
 *   home/devices/{deviceId}/events/access   → eventos da fechadura
 *   home/devices/{deviceId}/events/sensors  → mudanças dos sensores magnéticos
 *   home/devices/{deviceId}/status          → heartbeat e testamento (LWT) "OFFLINE"
 *
 * O ACL do Mosquitto garante que cada dispositivo (usuário = deviceId)
 * só publique nos seus próprios tópicos.
 */
export const SUBSCRIPTIONS = [
  'home/devices/+/events/access',
  'home/devices/+/events/sensors',
  'home/devices/+/status',
];

export type TopicKind = 'access' | 'sensors' | 'status';

const TOPIC_RE = /^home\/devices\/([0-9a-fA-F-]{36})\/(events\/access|events\/sensors|status)$/;

export function parseTopic(topic: string): { deviceId: string; kind: TopicKind } | null {
  const match = TOPIC_RE.exec(topic);
  if (!match) return null;
  const kind = match[2] === 'status' ? 'status' : (match[2].split('/')[1] as TopicKind);
  return { deviceId: match[1].toLowerCase(), kind };
}
