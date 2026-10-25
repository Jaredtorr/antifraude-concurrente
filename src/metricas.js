import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const MAX_MUESTRAS = 5000;
const recursos = new Map();

const lazo = monitorEventLoopDelay({ resolution: 10 });
lazo.enable();
setInterval(() => lazo.reset(), 30000).unref();

export function iniciar() {
    const t0 = performance.now();
    return () => performance.now() - t0;
}

function ventana(arr, valor) {
    arr.push(valor);
    if (arr.length > MAX_MUESTRAS) arr.shift();
}

export function registrar(recurso, { colaMs = 0, ejecucionMs = 0, totalMs, codigo }) {
    let r = recursos.get(recurso);
    if (!r) {
        r = { n: 0, codigos: {}, cola: [], ejecucion: [], total: [] };
        recursos.set(recurso, r);
    }
    r.n++;
    r.codigos[codigo] = (r.codigos[codigo] ?? 0) + 1;
    ventana(r.cola, colaMs);
    ventana(r.ejecucion, ejecucionMs);
    ventana(r.total, totalMs);
}

function percentil(valores, p) {
    if (valores.length === 0) return 0;
    const o = [...valores].sort((a, b) => a - b);
    const k = Math.max(0, Math.min(o.length - 1, Math.ceil((p / 100) * o.length) - 1));
    return Math.round(o[k] * 100) / 100;
}

export function resumenRecursos() {
    const salida = {};
    for (const [nombre, r] of recursos) {
        salida[nombre] = {
            n: r.n,
            codigos: r.codigos,
            p50: percentil(r.total, 50),
            p95: percentil(r.total, 95),
            p99: percentil(r.total, 99),
            cola_p50: percentil(r.cola, 50),
            ejecucion_p50: percentil(r.ejecucion, 50),
        };
    }
    return salida;
}

export function retrasoEventLoop() {
    return {
        p50: Math.round((lazo.percentile(50) / 1e6) * 100) / 100,
        p99: Math.round((lazo.percentile(99) / 1e6) * 100) / 100,
    };
}

export function serverTiming({ colaMs = 0, ejecucionMs = 0, totalMs }) {
    return `cola;dur=${colaMs.toFixed(1)}, ejecucion;dur=${ejecucionMs.toFixed(1)}, total;dur=${totalMs.toFixed(1)}`;
}
