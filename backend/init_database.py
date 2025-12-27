#!/usr/bin/env python3
"""Database initialization script for Voxalyze"""
import sqlite3
import os

DB_PATH = "expenses.db"

def init_database():
    """Initialize or migrate the database"""
    print(f"Initializing database at {DB_PATH}...")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if tables exist
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing_tables = [row[0] for row in cursor.fetchall()]

    print(f"Existing tables: {existing_tables}")

    # Create users table
    print("Creating users table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # Handle expenses table migration
    if 'expenses' in existing_tables:
        print("Expenses table exists, checking for user_id column...")

        # Check if user_id column exists
        cursor.execute("PRAGMA table_info(expenses)")
        columns = [row[1] for row in cursor.fetchall()]

        if 'user_id' not in columns:
            print("Migrating expenses table to add user_id column...")

            # Create new table with user_id
            cursor.execute("""
                CREATE TABLE expenses_new (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER,
                    store TEXT NOT NULL,
                    items TEXT NOT NULL,
                    category TEXT,
                    amount REAL,
                    date TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id)
                )
            """)

            # Copy existing data (will have NULL user_id for old records)
            cursor.execute("""
                INSERT INTO expenses_new (id, user_id, store, items, category, amount, date, created_at)
                SELECT id, NULL, store, items, category, amount, date, created_at FROM expenses
            """)

            # Drop old table
            cursor.execute("DROP TABLE expenses")

            # Rename new table
            cursor.execute("ALTER TABLE expenses_new RENAME TO expenses")

            print("Migration complete - old expenses will have NULL user_id")
        else:
            print("user_id column already exists")
    else:
        print("Creating expenses table...")
        cursor.execute("""
            CREATE TABLE expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                store TEXT NOT NULL,
                items TEXT NOT NULL,
                category TEXT,
                amount REAL,
                date TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)

    conn.commit()

    # Verify tables
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print(f"\nFinal tables: {[t[0] for t in tables]}")

    # Check user count
    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    print(f"Users in database: {user_count}")

    # Check expense count
    cursor.execute("SELECT COUNT(*) FROM expenses")
    expense_count = cursor.fetchone()[0]
    print(f"Expenses in database: {expense_count}")

    conn.close()
    print("\nDatabase initialization complete!")

if __name__ == "__main__":
    init_database()
