"""Servidor local para jugar en tu PC:  python servidor.py   →  http://localhost:8080

Igual que «python -m http.server», pero con los tipos MIME correctos para .js, .mjs y .wasm
(en Windows el registro a veces los tiene mal y el navegador no carga a Maia)."""
import http.server
import socketserver
import sys
import webbrowser
from pathlib import Path

PUERTO = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class Manejador(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".json": "application/json",
        ".css": "text/css",
        ".bin": "application/octet-stream",
        ".html": "text/html",
    }

    def __init__(self, *a, **k):
        super().__init__(*a, directory=str(Path(__file__).resolve().parent), **k)


if __name__ == "__main__":
    with socketserver.ThreadingTCPServer(("", PUERTO), Manejador) as srv:
        url = f"http://localhost:{PUERTO}"
        print(f"Ajedrez con Maia en {url}  (Ctrl+C para cerrar)")
        try:
            webbrowser.open(url)
        except Exception:
            pass
        srv.serve_forever()
