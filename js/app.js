// Ajedrez con Maia: flujo de la partida, tablero y entrenador.
import { Chess } from "../vendor/chess.js";
import { Chessground } from "../vendor/chessground/chessground.min.js";
import { Maia } from "./maia.js";
import { Motor, puntos } from "./motor.js";
import * as E from "./coach.js";
import { Voz } from "./voz.js";

const $ = (id) => document.getElementById(id);
const PROF = 12; // profundidad de Stockfish (≈ medio segundo por análisis)
const MARGEN_HUMANO = 50; // si la jugada favorita de Maia pierde menos de esto, se recomienda (es más «humana»)

const st = {
  modo: "maia", // "maia": juegas contra Maia · "libre": mueves los dos lados y Maia aconseja
  color: "w",
  vista: "w", // lado que se ve abajo en el tablero
  elo: 2200,
  juego: new Chess(),
  analisis: null,
  turnoId: 0,
  ocupado: false,
  ayuda: true,
  estrellas: 0,
  calificaciones: {}, // índice de jugada → nivel
  listos: { maia: false, motor: false },
};
window.__ajedrez = st; // para pruebas

// --- motores -----------------------------------------------------------------------
const maia = new Maia({
  alProgreso: (p) => {
    $("carga-barra").style.width = `${p}%`;
    $("carga-txt").textContent = p < 100 ? `Descargando a Maia… ${p}%` : "Despertando a Maia…";
  },
});
const motor = new Motor();
const revisarListo = () => {
  const ok = st.listos.maia && st.listos.motor;
  $("btn-jugar").disabled = !ok;
  if (ok) {
    $("carga").classList.add("ok");
    $("carga-txt").textContent = "¡Maia está lista para jugar!";
  }
};
maia.listo
  .then(() => {
    st.listos.maia = true;
    revisarListo();
  })
  .catch((e) => {
    $("carga-txt").textContent = `No se pudo cargar a Maia: ${e.message}`;
  });
motor.listo.then(() => {
  st.listos.motor = true;
  revisarListo();
});

// --- tablero -----------------------------------------------------------------------
const nombreColor = (c) => (c === "w" ? "white" : "black");
const cg = Chessground($("tablero"), {
  coordinates: true,
  animation: { enabled: true, duration: 250 },
  movable: { free: false, showDests: true, events: { after: (o, d) => alMoverEnTablero(o, d) } },
  draggable: { showGhost: true },
  highlight: { lastMove: true, check: true },
  drawable: { enabled: false, visible: true },
  premovable: { enabled: false },
});

function destinos() {
  const d = new Map();
  for (const m of st.juego.moves({ verbose: true })) {
    if (!d.has(m.from)) d.set(m.from, []);
    d.get(m.from).push(m.to);
  }
  return d;
}

const libre = () => st.modo === "libre";
// lado que mueve el niño ahora: en modo libre, siempre el que tiene el turno
const lado = () => (libre() ? st.juego.turn() : st.color);
const nombreLado = (c) => (c === "w" ? "blancas" : "negras");
const esMiTurno = () => !st.juego.isGameOver() && (libre() || st.juego.turn() === st.color);

function sincronizar() {
  const h = st.juego.history({ verbose: true });
  const ult = h[h.length - 1];
  const puedo = esMiTurno() && !st.ocupado;
  cg.set({
    fen: st.juego.fen(),
    orientation: nombreColor(st.vista),
    turnColor: nombreColor(st.juego.turn()),
    check: st.juego.inCheck() ? nombreColor(st.juego.turn()) : false,
    lastMove: ult ? [ult.from, ult.to] : undefined,
    movable: { color: puedo ? nombreColor(lado()) : undefined, dests: puedo ? destinos() : new Map() },
  });
  pintarHistorial();
}

function flecha(uci, color = "green") {
  cg.setAutoShapes(uci ? [{ orig: uci.slice(0, 2), dest: uci.slice(2, 4), brush: color }] : []);
}

