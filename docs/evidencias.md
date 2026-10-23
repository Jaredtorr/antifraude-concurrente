# Evidencias de la línea base

## Metodología
- Servidor naive y JMeter en la misma Mac (comparten CPU).
- Servidor reiniciado antes de cada corrida.
- /lotes: 30 millones de transacciones, semilla 42.
- 10 hilos, rampa de 5 s, 60 s configurados (la corrida real dura más: las peticiones en cola terminan después del corte).

## /lotes, 10 hilos
| Corrida | n | p50 (ms) | p95 (ms) | p99 (ms) | req/s | Errores |
|---|---|---|---|---|---|---|
| r1 | 49 | 7130 | 45129 | 52991 | 0.7 | 7 (14.3%) |

Errores r1: 7 de tipo `Connection reset` (SocketException); las otras 42 respuestas fueron 200.