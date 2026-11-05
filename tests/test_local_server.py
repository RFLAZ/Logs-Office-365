import importlib.util
import io
import json
from email.message import Message
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import urllib.error

spec = importlib.util.spec_from_file_location('activity_server', Path(__file__).resolve().parents[1] / 'local/iniciar_actividad.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


def request(body=None, origin='http://127.0.0.1:1234', host='127.0.0.1:1234'):
    handler = object.__new__(server.Handler)
    handler.server = SimpleNamespace(server_port=1234)
    handler.path = '/api/abuseipdb/check'
    data = json.dumps(body or {'ipAddress': '8.8.8.8', 'apiKey': 'test-only-key', 'maxAgeInDays': 90}).encode()
    handler.headers = Message()
    for key, value in {'Host': host, 'Origin': origin, 'Content-Type': 'application/json', 'Content-Length': str(len(data))}.items():
        handler.headers[key] = value
    handler.rfile = io.BytesIO(data)
    handler.respond = Mock()
    return handler


class LocalServerTests(unittest.TestCase):
    def test_only_public_ips_from_same_origin_reach_provider(self):
        with patch.object(server, 'query_abuseipdb', return_value=(200, {'data': {}})) as call:
            good = request()
            good.do_POST()
            call.assert_called_once_with('8.8.8.8', 'test-only-key', 90)
            call.reset_mock()
            for handler in [request(origin='https://other.example'), request(host='other.example'), request({'ipAddress': '127.0.0.1', 'apiKey': 'test-only-key', 'maxAgeInDays': 90})]:
                handler.do_POST()
                self.assertIn(handler.respond.call_args.args[0], (400, 403))
            call.assert_not_called()

    def test_api_key_is_a_header_to_fixed_https_host_not_url(self):
        response = Mock()
        response.read.return_value = json.dumps({'data': {'ipAddress': '8.8.8.8', 'abuseConfidenceScore': 12, 'totalReports': 4, 'unneeded': 'discard'}}).encode()
        response.headers = {'X-RateLimit-Remaining': '7'}
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        opener = Mock()
        opener.open.return_value = response
        with patch.object(server.urllib.request, 'build_opener', return_value=opener):
            status, result = server.query_abuseipdb('8.8.8.8', 'test-only-key', 90)
        req = opener.open.call_args.args[0]
        self.assertTrue(req.full_url.startswith('https://api.abuseipdb.com/api/v2/check?'))
        self.assertNotIn('test-only-key', req.full_url)
        self.assertEqual(req.get_header('Key'), 'test-only-key')
        self.assertEqual(status, 200)
        self.assertEqual(result['remaining'], 7)
        self.assertNotIn('unneeded', result['data'])
        self.assertNotIn('test-only-key', json.dumps(result))

    def test_provider_error_and_redirect_do_not_expose_key_or_follow_redirect(self):
        for code in [401, 429, 302]:
            opener = Mock()
            opener.open.side_effect = urllib.error.HTTPError('https://api.abuseipdb.com', code, 'error', {}, None)
            with patch.object(server.urllib.request, 'build_opener', return_value=opener):
                status, body = server.query_abuseipdb('8.8.8.8', 'test-only-key', 90)
            self.assertEqual(status, code if code in (401, 429) else 502)
            self.assertNotIn('test-only-key', json.dumps(body))
        self.assertIsNone(server.NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.example'))

    def test_key_newlines_and_invalid_period_are_rejected(self):
        with patch.object(server, 'query_abuseipdb') as call:
            for body in [{'ipAddress': '8.8.8.8', 'apiKey': 'test\nkey', 'maxAgeInDays': 90}, {'ipAddress': '8.8.8.8', 'apiKey': 'test', 'maxAgeInDays': 999}]:
                handler = request(body)
                handler.do_POST()
                self.assertEqual(handler.respond.call_args.args[0], 400)
            call.assert_not_called()


if __name__ == '__main__':
    unittest.main()
