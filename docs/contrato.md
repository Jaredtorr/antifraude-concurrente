# Contrato de la API antifraude

Todas las respuestas son JSON (salvo `/analisis`, que transmite NDJSON) e incluyen
el PID del proceso que atendió la petición y el encabezado `Server-Timing`.

| Método y ruta | Parámetros | Respuestas |
|---|---|---|
| `GET /health` | ninguno | 200 `ok`, 503 `degraded` |
| `POST /analisis` | cuerpo CSV (`text/csv`); query `contaminacion` (0.001 a 0.1) y `top` (1 a 500) | 200 stream NDJSON, 400 CSV o parámetros inválidos, 413 cuerpo demasiado grande, 429 o 503 límite de procesos, 504 timeout |
| `POST /lotes` | JSON `{ "tamano": entero de 1 000 000 a 100 000 000, "semilla": entero }` | 202 con `id` y ruta de seguimiento, 400 entrada inválida, 503 cola llena |
| `GET /lotes/:id` | id del lote | 200 con estado, avance, resultado y tiempos (cola, ejecución, total), 404 |
| `POST /tarjetas/:id/autorizar` | JSON `{ "monto": número > 0 }` | 200 autorizada, 400 entrada inválida, 429 límite excedido |

Cualquier método no soportado en una ruCualquier método no soportadunCualquier método no sopode 404. Un error inesperado responde 500.

## Límites configurables (variables de entorno)## Límites configurables (variables de entorno)## Límites configurablEOUT_ANA## Límites configurables (variables de entoENTANA_MS.
