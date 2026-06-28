import httpx

lat_min, lat_max = 28.48, 28.64
lon_min, lon_max = 77.05, 77.25

overpass_query = f"""
[out:json];
(
  way["building"]({lat_min},{lon_min},{lat_max},{lon_max});
  way["natural"="water"]({lat_min},{lon_min},{lat_max},{lon_max});
  way["waterway"]({lat_min},{lon_min},{lat_max},{lon_max});
  node["place"~"suburb|quarter|neighbourhood|ward"]({lat_min},{lon_min},{lat_max},{lon_max});
);
out center;
"""

print("Fetching from Overpass...")
resp = httpx.post("http://overpass-api.de/api/interpreter", data={"data": overpass_query}, timeout=30)
elements = resp.json().get("elements", [])
buildings = [e for e in elements if "building" in e.get("tags", {})]
water = [e for e in elements if "natural" in e.get("tags", {}) or "waterway" in e.get("tags", {})]
places = [e for e in elements if "place" in e.get("tags", {})]

print(f"Buildings: {len(buildings)}")
print(f"Water: {len(water)}")
print(f"Places: {len(places)}")
if places:
    print(f"Sample place: {places[0].get('tags', {}).get('name', 'Unknown')}")
