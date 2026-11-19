import 'dotenv/config';
import { upsertMosquittoUser } from '../src/utils/mosquitto-passwd';

/**
 * Cria/atualiza o usuário MQTT do backend no arquivo de senhas do Mosquitto,
 * usando MQTT_USERNAME e MQTT_PASSWORD do .env.
 *   npm run mqtt:user
 */
const file = process.env.MOSQUITTO_PASSWD_FILE;
const username = process.env.MQTT_USERNAME;
const password = process.env.MQTT_PASSWORD ?? '';

if (!file || !username || password.length < 12) {
  console.error('Defina MOSQUITTO_PASSWD_FILE, MQTT_USERNAME e MQTT_PASSWORD (12+ caracteres) no .env.');
  process.exit(1);
}

upsertMosquittoUser(file, username, password);
console.log(`Usuário MQTT "${username}" salvo em ${file}.`);
console.log('Se o broker já estiver rodando: docker compose kill -s SIGHUP mosquitto');
