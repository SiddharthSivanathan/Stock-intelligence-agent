"""Tests for app.ai.agents.output_parser — the JSON-extraction half."""
from __future__ import annotations

from app.ai.agents.output_parser import extract_json_text


class TestExtractJsonText:
    def test_plain_object(self):
        assert extract_json_text('{"a": 1}') == '{"a": 1}'

    def test_plain_array(self):
        assert extract_json_text("[1,2,3]") == "[1,2,3]"

    def test_fenced_json(self):
        raw = "Here's the JSON:\n```json\n{\"a\": 1}\n```\nthanks"
        assert extract_json_text(raw) == '{"a": 1}'

    def test_fenced_no_lang_tag(self):
        raw = "```\n{\"x\": [1,2]}\n```"
        assert extract_json_text(raw) == '{"x": [1,2]}'

    def test_prose_with_trailing_object(self):
        raw = 'Sure! Here is the result: {"action": "buy"} hope that helps!'
        assert extract_json_text(raw) == '{"action": "buy"}'

    def test_prose_with_trailing_array(self):
        raw = 'Result: [1, 2, 3] done.'
        assert extract_json_text(raw) == '[1, 2, 3]'

    def test_empty_input(self):
        assert extract_json_text("") == ""

    def test_whitespace_stripped(self):
        assert extract_json_text("   \n  {\"a\":1}  \n").startswith("{")

    def test_nested_objects_preserved(self):
        raw = '{"a": {"b": {"c": 1}}}'
        assert extract_json_text(raw) == raw

    def test_no_json_in_text_returns_input(self):
        raw = "just text with no braces"
        assert extract_json_text(raw) == raw
