import { parentPort, workerData } from 'node:worker_threads';
import { analizarTarjetas } from '../servicios/reglas.js';
import { sumarAtomico, sumarConCarrera } from '../contador.js';

const vista = new Int32Array(workerData.sab);
const sumar = workerData.modo === 'carrera' ? sumarConCarrera : sumarAtomico;

parentPort.on('message', ({ idTarea, desde, hasta, semilla }) => {
    try {
        const resultado = analizarTarjetas(desde, hasta, semilla);
        sumar(vista, hasta - desde);
        parentPort.postMessage({ tipo: 'listo', idTarea, resultado });
    } catch (e) {
        parentPort.postMessage({ tipo: 'error', idTarea, mensaje: e.message });
    }
});

parentPort.postMessage({ tipo: 'listo-para-trabajar' });