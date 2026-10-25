import { crearContador, leer } from '../src/contador.js';
import { Pool } from '../src/workers/pool.js';
import { totalTarjetas } from '../src/servicios/reglas.js';

const total = totalTarjetas(30_000_000);
const partes = 4;
const paso = Math.ceil(total / partes);

for (const modo of ['atomico', 'carrera']) {
    const { sab, vista } = crearContador();
    const pool = new Pool({ sab, modo, tamano: partes });
    const tareas = Array.from({ length: partes }, (_, i) =>
        pool.ejecutar({ idTarea: i, desde: i * paso, hasta: Math.min(total, (i + 1) * paso), semilla: 42 }),
    );
    await Promise.all(tareas);
    const contado = leer(vista);
    console.log(`${modo}: esperado ${total}, contado ${contado}, perdidas ${total - contado}`);
    await pool.cerrar();
}