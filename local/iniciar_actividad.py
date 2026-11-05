#!/usr/bin/env python3
"""Serve the activity tool on loopback and proxy only AbuseIPDB check requests.

No API key, log file or provider response is stored on disk or written to logs.
"""
import argparse
import ipaddress
import json
from pathlib import Path
import ssl
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PUBLIC_FILES = {
    '/': ('index.html', 'text/html; charset=utf-8'),
    '/index.html': ('index.html', 'text/html; charset=utf-8'),
    '/activity-app.js': ('activity-app.js', 'text/javascript; charset=utf-8'),
    '/THIRD_PARTY_LICENSES.txt': ('THIRD_PARTY_LICENSES.txt', 'text/plain; charset=utf-8'),
}
FIELDS = ('ipAddress', 'abuseConfidenceScore', 'totalReports', 'numDistinctUsers',
          'lastReportedAt', 'countryName', 'countryCode', 'isp', 'domain',
          'usageType', 'isWhitelisted')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def query_abuseipdb(ip, key, max_age):
    query = urllib.parse.urlencode({'ipAddress': ip, 'maxAgeInDays': max_age})
    request = urllib.request.Request(
        'https://api.abuseipdb.com/api/v2/check?' + query,
        headers={'Key': key, 'Accept': 'application/json'}, method='GET')
    opener = urllib.request.build_opener(
        urllib.request.HTTPSHandler(context=ssl.create_default_context()), NoRedirect())
    try:
        with opener.open(request, timeout=20) as response:
            # check responses without verbose reports are small; reject oversized data.
            raw = response.read(1048577)
            if len(raw) > 1048576:
                return 502, {'error': 'Respuesta del proveedor demasiado grande'}
            body = json.loads(raw)
            data = body.get('data', {})
            score = data.get('abuseConfidenceScore')
            if (str(ipaddress.ip_address(data.get('ipAddress', ''))) != ip
                    or type(score) is not int or not 0 <= score <= 100):
                return 502, {'error': 'Respuesta del proveedor no válida'}
            remaining = response.headers.get('X-RateLimit-Remaining')
            return 200, {
                'data': {field: data.get(field) for field in FIELDS},
                'remaining': int(remaining) if remaining and remaining.isdigit() else None,
            }
    except urllib.error.HTTPError as error:
        status = error.code if error.code in (401, 403, 429) else 502
        return status, {'error': 'La consulta a AbuseIPDB no pudo completarse'}
    except (OSError, ValueError, TypeError, KeyError, AttributeError):
        return 502, {'error': 'Error de conexión o respuesta no válida de AbuseIPDB'}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    @property
    def origin(self):
        return 'http://127.0.0.1:' + str(self.server.server_port)

    def allowed_host(self):
        return self.headers.get('Host') == '127.0.0.1:' + str(self.server.server_port)

    def respond(self, status, content, content_type='application/json; charset=utf-8'):
        payload = json.dumps(content).encode() if not isinstance(content, bytes) else content
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if not self.allowed_host():
            self.respond(403, {'error': 'Host no permitido'})
            return
        if self.path == '/api/status':
            self.respond(200, {'service': 'office365-activity', 'reputation': True})
            return
        target = PUBLIC_FILES.get(self.path)
        if not target:
            self.respond(404, {'error': 'No encontrado'})
            return
        path = self.server.asset_root / (self.server.entrypoint if target[0] == 'index.html' else target[0])
        if not path.is_file():
            self.respond(404, {'error': 'Faltan archivos de la aplicación junto al lanzador'})
            return
        self.respond(200, path.read_bytes(), target[1])

    def do_POST(self):
        if not self.allowed_host() or self.headers.get('Origin') != self.origin:
            self.respond(403, {'error': 'Origen no permitido'})
            return
        if self.path != '/api/abuseipdb/check':
            self.respond(404, {'error': 'No encontrado'})
            return
        if self.headers.get('Content-Type', '').split(';')[0].strip() != 'application/json':
            self.respond(415, {'error': 'Se requiere JSON'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 8192:
                raise ValueError()
            body = json.loads(self.rfile.read(length))
            ip = ipaddress.ip_address(body['ipAddress'])
            if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
                ip = ip.ipv4_mapped
            if not ip.is_global or ip.is_multicast or ip.is_reserved:
                raise ValueError()
            key = body['apiKey']
            if not isinstance(key, str) or not 1 <= len(key.strip()) <= 4096 or '\r' in key or '\n' in key:
                raise ValueError()
            max_age = body['maxAgeInDays']
            if type(max_age) is not int or not 1 <= max_age <= 365:
                raise ValueError()
        except (ValueError, TypeError, KeyError):
            self.respond(400, {'error': 'IP, clave o período no válidos'})
            return
        status, result = query_abuseipdb(str(ip), key.strip(), max_age)
        self.respond(status, result)


def make_server(asset_root, port=0):
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    server.daemon_threads = True
    server.asset_root = Path(asset_root).resolve()
    server.entrypoint = 'actividad.html' if (server.asset_root / 'actividad.html').is_file() else 'index.html'
    return server


def main():
    args = argparse.ArgumentParser(description='Analizador local de actividad Office 365')
    args.add_argument('--no-browser', action='store_true')
    options = args.parse_args()
    asset_root = Path(__file__).parent
    if not (asset_root / 'activity-app.js').is_file():
        asset_root = asset_root.parent / 'dist'
    with make_server(asset_root) as server:
        url = 'http://127.0.0.1:' + str(server.server_port) + '/'
        print('Analizador local: ' + url, flush=True)
        print('Mantén esta ventana abierta. Ctrl+C para cerrar. No introduzcas claves aquí.', flush=True)
        if not options.no_browser:
            threading.Timer(0.3, lambda: webbrowser.open(url)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