// --- inicio ------------------------------------------------------------------------
document.querySelectorAll(".modo-op").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".modo-op").forEach((x) => {
      x.classList.toggle("sel", x === b);
      x.setAttribute("aria-checked", x === b);
    });
    st.modo = b.dataset.modo;
    $("color-tit").textContent = libre() ? "¿Qué lado quieres ver abajo?" : "¿Con qué color juegas?";
    $("sub-w").textContent = libre() ? "Abajo las blancas" : "Empiezas tú";
    $("sub-b").textContent = libre() ? "Abajo las negras" : "Empieza Maia";
    $("nivel-tit").textContent = libre() ? "Nivel de Maia (para aconsejarte)" : "Nivel de Maia";
    Voz.decir(libre() ? "Práctica libre: tú mueves las piezas blancas y las negras. Maia te aconseja en cada jugada." : "Contra Maia: tú juegas con un color y Maia con el otro.");
  }),
);
document.querySelectorAll(".color-op").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".color-op").forEach((x) => {
      x.classList.toggle("sel", x === b);
      x.setAttribute("aria-checked", x === b);
    });
    st.color = b.dataset.color;
    if (libre()) Voz.decir(st.color === "w" ? "Las blancas abajo." : "Las negras abajo.");
    else Voz.decir(st.color === "w" ? "Blancas. Empiezas tú." : "Negras. Empieza Maia.");
  }),
);
document.querySelectorAll(".nivel-op").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll(".nivel-op").forEach((x) => {
      x.classList.toggle("sel", x === b);
      x.setAttribute("aria-checked", x === b);
    });
    st.elo = Number(b.dataset.elo);
  }),
);
$("btn-jugar").addEventListener("click", empezar);
$("fin-otra").addEventListener("click", () => {
  $("fin").classList.remove("show");
  irInicio();
});
$("fin-ver").addEventListener("click", () => $("fin").classList.remove("show"));
$("btn-nueva").addEventListener("click", irInicio);
$("btn-deshacer").addEventListener("click", deshacer);
$("btn-girar").addEventListener("click", () => {
  st.vista = st.vista === "w" ? "b" : "w";
  cg.set({ orientation: nombreColor(st.vista) });
});
$("btn-maia-mueve").addEventListener("click", () => {
  if (!libre() || st.ocupado || st.juego.isGameOver()) return;
  turnoMaia();
});
$("btn-ayuda").addEventListener("click", () => {
  st.ayuda = !st.ayuda;
  $("btn-ayuda").classList.toggle("activo", st.ayuda);
  pintarRecomendacion();
});
$("btn-voz").addEventListener("click", () => {
  Voz.activa = !Voz.activa;
  $("btn-voz").classList.toggle("activo", Voz.activa);
  $("btn-voz").textContent = Voz.activa ? "🔊" : "🔇";
  if (!Voz.activa) Voz.callar();
});

function irInicio() {
  st.turnoId++;
  Voz.callar();
  $("partida").classList.remove("activa");
  $("inicio").classList.add("activa");
}

function empezar() {
  st.juego = new Chess();
  st.analisis = null;
  st.estrellas = 0;
  st.calificaciones = {};
  st.ocupado = false;
  st.vista = st.color;
  $("tag-yo").textContent = libre() ? "Tú mueves ♔ y ♚" : `Tú (${st.color === "w" ? "blancas ♔" : "negras ♚"})`;
  $("tag-maia").textContent = libre() ? `Maia ${st.elo} te aconseja` : `Maia ${st.elo}`;
  $("vs").textContent = libre() ? "·" : "contra";
  $("eval-izq").textContent = libre() ? "Blancas" : "Tú";
  $("eval-der").textContent = libre() ? "Negras" : "Maia";
  $("btn-maia-mueve").classList.toggle("oculto", !libre());
  $("op-elo").textContent = st.elo;
  $("inicio").classList.remove("activa");
  $("partida").classList.add("activa");
  ocultar("tarjeta-maia");
  ocultar("tarjeta-calif");
  ocultar("alerta");
  $("estrellas").textContent = "";
  flecha(null);
  sincronizar();
  cg.redrawAll();
  actualizarBarra(null);
  if (libre()) {
    Voz.decir("¡Empezamos la práctica! Tú mueves las piezas de los dos colores. Empiezan las blancas.");
    turnoJugador();
  } else if (st.color === "w") {
    Voz.decir("¡Empezamos! Juegas con blancas, así que te toca primero.");
    turnoJugador();
  } else {
    Voz.decir("¡Empezamos! Juegas con negras. Primero mueve Maia.");
    turnoMaia();
  }
}

