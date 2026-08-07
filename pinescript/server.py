#!/usr/bin/env python3
"""
Servidor HTTP simples para o simulador da Confluência Multi-Fator.

Uso:
    python3 server.py

Então acesse: http://localhost:8000

"""

import http.server
import socketserver
import os
import sys

PORT = 8000

class MyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Adicionar headers para evitar cache
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        super().end_headers()

    def log_message(self, format, *args):
        # Simplificar log
        print(f"[{self.log_date_time_string()}] {format % args}")

def run_server():
    # Mudar para o diretório do script
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)

    handler = MyHTTPRequestHandler

    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"""
╔════════════════════════════════════════════════════════════╗
║         SIMULADOR CONFLUÊNCIA MULTI-FATOR                  ║
║              🚀 Servidor iniciado!                         ║
╠════════════════════════════════════════════════════════════╣
║  🌐 Abra no navegador: http://localhost:{PORT}             ║
║  📂 Diretório: {script_dir}
║  🛑 Para parar: Ctrl+C                                    ║
╚════════════════════════════════════════════════════════════╝
        """)

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n\n[INFO] Servidor parado pelo usuário.")
            sys.exit(0)

if __name__ == '__main__':
    run_server()
