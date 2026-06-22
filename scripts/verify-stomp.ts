import * as stompit from 'stompit';
import * as dotenv from 'dotenv';
import { join } from 'path';

// Cargar variables de entorno del archivo .env
dotenv.config({ path: join(process.cwd(), '.env') });

const host = process.env.STOMP_HOST || 'localhost';
const port = parseInt(process.env.STOMP_PORT || '61613', 10);
const useTls = process.env.STOMP_USE_TLS === 'true';
const login = process.env.STOMP_USER || 'admin';
const passcode = process.env.STOMP_PASSWORD || 'adminpassword';

console.log('=== Iniciando Cliente de Pruebas STOMP / RadioVIS ===');
console.log(`Conectando a broker en: ${host}:${port} (TLS: ${useTls})`);

const connectionOptions: any = {
  host,
  port,
  ssl: useTls,
  connectHeaders: {
    host,
    login,
    passcode,
    'heart-beat': '10000,10000',
  },
};

const imageTopic = '/topic/2a3/2016/image';
const textTopic = '/topic/2a3/2016/text';

stompit.connect(connectionOptions, (err, client) => {
  if (err) {
    console.error('Error al conectar con ActiveMQ:', err.message);
    process.exit(1);
  }

  // Registrar confirmaciones de RECEIPT en la estructura interna de stompit
  const imageReceiptId = 'receipt-sub-image';
  const textReceiptId = 'receipt-sub-text';

  (client as any)._receipts[imageReceiptId] = () => {
    console.log(`[RECEIPT CONFIRMED] Suscripción confirmada para: ${imageTopic}`);
  };

  (client as any)._receipts[textReceiptId] = () => {
    console.log(`[RECEIPT CONFIRMED] Suscripción confirmada para: ${textTopic}`);
  };

  console.log('✔ Conectado exitosamente al Broker STOMP.');

  client.on('error', (clientErr) => {
    console.error('Error en el cliente STOMP:', clientErr.message);
  });

  // Suscribirse a Diapositivas (SLIDE) con solicitud de RECEIPT
  console.log(`Suscribiéndose a ${imageTopic} (Solicitando Receipt ID: ${imageReceiptId})...`);
  client.subscribe(
    {
      destination: imageTopic,
      ack: 'auto',
      receipt: imageReceiptId,
    },
    (subErr, message) => {
      if (subErr) {
        console.error(`Error al suscribirse a ${imageTopic}:`, subErr.message);
        return;
      }
      message.readString('utf-8', (readErr, body) => {
        if (readErr) {
          console.error('Error leyendo cuerpo del mensaje:', readErr.message);
          return;
        }
        console.log(`\n[RadioVIS SLIDE INCOMING] => Topic: ${imageTopic}`);
        console.log(`Payload: "${body}"`);
      });
    }
  );

  // Suscribirse a Textos (TEXT) con solicitud de RECEIPT
  console.log(`Suscribiéndose a ${textTopic} (Solicitando Receipt ID: ${textReceiptId})...`);
  client.subscribe(
    {
      destination: textTopic,
      ack: 'auto',
      receipt: textReceiptId,
    },
    (subErr, message) => {
      if (subErr) {
        console.error(`Error al suscribirse a ${textTopic}:`, subErr.message);
        return;
      }
      message.readString('utf-8', (readErr, body) => {
        if (readErr) {
          console.error('Error leyendo cuerpo del mensaje:', readErr.message);
          return;
        }
        console.log(`\n[RadioVIS TEXT INCOMING]  => Topic: ${textTopic}`);
        console.log(`Payload: "${body}"`);
      });
    }
  );

  console.log('\nEsperando mensajes de pauta en tiempo real... (Presiona Ctrl+C para salir)\n');
});
