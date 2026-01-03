#!/usr/bin/env python3
"""
Database initialization script for Voxalyze

This script:
- Creates the database tables (users, expenses) if they don't exist
- Handles database migrations (e.g., adding user_id column to expenses table)
- Can be run standalone to initialize or update the database schema
- Preserves existing data during migrations
"""

# ============================================================================
# IMPORTS
# ============================================================================
import sqlite3
import os

# ============================================================================
# CONFIGURATION
# ============================================================================
DB_PATH = "voxalyze.db"

# ============================================================================
# DATABASE INITIALIZATION FUNCTION
# ============================================================================

def init_database():
    """
    Initialize or migrate the database schema.
    
    This function:
    1. Creates the 'users' table if it doesn't exist
    2. Creates or migrates the 'expenses' table:
       - If expenses table exists but lacks 'user_id' column, migrates it
       - If expenses table doesn't exist, creates it with full schema
    3. Verifies tables and displays database statistics
    
    Migration Strategy:
    - When adding user_id to existing expenses table:
      * Creates a new table with the updated schema
      * Copies all existing data (with NULL user_id for old records)
      * Drops the old table and renames the new one
      * This preserves all existing expense data
    """
    print(f"Initializing database at {DB_PATH}...")

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # ------------------------------------------------------------------------
    # Check Existing Tables
    # ------------------------------------------------------------------------
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing_tables = [row[0] for row in cursor.fetchall()]
    print(f"Existing tables: {existing_tables}")

    # ------------------------------------------------------------------------
    # Create Users Table
    # ------------------------------------------------------------------------
    print("Creating users table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
    """)

    # ------------------------------------------------------------------------
    # Handle Expenses Table (Create or Migrate)
    # ------------------------------------------------------------------------
    if 'expenses' in existing_tables:
        print("Expenses table exists, checking for user_id column...")

        # Check if user_id column exists
        cursor.execute("PRAGMA table_info(expenses)")
        columns = [row[1] for row in cursor.fetchall()]

        if 'user_id' not in columns:
            # --------------------------------------------------------------------
            # Migration: Add user_id column to existing expenses table
            # --------------------------------------------------------------------
            print("Migrating expenses table to add user_id column...")

            # Step 1: Create new table with updated schema (includes user_id)
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

            # Step 2: Copy existing data (old records will have NULL user_id)
            cursor.execute("""
                INSERT INTO expenses_new (id, user_id, store, items, category, amount, date, created_at)
                SELECT id, NULL, store, items, category, amount, date, created_at FROM expenses
            """)

            # Step 3: Drop old table
            cursor.execute("DROP TABLE expenses")

            # Step 4: Rename new table to replace the old one
            cursor.execute("ALTER TABLE expenses_new RENAME TO expenses")

            print("Migration complete - old expenses will have NULL user_id")
        else:
            print("user_id column already exists")
    else:
        # --------------------------------------------------------------------
        # Create Expenses Table (First Time)
        # --------------------------------------------------------------------
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

    # ------------------------------------------------------------------------
    # Create Budgets Table
    # ------------------------------------------------------------------------
    print("Creating budgets table...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            amount REAL NOT NULL,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            recurring INTEGER DEFAULT 0,
            repeat_interval INTEGER DEFAULT NULL,
            repeat_unit TEXT DEFAULT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id),
            UNIQUE(user_id, category, month, year)
        )
    """)
    
    # Add recurring columns if they don't exist (migration)
    for column, col_type in [("recurring", "INTEGER DEFAULT 0"), ("repeat_interval", "INTEGER DEFAULT NULL"), ("repeat_unit", "TEXT DEFAULT NULL")]:
        try:
            cursor.execute(f"ALTER TABLE budgets ADD COLUMN {column} {col_type}")
            conn.commit()
            print(f"Added {column} column to budgets table")
        except sqlite3.OperationalError:
            pass  # Column already exists

    # Commit all changes
    conn.commit()

    # ------------------------------------------------------------------------
    # Verification & Statistics
    # ------------------------------------------------------------------------
    # Verify tables were created successfully
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = cursor.fetchall()
    print(f"\nFinal tables: {[t[0] for t in tables]}")

    # Display user count
    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]
    print(f"Users in database: {user_count}")

    # Display expense count
    cursor.execute("SELECT COUNT(*) FROM expenses")
    expense_count = cursor.fetchone()[0]
    print(f"Expenses in database: {expense_count}")

    # Display budget count
    cursor.execute("SELECT COUNT(*) FROM budgets")
    budget_count = cursor.fetchone()[0]
    print(f"Budgets in database: {budget_count}")

    conn.close()
    print("\nDatabase initialization complete!")

# ============================================================================
# SCRIPT ENTRY POINT
# ============================================================================

if __name__ == "__main__":
    """
    Run this script directly to initialize or migrate the database.
    
    Usage:
        python init_database.py
    
    This is useful for:
    - Setting up a new database from scratch
    - Running migrations when the schema changes
    - Verifying database structure
    """
    init_database()
