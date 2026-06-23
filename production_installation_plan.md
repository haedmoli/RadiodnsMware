# Plan de Instalación en Producción - RadioDNS Middleware

Este documento describe la arquitectura, configuración y pasos requeridos para desplegar el middleware en un entorno de producción (AWS / Nube) utilizando **Amazon MQ (ActiveMQ)** y **Amazon RDS (PostgreSQL)**.

---

## 1. Arquitectura de Producción

El siguiente diagrama ilustra el flujo de red e integración entre los sistemas:

```mermaid
graph TD
    %% Playout Ingest
    AzuraCast[AzuraCast Playout] -->|Webhook POST /ad-trigger/azuracast| API[NestJS Middleware API]
    
    %% Storage
    API -->|Read/Write| DB[(AWS RDS PostgreSQL)]
    API -->|Caching & Real-Time Status| Cache[(AWS ElastiCache Redis)]

    %% Publishers
    API -->|1. WebSockets MQTT| Mosquitto[Mosquitto Broker]
    API -->|2. STOMP SSL port 61614| AmazonMQ[Amazon MQ - ActiveMQ]

    %% Subscribers
    WebVisualizer[HTML5 Visualizer] -->|ws://localhost:9001| Mosquitto
    
    %% Standard RadioVIS Flow (Anonymous Connect)
    RadioVISReceiver[RadioVIS Receivers] -->|No Credentials| Proxy[STOMP Proxy / Gateway]
    Proxy -->|Inject Read-Only Credentials| AmazonMQ
```

---

## 2. Variables de Entorno de Producción (`.env`)

En producción, estas variables se deben inyectar directamente en el servicio contenedor (por ejemplo, en las definiciones de tareas de **AWS ECS Fargate** o Secrets de Kubernetes) en lugar de usar un archivo `.env` local:

```env
# Puerto del Servidor NestJS
PORT=3000

# Base de datos (AWS RDS PostgreSQL)
DATABASE_URL="postgresql://db_user:secure_password@rds-instance-endpoint.rds.amazonaws.com:5432/rdns_db?schema=public&sslmode=require"

# Caché (AWS ElastiCache Redis)
REDIS_HOST="elasticache-redis-cluster-endpoint.cache.amazonaws.com"
REDIS_PORT=6379

# Servidor MQTT Propietario (Visualizador Regional)
MQTT_HOST="mqtt.midominio.com"
MQTT_PORT=1883
MQTT_WS_PORT=9001

# MaxMind GeoIP Database Path
GEOIP_DB_PATH="/usr/src/app/src/geoip/GeoLite2-City.mmdb"

# JWT y Seguridad Admin
JWT_SECRET="Llave_Segura_Y_Compleja_Generada_En_Produccion_256bits"
ADMIN_USER="superadmin"
ADMIN_PASSWORD="Password_Altamente_Seguro_Admin"

# --- Amazon MQ / ActiveMQ STOMP ---
STOMP_HOST="b-12345-endpoint.mq.us-east-1.amazonaws.com"
STOMP_PORT=61614
STOMP_USE_TLS=true
STOMP_USER="middleware_admin"
STOMP_PASSWORD="Password_Middleware_ActiveMQ"
```

---

## 3. Configuración de Seguridad en Amazon MQ (ActiveMQ)

### A. Definición de Usuarios en la Consola AWS
Crea dos usuarios de ActiveMQ en tu configuración de Amazon MQ dentro de la consola de AWS:
1.  **`middleware_admin` (Escritura):** Utilizado por tu backend NestJS para publicar los frames `SEND`.
2.  **`radiovis_guest` (Lectura):** Utilizado únicamente por los receptores RadioVIS (a través del STOMP Gateway).

### B. Configuración de ACLs en `activemq.xml`
Para restringir que solo tu middleware publique y que los usuarios generales solo lean, aplica el plugin de autorización en la configuración del broker de Amazon MQ:

```xml
<plugins>
  <authorizationPlugin>
    <map>
      <authorizationMap>
        <authorizationEntries>
          <!-- 
            - read: Solo el rol de invitados y administradores leen de los tópicos
            - write: Únicamente el middleware admin publica
            - admin: Permiso exclusivo de administración para middleware
          -->
          <authorizationEntry topic="/topic/>" read="guests,admins" write="admins" admin="admins" />
          
          <!-- Tópicos de advisory necesarios para la negociación de clientes STOMP -->
          <authorizationEntry topic="ActiveMQ.Advisory.>" read="guests,admins" write="guests,admins" admin="guests,admins" />
        </authorizationEntries>
      </authorizationMap>
    </map>
  </authorizationPlugin>
</plugins>
```

