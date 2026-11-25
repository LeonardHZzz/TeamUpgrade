// Maia-3: predice qué jugaría una persona de cierto Elo (modelo de CSSLab, Universidad de Toronto).
// Entrada: 64 casillas × 12 tipos de pieza, siempre vista desde las blancas (si juegan negras, se espeja).
import { Chess } from "../vendor/chess.js";

const PIEZAS = "PNBRQKpnbrqk";
const espejarCasilla = (c) => c[0] + (9 - Number(c[1]));
const espejarJugada = (u) => espejarCasilla(u.slice(0, 2)) + espejarCasilla(u.slice(2, 4)) + u.slice(4);

export class Maia {
  constructor({ modelo = ["modelos/maia3_parte1.bin", "modelos/maia3_parte2.bin"], movimientos = "modelos/movimientos_maia3.json", alProgreso = () => {} } = {}) {
    this.urlsModelo = modelo.map((u) => new URL(u, document.baseURI).href);
    this.urlMovs = new URL(movimientos, document.baseURI).href;
    this.alProgreso = alProgreso;
    this.pend = new Map();
    this.sig = 0;
    this.listo = this._iniciar();
  }

  async _iniciar() {
    this.movs = await (await fetch(this.urlMovs)).json(); // índice → jugada UCI
    this.indice = new Map(this.movs.map((u, i) => [u, i]));
    this.worker = new Worker(new URL("./maia-worker.js", import.meta.url));
    await new Promise((resolve, reject) => {
      this.worker.onmessage = (e) => {
        const m = e.data;
        if (m.tipo === "progreso") this.alProgreso(m.pct);
        else if (m.tipo === "listo") resolve();
        else if (m.tipo === "error" && m.id === undefined) reject(new Error(m.mensaje));
        else if (m.tipo === "resultado" || m.tipo === "error") {
          const p = this.pend.get(m.id);
          this.pend.delete(m.id);
          if (!p) return;
          if (m.tipo === "error") p.reject(new Error(m.mensaje));
          else p.resolve(m);
        }
      };
      this.worker.postMessage({ tipo: "iniciar", urls: this.urlsModelo });
    });
  }

  // Tokens (64×12) y jugadas legales desde el punto de vista de quien mueve
  _entrada(fen) {
    const juego = new Chess(fen);
    const negras = juego.turn() === "b";
    const tokens = new Float32Array(64 * 12);
    const tablero = juego.board(); // fila 0 = 8.ª fila
    for (let f = 0; f < 8; f++) {
      for (let c = 0; c < 8; c++) {
        const p = tablero[f][c];
        if (!p) continue;
        let fila = 7 - f; // 0 = 1.ª fila
        let simbolo = p.color === "w" ? p.type.toUpperCase() : p.type;
        if (negras) {
          fila = 7 - fila;
          simbolo = simbolo === simbolo.toUpperCase() ? simbolo.toLowerCase() : simbolo.toUpperCase();
        }
        tokens[(fila * 8 + c) * 12 + PIEZAS.indexOf(simbolo)] = 1;
      }
    }
    const legales = [];
    for (const m of juego.moves({ verbose: true })) {
      const uci = m.from + m.to + (m.promotion || "");
      const idx = this.indice.get(negras ? espejarJugada(uci) : uci);
      if (idx !== undefined) legales.push([uci, idx]);
    }
    return { tokens, legales, negras };
  }

  // Devuelve [{uci, p}] ordenado de mayor a menor probabilidad y la probabilidad de ganar de quien mueve
  async predecir(fen, eloPropio, eloRival = eloPropio) {
    await this.listo;
    const { tokens, legales } = this._entrada(fen);
    if (!legales.length) return { jugadas: [], ganar: 0.5 };
    const id = this.sig++;
    const r = await new Promise((resolve, reject) => {
      this.pend.set(id, { resolve, reject });
      this.worker.postMessage(
        { tipo: "inferir", id, n: 1, tokens, eloPropio: Float32Array.of(eloPropio), eloRival: Float32Array.of(eloRival) },
        [tokens.buffer],
      );
    });
    const logits = legales.map(([, i]) => r.mov[i]);
    const max = Math.max(...logits);
    const ex = logits.map((l) => Math.exp(l - max));
    const suma = ex.reduce((a, b) => a + b, 0);
    const jugadas = legales.map(([uci], k) => ({ uci, p: ex[k] / suma })).sort((a, b) => b.p - a.p);
    const v = Array.from(r.val); // [pierde, tablas, gana] para quien mueve
    const mv = Math.max(...v);
    const ev = v.map((x) => Math.exp(x - mv));
    const sv = ev.reduce((a, b) => a + b, 0);
    return { jugadas, ganar: (ev[2] + 0.5 * ev[1]) / sv };
  }
}
