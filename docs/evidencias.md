# Evidencias

## Metodología
- Servidor y JMeter (modo consola) en la misma Mac de 10 núcleos: comparten CPU.
- Servidor reiniciado antes de cada corrida; los `.jtl` nuevos llevan prefijo `fin-`.
- Línea base (`naive/server.js`): 60 s por corrida; `/lotes` con 30 millones de transacciones y semilla 42.
- Versión final: mismo plan JMeter y mismo cuerpo. `/lotes` con 1 hilo a 60 s; con 10 y 50 hilos a 15 s (rampa de 2 y 5 s); `/analisis` y `/tarjetas` a 60 s.
- Configuración A: `PROCESOS=1 POOL=4 EXTERNOS_MAX=2`. Configuración B: `PROCESOS=2 POOL=2 EXTERNOS_MAX=1`. Ambas respetan procesos x pool x externos <= 10 núcleos.
- El plan de `/lotes` es de ciclo abierto: la versión final responde 202 al instante, así que el p99 de JMeter solo mide la aceptación. La latencia comparable con la línea base es la de `lotes_calculo` en `/health`. Los 503 son contrapresión (cola llena) y se reportan aparte de los errores reales, aunque `resumen_jtl.py` los cuente como errores.
- `/health` solo muestra las métricas del proceso que responde; con 2 procesos se consultó cada PID.

## Línea base

### /lotes
| Hilos | Corridas | p50 (ms) | p99 (ms) | req/s | Errores |
|---|---|---|---|---|---|
| 1 | 3 | 1758 a 1766 | 1811 a 2053 | 0.6 | 0 % |
| 10 | 3 | 7020 a 7182 | 50 301 a 52 991 | 0.6 a 0.7 | 14.3 % Connection reset |
| 50 | 1 | 60 226 | 123 857 | 0.6 | 7.9 % Connection reset |

### /tarjetas
| Hilos | p50 / p99 (ms) | req/s | Errores |
|---|---|---|---|
| 1 | 0 / 1 | 27 653 | 0 |
| 10 | 0 / 1 | 103 761 | 510 (429 por colisión de ids) |
| 50 | 0 / 2 | 90 955 | 264 (429) |

Cada proceso contaba los intentos por separado: falla en corrección, no en velocidad.

### /analisis
| Hilos | p50 / p99 (ms) | req/s | Errores |
|---|---|---|---|
| 1 | 802 / 930 | 1.2 | 0 % |
| 10 | 6508 / 26 891 | 1.3 | 4.6 % Connection reset |

Con 50 hilos no se midió (limitación).

### /health (medición manual)
1.56 s durante `/analisis` y 1.15 s durante `/lotes`.

## Versión final

### /lotes, configuración A (1 proceso, pool 4)
| Hilos | Completados | Ejecución p50 | Cola p50 | Total p50 / p95 / p99 (ms) | Rechazos 503 | Event Loop p99 | RSS |
|---|---|---|---|---|---|---|---|
| 1 (60 s) | 126 (~2.1/s) | 526 ms | 4058 ms | 4571 / 4731 / 4855 | 1 365 992 | 11.08 ms | 333 MB |
| 10 (15 s) | 35 (~2/s) | 565 ms | 4246 ms | 4803 / 5313 / 5435 | 796 792 | 11.10 ms | 288 MB |
| 50 (15 s) | 33 (~2/s) | 611 ms | 4519 ms | 5071 / 5801 / 5849 | 792 584 | 11.10 ms | 260 MB |

Errores reales: 0 en los tres niveles.

Mejora contra la línea base (lotes aceptados): p99 de -89.7 % con 10 hilos (52 991 a 5435 ms) y de -95.3 % con 50 hilos (123 857 a 5849 ms). Ejecución p50: -92.1 % con 10 hilos y -99.0 % con 50. Throughput de cálculo: ~2 lotes/s contra 0.6 a 0.7. El p99 queda acotado por la cola máxima de 32 tramos. Los rechazos 503 no entran en ese p99.

### /lotes, configuración B (2 procesos, pool 2 c/u), 10 hilos, 15 s
| PID | Completados | Ejecución p50 | Cola p50 | Total p50 / p95 / p99 (ms) | Event Loop p99 | RSS |
|---|---|---|---|---|---|---|
| 67684 | 29 | 1049 ms | 15 230 ms | 16 126 / 18 076 / 18 601 | 11.21 ms | 221 MB |
| 67685 | 29 | 1028 ms | 15 081 ms | 15 982 / 18 109 / 18 792 | 11.25 ms | 220 MB |

Rechazos 503: 971 351 de 971 409 peticiones. Mejora del p99 contra la línea base de 10 hilos: -64.5 % a -64.9 %.

