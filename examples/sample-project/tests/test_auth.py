from routes.auth import create_user


def test_create_user_with_valid_payload():
    payload = {"username": "afra", "email_address": "afra@example.com"}
    user = create_user(payload)
    assert user["email"] == "afra@example.com"
