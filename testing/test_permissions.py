from uuid import uuid4

import pytest
from fastapi import HTTPException

from BackEnd.app import permissions
from BackEnd.app.permissions import handover_access, matches_employee, require_write_access
from BackEnd.app.schemas import CurrentUser, Role

HANDOVER = {
    "id": "h1",
    "departing_employee": "out@co.com",
    "incoming_employee": "in@co.com",
}


def make_user(email="x@co.com", role=Role.employee, verified=True):
    return CurrentUser(id="u1", email=email, email_verified=verified, role=role)


@pytest.fixture(autouse=True)
def fake_db(monkeypatch):
    monkeypatch.setattr(permissions, "fetch_handover", lambda hid: dict(HANDOVER))
    monkeypatch.setattr(permissions, "get_member_role", lambda hid, uid: None)


def test_matches_requires_verified_email():
    assert matches_employee(make_user("OUT@co.com"), "out@co.com")
    assert not matches_employee(make_user("out@co.com", verified=False), "out@co.com")


def test_admin_can_access():
    assert handover_access(uuid4(), make_user(role=Role.admin))["id"] == "h1"


def test_departing_employee_can_access():
    assert handover_access(uuid4(), make_user("out@co.com"))["member_role"] is None


def test_stranger_gets_404():
    with pytest.raises(HTTPException) as exc:
        handover_access(uuid4(), make_user("nobody@co.com"))
    assert exc.value.status_code == 404


def test_member_can_access_and_viewer_is_read_only(monkeypatch):
    monkeypatch.setattr(permissions, "get_member_role", lambda hid, uid: "viewer")
    handover = handover_access(uuid4(), make_user("nobody@co.com"))
    assert handover["member_role"] == "viewer"
    with pytest.raises(HTTPException) as exc:
        require_write_access(handover, make_user("nobody@co.com"))
    assert exc.value.status_code == 403


def test_contributor_member_can_write(monkeypatch):
    monkeypatch.setattr(permissions, "get_member_role", lambda hid, uid: "contributor")
    handover = handover_access(uuid4(), make_user("nobody@co.com"))
    require_write_access(handover, make_user("nobody@co.com"))