### Comparación A contra B (mismo pool total de 4 hilos, 10 hilos de JMeter)
| | A | B |
|---|---|---|
| Lotes completados | 35 | 58 |
| Capacidad de cálculo | ~2 lotes/s | ~2 lotes/s |
| Ejecución p50 | 565 ms | ~1040 ms |
| Total p99 | 5435 ms | ~18 700 ms |
| RSS total | 288 MB | 441 MB |

Cada lote se reparte en tantos tramos como hilos tiene el pool de su proceso (4 en A, 2 en B). Para un cálculo CPU-bound el cluster no aumenta el throughput: añade memoria y colas más largas. Aporta tolerancia a fallos y estado compartido por IPC.

### /analisis, configuración A
| Hilos | Completados | p50 / p95 / p99 (ms) | Errores reales | Rechazos 429 | Event Loop p99 | RSS |
|---|---|---|---|---|---|---|
| 1 (60 s) | 73 (~1.2/s) | 829 / 884 / 913 | 0 | 0 | 16.11 ms | 114 MB |
| 10 (60 s) | 82 (~1.3/s) | 1442 / 1632 / 1780 | 0 | 1 202 164 | 15.01 ms | 241 MB |

Mejora con 10 hilos: p50 -77.8 % (6508 a 1442 ms) y p99 -93.4 % (26 891 a 1780 ms). Con 1 hilo no hay cambio relevante porque el cálculo corre en Python. Las cifras de 1 hilo salen de `/health`: el `.jtl` quedó con dos corridas mezcladas y no se usa. La latencia de 10 hilos sale del `.jtl` filtrado por código 200.

### /tarjetas, configuración B (2 procesos), 10 hilos, 60 s
| Métrica | Línea base | Final |
|---|---|---|
| Peticiones | ~6.2 millones | 5 668 478 |
| Throughput | 103 761/s | 78 250/s (-24.6 %) |
| p50 / p99 (JMeter) | 0 / 1 ms | 1 / 1 ms |
| 429 | 510 | 265 |
| Reparto | un proceso | 2 863 477 (PID 69750) y 2 805 011 (PID 69751) |

El costo del contador único (un mensaje IPC al primario por intento) se ve en el throughput, no en la latencia. La causa exacta del 25 % no se midió. Con ids aleatorios los 429 salen de colisiones; la prueba del contador unificado es la manual: con 2 procesos los intentos de una misma tarjeta llegaron a 14 con el PID alternando.

### Aislamiento de /health
| Condición | Línea base | Final |
|---|---|---|
| Durante `/lotes` | 1150 ms | 1.9 a 6.5 ms (p99 de 4.74 ms con 50 hilos) |
| 8 solicitudes simultáneas con un lote de 100 millones en curso | no medido | 0.8 a 1.6 ms |
| Event Loop p99 (límite de 50 ms) | no medido | 11.1 ms (base de 10 ms por `resolution: 10`) |

### Carrera de datos (`pruebas/carrera.js`)
| Versión | Resultado |
|---|---|
| Atómica (`Atomics`) | 750 000 de 750 000 (0 perdidas) |
| Con carrera | 512 863 (237 137 perdidas, 31.6 %) |

### Resiliencia
| Prueba | Resultado |
|---|---|
| `kill -9` a un worker | PID 54475 reemplazado por 54509; `/health` 200 sin interrupción |
| Ciclo de caídas | 5 reinicios en 60 s; luego "demasiados reinicios" y salida con código 1 al quedar sin workers |
| SIGTERM con `/analisis` en vuelo | Sin `detectar.py` ni `index.js` huérfanos |
| SIGINT con lote de 100 millones en vuelo | `cierre ordenado`, código 0 |
| Cola llena (`POOL=1 COLA_MAX=1`) | 5 POST: 202, 202, 503, 503, 503 |

### Perfil de CPU (`--cpu-prof`, `/lotes`, 10 hilos, 15 s)
Archivos en `load/perfil/`. En los 4 hilos del pool domina `generarTarjeta` (`servicios/reglas.js:20`) con 47 a 50 % del tiempo; `(idle)` ronda 31 % y `analizarTarjetas` 11 a 14 %. El cálculo vive en los hilos del pool.

## Arranque en frío contra reutilización del pool (Config A, /lotes, 30 millones, semilla 42)
| Lote | ejecucion_ms | total_ms |
|---|---|---|
| Primero tras arrancar (en frío) | 483.4 | 483.6 |
| En caliente (4 lotes) | 460 a 471.7 | 460 a 472 |

El primer lote tarda unos 18 ms más (≈4 %). El pool crea y carga los workers al arrancar, así que el costo de arranque no recae sobre la primera petición. Una sola medición en frío: es una tendencia, no una medida estadística.