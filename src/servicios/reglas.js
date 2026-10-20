const TX_POR_TARJETA = 40;
const DIAS = 90;
const SEG_DIA = 86400;

// Generador pseudoaleatorio con semilla (mulberry32)
function crearRng(semilla) {
    let a = semilla >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export function totalTarjetas(tamano) {
    return Math.max(1, Math.floor(tamano / TX_POR_TARJETA));
}

function generarTarjeta(indice, semilla) {
    const rng = crearRng((semilla ^ Math.imul(indice + 1, 2654435761)) >>> 0);
    const perfil = 0.7 + rng() * 0.8;
    const txs = [];
    for (let i = 0; i < TX_POR_TARJETA; i++) {
        txs.push({
            t: Math.floor(rng() * DIAS * SEG_DIA),
            monto: perfil * (50 + 1500 * rng() * rng()),
        });
    }
    if (rng() < 0.05) { // ráfaga fraudulenta
        let t = Math.floor(rng() * DIAS * SEG_DIA);
        for (let i = 0; i < 5; i++) {
            t += 30 + Math.floor(rng() * 150);
            txs.push({ t, monto: 3000 + rng() * 5000 });
        }
    }
    txs.sort((a, b) => a.t - b.t);
    return txs;
}

export function analizarTarjetas(desde, hasta, semilla) {
    const r = { analizadas: 0, sospechosas: 0, atipico: 0, rafaga: 0, madrugada: 0 };
    for (let i = desde; i < hasta; i++) {
        const txs = generarTarjeta(i, semilla);
        const n = txs.length;

        let suma = 0;
        for (const x of txs) suma += x.monto;
        const media = suma / n;
        let varianza = 0;
        for (const x of txs) varianza += (x.monto - media) ** 2;
        const desv = Math.sqrt(varianza / n) || 1;

        let inicio = 0;
        for (let j = 0; j < n; j++) {
            const x = txs[j];
            while (x.t - txs[inicio].t > 600) inicio++;
            const enRafaga = j - inicio + 1 >= 4;
            const atipico = (x.monto - media) / desv > 3;
            const hora = Math.floor((x.t % SEG_DIA) / 3600);
            const madrugada = hora < 5 && x.monto > media * 2;

            if (atipico) r.atipico++;
            if (enRafaga) r.rafaga++;
            if (madrugada) r.madrugada++;
            if (atipico || enRafaga || madrugada) r.sospechosas++;
            r.analizadas++;
        }
    }
    return r;
}

export function analizarLote(tamano, semilla) {
    return analizarTarjetas(0, totalTarjetas(tamano), semilla);
}