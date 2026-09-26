from models.user_schema import validate_user


def create_user(data: dict) -> dict:
    validated = validate_user(data)
    return {
        "username": validated["username"],
        "email": validated["email"],
    }
