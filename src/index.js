import cluster from 'node:cluster';
import { config } from './config.js';
import { log } from './log.js';

if (cluster.isPrimary) {
    const { iniciarPrimario } = await import('./cluster/primario.js');
    log('info', 'primario iniciado', { procesos: config.procesos, pool: config.pool, externos: config.externos, puerto: config.puerto });
    iniciarPrimario();
} else {
    const { crearServidor, cerrar } = await import('./servidor.js');
    const { crearContador } = await import('./contador.js');
    const { Pool } = await import('./workers/pool.js');
    const { crearRutasLotes } = await import('./recursos/lotes.js');
    const { rutaAnalisis, estadoExternos, matarTodos } = await import('./recursos/analisis.js');
    const { rutaTarjetas } = await import('./recursos/tarjetas.js');

    const { sab } = crearContador();
    const pool = new Pool({ sab, modo: process.env.CONTADOR === 'carrera' ? 'carrera' : 'atomico' });

    const servidor = crearServidor({
        rutas: [rutaAnalisis, rutaTarjetas, ...crearRutasLotes(pool)],
        salud: () => {
            const e = pool.estado();
            return {
                listo: e.libres + e.ocupados > 0,
                workersLibres: e.libres,
                workersOcupados: e.ocupados,
                cola: e.cola,
                externosActivos: estadoExternos(),
            };
        },
    });

    servidor.listen(config.puerto, () => log('info', 'worker escuchando', { puerto: config.puerto }));

    let apagando = false;
    async function apagar(senal) {
        if (apagando) return;
        apagando = true;
        log('info', 'apagando worker', { senal });
        matarTodos();
        await cerrar(servidor, 5000);
        await pool.cerrar();
        process.exit(0);
    }
    process.on('SIGTERM', () => apagar('SIGTERM'));
    process.on('SIGINT', () => apagar('SIGINT'));
    process.on('disconnect', () => apagar('disconnect'));
}