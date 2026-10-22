import csv
import sys

def leer(ruta):
    with open(ruta, newline="") as f:
        filas = list(csv.DictReader(f))
    return filas

def percentil(valores, p):
    ordenados = sorted(valores)
    k = max(0, min(len(ordenados) - 1, round(p / 100 * len(ordenados)) - 1))
    return ordenados[k]

def resumir(ruta):
    filas = leer(ruta)
    tiempos = [int(f["elapsed"]) for f in filas]
    errores = sum(1 for f in filas if f["success"] != "true")
    inicio = min(int(f["timeStamp"]) for f in filas)
    fin = max(int(f["timeStamp"]) + int(f["elapsed"]) for f in filas)
    segundos = (fin - inicio) / 1000
    return {
        "n": len(filas),
        "p50": percentil(tiempos, 50),
        "p95": percentil(tiempos, 95),
        "p99": percentil(tiempos, 99),
        "rps": round(len(filas) / segundos, 1),
        "errores": f"{errores} ({100 * errores / len(filas):.1f}%)",
    }

if __name__ == "__main__":
    r = resumir(sys.argv[1])
    print(f"| {sys.argv[1]} | {r['n']} | {r['p50']} | {r['p95']} | {r['p99']} | {r['rps']} | {r['errores']} |")