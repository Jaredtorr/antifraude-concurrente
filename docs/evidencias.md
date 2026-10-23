# Evidencias de la línea base

## Metodología
- Servidor naive y JMeter en la misma Mac (comparten CPU).
- Servidor reiniciado antes de cada corrida.
- /lotes: 30 millones de transacciones, semilla 42.
- 3 repeticiones por escenario.
- 10 hilos: rampa de 5 s, 60 s configurados. La corrida real dura ~75 s porque las peticiones en cola terminan después del corte.
- 1 hilo: rampa de 1 s, 60 s configurados.

## /lotes, 1 hilo
| Corrida | n | p50 (ms) | p95 (ms) | p99 (ms) | req/s | Errores |
|---|---|---|---|---|---|---|
| r1 | 34 | 1766 | 1882 | 2053 | 0.6 | 0 (0.0%) |
| r2 | 35 | 1764 | 1780 | 1811 | 0.6 | 0 (0.0%) |
| r3 | 35 | 1758 | 1776 | 1825 | 0.6 | 0 (0.0%) |

## /lotes, 10 hilos
| Corrida | n | p50 (ms) | p95 (ms) | p99 (ms) | req/s | Errores |
|---|---|---|---|---|---|---|
| r1 | 49 | 7130 | 45129 | 52991 | 0.7 | 7 (14.3%) |
| r2 | 49 | 7182 | 43732 | 51637 | 0.6 | 7 (14.3%) |
| r3 | 49 | 7020 | 42653 | 50301 | 0.7 | 7 (14.3%) |

Errores (10 hilos): en las tres corridas, 7 de tipo `Connection reset` (SocketException) y 42 respuestas 200. Causa sin confirmar (hipótesis: timeout de keep-alive de Node mientras /lotes bloquea el hilo principal).