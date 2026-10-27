import os from 'node:os';

const entero = (nombre, defecto) => {
    const v = Number.parseInt(process.env[nombre] ?? '', 10);
    return Number.isInteger(v) && v > 0 ? v : defecto;
};

const nucleos = os.availableParallelism();

// Defaults: procesos x (pool + externos + 1 hilo principal) <= núcleos
const procesos = entero('PROCESOS', Math.min(2, nucleos));
const externos = entero('EXTERNOS_MAX', 1);
const pool = entero('POOL', Math.max(1, Math.floor(nucleos / procesos) - externos - 1));

export const config = {
    puerto: entero('PUERTO', 3000),
    procesos,
    pool,
    cola: entero('COLA_MAX', 32),
    externos,
    timeoutMs: entero('TIMEOUT_MS', 30000),
    python: process.env.PYTHON ?? 'python3',
    nucleos,
};