# Manual de Pruebas - Middleware RadioDNS

Este manual está diseñado para guiar paso a paso en el proceso de instalación, verificación y pruebas de integración del **Middleware RadioDNS** para pauta publicitaria visual en radio híbrida.

El middleware soporta dos canales paralelos de distribución:
1.  **MQTT (Visualizador Regionalizado):** Segmentación regional en base a geolocalización IP (Bogotá, Medellín, Nacional) mediante WebSockets.
2.  **STOMP/ActiveMQ (RadioVIS Estándar):** Publicación global a tópicos oficiales de RadioVIS basados en portadoras FM (`fm:<ecc>.<pi>.<freq>`).

---

## 1. Requisitos Previos

Asegúrate de tener instalado:
*   **Docker** y **Docker Compose**.
*   **Node.js** (versión 20 o superior) y **npm** (para correr los scripts de prueba fuera de Docker).
*   **cURL** o **Postman** (para enviar peticiones HTTP POST).

---

## 2. Puesta en Marcha (Entorno Local)

1.  **Clonar el repositorio y entrar al directorio:**
    ```bash
    git clone https://github.com/haedmoli/RadiodnsMware.git
    cd RadiodnsMware
    ```
2.  **Crear el archivo de configuración `.env`:**
    ```bash
    cp .env.example .env
    ```
3.  **Iniciar los contenedores de Docker:**
    ```bash
    docker compose up -d --build
    ```
    *Este comando iniciará PostgreSQL, Redis, Mosquitto (MQTT), ActiveMQ y el backend NestJS (en puerto 3000).*
4.  **Ejecutar migraciones y semilla de la Base de Datos:**
    ```bash
    # Aplicar el esquema en PostgreSQL
    docker exec -it rdns_api npx prisma migrate deploy
    # Cargar regiones y campañas iniciales de prueba
    docker exec -it rdns_api npx prisma db seed
    ```

---

## 3. Pruebas de Flujo 1: Visualizador Web Regional (MQTT)

Esta prueba valida la resolución geográfica mediante la IP del cliente (con MaxMind GeoIP2) y la suscripción WebSockets.

