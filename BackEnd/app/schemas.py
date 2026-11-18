from enum import Enum

from pydantic import BaseModel, Field


class Role(str, Enum):
    admin = "admin"
    manager = "manager"
    employee = "employee"
    viewer = "viewer"


class CurrentUser(BaseModel):
    id: str
    email: str | None = None
    role: Role
    email_verified: bool = Field(default=False, exclude=True)


class ProfileOut(BaseModel):
    id: str
    email: str | None = None
    full_name: str | None = None
    role: Role


class RoleUpdate(BaseModel):
    role: Role
