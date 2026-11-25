// El entrenador: convierte jugadas y análisis en explicaciones sencillas para niños.
import { Chess } from "../vendor/chess.js";
import { puntos } from "./motor.js";

export const NOMBRE = { p: "peón", n: "caballo", b: "alfil", r: "torre", q: "dama", k: "rey" };
const EL = { p: "el", n: "el", b: "el", r: "la", q: "la", k: "el" };
const VALOR = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
export const ICONO = { w: { p: "♙", n: "♘", b: "♗", r: "♖", q: "♕", k: "♔" }, b: { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" } };
const LETRA = { N: "C", B: "A", R: "T", Q: "D", K: "R" };
const CENTRO = new Set(["d4", "e4", "d5", "e5"]);

const may = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const rival = (c) => (c === "w" ? "b" : "w");

// Notación en español: Cf3, Axf7+, O-O, e8=D
export const sanEs = (san) => san.replace(/[NBRQK]/g, (l) => LETRA[l]);

// Frase para leer: "Caballo a f3", "El alfil captura el peón en f7"
export function frase(m) {
  if (m.flags.includes("k")) return "Enroque corto";
  if (m.flags.includes("q")) return "Enroque largo";
  if (m.promotion) return `${m.captured ? "El peón captura y corona" : "El peón corona"} en ${m.to}: se convierte en ${NOMBRE[m.promotion]}`;
  if (m.captured) return `${may(EL[m.piece])} ${NOMBRE[m.piece]} captura ${EL[m.captured]} ${NOMBRE[m.captured]} en ${m.to}`;
  return `${may(NOMBRE[m.piece])} a ${m.to}`;
}

export function jugadaDe(fen, uci) {
  const g = new Chess(fen);
  const m = g.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
  return { m, despues: g };
}

// Línea de jugadas UCI → SAN en español
export function lineaEs(fen, pv, n = 4) {
  const g = new Chess(fen);
  const out = [];
  for (const u of pv.slice(0, n)) {
    try {
      out.push(sanEs(g.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] || "q" }).san));
    } catch (e) {
      break;
    }
  }
  return out;
}

// ¿La pieza de esa casilla se puede perder? (atacada sin defensa, o atacada por algo que vale menos)
function enPeligro(g, sq) {
  const p = g.get(sq);
  if (!p || p.type === "k") return false;
  const atac = g.attackers(sq, rival(p.color));
  if (!atac.length) return false;
  const def = g.attackers(sq, p.color);
  if (!def.length) return true;
  const menor = Math.min(...atac.map((s) => VALOR[g.get(s).type]));
  return menor < VALOR[p.type];
}

export function piezasEnPeligro(g, color) {
  const out = [];
  for (const fila of g.board()) {
    for (const c of fila) {
      if (c && c.color === color && enPeligro(g, c.square)) out.push({ sq: c.square, type: c.type });
    }
  }
  return out.sort((a, b) => VALOR[b.type] - VALOR[a.type]);
}

