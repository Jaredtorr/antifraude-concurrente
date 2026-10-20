import argparse
import json
import sys

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

COLUMNAS = ["id_transaccion", "id_tarjeta", "monto", "fecha_hora", "ciudad"]


def leer_parametros():
    p = argparse.ArgumentParser()
    p.add_argument("archivo", help="ruta del CSV, o - para leer de stdin")
    p.add_argument("--contaminacion", type=float, default=0.01)
    p.add_argument("--top", type=int, default=50)
    args = p.parse_args()
    if not 0 < args.contaminacion <= 0.5 or args.top < 1:
        print("parámetros fuera de rango", file=sys.stderr)
        sys.exit(2)
    return args


def cargar(archivo):
    df = pd.read_csv(sys.stdin if archivo == "-" else archivo)
    faltan = [c for c in COLUMNAS if c not in df.columns]
    if faltan:
        raise ValueError("faltan columnas: " + ", ".join(faltan))
    df["monto"] = pd.to_numeric(df["monto"], errors="raise")
    df["fecha_hora"] = pd.to_datetime(df["fecha_hora"])
    return df


def preparar(df):
    df = df.sort_values(["id_tarjeta", "fecha_hora"]).copy()
    por_tarjeta = df.groupby("id_tarjeta")
    seg = por_tarjeta["fecha_hora"].diff().dt.total_seconds()
    seg = seg.fillna(86400).clip(upper=86400)
    habitual = por_tarjeta["ciudad"].transform(lambda s: s.mode().iloc[0])
    df["log_monto"] = np.log1p(df["monto"])
    df["hora"] = df["fecha_hora"].dt.hour
    df["log_seg_previa"] = np.log1p(seg)
    df["ratio_monto"] = df["monto"] / por_tarjeta["monto"].transform("median")
    df["ciudad_inusual"] = (df["ciudad"] != habitual).astype(int)
    return df


CARACTERISTICAS = ["log_monto", "hora", "log_seg_previa", "ratio_monto", "ciudad_inusual"]


def main():
    args = leer_parametros()
    try:
        df = preparar(cargar(args.archivo))
    except ValueError as e:
        print("entrada inválida: " + str(e), file=sys.stderr)
        sys.exit(2)

    X = df[CARACTERISTICAS]
    modelo = IsolationForest(n_estimators=200, contamination=args.contaminacion,
                             random_state=42, n_jobs=1)
    modelo.fit(X)
    df["riesgo"] = -modelo.score_samples(X)
    sospechosas = df[modelo.predict(X) == -1].sort_values("riesgo", ascending=False)

    for f in sospechosas.head(args.top).itertuples():
        print(json.dumps({
            "id_transaccion": f.id_transaccion, "id_tarjeta": f.id_tarjeta,
            "monto": float(f.monto), "fecha_hora": str(f.fecha_hora),
            "riesgo": round(float(f.riesgo), 4),
        }, ensure_ascii=False))

    resumen = {"analizadas": int(len(df)), "sospechosas": int(len(sospechosas))}
    if "es_fraude" in df.columns:
        resumen["fraudes_reales_detectados"] = int(sospechosas["es_fraude"].sum())
        resumen["fraudes_reales_totales"] = int(df["es_fraude"].sum())
    print(json.dumps({"resumen": resumen}))


if __name__ == "__main__":
    main()