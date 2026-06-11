import re
import urllib.request
import json

with open("quiniela-app/src/App.jsx", "r", encoding="utf-8") as f:
    code = f.read()

url_match = re.search(r"supabaseUrl\s*=\s*'([^']+)'", code)
key_match = re.search(r"supabaseAnonKey\s*=\s*'([^']+)'", code)

if url_match and key_match:
    url = url_match.group(1) + "/rest/v1/teams?select=id,name"
    key = key_match.group(1)
    req = urllib.request.Request(url, headers={"apikey": key})
    try:
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read().decode())
            print(json.dumps([{"id": t["id"], "name": t["name"]} for t in data]))
    except Exception as e:
        print(f"Error: {e}")
else:
    print("Could not find credentials")
