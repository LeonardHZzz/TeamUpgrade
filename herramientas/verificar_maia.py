"""Comprueba en Python que el modelo Maia-3 da lo mismo que la página (mismas probabilidades).

    pip install onnxruntime python-chess numpy
    python herramientas/verificar_maia.py

Salida esperada (posición inicial, Elo 2200): ver README (deben coincidir con la página)
"""
import json
from pathlib import Path

import chess
import numpy as np
import onnxruntime as ort

RAIZ = Path(__file__).resolve().parent.parent
MOVS = json.loads((RAIZ / "modelos" / "movimientos_maia3.json").read_text())
INDICE = {u: i for i, u in enumerate(MOVS)}
_op = ort.SessionOptions()
_op.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC  # igual que en el navegador
_modelo = b"".join((RAIZ / "modelos" / f"maia3_parte{k}.bin").read_bytes() for k in (1, 2))
SESION = ort.InferenceSession(_modelo, _op)
PIEZAS = "PNBRQKpnbrqk"


def espejar(u):
    e = lambda c: c[0] + str(9 - int(c[1]))
    return e(u[:2]) + e(u[2:4]) + u[4:]


def predecir(fen, elo_propio, elo_rival=None):
    b = chess.Board(fen)
    negras = b.turn == chess.BLACK
    vista = b.mirror() if negras else b
    tokens = np.zeros((1, 64, 12), np.float32)
    for sq, pz in vista.piece_map().items():
        tokens[0, sq, PIEZAS.index(pz.symbol())] = 1
    legales = [(m.uci(), INDICE[m.uci()]) for m in vista.legal_moves if m.uci() in INDICE]
    mov, val = SESION.run(["logits_move", "logits_value"], {
        "tokens": tokens,
        "elo_self": np.array([elo_propio], np.float32),
        "elo_oppo": np.array([elo_rival or elo_propio], np.float32),
    })
    lg = np.array([mov[0][i] for _, i in legales])
    p = np.exp(lg - lg.max())
    p /= p.sum()
    jugadas = sorted(((espejar(u) if negras else u, float(x)) for (u, _), x in zip(legales, p)), key=lambda t: -t[1])
    return jugadas


if __name__ == "__main__":
    for fen in (chess.STARTING_FEN, "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1"):
        for elo in (2100, 2200):
            print(elo, [(u, round(p, 4)) for u, p in predecir(fen, elo)[:3]])
