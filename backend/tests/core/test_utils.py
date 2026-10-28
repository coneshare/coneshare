import importlib.util
import os
import signal
import tempfile
from unittest.mock import MagicMock
import pytest
from django.test import RequestFactory, override_settings

from backend.utils import get_client_ip
from sharelinks.views import _render_watermark_text


def _load_entrypoint_module():
    entrypoint_path = os.path.join(os.path.dirname(__file__), '../../docker.dist/build/entrypoint.py')
    spec = importlib.util.spec_from_file_location('entrypoint', os.path.abspath(entrypoint_path))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestGetClientIp:
    @pytest.fixture
    def rf(self):
        return RequestFactory()

    def test_untrusted_remote_addr_ignores_spoofed_x_real_ip(self, rf):
        """
        An untrusted client (e.g. 198.51.100.5) must not be able to spoof its IP
        via X-Real-IP. get_client_ip must return REMOTE_ADDR.
        """
        request = rf.get('/', HTTP_X_REAL_IP='203.0.113.7', REMOTE_ADDR='198.51.100.5')
        assert get_client_ip(request) == '198.51.100.5'

    def test_untrusted_remote_addr_ignores_spoofed_x_forwarded_for(self, rf):
        """
        An untrusted client must not be able to spoof its IP via X-Forwarded-For.
        get_client_ip must return REMOTE_ADDR.
        """
        request = rf.get('/', HTTP_X_FORWARDED_FOR='203.0.113.7', REMOTE_ADDR='198.51.100.5')
        assert get_client_ip(request) == '198.51.100.5'

    def test_trusted_proxy_takes_rightmost_untrusted_xff(self, rf):
        """
        When REMOTE_ADDR is a trusted proxy (e.g. 127.0.0.1), get_client_ip must
        traverse X-Forwarded-For from right to left and pick the right-most untrusted IP.
        """
        # Scenario: Attacker sent X-Forwarded-For: 203.0.113.7.
        # Bundled proxy appended the real client IP (198.51.100.5).
        request = rf.get(
            '/',
            HTTP_X_REAL_IP='203.0.113.7',
            HTTP_X_FORWARDED_FOR='203.0.113.7, 198.51.100.5',
            REMOTE_ADDR='127.0.0.1'
        )
        assert get_client_ip(request) == '198.51.100.5'

    def test_docker_gateway_trusted_proxy_extracts_client_ip(self, rf):
        """
        Default TRUSTED_PROXIES includes Docker bridge subnets (172.16.0.0/12).
        A request arriving from a host reverse proxy over a Docker bridge gateway (172.18.0.1)
        correctly extracts the real client IP.
        """
        request = rf.get(
            '/',
            HTTP_X_FORWARDED_FOR='198.51.100.42',
            REMOTE_ADDR='172.18.0.1'
        )
        assert get_client_ip(request) == '198.51.100.42'

    @override_settings(TRUSTED_PROXIES=['127.0.0.1', '::1', '10.0.0.0/8'])
    def test_multi_hop_trusted_proxies(self, rf):
        """
        With multi-hop proxies, intermediate trusted proxies (e.g. 10.0.1.5) in XFF
        are skipped until the right-most untrusted IP is reached.
        """
        request = rf.get(
            '/',
            HTTP_X_FORWARDED_FOR='spoofed.ip, 198.51.100.42, 10.0.1.5',
            REMOTE_ADDR='127.0.0.1'
        )
        assert get_client_ip(request) == '198.51.100.42'

    def test_trusted_proxy_falls_back_to_x_real_ip_when_no_xff(self, rf):
        """
        When REMOTE_ADDR is trusted and X-Forwarded-For is absent, X-Real-IP
        provided by the proxy is used.
        """
        request = rf.get(
            '/',
            HTTP_X_REAL_IP='198.51.100.5',
            REMOTE_ADDR='127.0.0.1'
        )
        assert get_client_ip(request) == '198.51.100.5'

    def test_direct_connection_without_forwarding_headers(self, rf):
        """Standard direct connection without proxy headers returns REMOTE_ADDR."""
        request = rf.get('/', REMOTE_ADDR='198.51.100.5')
        assert get_client_ip(request) == '198.51.100.5'

    def test_intranet_client_cannot_spoof_with_default_proxies(self, rf):
        """
        In an intranet deployment (192.168.x.x or 10.x.x.x) where clients connect directly
        without a reverse proxy, the client's direct connection must NOT be treated as a trusted proxy.
        Any spoofed X-Forwarded-For or X-Real-IP must be ignored.
        """
        request_192 = rf.get(
            '/',
            HTTP_X_REAL_IP='203.0.113.7',
            HTTP_X_FORWARDED_FOR='203.0.113.7',
            REMOTE_ADDR='192.168.1.50'
        )
        assert get_client_ip(request_192) == '192.168.1.50'

        request_10 = rf.get(
            '/',
            HTTP_X_REAL_IP='203.0.113.7',
            HTTP_X_FORWARDED_FOR='203.0.113.7',
            REMOTE_ADDR='10.1.2.3'
        )
        assert get_client_ip(request_10) == '10.1.2.3'

    def test_watermark_text_renders_real_ip_not_spoofed_x_real_ip(self, rf):
        """
        Watermark rendering with {{ip-address}} must stamp the real client IP,
        not the spoofed X-Real-IP header.
        """
        request = rf.get(
            '/',
            HTTP_X_REAL_IP='203.0.113.7',
            REMOTE_ADDR='198.51.100.5'
        )
        watermark = _render_watermark_text('Confidential - {{ip-address}}', request, 'test@example.com')
        assert '203.0.113.7' not in watermark
        assert '198.51.100.5' in watermark