// --- turno del niño ----------------------------------------------------------------
async function turnoJugador() {
  const id = ++st.turnoId;
  st.ocupado = false;
  sincronizar();
  if (fin()) return;
  ponerTurno(libre() ? `Turno de las <b>${nombreLado(lado())}</b> ${E.ICONO[lado()].k} · mueve una pieza.` : "¡Te toca! Mueve una pieza.", "yo");
  $("rec-tit").textContent = libre() ? `💡 Jugada recomendada para las ${nombreLado(lado())}` : "💡 Jugada recomendada";
  avisos();
  st.analisis = null;
  $("rec-cuerpo").innerHTML = `<p class="pensando"><span class="spinner"></span> Buscando la mejor jugada…</p>`;
  const fen = st.juego.fen();
  const [mp, lineas] = await Promise.all([maia.predecir(fen, st.elo, st.elo), motor.analizar(fen, { profundidad: PROF, lineas: 3 })]);
  if (id !== st.turnoId) return;
  const favorita = mp.jugadas[0];
  let lFav = lineas.find((l) => l.uci === favorita.uci);
  if (!lFav) lFav = (await motor.analizar(fen, { profundidad: PROF, lineas: 1, soloJugadas: [favorita.uci] }))[0];
  if (id !== st.turnoId) return;
  const mejor = lineas[0];
  const humana = puntos(mejor) - puntos(lFav) <= MARGEN_HUMANO;
  st.analisis = {
    fen,
    lineas,
    maia: mp,
    favorita,
    lFav,
    rec: humana ? { uci: favorita.uci, linea: lFav, fuente: "maia" } : { uci: mejor.uci, linea: mejor, fuente: "motor" },
  };
  actualizarBarra(mejor);
  pintarRecomendacion();
  pintarOpciones();
  if (st.ayuda) {
    const { m } = E.jugadaDe(fen, st.analisis.rec.uci);
    const r = E.razones(fen, st.analisis.rec.uci)[0];
    Voz.decir(`${libre() ? `Turno de las ${nombreLado(lado())}. ` : ""}Te recomiendo: ${E.frase(m)}. ${r ? r.texto : ""}`);
  }
}

function pintarRecomendacion() {
  const a = st.analisis;
  if (!a || a.fen !== st.juego.fen()) return;
  if (!st.ayuda) {
    flecha(null);
    $("rec-cuerpo").innerHTML = `<p class="piensa">🤔 Piensa tu jugada. ¿Qué piezas están atacadas? ¿Puedes capturar algo?</p>
      <button type="button" class="btn-sec" id="ver-pista">💡 Ver la pista</button>`;
    $("ver-pista").onclick = () => $("btn-ayuda").click();
    return;
  }
  const { m } = E.jugadaDe(a.fen, a.rec.uci);
  flecha(a.rec.uci, "green");
  const razones = E.razones(a.fen, a.rec.uci);
  if (!razones.length) razones.push({ icono: "🧩", texto: "Mejora la posición de tus piezas sin dejar nada en peligro." });
  const plan = E.lineaEs(a.fen, a.rec.linea.pv, 5);
  const pMaia = a.maia.jugadas.find((j) => j.uci === a.rec.uci);
  let extra = "";
  if (a.rec.fuente === "maia") {
    extra = `<li><span>👥</span>El <b>${Math.round(100 * (pMaia ? pMaia.p : 0))}%</b> de los jugadores de ${st.elo} elegiría esta jugada.</li>`;
  } else {
    const fav = E.jugadaDe(a.fen, a.favorita.uci).m;
    const malos = E.problemas(a.fen, a.favorita.uci, a.lFav);
    extra = `<li><span>🧠</span>Muchos jugadores elegirían <b>${E.sanEs(fav.san)}</b>, pero esta es más fuerte.${
      puntos(a.lineas[0]) - puntos(a.lFav) > 150 && malos.length ? ` Con ${E.sanEs(fav.san)}: ${malos[0]}` : ""
    }</li>`;
  }
  $("rec-cuerpo").innerHTML = `
    <div class="rec-jugada">
      <span class="rec-pieza">${E.ICONO[m.color][m.piece]}</span>
      <div><b class="rec-frase">${E.frase(m)}</b><span class="rec-san">${E.sanEs(m.san)}</span></div>
    </div>
    <h3>¿Por qué?</h3>
    <ul class="razones">
      ${razones.map((r) => `<li><span>${r.icono}</span>${r.texto}</li>`).join("")}
      <li><span>📈</span>${E.situacion(a.rec.linea)}</li>
      ${extra}
    </ul>
    ${plan.length > 1 ? `<p class="plan"><b>Idea:</b> ${plan.map((s, i) => `<span class="${i % 2 ? "suya" : "mia"}">${s}</span>`).join(" → ")}</p>` : ""}
    <div class="rec-botones">
      <button type="button" class="btn-jugar btn-rec" id="jugar-rec">✔ Jugar esta jugada</button>
      <button type="button" class="btn-sec" id="oir-rec">🔊 Escuchar</button>
    </div>`;
  $("jugar-rec").onclick = () => hacerJugada(a.rec.uci);
  $("oir-rec").onclick = () => Voz.decir(`${E.frase(m)}. ${razones.map((r) => r.texto).join(" ")} ${E.situacion(a.rec.linea)}`);
}

