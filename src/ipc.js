import { randomUUID } from 'node:crypto';

const enCluster = typeof process.send === 'function';
const locales = new Map();
const pendientes = new Map();
const TIMEOUT_MS = 2000;

if (enCluster) {
    process.on('message', (m) => {
        if (m?.tipo !== 'lote:respuesta') return;
        const p = pendientes.get(m.id);
        if (!p) return;
        clearTimeout(p.timer);
        pendientes.delete(m.id);
        p.resolve(m.lote);
    });
}

export function publicarLote(lote) {
    if (!enCluster) return void locales.set(lote.id, lote);
    if (process.connected) process.send({ tipo: 'lote:set', lote });
}

export function obtenerLote(idLote) {
    if (!enCluster) return Promise.resolve(locales.get(idLote) ?? null);
    if (!process.connected) return Promise.resolve(null);
    return new Promise((resolve) => {
        const id = randomUUID();
        const timer = setTimeout(() => {
            pendientes.delete(id);
            resolve(null);
        }, TIMEOUT_MS);
        timer.unref();
        pendientes.set(id, { resolve, timer });
        process.send({ tipo: 'lote:get', id, lote: idLote });
    });
}