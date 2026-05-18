from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: str
    handle: str = Field(min_length=3, max_length=50)
    display_name: str = Field(min_length=2, max_length=120)
    bio: str | None = None
    base_city: str | None = None
    specialties: str | None = None
    website_url: str | None = None
    instagram_url: str | None = None
    licensing_available: bool = False
    scout_for_hire: bool = False
    hourly_rate_note: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user_id: int
    role: str
    handle: str


class MeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    role: str
    is_active: bool
    handle: str | None = None
