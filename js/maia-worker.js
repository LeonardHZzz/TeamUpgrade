// Ejecuta la red de Maia-3 (ONNX) fuera del hilo principal para que el tablero no se congele.
importScripts("../vendor/ort/ort.wasm.min.js");

// Se usa una copia .js del cargador: algunos servidores (p. ej. «python -m http.server» en Windows)
// entregan los .mjs con un tipo MIME incorrecto y el navegador se niega a importarlos.
ort.env.wasm.wasmPaths = {
  mjs: new URL("../vendor/ort/ort-wasm-simd-threaded.loader.js", self.location.href).href,
  wasm: new URL("../vendor/ort/ort-wasm-simd-threaded.wasm", self.location.href).href,
};
ort.env.wasm.numThreads = 1; // sin hilos: funciona en cualquier hosting estático

const CACHE = "maia3-modelo-v1";
let sesion = null;

// El modelo (45 MB) está partido en dos archivos para que quepa en cualquier repositorio u hosting.
async function descargar(urls) {
  const clave = urls[0];
  // 1) caché del navegador (la segunda visita carga al instante)
  try {
    const cache = await caches.open(CACHE);
    const guardada = await cache.match(clave);
    if (guardada) {
      postMessage({ tipo: "progreso", pct: 100 });
      return new Uint8Array(await guardada.arrayBuffer());
    }
  } catch (e) { /* sin Cache API */ }
  // 2) descarga con barra de progreso
  const total = 45683801;
  const partes = [];
  let recibido = 0;
  for (const url of urls) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`No se pudo descargar el modelo (${r.status})`);
    const lector = r.body.getReader();
    for (;;) {
      const { done, value } = await lector.read();
      if (done) break;
      partes.push(value);
      recibido += value.length;
      postMessage({ tipo: "progreso", pct: Math.min(99, Math.round((100 * recibido) / total)) });
    }
  }
  const datos = new Uint8Array(recibido);
  let o = 0;
  for (const p of partes) {
    datos.set(p, o);
    o += p.length;
  }
  try {
    const cache = await caches.open(CACHE);
    await cache.put(clave, new Response(datos.slice()));
  } catch (e) { /* sin espacio o sin Cache API */ }
  return datos;
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.tipo === "iniciar") {
      const datos = await descargar(m.urls);
      postMessage({ tipo: "progreso", pct: 100 });
      sesion = await ort.InferenceSession.create(datos, { graphOptimizationLevel: "basic" });
      postMessage({ tipo: "listo" });
    } else if (m.tipo === "inferir") {
      const n = m.n;
      const salida = await sesion.run({
        tokens: new ort.Tensor("float32", m.tokens, [n, 64, 12]),
        elo_self: new ort.Tensor("float32", m.eloPropio, [n]),
        elo_oppo: new ort.Tensor("float32", m.eloRival, [n]),
      });
      const mov = new Float32Array(salida.logits_move.data);
      const val = new Float32Array(salida.logits_value.data);
      postMessage({ tipo: "resultado", id: m.id, mov, val }, [mov.buffer, val.buffer]);
    }
  } catch (err) {
    postMessage({ tipo: "error", id: m.id, mensaje: String(err && err.message ? err.message : err) });
  }
};
