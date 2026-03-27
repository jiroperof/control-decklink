#!/usr/bin/env python3
"""
Script de migración única para hashear passwords existentes.
Ejecutar SOLO UNA VEZ antes del primer arranque con bcrypt.
"""
import bcrypt
import json
import os
from pathlib import Path

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def main():
    base_dir = Path(__file__).parent
    users_db_file = base_dir / "users_db.json"
    
    print("=== Migración de Passwords a bcrypt ===\n")
    
    # 1. Migrar users_db.json
    if users_db_file.exists():
        with open(users_db_file, 'r') as f:
            users_db = json.load(f)
        
        migrated_count = 0
        for username, user_data in users_db.get("users", {}).items():
            password = user_data.get("password", "")
            # Detectar si ya está hasheado (bcrypt empieza con $2b$)
            if password and not password.startswith("$2b$"):
                hashed = hash_password(password)
                user_data["password"] = hashed
                migrated_count += 1
                print(f"✓ Usuario '{username}' migrado")
        
        if migrated_count > 0:
            with open(users_db_file, 'w') as f:
                json.dump(users_db, f, indent=2)
            print(f"\n✓ {migrated_count} usuarios migrados en users_db.json")
        else:
            print("✓ users_db.json ya está migrado o vacío")
    else:
        print("⚠ users_db.json no existe (se creará al primer uso)")
    
    # 2. Instrucciones para .env
    print("\n" + "="*60)
    print("IMPORTANTE: Debes actualizar manualmente tu archivo .env")
    print("="*60)
    print("\nEjecuta estos comandos en Python para hashear tus passwords:\n")
    print("import bcrypt")
    print("def hash_pw(p): return bcrypt.hashpw(p.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')")
    print("\n# Luego hashea cada password:")
    print("print(hash_pw('tu_password_admin'))")
    print("print(hash_pw('tu_password_operador'))")
    print("\nReemplaza en .env:")
    print("ADMIN_PASS=<hash_generado>")
    print("OPERATOR_PASS=<hash_generado>")
    print("\n⚠ GUARDA LOS PASSWORDS ORIGINALES EN UN LUGAR SEGURO")
    print("="*60)

if __name__ == "__main__":
    main()
