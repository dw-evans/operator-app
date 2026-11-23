from pydantic import BaseModel


class PinVerifyRequest(BaseModel):
    pin: str


class PinVerifyResponse(BaseModel):
    valid: bool
    pin_required: bool