class TestConfigureNginxRealIp:
    def test_generates_default_private_network_directives(self, monkeypatch):
        ep = _load_entrypoint_module()
        with tempfile.TemporaryDirectory() as tmpdir:
            monkeypatch.setenv("RUNTIME_DIR", tmpdir)
            monkeypatch.delenv("TRUSTED_PROXIES", raising=False)
            monkeypatch.delenv("REAL_IP_HEADER", raising=False)

            ep.configure_nginx_real_ip()

            conf_path = os.path.join(tmpdir, "nginx", "real-ip.conf")
            assert os.path.exists(conf_path)
            content = open(conf_path).read()

            assert "set_real_ip_from 127.0.0.1;" in content
            assert "set_real_ip_from 172.16.0.0/12;" in content
            assert "10.0.0.0/8" not in content
            assert "192.168.0.0/16" not in content
            assert "real_ip_header X-Forwarded-For;" in content
            assert "real_ip_recursive on;" in content

    def test_generates_custom_proxies_from_env(self, monkeypatch):
        ep = _load_entrypoint_module()
        with tempfile.TemporaryDirectory() as tmpdir:
            monkeypatch.setenv("RUNTIME_DIR", tmpdir)
            monkeypatch.setenv("TRUSTED_PROXIES", "10.1.2.3, 192.168.10.0/24")
            monkeypatch.setenv("REAL_IP_HEADER", "X-Real-IP")

            ep.configure_nginx_real_ip()

            conf_path = os.path.join(tmpdir, "nginx", "real-ip.conf")
            content = open(conf_path).read()

            assert "set_real_ip_from 10.1.2.3;" in content
            assert "set_real_ip_from 192.168.10.0/24;" in content
            assert "real_ip_header X-Real-IP;" in content
            assert "172.16.0.0/12" not in content

    def test_ignores_invalid_proxies_and_sanitizes_header(self, monkeypatch):
        ep = _load_entrypoint_module()
        with tempfile.TemporaryDirectory() as tmpdir:
            monkeypatch.setenv("RUNTIME_DIR", tmpdir)
            monkeypatch.setenv("TRUSTED_PROXIES", "10.1.2.3, invalid/33, not_an_ip, 192.168.1.0/24")
            monkeypatch.setenv("REAL_IP_HEADER", "Bad Header; injection")

            ep.configure_nginx_real_ip()

            conf_path = os.path.join(tmpdir, "nginx", "real-ip.conf")
            content = open(conf_path).read()

            assert "set_real_ip_from 10.1.2.3;" in content
            assert "set_real_ip_from 192.168.1.0/24;" in content
            assert "invalid/33" not in content
            assert "not_an_ip" not in content
            # Malformed header should fall back to X-Forwarded-For
            assert "real_ip_header X-Forwarded-For;" in content
            assert "injection" not in content


class TestEntrypointProcessLifecycle:
    def test_custom_command_uses_execvp_with_gosu(self, monkeypatch):
        """Custom container commands must replace the entrypoint via execvp with gosu."""
        ep = _load_entrypoint_module()
        monkeypatch.setattr(ep, "initialize_logdir", MagicMock())
        monkeypatch.setattr(ep, "change_ugid", MagicMock())
        monkeypatch.setattr(ep, "configure_nginx_real_ip", MagicMock())
        monkeypatch.setenv("APP_DIR", "/app")
        monkeypatch.setattr(os, "chdir", MagicMock())

        mock_execvp = MagicMock()
        monkeypatch.setattr(os, "execvp", mock_execvp)

        ep.main(["entrypoint.py", "celery", "-A", "backend", "worker"])

        mock_execvp.assert_called_once_with(
            "gosu",
            ["gosu", "coneshare", "celery", "-A", "backend", "worker"],
        )

    def test_coneshare_command_runs_supervisord_and_handles_signals(self, monkeypatch):
        """Coneshare command runs supervisord in foreground, forwards SIGTERM, and exits with returncode."""
        ep = _load_entrypoint_module()
        monkeypatch.setattr(ep, "initialize_logdir", MagicMock())
        monkeypatch.setattr(ep, "change_ugid", MagicMock())
        monkeypatch.setattr(ep, "configure_nginx_real_ip", MagicMock())
        monkeypatch.setenv("APP_DIR", "/app")
        monkeypatch.setattr(os, "chdir", MagicMock())

        signal_handlers = {}
        def mock_signal(sig, handler):
            signal_handlers[sig] = handler

        monkeypatch.setattr(signal, "signal", mock_signal)
        mock_check_call = MagicMock()
        monkeypatch.setattr(ep, "check_call", mock_check_call)

        mock_supervisord = MagicMock()
        mock_supervisord.wait.return_value = 0

        mock_popen = MagicMock(side_effect=[mock_supervisord, MagicMock()])
        monkeypatch.setattr(ep, "Popen", mock_popen)
        monkeypatch.setattr(ep.time, "sleep", MagicMock())

        mock_exit = MagicMock(side_effect=SystemExit(0))
        monkeypatch.setattr(ep.sys, "exit", mock_exit)

        with pytest.raises(SystemExit):
            ep.main(["entrypoint.py", "coneshare"])

        assert signal.SIGTERM in signal_handlers
        assert signal.SIGINT in signal_handlers

        # Verify supervisord started with -n (foreground)
        assert mock_popen.call_args_list[0][0][0] == [
            "supervisord", "-n", "-c", "/home/coneshare/runtime/supervisord/supervisord.conf"
        ]

        # Trigger SIGTERM handler
        signal_handlers[signal.SIGTERM](signal.SIGTERM, None)
        mock_supervisord.terminate.assert_called_once()
        mock_exit.assert_called_once_with(0)