function pintarOpciones() {
  const a = st.analisis;
  const ol = $("opciones");
  ol.innerHTML = a.maia.jugadas
    .slice(0, 4)
    .map((j) => {
      const { m } = E.jugadaDe(a.fen, j.uci);
      const l = a.lineas.find((x) => x.uci === j.uci) || (j.uci === a.favorita.uci ? a.lFav : null);
      let tag = "";
      if (l) {
        const perd = puntos(a.lineas[0]) - puntos(l);
        tag = perd <= 50 ? `<em class="ok">buena</em>` : perd <= 150 ? `<em class="meh">regular</em>` : `<em class="mal">error</em>`;
      }
      return `<li><button type="button" data-uci="${j.uci}"><b>${E.sanEs(m.san)}</b> <span class="pct"><i style="width:${Math.round(100 * j.p)}%"></i></span> ${Math.round(100 * j.p)}% ${tag}</button></li>`;
    })
    .join("");
  ol.querySelectorAll("button").forEach((b) => {
    b.onmouseenter = () => flecha(b.dataset.uci, "blue");
    b.onfocus = b.onmouseenter;
    b.onmouseleave = () => flecha(st.ayuda ? a.rec.uci : null, "green");
    b.onclick = () => {
      flecha(b.dataset.uci, "blue");
      const { m } = E.jugadaDe(a.fen, b.dataset.uci);
      const r = E.razones(a.fen, b.dataset.uci);
      Voz.decir(`${E.frase(m)}. ${r.length ? r[0].texto : ""}`);
    };
  });
}

function avisos() {
  const peligro = E.piezasEnPeligro(st.juego, lado());
  const al = $("alerta");
  if (st.juego.inCheck()) {
    al.innerHTML = libre() ? `⚡ <b>¡Las ${nombreLado(lado())} están en jaque!</b> Hay que salvar al rey.` : "⚡ <b>¡Estás en jaque!</b> Tienes que salvar a tu rey.";
    mostrar("alerta");
  } else if (peligro.length) {
    const p = peligro[0];
    al.innerHTML = `⚠️ <b>¡Cuidado!</b> ${libre() ? `${p.type === "r" || p.type === "q" ? "La" : "El"} ${E.NOMBRE[p.type]} de las ${nombreLado(lado())}` : `Tu ${E.NOMBRE[p.type]}`} en ${p.sq} está en peligro.`;
    mostrar("alerta");
  } else ocultar("alerta");
}

// --- jugada del niño ---------------------------------------------------------------
function alMoverEnTablero(orig, dest) {
  const pieza = st.juego.get(orig);
  const corona = pieza && pieza.type === "p" && (dest[1] === "8" || dest[1] === "1");
  hacerJugada(orig + dest + (corona ? "q" : ""));
}

