TOKEN_EXPIRY_SECONDS = 7200


def issue_token(user_id: str) -> str:
    return f"token-for-{user_id}-expires-in-{TOKEN_EXPIRY_SECONDS}"
