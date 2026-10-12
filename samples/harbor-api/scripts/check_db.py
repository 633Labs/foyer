import os

url = os.environ["DATABASE_URL"]
print(f"checking {url.split('@')[-1]}")