async function hacerJugada(uci) {
  if (!esMiTurno() || st.ocupado) return;
  st.ocupado = true;
  const id = ++st.turnoId;
  const fen = st.juego.fen();
  let m;
  try {
    m = st.juego.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
  } catch (e) {
    st.ocupado = false;
    sincronizar();
    return;
  }
  const uciReal = m.from + m.to + (m.promotion || "");
  flecha(null);
  ocultar("alerta");
  if (libre()) ocultar("tarjeta-maia");
  sincronizar();
  // calificar
  let a = st.analisis && st.analisis.fen === fen ? st.analisis : null;
  if (!a) {
    const lineas = await motor.analizar(fen, { profundidad: PROF, lineas: 3 });
    a = { fen, lineas, rec: { uci: lineas[0].uci, linea: lineas[0] } };
  }
  let lJug = a.lineas.find((l) => l.uci === uciReal) || (a.lFav && a.lFav.uci === uciReal ? a.lFav : null);
  if (!lJug) lJug = (await motor.analizar(fen, { profundidad: PROF, lineas: 1, soloJugadas: [uciReal] }))[0];
  if (id !== st.turnoId) return;
  const perdida = uciReal === a.rec.uci ? 0 : Math.max(0, puntos(a.lineas[0]) - puntos(lJug));
  const c = E.calificar(perdida);
  st.estrellas += c.estrellas;
  st.calificaciones[st.juego.history().length - 1] = c.nivel;
  $("estrellas").textContent = st.estrellas ? `⭐ ${st.estrellas}` : "";
  let cuerpo;
  if (c.nivel === "excelente" || c.nivel === "buena") {
    const r = E.razones(fen, uciReal)[0];
    cuerpo = `${libre() ? `${may(nombreLado(m.color))}: ` : "Jugaste: "}<b>${E.frase(m)}</b> (${E.sanEs(m.san)}).${r ? ` ${r.icono} ${r.texto}` : ""}`;
  } else {
    const rec = E.jugadaDe(fen, a.rec.uci).m;
    const malos = E.problemas(fen, uciReal, lJug);
    cuerpo = `${libre() ? `${may(nombreLado(m.color))} jugaron` : "Jugaste"} <b>${E.sanEs(m.san)}</b>. ${malos.join(" ")} Era mejor <b>${E.frase(rec)}</b> (${E.sanEs(rec.san)}).`;
  }
  const t = $("tarjeta-calif");
  t.className = `tarjeta tarjeta-calif ${c.nivel}`;
  t.innerHTML = `<div class="calif-tit">${c.icono} ${c.titulo} <span>${"⭐".repeat(c.estrellas)}</span></div><p>${cuerpo}</p>`;
  Voz.decir(`${c.titulo}. ${t.querySelector("p").textContent}`);
  pintarHistorial();
  if (fin()) return;
  if (libre()) {
    // práctica: el niño también mueve el otro lado
    st.ocupado = false;
    await new Promise((r) => setTimeout(r, 300));
    if (id !== st.turnoId) return;
    turnoJugador();
    return;
  }
  await turnoMaia(id);
}

// --- turno de Maia -----------------------------------------------------------------
async function turnoMaia(idPrevio) {
  const id = idPrevio && idPrevio === st.turnoId ? idPrevio : ++st.turnoId;
  st.ocupado = true;
  st.analisis = null;
  sincronizar();
  ponerTurno(`Maia está pensando${libre() ? ` por las ${nombreLado(st.juego.turn())}` : ""}… <span class="spinner"></span>`, "maia");
  $("rec-cuerpo").innerHTML = `<p class="pensando">Espera a que Maia mueva.</p>`;
  const fen = st.juego.fen();
  const t0 = performance.now();
  const mp = await maia.predecir(fen, st.elo, st.elo);
  const espera = 900 - (performance.now() - t0);
  if (espera > 0) await new Promise((r) => setTimeout(r, espera));
  if (id !== st.turnoId) return;
  const j = mp.jugadas[0];
  const m = st.juego.move({ from: j.uci.slice(0, 2), to: j.uci.slice(2, 4), promotion: j.uci[4] || "q" });
  sincronizar();
  // contar qué hizo Maia, pensando en el niño
  const notas = [];
  const tu = libre() ? "el " : "tu ";
  if (m.captured) notas.push(`Capturó ${tu}${E.NOMBRE[m.captured]}.`);
  if (st.juego.inCheck()) notas.push(libre() ? "¡Es jaque!" : "¡Te dio jaque!");
  const peligro = E.piezasEnPeligro(st.juego, st.juego.turn()).filter((p) => !m.captured || p.sq !== m.to);
  if (peligro.length && !st.juego.inCheck()) notas.push(`Ahora ${tu}${E.NOMBRE[peligro[0].type]} de ${peligro[0].sq} está atacado.`);
  const tm = $("tarjeta-maia");
  tm.innerHTML = `<div class="maia-jugo"><span class="rec-pieza">${E.ICONO[m.color][m.piece]}</span>
    <div><small>Maia jugó${libre() ? ` por las ${nombreLado(m.color)}` : ""}</small><b>${E.frase(m)}</b> <span class="rec-san">${E.sanEs(m.san)}</span></div></div>
    ${notas.length ? `<p>${notas.join(" ")}</p>` : ""}`;
  mostrar("tarjeta-maia");
  Voz.decir(`Maia jugó ${E.frase(m)}. ${notas.join(" ")}`);
  if (fin()) return;
  st.ocupado = false;
  await new Promise((r) => setTimeout(r, 400));
  if (id !== st.turnoId) return;
  turnoJugador();
}

