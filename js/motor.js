// Stockfish 17.1 (versión ligera, un hilo) para medir qué tan buena es cada jugada.
export class Motor {
  constructor(ruta = "vendor/stockfish/stockfish-17.1-lite-single-03e3232.js") {
    this.w = new Worker(new URL(ruta, document.baseURI).href);
    this.oyente = null;
    this.cola = Promise.resolve();
    this.w.onmessage = (e) => this.oyente && this.oyente(String(e.data));
    this.listo = this._esperar("uciok", "uci").then(() => this._esperar("readyok", "isready"));
  }

  _esperar(palabra, comando) {
    return new Promise((resolve) => {
      this.oyente = (l) => {
        if (l.startsWith(palabra)) resolve();
      };
      this.w.postMessage(comando);
    });
  }

  // Analiza una posición. Puntajes desde el punto de vista de quien mueve.
  // opciones: {profundidad, lineas, soloJugadas: ["e2e4", ...]}
  analizar(fen, { profundidad = 12, lineas = 3, soloJugadas = null } = {}) {
    const tarea = this.cola.then(() => this._analizar(fen, profundidad, lineas, soloJugadas));
    this.cola = tarea.catch(() => {});
    return tarea;
  }

  async _analizar(fen, profundidad, lineas, soloJugadas) {
    await this.listo;
    const res = new Map();
    await new Promise((resolve) => {
      this.oyente = (l) => {
        if (l.startsWith("info") && l.includes(" pv ") && l.includes(" multipv ")) {
          const t = l.split(" ");
          const k = Number(t[t.indexOf("multipv") + 1]);
          const iS = t.indexOf("score");
          const tipo = t[iS + 1];
          const valor = Number(t[iS + 2]);
          if (t.includes("upperbound") || t.includes("lowerbound")) return;
          const pv = t.slice(t.indexOf("pv") + 1);
          res.set(k, { uci: pv[0], cp: tipo === "cp" ? valor : null, mate: tipo === "mate" ? valor : null, pv, prof: Number(t[t.indexOf("depth") + 1]) });
        } else if (l.startsWith("bestmove")) {
          resolve();
        }
      };
      this.w.postMessage("ucinewgame");
      this.w.postMessage(`setoption name MultiPV value ${lineas}`);
      this.w.postMessage(`position fen ${fen}`);
      this.w.postMessage(`go depth ${profundidad}${soloJugadas ? " searchmoves " + soloJugadas.join(" ") : ""}`);
    });
    return [...res.keys()].sort((a, b) => a - b).map((k) => res.get(k));
  }
}

// Puntaje comparable (centipeones); el mate vale muchísimo
export const puntos = (l) => (l.mate != null ? Math.sign(l.mate) * (100000 - Math.abs(l.mate) * 100) : l.cp);
