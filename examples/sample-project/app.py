from routes.auth import create_user


def handle_signup(payload: dict):
    user = create_user(payload)
    print(f"Created user: {user['email']}")
    return user


if __name__ == "__main__":
    handle_signup({"username": "afra", "email_address": "afra@example.com"})
