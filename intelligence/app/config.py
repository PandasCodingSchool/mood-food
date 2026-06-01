from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    unsplash_access_key: str = ""
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
