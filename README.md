# API antifraude concurrente (Node.js 24)

Proyecto integrador de Programación Concurrente. API REST sin librerías externas (solo módulos `node:*`) que combina `worker_threads` (cálculo CPU-bound), `child_process` (análisis en Python) y `cluster` (varios procesos con estado compartido por IPC).

## Requisitos
- Node.js 24 LTS (`nvm use` lee `.nvmrc`)
- Python 3 con las dependencias de `python/detectar.py` (se usa `.venv`)
- JMeter 5.6.3 (solo para las mediciones)

## Ejecución
```bash
source .venv/bin/activate
source ~/.nvm/nvm.sh && nvm use
npm start
# ejemplo con configuración explícita:
PROCESOS=2 POOL=2 EXTERNOS_MAX=1 node src/index.js
# versión ingenua (línea base, puerto 3000):
npm run start:naive
```

## Variables de entorno
| Variable | Defecto | Efecto |
|---|---|---|
| `PUERTO` | 3000 | Puerto HTTP |
| `PROCESOS` | núcleos disponibles | Procesos del cluster |
| `POOL` | núcleos / 2 (mínimo 1) | Hilos del pool de workers, por proceso |
| `COLA_MAX` | 32 | Tramos en cola; al llenarse, `/lotes` responde 503 |
| `EXTERNOS_MAX` | 2 | Procesos `detectar.py` simultáneos, por proceso |
| `TIMEOUT_MS` | 30000 | Timeout por tarea |
| `PYTHON` | `python3` | Intérprete para `child_process` |
| `CONTADOR` | (atómico) | `carrera` activa la versión con carrera de datos (solo para la demostración) |

`POOL` y `EXTERNOS_MAX` son por proceso. Debe cumplirse `PROCESOS x POOL x EXTERNOS_MAX <= núcleos` (la máquina de pruebas tiene 10).

## Contrato
Ver `docs/contrato.md`. Todas las respuestas llevan `X-PID` y `Server-Timing`. Códigos usados: 200, 201, 202, 400, 404, 405, 429, 500, 503.

## Colección de peticiones
```bash
# salud (200 ok o 503 degraded)
curl -s -i localhost:3000/health

# análisis con proceso externo (CSV en el cuerpo)
curl -s -X POST "localhost:3000/analisis?top=50" --data-binary @datos.csv

# lote asíncrono (202) y seguimiento
curl -s -i -X POST localhost:3000/lotes -H 'Content-Type: application/json' \
  -d '{"tamano":30000000,"semilla":42}'
curl -s localhost:3000/lotes/<ID>

# tarjeta (el contador de intentos es único entre procesos)
curl -s -i -X POST localhost:3000/tarjetas/1001/autorizar \
  -H 'Content-Type: application/json' -d '{"monto":100}'

# errores esperados
curl -s -i -X POST localhost:3000/lotes -H 'Content-Type: application/json' -d '{"tamano":1}'   # 400
curl -s -i -X DELETE localhost:3000/health                                                      # 405
curl -s -i localhost:3000/no-existe                                                             # 404
```

## Arquitectura
- `src/servidor.js`: despachador de rutas, 404/405, límite de cuerpo, `/health`.
- `src/recursos/analisis.js`: `spawn` con argumentos en arreglo y `shell: false`, lista blanca, límite de salida, timeout con kill y límite de procesos.
- `src/workers/pool.js` y `worker.js`: pool fijo, cola, 503 con cola llena, timeout y reemplazo de workers.
- `src/recursos/lotes.js`: 202 con recurso de seguimiento; `src/contador.js`: `SharedArrayBuffer` con `Atomics` y versión con carrera.
- `src/cluster/primario.js` e `src/ipc.js`: reinicio con protección contra ciclos, intentos por tarjeta y lotes compartidos por IPC, cierre ordenado con SIGTERM/SIGINT.
- `src/metricas.js`: percentiles por recurso y Event Loop.

## Mediciones
Los planes están en `load/` (`carga-json.jmx`, `carga-tarjetas.jmx`, `carga-analisis.jmx`, `carga-health.jmx`). Ejemplo:
```bash
jmeter -n -t load/carga-json.jmx -l load/fin-lotes-A-h10-r1.jtl \
  -Jhilos=10 -Jrampa=2 -Jduracion=15 -Jruta=/lotes -Jcuerpo='{"tamano":30000000,"semilla":42}'
python3 python/resumen_jtl.py load/fin-lotes-A-h10-r1.jtl
```
JMeter no sobrescribe `.jtl` ni carpetas `-o`: usar nombres nuevos. Resultados completos en `docs/evidencias.md`.

## Pruebas
- Carrera de datos: `node pruebas/carrera.js`.
- Resiliencia (reinicio de worker, cierre ordenado, 503 con cola llena): ver sección de resiliencia de `docs/evidencias.md`.