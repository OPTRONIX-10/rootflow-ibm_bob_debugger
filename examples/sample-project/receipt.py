def format_receipt(user: dict, amount: float) -> str:
    return f"Receipt for {user['username']}: ${amount:.2f}"
