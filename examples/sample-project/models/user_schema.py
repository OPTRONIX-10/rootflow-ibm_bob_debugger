USER_SCHEMA = {
    "required_fields": ["username", "email_address"],
}


def validate_user(data: dict) -> dict:
    for field in USER_SCHEMA["required_fields"]:
        if field not in data:
            raise ValueError(f"Missing required field: {field}")
    return data
