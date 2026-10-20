import http from "node:http";
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analizarLote } from "../src/servicios/reglas.js";

const PUERTO = 3000;
const PYTHON = ".venv/bin/python";
const LIMITE = Number(process.env.LIMITE_TARJETA ?? 5);
const VENTANA_MS = Number(process.env.VENTANA_MS ?? 60000);
const intentos = new Map(); // id de tarjeta -> marcas de tiempo

function leerCuerpo(req) {
    return new Promise((resolve) => {
        const trozos = [];
        req.on("data", (t) => trozos.push(t));
        req.on("end", () => resolve(Buffer.concat(trozos)));
    });
}

function responder(res, codigo, objeto) {
    res.writeHead(codigo, { "Content-Type": "application/json" });
    res.end(JSON.stringify(objeto));
}

const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
        return responder(res, 200, { status: "ok", pid: process.pid, uptime: process.uptime() });
    }

    if (req.method === "POST" && url.pathname === "/analisis") {
        try {
            const cuerpo = await leerCuerpo(req);
            const archivo = join(tmpdir(), `analisis-${Date.now()}.csv`);
            writeFileSync(archivo, cuerpo);
            const top = url.searchParams.get("top") ?? "50";
            const contaminacion = url.searchParams.get("contaminacion") ?? "0.01";
            const salida = execSync(
                `${PYTHON} python/detectar.py ${archivo} --top ${top} --contaminacion ${contaminacion}`,
                { encoding: "utf8" }
            );
            res.writeHead(200, { "Content-Type": "application/x-ndjson" });
            return res.end(salida);
        } catch (e) {
            return responder(res, 500, { error: "falló el análisis" });
        }
    }

    if (req.method === "POST" && url.pathname === "/lotes") {
        try {
            const { tamano, semilla = 42 } = JSON.parse((await leerCuerpo(req)).toString());
            const t0 = performance.now();
            const resultado = analizarLote(tamano, semilla);
            return responder(res, 200, {
                pid: process.pid,
                ms: Math.round(performance.now() - t0),
                resultado,
            });
        } catch (e) {
            return responder(res, 500, { error: "falló el lote" });
        }
    }

    const ruta = url.pathname.match(/^\/tarjetas\/([A-Za-z0-9-]+)\/autorizar$/);
    if (ruta) {
        if (req.method !== "POST") return responder(res, 405, { error: "método no permitido" });
        try {
            const { monto } = JSON.parse((await leerCuerpo(req)).toString());
            if (typeof monto !== "number" || monto <= 0) {
                return responder(res, 400, { error: "monto inválido" });
            }
            const id = ruta[1];
            const ahora = Date.now();
            const recientes = (intentos.get(id) ?? []).filter((t) => ahora - t < VENTANA_MS);
            if (recientes.length >= LIMITE) {
                intentos.set(id, recientes);
                return responder(res, 429, { error: "límite de intentos excedido", pid: process.pid });
            }
            recientes.push(ahora);
            intentos.set(id, recientes);
            return responder(res, 200, { autorizada: true, tarjeta: id, intentos: recientes.length, pid: process.pid });
        } catch (e) {
            return responder(res, 400, { error: "cuerpo inválido" });
        }
    }

    responder(res, 404, { error: "no encontrado" });
});

servidor.listen(PUERTO, () => console.log(`[naive] pid ${process.pid} en :${PUERTO}`));