---

## 4. Despliegue del STOMP Gateway / Proxy (Conectividad Anónima)

Para cumplir con la especificación de RadioVIS, que requiere conexión sin autenticación, y saltarse la restricción de Amazon MQ (que obliga a autenticar), se despliega un **STOMP Proxy** ligero de cara a internet.

### Opción Recomendada: Proxy Nginx Stream
Nginx puede balancear y redirigir conexiones TCP básicas. Usaremos un script de proxy node intermediario en su lugar, o configuramos Nginx con un filtro STOMP. 

Una alternativa estándar es usar un pequeño microservicio en la misma máquina o en Fargate que actúe como pasarela:
*   Acepta conexiones STOMP públicas en puerto `61613` (sin verificar credenciales).
*   Reenvía los datos al puerto `61614` de Amazon MQ interceptando el frame `CONNECT` y añadiendo las cabeceras `login: radiovis_guest` y `passcode: Password_De_Lectura`.

#### Código de Ejemplo para la Pasarela de Conexión (Gateway STOMP en Node.js)
```javascript
const net = require('net');

const PUBLIC_PORT = 61613; // Puerto expuesto públicamente
const AMAZON_MQ_HOST = 'b-12345-endpoint.mq.us-east-1.amazonaws.com';
const AMAZON_MQ_PORT = 61614; // STOMP + SSL
const GUEST_USER = 'radiovis_guest';
const GUEST_PASS = 'Password_De_Lectura';

net.createServer((socket) => {
  let mqSocket = null;
  let bufferQueue = [];

  // Conectar con Amazon MQ (usando tls para puerto 61614)
  const tls = require('tls');
  mqSocket = tls.connect(AMAZON_MQ_PORT, AMAZON_MQ_HOST, { rejectUnauthorized: true }, () => {
    // Enviar datos encolados
    bufferQueue.forEach(chunk => mqSocket.write(chunk));
    bufferQueue = [];
  });

  socket.on('data', (chunk) => {
    let dataStr = chunk.toString();
    
    // Interceptar frame CONNECT para inyectar credenciales del lector
    if (dataStr.startsWith('CONNECT\n') || dataStr.startsWith('CONNECT\r\n')) {
      const headers = `login:${GUEST_USER}\npasscode:${GUEST_PASS}\n`;
      dataStr = dataStr.replace(/(CONNECT\r?\n)/, `$1${headers}`);
      chunk = Buffer.from(dataStr);
    }

    if (mqSocket && mqSocket.writable) {
      mqSocket.write(chunk);
    } else {
      bufferQueue.push(chunk);
    }
  });

  mqSocket.on('data', (chunk) => {
    socket.write(chunk);
  });

  socket.on('close', () => mqSocket.destroy());
  mqSocket.on('close', () => socket.destroy());
}).listen(PUBLIC_PORT, () => {
  console.log(`STOMP Anonymous Gateway corriendo en puerto ${PUBLIC_PORT}`);
});
```

---

## 5. Pasos de Despliegue del Backend

1.  **Preparar Infraestructura AWS:**
    *   Crear base de datos RDS PostgreSQL.
    *   Crear clúster ElastiCache Redis.
    *   Crear broker Amazon MQ ActiveMQ.
2.  **Construir y Subir Imagen Docker:**
    *   Construir la imagen de producción en base al Dockerfile actual.
    *   Subir la imagen a un registro privado como **AWS ECR**.
3.  **Ejecutar Migraciones de Base de Datos:**
    *   Antes de arrancar el servicio API, ejecutar las migraciones de Prisma contra la base de datos de producción:
        ```bash
        npx prisma migrate deploy
        ```
4.  **Ejecutar Poblamiento (Seeding):**
    *   Si es la primera instalación, ejecutar el poblamiento inicial de regiones y mapeos de tópicos:
        ```bash
        npx prisma db seed
        ```
5.  **Desplegar Servicio Contenedor (AWS ECS Fargate):**
    *   Configurar el servicio NestJS apuntando a la imagen de ECR.
    *   Inyectar las variables de entorno detalladas en la sección 2.
    *   Configurar un **Application Load Balancer (ALB)** de cara al público con certificados SSL gestionados por **AWS Certificate Manager (ACM)** para exponer el endpoint HTTPS (`/ad-trigger/azuracast`) y el visualizador.
