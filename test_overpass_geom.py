import httpx
import json

lat_min, lat_max, lon_min, lon_max = 18.45, 18.58, 73.78, 73.92
overpass_query = f"""
[out:json][timeout:30];
(
  way["natural"="water"]({lat_min},{lon_min},{lat_max},{lon_max});
  way["waterway"]({lat_min},{lon_min},{lat_max},{lon_max});
);
out geom;
(
  way["highway"~"trunk|primary|secondary|tertiary"]({lat_min},{lon_min},{lat_max},{lon_max});
  node["place"~"suburb|quarter|neighbourhood"]({lat_min},{lon_min},{lat_max},{lon_max});
);
out center;
"""

resp = httpx.post("http://overpass-api.de/api/interpreter", data={"data": overpass_query}, timeout=35)
data = resp.json().get("elements", [])
print(f"Fetched {len(data)} elements.")
if data:
    for el in data[:5]:
        print(el["type"], "tags:", el.get("tags", {}).keys(), "geom:", "geometry" in el)
