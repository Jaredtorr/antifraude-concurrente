import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { totalTarjetas } from '../servicios/reglas.js';
import { leerCuerpo, responder } from '../servidor.js';
import { registrar } from '../metricas.js';
import { log } from '../log.js';

const MAX_LOTES = 500;
const lotes = new Map();
const redondear = (n) => Math.round(n * 10) / 10;

function repartir(total, partes) {
    const base = Math.floor(total / partes);
    const resto = total % partes;
    const tramos = [];
    let desde = 0;
    for (let i = 0; i < partes; i++) {
        const hasta = desde + base + (i < resto ? 1 : 0);
        tramos.push([desde, hasta]);
        desde = hasta;
    }
    return tramos;
}

function podar() {
    if (lotes.size <= MAX_LOTES) return;
    for (const [id, l] of lotes) {
        if (l.estado !== 'en_proceso') {
            lotes.delete(id);
            if (lotes.size <= MAX_LOTES) return;
        }
    }
}

function finalizar(lote, estado, codigo) {
    lote.estado = estado;
    lote.totalMs = performance.now() - lote.creado;
    registrar('lotes_calculo', {
        colaMs: lote.colaMs,
        ejecucionMs: lote.ejecucionMs,
        totalMs: lote.totalMs,
        codigo,
    });
    log(estado === 'error' ? 'error' : 'info', 'lote finalizado', {
        id: lote.id,
        estado,
        total_ms: Math.round(lote.totalMs),
    });
}

export function crearRutasLotes(pool) {
    const crear = {
        metodo: 'POST',
        patron: /^\/lotes$/,
        nombre: 'lotes',
        manejador: async ({ req, res }) => {
            let datos;
            try {
                datos = JSON.parse((await leerCuerpo(req)).toString());
            } catch (e) {
                if (e.codigo) throw e;
                return responder(res, 400, { error: 'JSON inválido' });
            }
            const tamano = datos?.tamano;
            const semilla = datos?.semilla ?? 42;
            const tamanoOk = Number.isInteger(tamano) && tamano >= 40 && tamano <= 100_000_000;
            const semillaOk = Number.isInteger(semilla) && semilla >= 0 && semilla <= 4294967295;
            if (!tamanoOk || !semillaOk) {
                return responder(res, 400, { error: 'tamano (40 a 100000000) o semilla (0 a 4294967295) inválidos' });
            }

            const total = totalTarjetas(tamano);
            const partes = Math.min(total, pool.tamano);
            if (pool.colaMax - pool.estado().cola < partes) {
                return responder(res, 503, { error: 'cola llena, reintente' }, { headers: { 'Retry-After': '2' } });
            }

            const id = randomUUID();
            const lote = {
                id, estado: 'en_proceso', tamano, semilla, tramos: partes, hechos: 0,
                resultado: { analizadas: 0, sospechosas: 0, atipico: 0, rafaga: 0, madrugada: 0 },
                colaMs: 0, ejecucionMs: 0, creado: performance.now(), totalMs: null, error: null,
            };
            lotes.set(id, lote);
            podar();

            for (const [desde, hasta] of repartir(total, partes)) {
                pool.ejecutar({ idTarea: `${id}:${desde}`, desde, hasta, semilla })
                    .then(({ resultado, colaMs, ejecucionMs }) => {
                        if (lote.estado !== 'en_proceso') return;
                        for (const k of Object.keys(lote.resultado)) lote.resultado[k] += resultado[k];
                        lote.colaMs = Math.max(lote.colaMs, colaMs);
                        lote.ejecucionMs = Math.max(lote.ejecucionMs, ejecucionMs);
                        if (++lote.hechos === lote.tramos) finalizar(lote, 'completado', 200);
                    })
                    .catch((e) => {
                        if (lote.estado !== 'en_proceso') return;
                        lote.error = e.message;
                        finalizar(lote, 'error', e.codigo ?? 500);
                    });
            }

            responder(res, 202, { id, estado: lote.estado, seguimiento: `/lotes/${id}` }, {
                headers: { Location: `/lotes/${id}` },
            });
        },
    };

    const consultar = {
        metodo: 'GET',
        patron: /^\/lotes\/([0-9a-f-]{36})$/,
        nombre: 'lotes_consulta',
        manejador: ({ res, params }) => {
            const l = lotes.get(params[0]);
            if (!l) return responder(res, 404, { error: 'lote no encontrado' });
            const cuerpo = {
                id: l.id, estado: l.estado, avance: `${l.hechos}/${l.tramos}`,
                tamano: l.tamano, semilla: l.semilla,
            };
            if (l.estado === 'completado') {
                Object.assign(cuerpo, {
                    resultado: l.resultado,
                    cola_ms: redondear(l.colaMs),
                    ejecucion_ms: redondear(l.ejecucionMs),
                    total_ms: redondear(l.totalMs),
                });
            }
            if (l.estado === 'error') cuerpo.error = l.error;
            responder(res, 200, cuerpo);
        },
    };

    return [crear, consultar];
}