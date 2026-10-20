import argparse
import csv
import random
from datetime import datetime, timedelta

# categoria -> (comercios, rango de monto normal en pesos)
CATALOGO = {
    "supermercado": (["Super Chiapas", "Abarrotes Don Beto", "Mercado Central"], (80, 1500)),
    "gasolina":     (["Gasolinera Norte", "Gas Express"], (200, 1200)),
    "restaurante":  (["Tacos El Güero", "Cocina Chiapaneca", "Café Marimba"], (60, 800)),
    "tecnologia":   (["TecnoMex", "ElectroPlaza"], (300, 8000)),
    "farmacia":     (["Farmacia Vida", "Farmacia del Sur"], (40, 900)),
    "ropa":         (["Moda Urbana", "Boutique Soconusco"], (150, 2500)),
}

CIUDADES = ["Tuxtla Gutiérrez", "Tapachula", "San Cristóbal", "Tonalá", "Comitán"]

PROPORCION_FRAUDE = 0.01  # 1% de las filas

INICIO = datetime(2026, 1, 1)
DIAS = 90
CAMPOS = ["id_transaccion", "id_tarjeta", "monto", "fecha_hora",
          "comercio", "categoria", "ciudad", "es_fraude"]

# Peso de cada hora del día (0 a 23): de madrugada casi no hay compras
HORAS = list(range(24))
PESOS_HORA = [1, 1, 1, 1, 1, 2,   4, 6, 8, 8, 8, 9,
              10, 10, 9, 8, 8, 9,  10, 10, 8, 6, 4, 2]


def crear_tarjetas(rng, cantidad):
    tarjetas = []
    for n in range(1, cantidad + 1):
        tarjetas.append({
            "id": f"TAR-{n:05d}",
            "ciudad": rng.choice(CIUDADES),
            "perfil": rng.uniform(0.7, 1.5),
            "favoritas": rng.sample(list(CATALOGO), 3),
        })
    return tarjetas


def transaccion_normal(rng, numero, tarjeta):
    categoria = rng.choice(tarjeta["favoritas"])
    comercios, (minimo, maximo) = CATALOGO[categoria]
    base = rng.triangular(minimo, maximo, minimo + (maximo - minimo) * 0.25)
    hora = rng.choices(HORAS, weights=PESOS_HORA)[0]
    fecha = INICIO + timedelta(days=rng.randrange(DIAS), hours=hora,
                               minutes=rng.randrange(60), seconds=rng.randrange(60))
    return {
        "id_transaccion": f"T{numero:08d}",
        "id_tarjeta": tarjeta["id"],
        "monto": round(base * tarjeta["perfil"], 2),
        "fecha_hora": fecha.strftime("%Y-%m-%d %H:%M:%S"),
        "comercio": rng.choice(comercios),
        "categoria": categoria,
        "ciudad": tarjeta["ciudad"],
        "es_fraude": 0,
    }



def fecha_aleatoria(rng, hora=None):
    if hora is None:
        hora = rng.choices(HORAS, weights=PESOS_HORA)[0]
    return INICIO + timedelta(days=rng.randrange(DIAS), hours=hora,
                              minutes=rng.randrange(60), seconds=rng.randrange(60))


def armar_fraude(numero, tarjeta, monto, fecha, categoria, comercio, ciudad):
    return {
        "id_transaccion": f"T{numero:08d}",
        "id_tarjeta": tarjeta["id"],
        "monto": monto,
        "fecha_hora": fecha.strftime("%Y-%m-%d %H:%M:%S"),
        "comercio": comercio,
        "categoria": categoria,
        "ciudad": ciudad,
        "es_fraude": 1,
    }


def ciudad_distinta(rng, tarjeta):
    return rng.choice([c for c in CIUDADES if c != tarjeta["ciudad"]])


def fraude_monto_alto(rng, numero, tarjeta):
    categoria = rng.choice(list(CATALOGO))
    comercios, (_, maximo) = CATALOGO[categoria]
    monto = round(maximo * rng.uniform(4, 10), 2)
    return [armar_fraude(numero, tarjeta, monto, fecha_aleatoria(rng),
                         categoria, rng.choice(comercios), tarjeta["ciudad"])]


def fraude_madrugada(rng, numero, tarjeta):
    categoria = rng.choice(["tecnologia", "ropa"])
    comercios, (_, maximo) = CATALOGO[categoria]
    monto = round(maximo * rng.uniform(1.5, 4), 2)
    fecha = fecha_aleatoria(rng, hora=rng.randrange(0, 5))
    return [armar_fraude(numero, tarjeta, monto, fecha, categoria,
                         rng.choice(comercios), ciudad_distinta(rng, tarjeta))]


def fraude_rafaga(rng, numero, tarjeta):
    comercios, (_, maximo) = CATALOGO["tecnologia"]
    ciudad = ciudad_distinta(rng, tarjeta)
    fecha = fecha_aleatoria(rng)
    filas = []
    for i in range(rng.randint(4, 6)):
        fecha += timedelta(seconds=rng.randint(30, 180))
        monto = round(maximo * rng.uniform(0.3, 0.9), 2)
        filas.append(armar_fraude(numero + i, tarjeta, monto, fecha,
                                  "tecnologia", rng.choice(comercios), ciudad))
    return filas


TIPOS_FRAUDE = [fraude_monto_alto, fraude_madrugada, fraude_rafaga]


def generar_fraudes(rng, tarjetas, cantidad, primer_numero):
    filas = []
    while len(filas) < cantidad:
        tipo = rng.choice(TIPOS_FRAUDE)
        filas += tipo(rng, primer_numero + len(filas), rng.choice(tarjetas))
    return filas[:cantidad]

def leer_parametros():
    p = argparse.ArgumentParser(description="Genera transacciones sintéticas")
    p.add_argument("--filas", type=int, default=100000)
    p.add_argument("--semilla", type=int, default=42)
    p.add_argument("--salida", default="datos.csv")
    return p.parse_args()

def main():
    args = leer_parametros()
    rng = random.Random(args.semilla)

    n_fraudes = int(args.filas * PROPORCION_FRAUDE)
    n_normales = args.filas - n_fraudes
    tarjetas = crear_tarjetas(rng, max(50, args.filas // 40))

    filas = [transaccion_normal(rng, i, rng.choice(tarjetas))
             for i in range(1, n_normales + 1)]
    filas += generar_fraudes(rng, tarjetas, n_fraudes, n_normales + 1)
    filas.sort(key=lambda f: f["fecha_hora"])

    with open(args.salida, "w", newline="", encoding="utf-8") as f:
        escritor = csv.DictWriter(f, fieldnames=CAMPOS)
        escritor.writeheader()
        escritor.writerows(filas)

    print(f"{len(filas)} filas ({n_fraudes} fraudes) escritas en {args.salida}")
if __name__ == "__main__":
    main()