import { testDatabaseUrl } from './test-db-url';

// Executado antes de cada arquivo de teste, antes de importar o código da aplicação.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDatabaseUrl();
process.env.JWT_SECRET = 'segredo-somente-para-testes-automatizados';
process.env.FRONTEND_URL = 'http://localhost:5173';
process.env.COOKIE_NAME = 'access_token';
process.env.MQTT_URL = '';
process.env.HEARTBEAT_TIMEOUT_SECONDS = '90';
