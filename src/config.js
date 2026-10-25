import os from 'node:os';

const entero = (nombre, defecto) => {
    const v = Number.parseInt(process.env[nombre] ?? '', 10);
    return Number.isInteger(v) && v > 0 ? v : defecto;
};

const nucleos = os.availableParallelism();

export const config = {
    puerto: entero('PUERTO', 3000),
    procesos: entero('PROCESOS', nucleos),
    pool: entero('POOL', Math.max(1, Math.floor(nucleos / 2))),
    cola: entero('COLA_MAX', 32),
    externos: entero('EXTERNOS_MAX', 2),
    timeoutMs: entero('TIMEOUT_MS', 30000),
    python: process.env.PYTHON ?? 'python3',
};