// Razones de una jugada, en palabras simples. Cada razón: {icono, texto}
export function razones(fen, uci) {
  const antes = new Chess(fen);
  const yo = antes.turn();
  const { m, despues } = jugadaDe(fen, uci);
  const r = [];
  if (despues.isCheckmate()) return [{ icono: "👑", texto: "¡Es jaque mate! El rey rival no puede escapar: ganas la partida." }];

  if (m.flags.includes("k") || m.flags.includes("q")) {
    r.push({ icono: "🏰", texto: "Enroque: escondes a tu rey detrás de los peones y tu torre entra a jugar." });
  }
  if (m.promotion) r.push({ icono: "✨", texto: `¡Coronas! Tu peón llega al final y se convierte en ${NOMBRE[m.promotion]}.` });

  if (m.captured) {
    const vC = VALOR[m.captured];
    const vP = VALOR[m.piece];
    const loDefienden = despues.attackers(m.to, rival(yo)).length > 0;
    if (!loDefienden) r.push({ icono: "🎁", texto: `Capturas ${EL[m.captured]} ${NOMBRE[m.captured]} gratis (vale ${vC} ${vC === 1 ? "punto" : "puntos"}).` });
    else if (vC > vP) r.push({ icono: "⚖️", texto: `Cambias tu ${NOMBRE[m.piece]} (${vP}) por su ${NOMBRE[m.captured]} (${vC}): ganas material.` });
    else r.push({ icono: "🔄", texto: `Capturas su ${NOMBRE[m.captured]}: es un cambio parejo.` });
  }
  if (despues.inCheck()) r.push({ icono: "⚡", texto: "Das jaque: el rey rival está atacado y tiene que escapar." });

  // salvar piezas
  if (enPeligro(antes, m.from)) r.push({ icono: "🛡️", texto: `Salvas tu ${NOMBRE[m.piece]}, que estaba en peligro.` });
  for (const p of piezasEnPeligro(antes, yo)) {
    if (p.sq !== m.from && despues.get(p.sq) && !enPeligro(despues, p.sq)) {
      r.push({ icono: "🛡️", texto: `Proteges tu ${NOMBRE[p.type]} de ${p.sq}.` });
      break;
    }
  }

  // amenazas nuevas que crea la pieza movida
  const amenazas = [];
  for (const fila of despues.board()) {
    for (const c of fila) {
      if (!c || c.color === yo || c.type === "k") continue;
      if (despues.attackers(c.square, yo).includes(m.to) && enPeligro(despues, c.square)) amenazas.push(c);
    }
  }
  amenazas.sort((a, b) => VALOR[b.type] - VALOR[a.type]);
  if (amenazas.length >= 2) r.push({ icono: "🍴", texto: `¡Ataque doble! Amenazas su ${NOMBRE[amenazas[0].type]} y su ${NOMBRE[amenazas[1].type]} a la vez.` });
  else if (amenazas.length === 1) r.push({ icono: "🎯", texto: `Amenazas su ${NOMBRE[amenazas[0].type]} en ${amenazas[0].square}.` });

  // ideas de apertura
  const filaInicio = yo === "w" ? "1" : "8";
  if (antes.moveNumber() <= 12 && (m.piece === "n" || m.piece === "b") && m.from[1] === filaInicio) {
    r.push({ icono: "🚀", texto: `Sacas ${EL[m.piece]} ${NOMBRE[m.piece]}: las piezas juegan mejor fuera de su casilla de inicio.` });
  }
  if (CENTRO.has(m.to) && (m.piece === "p" || m.piece === "n")) r.push({ icono: "🎯", texto: "Controlas el centro del tablero, donde las piezas tienen más fuerza." });
  else if (m.piece === "n" && ["c3", "f3", "c6", "f6"].includes(m.to)) r.push({ icono: "🎯", texto: "Desde ahí el caballo vigila el centro." });
  else if (m.piece === "p" && antes.moveNumber() <= 15 && [...CENTRO].some((c) => despues.attackers(c, yo).includes(m.to))) {
    r.push({ icono: "🧱", texto: "Tu peón apoya el centro y prepara el avance de otros peones." });
  }

  return r;
}

// Frase sobre quién va ganando (puntaje desde el punto de vista del jugador)
export function situacion(l) {
  if (!l) return "";
  if (l.mate != null) return l.mate > 0 ? `¡Hay mate en ${l.mate} ${l.mate === 1 ? "jugada" : "jugadas"}!` : `Cuidado: el rival tiene mate en ${-l.mate}.`;
  const cp = l.cp;
  if (Math.abs(cp) < 60) return "La partida queda pareja.";
  const peones = (Math.abs(cp) / 100).toFixed(1).replace(".", ",");
  return cp > 0 ? `Quedas ganando (como ${peones} peones de ventaja).` : `Quedas un poco peor (como ${peones} peones menos).`;
}

// Probabilidad de ganar (0-100) a partir del puntaje del motor
export const probGanar = (l) => (l.mate != null ? (l.mate > 0 ? 100 : 0) : 50 + 50 * (2 / (1 + Math.exp(-0.00368 * l.cp)) - 1));

// Calificación de la jugada del niño comparada con la mejor
export function calificar(perdida) {
  if (perdida <= 25) return { nivel: "excelente", icono: "🌟", titulo: "¡Excelente jugada!", estrellas: 3 };
  if (perdida <= 70) return { nivel: "buena", icono: "👍", titulo: "¡Buena jugada!", estrellas: 2 };
  if (perdida <= 160) return { nivel: "regular", icono: "🤔", titulo: "Jugada regular", estrellas: 1 };
  if (perdida <= 320) return { nivel: "error", icono: "⚠️", titulo: "Error", estrellas: 0 };
  return { nivel: "grave", icono: "😟", titulo: "Error grave", estrellas: 0 };
}

// Por qué una jugada es mala (lo que se ve en el tablero)
export function problemas(fen, uci, lineaMotor) {
  const yo = new Chess(fen).turn();
  const { m, despues } = jugadaDe(fen, uci);
  const out = [];
  const peligro = piezasEnPeligro(despues, yo);
  if (peligro.length) {
    const p = peligro[0];
    out.push(p.sq === m.to ? `Tu ${NOMBRE[p.type]} queda donde lo pueden capturar.` : `Tu ${NOMBRE[p.type]} de ${p.sq} queda sin protección.`);
  }
  if (lineaMotor && lineaMotor.pv && lineaMotor.pv.length > 1) {
    const resp = lineaEs(despues.fen(), lineaMotor.pv.slice(1), 1)[0];
    if (resp) out.push(`El rival puede responder ${resp}.`);
  }
  if (lineaMotor && lineaMotor.mate != null && lineaMotor.mate < 0) out.push("¡Le das al rival la oportunidad de dar jaque mate!");
  return out;
}

export { puntos };
