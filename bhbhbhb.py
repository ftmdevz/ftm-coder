import os, json, requests

API_KEY = os.getenv("AGENTROUTER_API_KEY")
if not API_KEY:
    raise SystemExit("Set key first: export AGENTROUTER_API_KEY='your_key'")

url = "https://agentrouter.org/v1/chat/completions"

payload = {
    "model": "gpt-5",
    "messages": [
        {"role": "user", "content": "Say hi in Hinglish"}
    ]
}

res = requests.post(
    url,
    headers={
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0"
    },
    json=payload,
    timeout=60
)

print("STATUS:", res.status_code)
print("CONTENT-TYPE:", res.headers.get("content-type"))

try:
    data = res.json()
    print(data["choices"][0]["message"]["content"])
except Exception:
    print(res.text[:1000])
