import { readFile } from 'node:fs/promises';
import { responder } from '../servidor.js';

const ARCHIVO = new URL('../../public/index.html', import.meta.url);

export const rutaEstatico = {
    metodo: 'GET',
    patron: /^\/$/,
    nombre: 'estatico',
    manejador: async ({ res }) => {
        const html = await readFile(ARCHIVO, 'utf8');
        responder(res, 200, html, { tipo: 'text/html; charset=utf-8' });
    },
};