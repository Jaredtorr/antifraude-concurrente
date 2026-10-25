import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { config } from '../config.js';
import { log } from '../log.js';

const RUTA_WORKER = fileURLToPath(new URL('./worker.js', import.meta.url));

const falla = (mensaje, codigo = 503) => Object.assign(new Error(mensaje), { codigo });

export class Pool {
    constructor({ sab, modo = 'atomico', tamano = config.pool, colaMax = config.cola, timeoutMs = config.timeoutMs }) {
        this.sab = sab;
        this.modo = modo;
        this.tamano = tamano;
        this.colaMax = colaMax;
        this.timeoutMs = timeoutMs;
        this.workers = [];
        this.cola = [];
        this.cerrado = false;
        this.reemplazos = 0;
        for (let i = 0; i < tamano; i++) this.#crear();
    }

    #crear() {
        const worker = new Worker(RUTA_WORKER, { workerData: { sab: this.sab, modo: this.modo } });
        const w = { worker, vivo: true, listo: false, tarea: null, timer: null };
        worker.on('message', (m) => this.#alMensaje(w, m));
        worker.on('error', (e) => this.#alFallar(w, e));
        worker.on('exit', (codigo) => {
            if (!this.cerrado) this.#alFallar(w, new Error(`worker salió con código ${codigo}`));
        });
        this.workers.push(w);
    }

    #alMensaje(w, m) {
        if (m.tipo === 'listo-para-trabajar') {
            w.listo = true;
            return this.#despachar();
        }
        const tarea = w.tarea;
        if (!tarea) return;
        clearTimeout(w.timer);
        w.tarea = null;
        if (m.tipo === 'listo') {
            tarea.resolve({
                resultado: m.resultado,
                colaMs: tarea.colaMs,
                ejecucionMs: performance.now() - tarea.inicio,
            });
        } else {
            tarea.reject(falla(m.mensaje, 500));
        }
        this.#despachar();
    }

    #alFallar(w, error) {
        if (!w.vivo) return;
        w.vivo = false;
        clearTimeout(w.timer);
        const tarea = w.tarea;
        w.tarea = null;
        w.worker.terminate();
        this.workers = this.workers.filter((x) => x !== w);
        log('error', 'worker caído', { motivo: error.message });
        if (tarea) tarea.reject(error.codigo ? error : falla(error.message, 500));
        if (!this.cerrado) {
            this.reemplazos++;
            this.#crear();
        }
    }

    #despachar() {
        while (this.cola.length > 0) {
            const w = this.workers.find((x) => x.vivo && x.listo && !x.tarea);
            if (!w) return;
            const tarea = this.cola.shift();
            tarea.inicio = performance.now();
            tarea.colaMs = tarea.inicio - tarea.encolada;
            w.tarea = tarea;
            w.timer = setTimeout(() => this.#alFallar(w, falla('timeout de tarea')), this.timeoutMs);
            w.worker.postMessage(tarea.datos);
        }
    }

    ejecutar(datos) {
        if (this.cerrado) return Promise.reject(falla('pool cerrado'));
        if (this.cola.length >= this.colaMax) return Promise.reject(falla('cola llena'));
        return new Promise((resolve, reject) => {
            this.cola.push({ datos, resolve, reject, encolada: performance.now() });
            this.#despachar();
        });
    }

    estado() {
        const vivos = this.workers.filter((w) => w.vivo);
        const ocupados = vivos.filter((w) => w.tarea).length;
        return {
            libres: vivos.length - ocupados,
            ocupados,
            cola: this.cola.length,
            tamano: this.tamano,
            reemplazos: this.reemplazos,
        };
    }

    async cerrar() {
        this.cerrado = true;
        for (const t of this.cola.splice(0)) t.reject(falla('pool cerrado'));
        for (const w of this.workers) clearTimeout(w.timer);
        await Promise.all(this.workers.map((w) => w.worker.terminate()));
        this.workers = [];
    }
}