// --- deshacer, final, historial ----------------------------------------------------
function deshacer() {
  const h = st.juego.history({ verbose: true });
  if (!h.length) return;
  st.turnoId++;
  if (libre()) {
    st.juego.undo();
    delete st.calificaciones[st.juego.history().length];
    ocultar("tarjeta-calif");
    ocultar("tarjeta-maia");
    $("fin").classList.remove("show");
    Voz.decir("Volvemos una jugada atrás.");
    turnoJugador();
    return 1;
  }
  // quitar hasta mi última jugada (y la respuesta de Maia, si la hubo)
  let quitadas = 0;
  while (st.juego.history().length) {
    const ult = st.juego.history({ verbose: true }).slice(-1)[0];
    st.juego.undo();
    delete st.calificaciones[st.juego.history().length];
    quitadas++;
    if (ult.color === st.color) break;
  }
  if (st.juego.turn() !== st.color) {
    // no había jugada mía que quitar (p. ej. solo movió Maia con blancas)
    turnoMaia();
    return;
  }
  ocultar("tarjeta-calif");
  ocultar("tarjeta-maia");
  $("fin").classList.remove("show");
  Voz.decir("Volvemos atrás. Inténtalo otra vez.");
  turnoJugador();
  return quitadas;
}

function fin() {
  const g = st.juego;
  if (!g.isGameOver()) return false;
  st.turnoId++;
  st.ocupado = true;
  sincronizar();
  flecha(null);
  let icono = "🤝";
  let tit = "¡Tablas!";
  let txt = "Nadie gana esta vez.";
  if (g.isCheckmate() && libre()) {
    icono = "🏆";
    tit = `¡Jaque mate! Ganan las ${nombreLado(g.turn() === "w" ? "b" : "w")}`;
    txt = "Practicaste con los dos colores. ¡Muy bien!";
  } else if (g.isCheckmate()) {
    const ganoYo = g.turn() !== st.color;
    icono = ganoYo ? "🏆" : "♟️";
    tit = ganoYo ? "¡Ganaste! ¡Jaque mate!" : "Maia ganó esta vez";
    txt = ganoYo ? `¡Le ganaste a Maia ${st.elo}! Eso es muy difícil.` : "No pasa nada: cada partida te enseña algo. Puedes deshacer jugadas y probar otra idea.";
  } else if (g.isStalemate()) txt = "Rey ahogado: el rey no está en jaque pero no tiene jugadas.";
  else if (g.isThreefoldRepetition()) txt = "La misma posición se repitió tres veces.";
  else if (g.isInsufficientMaterial()) txt = "No quedan piezas suficientes para dar mate.";
  $("fin-icono").textContent = icono;
  $("fin-tit").textContent = tit;
  $("fin-txt").textContent = `${txt} Estrellas ganadas: ${st.estrellas} ⭐`;
  ponerTurno(tit, "fin");
  $("fin").classList.add("show");
  Voz.decir(`${tit} ${txt}`);
  return true;
}

function pintarHistorial() {
  const h = st.juego.history();
  const ol = $("historial");
  let html = "";
  for (let i = 0; i < h.length; i += 2) {
    const celda = (k) => (k < h.length ? `<span class="${libre() || (k % 2 === 0 ? "w" : "b") === st.color ? "mia" : "suya"} ${st.calificaciones[k] || ""}">${E.sanEs(h[k])}</span>` : "");
    html += `<li>${celda(i)} ${celda(i + 1)}</li>`;
  }
  ol.innerHTML = html;
  ol.scrollTop = ol.scrollHeight;
}

function actualizarBarra(linea) {
  let pct = linea ? E.probGanar(linea) : 50; // para quien mueve
  if (linea && libre() && st.juego.turn() === "b") pct = 100 - pct; // en práctica: izquierda = blancas
  $("eval-yo").style.width = `${pct}%`;
}

function ponerTurno(html, quien) {
  const t = $("turno");
  t.innerHTML = html;
  t.className = `turno ${quien}`;
}
const may = (t) => t.charAt(0).toUpperCase() + t.slice(1);
const mostrar = (id) => $(id).classList.remove("oculto");
const ocultar = (id) => $(id).classList.add("oculto");
window.__ajedrezApi = { turnoJugador, hacerJugada, sincronizar };
