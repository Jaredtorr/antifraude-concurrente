import cluster from 'node:cluster';
import { config } from '../config.js';
import { log } from '../log.js';

const VENTANA_MS = 60_000;
const MAX_INTENTOS = 5;
const MAX_REINICIOS = 5; // reinicios permitidos por ventana
const ESPERA_CIERRE_MS = 10_000;

export function iniciarPrimario() {
    const tarjetas = new Map(); // id -> { n, inicio }
    const reinicios = [];
    const lotesPub = new Map(); // copia de los lotes, visible desde cualquier proceso
    let cerrando = false;

    // Limpia tarjetas con ventana vencida: la memoria no crece sin límite
    setInterval(() => {
        const ahora = Date.now();
        for (const [id, t] of tarjetas) if (ahora - t.inicio > VENTANA_MS) tarjetas.delete(id);
    }, 10_000).unref();

    function intentar(id) {
        const ahora = Date.now();
        let t = tarjetas.get(id);
        if (!t || ahora - t.inicio > VENTANA_MS) {
            t = { n: 0, inicio: ahora };
            tarjetas.set(id, t);
        }
        t.n++;
        return { autorizada: t.n <= MAX_INTENTOS, intentos: t.n };
    }

    function lanzar() {
        const w = cluster.fork();
        w.on('message', (m) => {
            if (m?.tipo === 'autorizar') {
                w.send({ tipo: 'autorizar:respuesta', id: m.id, ...intentar(m.tarjeta) });
            } else if (m?.tipo === 'lote:set') {
                lotesPub.delete(m.lote.id);
                lotesPub.set(m.lote.id, m.lote);
                if (lotesPub.size > 500) lotesPub.delete(lotesPub.keys().next().value);
            } else if (m?.tipo === 'lote:get') {
                w.send({ tipo: 'lote:respuesta', id: m.id, lote: lotesPub.get(m.lote) ?? null });
            }
        });
        log('info', 'worker lanzado', { worker: w.process.pid });
        return w;
    }

    for (let i = 0; i < config.procesos; i++) lanzar();

    // Reinicio automático con protección contra ciclos
    cluster.on('exit', (w, codigo, senal) => {
        if (cerrando) return;
        log('error', 'worker caído', { worker: w.process.pid, codigo, senal });
        const ahora = Date.now();
        while (reinicios.length && ahora - reinicios[0] > VENTANA_MS) reinicios.shift();
        if (reinicios.length >= MAX_REINICIOS) {
            log('error', 'demasiados reinicios, no se reinicia más', { reinicios: reinicios.length });
            if (Object.keys(cluster.workers).length === 0) process.exit(1);
            return;
        }
        reinicios.push(ahora);
        lanzar();
    });

    // Cierre ordenado
    function cerrar(senal) {
        if (cerrando) return;
        cerrando = true;
        log('info', 'cierre ordenado', { senal });
        for (const w of Object.values(cluster.workers)) w.kill('SIGTERM');
        const forzar = setTimeout(() => {
            for (const w of Object.values(cluster.workers)) w.process.kill('SIGKILL');
            process.exit(1);
        }, ESPERA_CIERRE_MS);
        forzar.unref();
        const vigilar = setInterval(() => {
            if (Object.keys(cluster.workers).length === 0) process.exit(0);
        }, 100);
        vigilar.unref();
    }
    process.on('SIGTERM', () => cerrar('SIGTERM'));
    process.on('SIGINT', () => cerrar('SIGINT'));
}