### Paso 1: Conectar el visualizador en el navegador
1.  Abre en tu navegador la URL: [http://localhost:3000/client](http://localhost:3000/client)
2.  En el panel izquierdo **"Simulación de Ubicación"**, haz clic en el botón de perfil **Bogotá** (esto auto-completa la IP `186.28.232.10`).
3.  Haz clic en **Conectar a RadioDNS**.
4.  Verifica los logs en el visualizador. Verás cómo descarga el XML SPI dinámico, extrae el tópico de MQTT `/emisora_colombia/region/bogota` y se conecta con éxito.

### Paso 2: Disparar el comercial en Bogotá
Abre una terminal paralela y envía el webhook simulado de AzuraCast con el identificador de pauta comercial:

```bash
curl -X POST http://localhost:3000/ad-trigger/azuracast \
  -H "Content-Type: application/json" \
  -d '{
    "event": "song_changed",
    "station": {
      "id": 1,
      "name": "Colombia FM",
      "shortcode": "emisora_colombia"
    },
    "now_playing": {
      "duration": 45,
      "song": {
        "id": "custom_song_id",
        "text": "Carulla Spot - Promo Bogota",
        "artist": "Carulla",
        "title": "Promo Bogota",
        "custom_fields": {
          "trigger_key": "comercial_bloque_1"
        }
      }
    }
  }'
```

*   **Resultado Esperado:** El visualizador web en tu navegador cargará inmediatamente el slide con la botella de vino de **Carulla Bogotá** y el texto de RDS *"¡30% de descuento en vinos hoy en Carulla Bogotá!"*, iniciando un temporizador de 45 segundos.

---

## 4. Pruebas de Flujo 2: RadioVIS Estándar (ActiveMQ STOMP)

Esta prueba valida el parseo de la portadora FM (bearer) y la entrega estándar de los mensajes `SHOW` y `TEXT` de RadioVIS solicitando confirmación `RECEIPT` en la conexión STOMP.

### Paso 1: Levantar el cliente suscriptor
Ejecuta el script independiente en una terminal para simular un receptor de radio físico suscrito a **El Sol** (`fm:2a3.2016.10540`):

```bash
npx ts-node scripts/verify-stomp.ts
```

*   **Resultado Esperado:** Verás en la consola la salida exitosa:
    ```
    ✔ Conectado exitosamente al Broker STOMP.
    Suscribiéndose a /topic/2a3/2016/image (Solicitando Receipt ID: receipt-sub-image)...
    Suscribiéndose a /topic/2a3/2016/text (Solicitando Receipt ID: receipt-sub-text)...
    [RECEIPT CONFIRMED] Suscripción confirmada para: /topic/2a3/2016/image
    [RECEIPT CONFIRMED] Suscripción confirmada para: /topic/2a3/2016/text
    ```

### Paso 2: Disparar el comercial con el FM Bearer
En otra terminal, dispara el trigger incluyendo la propiedad `bearer` en la emisora (station):

```bash
curl -X POST http://localhost:3000/ad-trigger/azuracast \
  -H "Content-Type: application/json" \
  -d '{
    "event": "song_changed",
    "station": {
      "id": 1,
      "name": "El Sol",
      "shortcode": "el_sol",
      "bearer": "fm:2a3.2016.10540"
    },
    "now_playing": {
      "duration": 30,
      "song": {
        "id": "custom_song_id",
        "text": "El Sol Commercial Spot",
        "artist": "El Sol",
        "title": "El Sol Promo",
        "custom_fields": {
          "trigger_key": "comercial_bloque_1"
        }
      }
    }
  }'
```

*   **Resultado Esperado:** En la consola del Paso 1, verás de forma instantánea los payloads de RadioVIS:
    ```
    [RadioVIS SLIDE INCOMING] => Topic: /topic/2a3/2016/image
    Payload: "SHOW https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=800&q=80"

    [RadioVIS TEXT INCOMING]  => Topic: /topic/2a3/2016/text
    Payload: "TEXT Escuchas la emisora oficial de Colombia - Radio Híbrida"
    ```

---

## 5. Pruebas de Flujo 3: Consola Web de ActiveMQ
Puedes inspeccionar la entrega de los mensajes y los tópicos directamente en el broker de ActiveMQ:
1.  Entra en tu navegador a: [http://localhost:8161](http://localhost:8161)
2.  Ingresa con las credenciales por defecto: Usuario `admin` / Contraseña `admin`.
3.  Dirígete a **Manage ActiveMQ Broker** $\rightarrow$ **Topics**.
4.  Verifica los contadores de mensajes (`enqueueCount` / `dequeueCount`) para `/topic/2a3/2016/image` y `/topic/2a3/2016/text`.

---

## 6. Pruebas de Flujo 4: Validaciones de Longitud de Especificación

El sistema valida y rechaza/recorta los mensajes que violen las longitudes máximas de la especificación ETSI TS 101 499 (URL de diapositiva máx 512 caracteres; texto RDS máx 128 caracteres).

### Ejecutar Tests Unitarios
Para validar que las reglas de negocio de validación y parseo de bearer funcionen correctamente de forma aislada, corre las pruebas automatizadas del proyecto:

```bash
# Correr todas las pruebas unitarias en el contenedor de la API
docker exec -it rdns_api npm run test
```

*   **Resultado Esperado:** Todos los tests de la suite de `bearer.parser` y `radiovis.service` deben pasar exitosamente (`PASS`).
    *   `✓ debería truncar mensajes de texto de más de 128 caracteres y emitir una advertencia`
    *   `✓ debería rechazar imágenes con URLs de más de 512 caracteres y emitir una advertencia`
