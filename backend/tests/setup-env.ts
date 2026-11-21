import { testDatabaseUrl } from './test-db-url';

// Executado antes de cada arquivo de teste, antes de importar o código da aplicação.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl();
process.env.MQTT_URL = '';
process.env.OFFLINE_APOS_SEGUNDOS = '15';
process.env.COMANDO_EXPIRA_SEGUNDOS = '15';
