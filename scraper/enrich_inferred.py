"""
Infers boolean enrichment flags from cafe name, suburb, address, and description
for cafes that currently have null values.
No API needed — pure heuristic matching.
"""

import json
import re
import sys
import io
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

ROOT = Path(__file__).parent.parent
CAFES_FILE = ROOT / "public" / "cafes.json"


def text_of(cafe):
    parts = [
        cafe.get("name") or "",
        cafe.get("shortDescription") or "",
        cafe.get("address") or "",
        cafe.get("coffeeBrand") or "",
    ]
    return " ".join(parts).lower()


SPECIALTY_KEYWORDS = [
    "roastery", "roasters", "specialty", "speciality", "single origin",
    "filter coffee", "batch brew", "pour over", "v60", "chemex", "aeropress",
    "cold brew", "siphon", "allpress", "market lane", "seven seeds",
    "code black", "proud mary", "st ali", "patricia", "mecca", "dukes",
    "axil", "five senses", "wide open road", "brother baba budan",
    "sensory lab", "project forty nine", "streat", "ona coffee",
    "three thousand thieves", "coffee lab", "coffee science",
    "coffee roast", "micro roast",
]

MATCHA_KEYWORDS = ["matcha", "macha"]

PASTRY_KEYWORDS = [
    "bakery", "bake house", "bakehouse", "patisserie", "pâtisserie",
    "patissery", "cake shop", "cake studio", "cakery", "pastry",
    "croissant", "sourdough", "artisan bread", "boulangerie",
    "cannoli", "danish", "brioche",
]

BREAKFAST_KEYWORDS = [
    "breakfast", "brunch", "brekkie", "brekky", "eggs benedict",
    "all day brekky", "all-day breakfast", "big breakfast",
]

VEGAN_KEYWORDS = [
    "vegan", "plant based", "plant-based", "wholly plants",
    "herbivore", "green", "raw food",
]

OUTDOOR_KEYWORDS = [
    "rooftop", "garden cafe", "outdoor", "alfresco", "terrace",
    "courtyard", "parkside", "beachside", "waterfront", "riverside",
    "park cafe", "beach cafe", "poolside",
]

DOG_KEYWORDS = [
    "dog friendly", "dog-friendly", "pet friendly", "pet-friendly",
    "bring your dog", "dogs welcome", "paws",
]

WIFI_KEYWORDS = [
    "wifi", "wi-fi", "free wifi", "free wi-fi", "laptop friendly",
    "work-friendly", "co-working",
]

DECAF_KEYWORDS = ["decaf", "decaffeinated"]

FILTER_KEYWORDS = [
    "filter coffee", "pour over", "batch brew", "v60", "chemex",
    "aeropress", "siphon", "drip coffee", "cold brew",
]

PRICE_CHEAP_KEYWORDS = [
    "milk bar", "milkbar", "snack bar", "sandwich bar", "food court",
    "kiosk", "takeaway", "takeout",
]

PRICE_PRICEY_KEYWORDS = [
    "degustation", "fine dining", "hatted", "upscale", "premium",
]


def infer(cafe):
    t = text_of(cafe)
    updates = {}

    if cafe.get("specialtyCoffee") is None:
        updates["specialtyCoffee"] = any(kw in t for kw in SPECIALTY_KEYWORDS)

    if cafe.get("matcha") is None:
        updates["matcha"] = any(kw in t for kw in MATCHA_KEYWORDS)

    if cafe.get("pastries") is None:
        updates["pastries"] = any(kw in t for kw in PASTRY_KEYWORDS)

    if cafe.get("breakfastAllDay") is None:
        updates["breakfastAllDay"] = any(kw in t for kw in BREAKFAST_KEYWORDS)

    if cafe.get("veganOptions") is None:
        updates["veganOptions"] = any(kw in t for kw in VEGAN_KEYWORDS)

    if cafe.get("outdoorSeating") is None:
        updates["outdoorSeating"] = any(kw in t for kw in OUTDOOR_KEYWORDS)

    if cafe.get("dogFriendly") is None:
        updates["dogFriendly"] = any(kw in t for kw in DOG_KEYWORDS)

    if cafe.get("hasWifi") is None:
        updates["hasWifi"] = any(kw in t for kw in WIFI_KEYWORDS)

    if cafe.get("laptopFriendly") is None:
        if any(kw in t for kw in WIFI_KEYWORDS):
            updates["laptopFriendly"] = True

    if cafe.get("hasDecaf") is None:
        updates["hasDecaf"] = any(kw in t for kw in DECAF_KEYWORDS)

    if cafe.get("filterCoffee") is None:
        updates["filterCoffee"] = any(kw in t for kw in FILTER_KEYWORDS)

    if cafe.get("priceLevel") is None:
        if any(kw in t for kw in PRICE_CHEAP_KEYWORDS):
            updates["priceLevel"] = 1
        elif any(kw in t for kw in PRICE_PRICEY_KEYWORDS):
            updates["priceLevel"] = 3

    return updates


def main():
    cafes = json.loads(CAFES_FILE.read_text(encoding="utf-8"))
    total_updates = 0
    field_counts = {}

    for cafe in cafes:
        updates = infer(cafe)
        for k, v in updates.items():
            cafe[k] = v
            if v:  # only count truthy inferences
                field_counts[k] = field_counts.get(k, 0) + 1
                total_updates += 1

    print("Inferred flags set to True:")
    for k, n in sorted(field_counts.items(), key=lambda x: -x[1]):
        print(f"  {k}: {n}")

    print(f"\nTotal truthy inferences: {total_updates}")

    CAFES_FILE.write_text(json.dumps(cafes, indent=2, ensure_ascii=False), encoding="utf-8")
    print("Saved.")

    # Show updated coverage
    fields = ["specialtyCoffee", "matcha", "pastries", "breakfastAllDay",
              "veganOptions", "outdoorSeating", "dogFriendly", "hasWifi",
              "laptopFriendly", "hasDecaf", "filterCoffee", "priceLevel"]
    print("\nUpdated coverage (non-null %):")
    for f in fields:
        filled = sum(1 for c in cafes if c.get(f) is not None)
        print(f"  {f}: {filled}/{len(cafes)} ({100*filled//len(cafes)}%)")


if __name__ == "__main__":
    main()
