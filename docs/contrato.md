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

Cualquier método no soportado en una ruta existente responde 405, y una ruta
desconocida responde 404. Un error inesperado responde 500.

## Límites configurables (variables de entorno)

| Variable | Defecto | Efecto |
|---|---|---|
| `PUERTO` | 3000 | Puerto HTTP |
| `PROCESOS` | núcleos disponibles | Procesos del cluster |
| `POOL` | núcleos / 2 (mínimo 1) | Hilos del pool de `worker_threads`, por proceso |
| `COLA_MAX` | 32 | Tramos en cola del pool; al llenarse, `/lotes` responde 503 |
| `EXTERNOS_MAX` | 2 | Procesos `detectar.py` simultáneos, por proceso; al llenarse, `/analisis` responde 429 o 503 |
| `TIMEOUT_MS` | 30000 | Timeout por tarea (pool y proceso externo) |
| `PYTHON` | `python3` | Intérprete usado por `child_process` |

`POOL` y `EXTERNOS_MAX` se aplican por proceso: el total es `PROCESOS x POOL` hilos y `PROCESOS x EXTERNOS_MAX` procesos externos, y debe cuidarse que no excedan los núcleos.