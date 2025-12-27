#!/usr/bin/env python3
"""Verify that the authentication system is set up correctly"""
import sys

def check_imports():
    """Check that required packages are installed"""
    print("Checking imports...")
    try:
        import bcrypt
        print("✓ bcrypt imported successfully")
    except ImportError:
        print("✗ bcrypt not installed - run: pip install -r requirements.txt")
        return False

    try:
        from jose import jwt
        print("✓ python-jose imported successfully")
    except ImportError:
        print("✗ python-jose not installed - run: pip install -r requirements.txt")
        return False

    try:
        import fastapi
        print("✓ fastapi imported successfully")
    except ImportError:
        print("✗ fastapi not installed - run: pip install -r requirements.txt")
        return False

    return True

def check_bcrypt_version():
    """Check that we're using the direct bcrypt implementation"""
    print("\nChecking bcrypt implementation...")
    try:
        import bcrypt
        # Test that we can hash and verify
        password = "test123"
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
        verified = bcrypt.checkpw(password.encode('utf-8'), hashed)
        if verified:
            print("✓ bcrypt hashing works correctly")
            return True
        else:
            print("✗ bcrypt verification failed")
            return False
    except Exception as e:
        print(f"✗ bcrypt error: {e}")
        return False

def check_jwt():
    """Check that JWT encoding/decoding works"""
    print("\nChecking JWT...")
    try:
        from jose import jwt
        from datetime import datetime, timedelta

        SECRET_KEY = "test-secret-key"
        ALGORITHM = "HS256"

        # Create token with string subject (per JWT spec)
        token_data = {"sub": "1"}
        expire = datetime.utcnow() + timedelta(minutes=10)
        token_data.update({"exp": expire})

        token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        if payload.get("sub") == "1":
            print("✓ JWT encoding/decoding works correctly")
            return True
        else:
            print("✗ JWT payload incorrect")
            return False
    except Exception as e:
        print(f"✗ JWT error: {e}")
        return False

def check_database():
    """Check that database can be created"""
    print("\nChecking database...")
    try:
        import sqlite3
        import os

        # Check if database exists
        if os.path.exists("expenses.db"):
            print("✓ Database file exists")

            # Check tables
            conn = sqlite3.connect("expenses.db")
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            conn.close()

            if "users" in tables and "expenses" in tables:
                print(f"✓ Database tables exist: {tables}")
                return True
            else:
                print(f"⚠ Database exists but missing tables. Found: {tables}")
                print("  Run: python3 init_database.py")
                return False
        else:
            print("⚠ Database doesn't exist yet")
            print("  It will be created when you start the server")
            print("  Or run: python3 init_database.py")
            return True  # Not an error, will be created
    except Exception as e:
        print(f"✗ Database error: {e}")
        return False

def main():
    print("=" * 60)
    print("Authentication System Verification")
    print("=" * 60)

    all_checks = [
        check_imports(),
        check_bcrypt_version(),
        check_jwt(),
        check_database()
    ]

    print("\n" + "=" * 60)
    if all(all_checks):
        print("✓ ALL CHECKS PASSED!")
        print("\nYou're ready to start the server:")
        print("  python3 -m uvicorn main:app --host 0.0.0.0 --port 8000")
        print("\nOr run the server with:")
        print("  python3 main.py")
        return 0
    else:
        print("✗ SOME CHECKS FAILED")
        print("\nPlease fix the issues above before starting the server.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
