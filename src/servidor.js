import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { config } from './config.js';
import { log } from './log.js';
import { registrar, resumenRecursos, retrasoEventLoop, serverTiming } from './metricas.js';

const LIMITE_CUERPO = 10 * 1024 * 1024;

export function leerCuerpo(req, limite = LIMITE_CUERPO) {
    return new Promise((resolve, reject) => {
        const partes = [];
        let total = 0;
        let excedido = false;
        req.on('data', (c) => {
            total += c.length;
            if (total > limite) excedido = true;
            else partes.push(c);
        });
        req.on('end', () => {
            if (excedido) reject(Object.assign(new Error('cuerpo demasiado grande'), { codigo: 400 }));
            else resolve(Buffer.concat(partes));
        });
        req.on('error', reject);
    });
}

export function responder(res, codigo, cuerpo, { colaMs = 0, ejecucionMs = 0, tipo = 'application/json', headers = {} } = {}) {
    if (res.headersSent || res.writableEnded) return;
    const totalMs = performance.now() - res.inicio;
    res.estado = { colaMs, ejecucionMs, totalMs, codigo };
    const texto = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
    res.writeHead(codigo, {
        'Content-Type': tipo,
        'Server-Timing': serverTiming({ colaMs, ejecucionMs, totalMs }),
        'X-PID': String(process.pid),
        ...headers,
    });
    res.end(texto);
}

const MB = (n) => Math.round((n / 1024 / 1024) * 10) / 10;

function manejarHealth(res, salud) {
    const s = salud();
    const lazo = retrasoEventLoop();
    const listo = s.listo && lazo.p99 < 50;
    const mem = process.memoryUsage();
    responder(res, listo ? 200 : 503, {
        estado: listo ? 'ok' : 'degraded',
        pid: process.pid,
        uptime_s: Math.round(process.uptime()),
        workers: { libres: s.workersLibres, ocupados: s.workersOcupados },
        cola: s.cola,
        externos_activos: s.externosActivos,
        event_loop_ms: lazo,
        memoria_mb: { rss: MB(mem.rss), heap: MB(mem.heapUsed) },
        recursos: resumenRecursos(),
    });
}

export function crearServidor({ rutas = [], salud = () => ({ listo: true, workersLibres: 0, workersOcupados: 0, cola: 0, externosActivos: 0 }) } = {}) {
    const todas = [
        { metodo: 'GET', patron: /^\/health$/, nombre: 'health', manejador: ({ res }) => manejarHealth(res, salud) },
        ...rutas,
    ];

    const servidor = http.createServer(async (req, res) => {
        res.inicio = performance.now();
        const url = new URL(req.url, 'http://localhost');
        const candidatas = todas.filter((r) => r.patron.test(url.pathname));
        const ruta = candidatas.find((r) => r.metodo === req.method);
        let nombre = 'desconocido';

        res.on('close', () => {
            if (res.estado) registrar(nombre, res.estado);
        });

        if (candidatas.length === 0) {
            return responder(res, 404, { error: 'ruta no encontrada' });
        }
        if (!ruta) {
            const permitidos = candidatas.map((r) => r.metodo).join(', ');
            return responder(res, 405, { error: 'método no permitido' }, { headers: { Allow: permitidos } });
        }
        nombre = ruta.nombre;
        const params = url.pathname.match(ruta.patron).slice(1);
        try {
            await ruta.manejador({ req, res, url, params });
        } catch (e) {
            log('error', 'fallo en manejador', { ruta: nombre, error: e.message });
            responder(res, e.codigo === 400 ? 400 : 500, { error: e.codigo === 400 ? e.message : 'error interno' });
        }
    });

    servidor.requestTimeout = config.timeoutMs + 5000;
    return servidor;
}

export function cerrar(servidor, esperaMs = 10000) {
    return new Promise((resolve) => {
        const forzar = setTimeout(() => servidor.closeAllConnections(), esperaMs);
        forzar.unref();
        servidor.close(() => {
            clearTimeout(forzar);
            resolve();
        });
        servidor.closeIdleConnections();
    });
}