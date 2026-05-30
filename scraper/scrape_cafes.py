import os
 import json
 import time
 import requests
 from dotenv import load_dotenv
 from tqdm import tqdm
 import pandas as pd

 load_dotenv()

 GEOAPIFY_KEY = os.getenv("GEOAPIFY_API_KEY")
 GOOGLE_KEY = os.getenv("GOOGLE_PLACES_API_KEY")

 # Greater Melbourne bounding box (approx)
 BBOX = {
     "min_lon": 144.3,
     "min_lat": -38.5,
     "max_lon": 145.5,
     "max_lat": -37.4
 }

 def get_cafes_geoapify():
     print("Fetching cafes from Geoapify...")
     url = "https://api.geoapify.com/v2/places"
     params = {
         "categories": "catering.cafe,catering.coffee_shop",
         "filter": f"rect:{BBOX['min_lon']},{BBOX['min_lat']},{BBOX['max_lon']},{BBOX['max_lat']}",
         "limit": 500,
         "apiKey": GEOAPIFY_KEY
     }

     all_cafes = []
     offset = 0

     while True:
         params["offset"] = offset
         response = requests.get(url, params=params)
         if response.status_code != 200:
             print("Error:", response.text)
             break

         data = response.json()
         features = data.get("features", [])
         if not features:
             break

         for f in features:
             props = f["properties"]
             all_cafes.append({
                 "id": props.get("place_id"),
                 "name": props.get("name"),
                 "lat": props["lat"],
                 "lon": props["lon"],
                 "address": props.get("formatted"),
                 "suburb": props.get("suburb"),
                 "phone": props.get("contact.phone"),
                 "website": props.get("contact.website"),
                 "categories": props.get("categories", []),
             })

         offset += len(features)
         if len(features) < 500:
             break
         time.sleep(1.2)  # rate limit

     print(f"Found {len(all_cafes)} cafes from Geoapify")
     return all_cafes

 def enrich_with_google(cafes):
     print("Enriching with Google Places...")
     enriched = []

     for cafe in tqdm(cafes):
         if not GOOGLE_KEY:
             enriched.append(cafe)
             continue

         # Simple text search
         search_url = "https://maps.googleapis.com/maps/api/place/textsearch/json"
         params = {
             "query": f"{cafe['name']} {cafe.get('address', '')}",
             "key": GOOGLE_KEY
         }
         try:
             r = requests.get(search_url, params=params, timeout=10)
             data = r.json()
             if data.get("results"):
                 place = data["results"][0]
                 place_id = place["place_id"]

                 # Get details
                 details_url = "https://maps.googleapis.com/maps/api/place/details/json"
                 details_params = {
                     "place_id": place_id,
                     "fields": "name,formatted_phone_number,website,opening_hours,photos,rating,reviews",
                     "key": GOOGLE_KEY
                 }
                 details_r = requests.get(details_url, params=details_params, timeout=10)
                 details = details_r.json().get("result", {})

                 cafe.update({
                     "phone": details.get("formatted_phone_number"),
                     "website": details.get("website"),
                     "rating": details.get("rating"),
                     "opening_hours": details.get("opening_hours", {}).get("weekday_text"),
                     "google_place_id": place_id,
                 })

                 # Basic review attribute extraction (very simple version)
                 reviews = details.get("reviews", [])
                 if reviews:
                     review_text = " ".join([r.get("text", "") for r in reviews[:5]]).lower()
                     cafe["wifi_quality"] = "good" if any(w in review_text for w in ["wifi", "wi-fi", "internet"]) else "unknown"
                     cafe["power_outlets"] = "some" if any(p in review_text for p in ["outlet", "power", "plug", "charge"]) else "unknown"
                     cafe["cozy"] = any(c in review_text for c in ["cozy", "cosy", "warm", "comfortable"])

         except Exception as e:
             print("Google error for", cafe.get("name"), str(e))

         enriched.append(cafe)
         time.sleep(0.8)  # respect Google rate limits

     return enriched

 if __name__ == "__main__":
     cafes = get_cafes_geoapify()
     enriched_cafes = enrich_with_google(cafes)

     os.makedirs("data", exist_ok=True)
     with open("data/cafes_raw.json", "w", encoding="utf-8") as f:
         json.dump(enriched_cafes, f, indent=2, ensure_ascii=False)

     print(f"\nSaved {len(enriched_cafes)} cafes to data/cafes_raw.json")
     print("Next step: Run review analysis + deduplication script")
