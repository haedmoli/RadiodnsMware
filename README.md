# RadioDNS Middleware

Middleware desarrollado en **NestJS** diseñado para actuar como puente entre **AzuraCast** (mediante Webhooks) y clientes de **RadioDNS**, gestionando la entrega de pautas publicitarias regionalizadas a través de **MQTT** y a nivel nacional mediante **RadioVIS (STOMP)**.

---

## Arquitectura del Proyecto

El sistema está compuesto por los siguientes servicios orquestados en Docker Compose:

*   **API (NestJS):** Escucha las notificaciones de cambio de canción desde AzuraCast, resuelve qué campaña y piezas (imágenes/texto) corresponden para cada región y publica los resultados.
*   **PostgreSQL:** Almacena la configuración de Regiones, Clientes, Mapeos de Topics, Campañas y Creatividades.
*   **Redis:** Caché de campañas activas y almacenamiento del estado actual de la emisora en tiempo real (`active_now`).
*   **Mosquitto (MQTT Broker):** Distribuye imágenes y textos regionalizados bajo topics como `harold_moreno/region/<region_name>/image`.
*   **ActiveMQ (STOMP Broker):** Distribuye textos y diapositivas nacionales usando el estándar RadioVIS sobre topics como `/topic/2a3/2016/...`.

---

## Configuración y Variables de Entorno (`.env`)

Crea un archivo `.env` en la raíz del proyecto basándote en `.env.example`. La sección de mapeo de **Bearers** es crítica para asociar las estaciones de AzuraCast con sus identificadores de RadioDNS:

```ini
PORT=3000

# Base de datos PostgreSQL
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=rdns_db
DB_PORT=5432
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rdns_db?schema=public"

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# MQTT
MQTT_HOST=localhost
MQTT_PORT=1883
MQTT_WS_PORT=9001

# ActiveMQ STOMP / RadioVIS
STOMP_HOST=localhost
STOMP_PORT=61613
STOMP_USE_TLS=false
STOMP_USER=admin
STOMP_PASSWORD=adminpassword

# Mapeos de Bearer para AzuraCast (Asociación Estación -> RadioDNS Bearer)
# Formato: BEARER_<shortcode_estacion>="fm:<ecc>.<country>.<id>"
BEARER_harold_moreno="fm:2a3.2016.10540"
BEARER_el_sol="fm:2a3.2016.10540"
```

---

## Primeros Pasos

### 1. Levantar la infraestructura
Para inicializar todos los contenedores Docker en segundo plano, ejecuta:

```bash
docker-compose up -d
```

### 2. Poblar la Base de Datos (Seeding)
El proyecto contiene un script de base de datos para poblar campañas iniciales en los bloques publicitarios del 1 al 4 (`comercial_bloque_1` a `comercial_bloque_4`):

```bash
docker exec rdns_api npx prisma db seed
```

---

## Integración con AzuraCast (Webhooks)

### 1. Configurar Webhook en AzuraCast
*   Ve a la configuración de tu emisora en AzuraCast -> **Webhooks**.
*   Agrega un nuevo webhook de tipo **Generic / Custom POST**.
*   Configura la URL de destino apuntando a la dirección IP del host de tu middleware (ejemplo usando DNS interno de docker o el host local):
    `http://host.docker.internal:3000/ad-trigger/azuracast`
*   Selecciona el evento **Song Changed** (Cambio de canción).

### 2. Configurar el campo personalizado `trigger_key`
*   En AzuraCast, crea un **Campo Personalizado** (Custom Field) llamado `trigger_key` (Configuración de la emisora -> Campos Personalizados).
*   En tu biblioteca de medios, edita los metadatos de las cuñas o canciones de pauta comercial y rellena el campo `trigger_key` con valores como `comercial_bloque_1`, `comercial_bloque_2`, etc.

### 3. Soporte del botón "Test Webhook"
El middleware incluye lógica específica para soportar el botón de prueba de AzuraCast:
*   **Estructura flexible:** Lee tanto el JSON plano en vivo como el objeto de prueba envuelto bajo `np`.
*   **Búsqueda en Historial:** Como la canción de prueba no tiene `trigger_key` asignado, el middleware escanea el historial de reproducción reciente (`song_history`) para recuperar un trigger válido (por ejemplo, `comercial_bloque_4`) permitiendo que la simulación de pauta se ejecute de forma exitosa.

---

## Configuración de Túneles Públicos (ngrok / Expo)

Si estás probando la aplicación cliente (ej. una app móvil en React Native con Expo) desde internet, debes exponer los puertos de la API y de STOMP usando ngrok:

1. **Túnel para la API:**
   ```bash
   ngrok http 3000
   ```
2. **Túnel para STOMP WebSockets:**
   ```bash
   ngrok http 61614
   ```

Una vez que obtengas las URLs públicas, actualiza tu archivo `.env`:
*   Define `STOMP_PUBLIC_HOST` con el subdominio de tu túnel de STOMP (ej: `xxxx-xxxx.ngrok-free.app`).
*   Define `STOMP_PUBLIC_PORT` en `443` (puerto seguro HTTPS/WSS por defecto de ngrok).

Reinicia el contenedor de la API:
```bash
docker restart rdns_api
```

El XML de SPI que consuma tu aplicación ahora devolverá el enlace correcto para conectarse de forma remota a través de WebSockets Seguros (`wss://`).

---

## Pruebas y Verificación

### Verificar STOMP (RadioVIS)
Puedes ejecutar el cliente de prueba incluido para escuchar las diapositivas y textos que el middleware despacha en tiempo real por STOMP:

```bash
docker exec rdns_api npx ts-node scripts/verify-stomp.ts
```

Cuando dispares una prueba de webhook desde AzuraCast o cambie una canción con trigger activo, verás el log de mensajes entrantes de RadioVIS:

```text
[RadioVIS SLIDE INCOMING] => Topic: /topic/2a3/2016/image
Payload: "SHOW https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80"

[RadioVIS TEXT INCOMING]  => Topic: /topic/2a3/2016/text
Payload: "TEXT Radio Híbrida: Una sola señal, todo un país conectado"
```
