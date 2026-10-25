import { randomUUID } from 'node:crypto';
import { leerCuerpo, responder } from '../servidor.js';

const TIMEOUT_IPC_MS = 2000;
const pendientes = new Map();

process.on('message', (m) => {
    if (m?.tipo !== 'autorizar:respuesta') return;
    const p = pendientes.get(m.id);
    if (!p) return;
    clearTimeout(p.timer);
    pendientes.delete(m.id);
    p.resolve(m);
});

function preguntarAlPrimario(tarjeta) {
    return new Promise((resolve, reject) => {
        const id = randomUUID();
        const timer = setTimeout(() => {
            pendientes.delete(id);
            reject(Object.assign(new Error('el primario no respondió'), { codigo: 503 }));
        }, TIMEOUT_IPC_MS);
        pendientes.set(id, { resolve, timer });
        process.send({ tipo: 'autorizar', id, tarjeta });
    });
}

export const rutaTarjetas = {
    metodo: 'POST',
    patron: /^\/tarjetas\/([A-Za-z0-9_-]{1,64})\/autorizar$/,
    nombre: 'tarjetas',
    manejador: async ({ req, res, params }) => {
        let datos;
        try {
            datos = JSON.parse((await leerCuerpo(req)).toString());
        } catch (e) {
            if (e.codigo) throw e;
            return responder(res, 400, { error: 'JSON inválido' });
        }
        if (typeof datos?.monto !== 'number' || !(datos.monto > 0)) {
            return responder(res, 400, { error: 'monto debe ser un número positivo' });
        }
        try {
            const r = await preguntarAlPrimario(params[0]);
            responder(res, r.autorizada ? 200 : 429, {
                autorizada: r.autorizada,
                tarjeta: params[0],
                intentos: r.intentos,
                pid: process.pid,
            });
        } catch (e) {
            responder(res, 503, { error: e.message });
        }
    },
};