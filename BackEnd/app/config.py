from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")

    supabase_url: str
    supabase_publishable_key: str
    supabase_service_role_key: str
    frontend_origin: str = "http://localhost:5173"


settings = Settings()