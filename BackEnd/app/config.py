from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE)

    supabase_url: str
    supabase_publishable_key: str
    supabase_service_role_key: str
    frontend_origin: str = "http://localhost:5173"


settings = Settings()