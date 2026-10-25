import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { log } from '../log.js';
import { leerCuerpo, responder } from '../servidor.js';

const SCRIPT = fileURLToPath(new URL('../../python/detectar.py', import.meta.url));
const MAX_SALIDA = 1024 * 1024; // 1 MB de salida del hijo
const hijos = new Set();
let ocupados = 0;

export const estadoExternos = () => ocupados;

export function matarTodos() {
    for (const h of hijos) h.kill('SIGKILL');
    hijos.clear();
}

// Lista blanca: solo números con formato exacto
function validar(url) {
    const top = url.searchParams.get('top') ?? '50';
    const cont = url.searchParams.get('contaminacion') ?? '0.01';
    if (!/^\d{1,4}$/.test(top) || Number(top) < 1 || Number(top) > 1000) return null;
    if (!/^0(\.\d{1,4})?$/.test(cont) || Number(cont) <= 0 || Number(cont) > 0.5) return null;
    return { top, cont };
}

function ejecutar(res, cuerpo, { top, cont }) {
    return new Promise((resolve) => {
        const t0 = performance.now();
        const hijo = spawn(
            config.python,
            [SCRIPT, '-', '--top', top, '--contaminacion', cont],
            { shell: false, stdio: ['pipe', 'pipe', 'pipe'] },
        );
        hijos.add(hijo);

        const partes = [];
        let tam = 0;
        let stderr = '';
        let terminado = false;

        const fin = (codigo, salida, tipo = 'application/json') => {
            if (terminado) return;
            terminado = true;
            clearTimeout(timer);
            hijos.delete(hijo);
            const ejecucionMs = performance.now() - t0;
            responder(res, codigo, salida, { ejecucionMs, tipo });
            resolve();
        };

        const timer = setTimeout(() => {
            hijo.kill('SIGKILL');
            fin(503, { error: 'el análisis excedió el tiempo límite' });
        }, config.timeoutMs);

        // Si el cliente cierra la conexión antes de tiempo, se mata al hijo
        res.on('close', () => {
            if (!res.writableEnded && !terminado) {
                hijo.kill('SIGKILL');
                terminado = true;
                clearTimeout(timer);
                hijos.delete(hijo);
                log('info', 'cliente cerró, hijo terminado', { hijo: hijo.pid });
                resolve();
            }
        });

        hijo.stdout.on('data', (c) => {
            tam += c.length;
            if (tam > MAX_SALIDA) {
                hijo.kill('SIGKILL');
                return fin(500, { error: 'la salida del análisis excede el límite' });
            }
            partes.push(c);
        });
        hijo.stderr.on('data', (c) => {
            if (stderr.length < 2000) stderr += c.toString();
        });
        hijo.stdin.on('error', () => { }); // EPIPE si el hijo muere antes de leer
        hijo.on('error', (e) => {
            log('error', 'no se pudo lanzar el hijo', { error: e.message });
            fin(500, { error: 'no se pudo ejecutar el análisis' });
        });
        hijo.on('close', (codigoSalida, senal) => {
            if (codigoSalida === 0) return fin(200, Buffer.concat(partes).toString(), 'application/x-ndjson');
            log('error', 'hijo terminó con error', { codigoSalida, senal, stderr: stderr.slice(0, 300) });
            // Código 2 = entrada inválida (contrato de detectar.py)
            if (codigoSalida === 2) return fin(400, { error: 'CSV inválido' });
            fin(500, { error: 'falló el análisis' });
        });

        hijo.stdin.end(cuerpo);
    });
}

export const rutaAnalisis = {
    metodo: 'POST',
    patron: /^\/analisis$/,
    nombre: 'analisis',
    manejador: async ({ req, res, url }) => {
        const params = validar(url);
        if (!params) return responder(res, 400, { error: 'parámetros inválidos' });
        if (ocupados >= config.externos) {
            return responder(res, 429, { error: 'demasiados análisis simultáneos' }, { headers: { 'Retry-After': '1' } });
        }
        ocupados++;
        try {
            const cuerpo = await leerCuerpo(req);
            if (cuerpo.length === 0) return responder(res, 400, { error: 'cuerpo vacío' });
            await ejecutar(res, cuerpo, params);
        } finally {
            ocupados--;
        }
    },
};