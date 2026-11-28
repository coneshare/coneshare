import json
import math
import re
from collections import Counter
from starlette.testclient import TestClient

from coneshare_mcp import __version__
from coneshare_mcp.config import Settings
from coneshare_mcp.server import SERVER_INSTRUCTIONS, create_mcp_server
from tests.base import BaseMCPTestCase


def _build_bm25_index(tools):
    docs = []
    for tool in tools:
        schema_props = (tool.parameters or {}).get("properties", {})
        param_bits = []
        for pname, pmeta in schema_props.items():
            if pname == "ctx":
                continue
            desc = pmeta.get("description", "") if isinstance(pmeta, dict) else ""
            param_bits.append(f"{pname} {desc}")
        text = f"{tool.name} {tool.name.replace('_', ' ')} {tool.description or ''} {' '.join(param_bits)}"
        tokens = re.findall(r"[a-z0-9]+", text.lower())
        docs.append((tool.name, tokens, len(tokens)))

    total_docs = len(docs)
    avgdl = sum(d[2] for d in docs) / total_docs
    df = Counter()
    for _, toks, _ in docs:
        for w in set(toks):
            df[w] += 1

    def rank(query: str, k1: float = 1.5, b: float = 0.75) -> list[str]:
        qtoks = re.findall(r"[a-z0-9]+", query.lower())
        scored = []
        for name, toks, dl in docs:
            tf = Counter(toks)
            score = 0.0
            for q in qtoks:
                if df[q] == 0:
                    continue
                idf = math.log((total_docs - df[q] + 0.5) / (df[q] + 0.5) + 1.0)
                freq = tf[q]
                score += idf * (freq * (k1 + 1.0)) / (freq + k1 * (1.0 - b + b * dl / avgdl))
            scored.append((score, name))
        scored.sort(reverse=True)
        return [name for _, name in scored]

    return rank


class TestMCPServer(BaseMCPTestCase):
    @staticmethod
    def _test_settings(oauth_enabled: bool = False) -> Settings:
        return Settings(
            api_url="http://backend:8000/api/v1",
            mcp_transport="streamable-http",
            mcp_host="127.0.0.1",
            mcp_port=8001,
            mcp_path="/mcp/sse",
            oauth_enabled=oauth_enabled,
            site_domain="https://app.coneshare.com" if oauth_enabled else "",
        )

    async def test_server_registers_35_tools_with_expected_names_and_tags(self):
        server = create_mcp_server(self._test_settings())
        all_tools = await server.list_tools(run_middleware=False)
        self.assertEqual(len(all_tools), 35)

        by_name = {tool.name: tool for tool in all_tools}
        self.assertNotIn("get_document", by_name)
        self.assertNotIn("update_document", by_name)
        self.assertIn("get_document_metadata", by_name)
        self.assertIn("update_document_metadata", by_name)
        self.assertIn("list_folders", by_name)

        for name, tool in by_name.items():
            tags = set(tool.tags or ())
            self.assertTrue(tags & {"core", "folders", "destructive", "admin"}, f"{name} missing functional tag")
            self.assertTrue(tags & {"read", "write"}, f"{name} missing mutability tag")

        core_tools = {n for n, t in by_name.items() if "core" in t.tags}
        folder_tools = {n for n, t in by_name.items() if "folders" in t.tags}
        destructive_tools = {n for n, t in by_name.items() if "destructive" in t.tags}
        admin_tools = {n for n, t in by_name.items() if "admin" in t.tags}
        viewer_analytics_tools = {n for n, t in by_name.items() if "viewer_analytics" in t.tags}

        self.assertEqual(len(core_tools), 24)
        self.assertEqual(folder_tools, {"list_folders", "create_folder", "update_folder", "delete_folder", "move_items"})
        self.assertEqual(
            destructive_tools,
            {"delete_document", "delete_folder", "delete_dataroom", "remove_content_from_dataroom"},
        )
        self.assertEqual(admin_tools, {"list_admin_users", "get_admin_user_details", "list_login_activities"})
        self.assertEqual(viewer_analytics_tools, {"list_view_sessions", "get_view_session"})

    def test_server_exposes_version_and_instructions_on_initialize(self):
        server = create_mcp_server(self._test_settings())
        self.assertEqual(server.version, __version__)
        self.assertEqual(server.instructions, SERVER_INSTRUCTIONS)
        self.assertIn("?toolsets=admin", server.instructions or "")
        self.assertIn("?toolsets=core", server.instructions or "")

        app = server.http_app(path="/mcp/sse", transport="streamable-http")
        with TestClient(app) as client:
            res = client.post(
                "/mcp/sse",
                json={
                    "jsonrpc": "2.0",
                    "id": 1,
                    "method": "initialize",
                    "params": {
                        "protocolVersion": "2025-03-26",
                        "capabilities": {},
                        "clientInfo": {"name": "test", "version": "1.0"},
                    },
                },
                headers={"Accept": "application/json, text/event-stream"},
            )
        self.assertEqual(res.status_code, 200)
        data_line = next(line[6:] for line in res.text.splitlines() if line.startswith("data: "))
        payload = json.loads(data_line)
        result = payload["result"]
        self.assertEqual(result["serverInfo"]["version"], __version__)
        self.assertIn("get_dataroom", result["instructions"])

    async def test_reproducible_bm25_top5_ranking(self):
        server = create_mcp_server(self._test_settings())
        default_tools = await server.list_tools(run_middleware=True)
        self.assertEqual(len(default_tools), 32)
        rank = _build_bm25_index(default_tools)

        expected_top5 = {
            "share link": "list_share_links",
            "share links": "list_share_links",
            "update markdown document content": "update_text_document",
            "get document metadata": "get_document_metadata",
            "list folders": "list_folders",
            "search documents": "search_documents",
        }
        for query, expected_tool in expected_top5.items():
            with self.subTest(query=query):
                top5 = rank(query)[:5]
                self.assertIn(expected_tool, top5, f"Expected {expected_tool!r} in Top 5 for {query!r}, got {top5}")
        # Primary content/metadata targets should rank #1 ahead of metadata/copy distractors
        self.assertEqual(rank("update markdown document content")[0], "update_text_document")
        self.assertEqual(rank("get document metadata")[0], "get_document_metadata")
