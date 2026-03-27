#!/usr/bin/env python3
"""
Script para resetear la contraseña del administrador
"""
import bcrypt
import sys

def generate_hash(password):
    """Genera un hash bcrypt para la contraseña"""
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def main():
    print("=" * 60)
    print("RESET DE CONTRASEÑA - VTV Capturadora 2.0")
    print("=" * 60)
    print()
    
    if len(sys.argv) > 1:
        new_password = sys.argv[1]
    else:
        new_password = input("Ingresa la nueva contraseña de administrador: ")
    
    if len(new_password) < 6:
        print("❌ Error: La contraseña debe tener al menos 6 caracteres")
        sys.exit(1)
    
    # Generar hash
    hashed = generate_hash(new_password)
    
    print()
    print("✅ Hash generado exitosamente")
    print()
    print("Copia esta línea en tu archivo .env:")
    print("-" * 60)
    print(f"ADMIN_PASS={hashed}")
    print("-" * 60)
    print()
    print("Pasos siguientes:")
    print("1. Edita el archivo .env")
    print("2. Reemplaza la línea ADMIN_PASS con la nueva")
    print("3. Reinicia el servidor: pkill -f 'python.*main.py' && python3 main.py &")
    print()
    print(f"Usuario: administrador (o 'admin')")
    print(f"Contraseña: {new_password}")
    print()

if __name__ == "__main__":
    main()
