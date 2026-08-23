import requests

BASE_URL = "http://127.0.0.1:8000/api"

def setup_test_data():
    print("Initializing Database with Test Data...")

    # 1. Register Super Admin
    print("\n[+] Registering Super Admin...")
    try:
        res = requests.post(f"{BASE_URL}/superadmin/register", json={
            "email": "superadmin@example.com",
            "password": "superpassword"
        })
        if res.status_code == 200:
            print("Super Admin registered successfully!")
        else:
            print(f"Skipped: {res.json()['detail']}")
    except Exception as e:
        print(f"Error connecting to server. Is it running? {e}")
        return

    # 2. Login as Super Admin
    print("\n[+] Logging in as Super Admin...")
    login = requests.post(f"{BASE_URL}/token", data={
        "username": "superadmin@example.com",
        "password": "superpassword"
    })
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 3. Create a Community
    print("\n[+] Creating 'AJS' Community...")
    comm_res = requests.post(f"{BASE_URL}/communities/", json={
        "name": "AJS",
        "address": "123 Palm Tree Lane"
    }, headers=headers)
    community_id = comm_res.json()["id"]
    print(f"Community created with ID: {community_id}")

    # 4. Add a Resident to AJS
    print("\n[+] Adding a Resident User...")
    user_res = requests.post(f"{BASE_URL}/users/?community_id={community_id}", json={
        "email": "resident@example.com",
        "name": "John Doe",
        "password": "password123",
        "role": "resident"
    }, headers=headers)
    print("Resident added successfully!")

    print("\n=== SETUP COMPLETE ===")
    print("You can now login to the UI with:")
    print("Email: resident@example.com")
    print("Password: password123")

if __name__ == "__main__":
    setup_test_data()
