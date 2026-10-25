// Contador sobre memoria compartida (SharedArrayBuffer)
export function crearContador() {
    const sab = new SharedArrayBuffer(4);
    return { sab, vista: new Int32Array(sab) };
}

// Versión correcta: Atomics.add es una operación indivisible
export function sumarAtomico(vista, n) {
    for (let i = 0; i < n; i++) Atomics.add(vista, 0, 1);
}

// Versión con condición de carrera: leer, sumar y escribir son tres pasos separados
export function sumarConCarrera(vista, n) {
    for (let i = 0; i < n; i++) vista[0] = vista[0] + 1;
}

export const leer = (vista) => Atomics.load(vista, 0);