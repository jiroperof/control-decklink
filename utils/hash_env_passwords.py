#!/usr/bin/env python3
"""Script para hashear passwords del .env"""
import bcrypt
import os
from dotenv import load_dotenv

load_dotenv()

def hash_pw(password):
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

# Leer passwords actuales del .env
admin_pass = os.environ.get("ADMIN_PASS", "")
operator_pass = os.environ.get("OPERATOR_PASS", "")

print("="*60)
print("HASHEAR PASSWORDS DEL .ENV")
print("="*60)

if admin_pass and not admin_pass.startswith("$2b$"):
    admin_hash = hash_pw(admin_pass)
    print(f"\n✓ ADMIN_PASS hasheado:")
    print(f"ADMIN_PASS={admin_hash}")
else:
    print("\n✓ ADMIN_PASS ya está hasheado o vacío")

if operator_pass and not operator_pass.startswith("$2b$"):
    operator_hash = hash_pw(operator_pass)
    print(f"\n✓ OPERATOR_PASS hasheado:")
    print(f"OPERATOR_PASS={operator_hash}")
else:
    print("\n✓ OPERATOR_PASS ya está hasheado o vacío")

print("\n" + "="*60)
print("INSTRUCCIONES:")
print("="*60)
print("1. Copia los hashes de arriba")
print("2. Edita el archivo .env:")
print("   nano .env")
print("3. Reemplaza ADMIN_PASS y OPERATOR_PASS con los hashes")
print("4. Guarda y cierra (Ctrl+X, Y, Enter)")
print("5. Reinicia el servidor:")
print("   sudo systemctl restart vtv-decklink")
print("="*60)
