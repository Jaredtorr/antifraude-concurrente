export function log(nivel, mensaje, extra = {}) {
    const linea = {
        t: new Date().toISOString(),
        pid: process.pid,
        nivel,
        mensaje,
        ...extra,
    };
    const salida = nivel === 'error' ? process.stderr : process.stdout;
    salida.write(JSON.stringify(linea) + '\n');
}