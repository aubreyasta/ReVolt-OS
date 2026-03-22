"""
02_vector_search_setup.py — Atlas Vector Search Index + Similarity Queries
==========================================================================
This is the SECOND script Person 1 runs. It does two things:
  1. Creates an Atlas Vector Search index on the behavior_embedding field
  2. Provides a ready-to-use similarity search function

WHAT IS ATLAS VECTOR SEARCH?
  Normal database queries: "Give me all batteries where chemistry = 'LFP'"
  Vector search queries:   "Give me batteries most SIMILAR to this one"

  It works by comparing the 256-number "behavior fingerprint" (embedding)
  of a query battery against every battery in the database, and returning
  the closest matches. Think of it like Shazam for batteries — it matches
  by behavior pattern, not by name.

HOW DO I CREATE THE INDEX?
  ⚠️  IMPORTANT: Atlas Vector Search indexes CANNOT be created via pymongo.
  You must create them in the Atlas UI or via the Atlas Admin API.
  This script gives you BOTH options — the manual steps AND the API call.

Run: python 02_vector_search_setup.py
"""

import os
import json
import numpy as np
import certifi
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
DB_NAME = os.getenv("DB_NAME", "revolt_db")
COLLECTION_NAME = "battery_twins"
EMBEDDING_DIMENSIONS = 256
INDEX_NAME = "battery_behavior_index"


def get_collection():
    """Connect and return the battery_twins collection."""
    client = MongoClient(MONGODB_URI, tlsCAFile=certifi.where())
    client.admin.command("ping")
    print("✓ Connected to MongoDB Atlas")
    return client[DB_NAME][COLLECTION_NAME]


def print_manual_index_instructions():
    """
    Print step-by-step instructions for creating the Vector Search index
    in the Atlas UI. This is the EASIEST method for hackathon speed.
    """
    
    index_definition = {
        "fields": [
            {
                "type": "vector",
                "path": "behavior_embedding",
                "numDimensions": EMBEDDING_DIMENSIONS,
                "similarity": "cosine",
            },
            {
                "type": "filter",
                "path": "status",
            },
            {
                "type": "filter",
                "path": "manufacturer.chemistry",
            },
            {
                "type": "filter",
                "path": "health_grade",
            },
        ]
    }
    
    print("\n📋 MANUAL METHOD: Create Vector Search Index in Atlas UI")
    print("=" * 60)
    print("""
Steps:
  1. Go to https://cloud.mongodb.com
  2. Click your cluster → "Atlas Search" tab
  3. Click "Create Search Index"
  4. Choose "Atlas Vector Search" → "JSON Editor"
  5. Select database: revolt_db
  6. Select collection: battery_twins
  7. Index name: battery_behavior_index
  8. Paste this JSON definition:
""")
    print(json.dumps(index_definition, indent=2))
    print("""
  9. Click "Create Search Index"
  10. Wait ~1 minute for it to build (status changes to "Active")

WHY THESE FIELDS?
  - behavior_embedding (vector): The main field we search by similarity.
    Powers TWO features:
      1. "Smart Match" — find batteries similar to a known battery
      2. "Mystery ID" — identify an unknown battery from a voltage trace
  - status (filter): So we can limit results to "Certified" batteries only  
  - manufacturer.chemistry (filter): So buyers can filter by chemistry type
  - health_grade (filter): So buyers can set minimum grade requirements
  
  Filter fields let us do "pre-filtering" BEFORE the vector search runs.
  Example: "Find batteries similar to this one, but ONLY among LFP packs"
""")
    
    return index_definition


def create_index_via_api():
    """
    Alternative: Create the index using the Atlas Admin API.
    This requires an Atlas API key (Public + Private key pair).
    
    For hackathon speed, the manual UI method above is usually faster.
    But if you want to automate everything, here's how.
    """
    
    print("\n🔧 API METHOD (Optional — requires Atlas API keys)")
    print("=" * 60)
    print("""
If you prefer automation, set these environment variables:
  ATLAS_PUBLIC_KEY=your_public_key
  ATLAS_PRIVATE_KEY=your_private_key
  ATLAS_GROUP_ID=your_project_id
  ATLAS_CLUSTER_NAME=revolt-exchange

Then uncomment and run the code below.
For a 24-hour hackathon, the UI method is usually faster.
""")
    
    # Uncomment below if you have Atlas API keys:
    #
    # import requests
    # from requests.auth import HTTPDigestAuth
    #
    # public_key = os.getenv("ATLAS_PUBLIC_KEY")
    # private_key = os.getenv("ATLAS_PRIVATE_KEY")
    # group_id = os.getenv("ATLAS_GROUP_ID")
    # cluster_name = os.getenv("ATLAS_CLUSTER_NAME", "revolt-exchange")
    #
    # url = f"https://cloud.mongodb.com/api/atlas/v2/groups/{group_id}/clusters/{cluster_name}/search/indexes"
    #
    # payload = {
    #     "name": INDEX_NAME,
    #     "database": DB_NAME,
    #     "collectionName": COLLECTION_NAME,
    #     "type": "vectorSearch",
    #     "definition": {
    #         "fields": [
    #             {"type": "vector", "path": "behavior_embedding",
    #              "numDimensions": EMBEDDING_DIMENSIONS, "similarity": "cosine"},
    #             {"type": "filter", "path": "status"},
    #             {"type": "filter", "path": "manufacturer.chemistry"},
    #             {"type": "filter", "path": "health_grade"},
    #         ]
    #     }
    # }
    #
    # response = requests.post(
    #     url,
    #     json=payload,
    #     auth=HTTPDigestAuth(public_key, private_key),
    #     headers={"Content-Type": "application/json", "Accept": "application/vnd.atlas.2024-05-30+json"},
    # )
    # print(f"Response: {response.status_code} — {response.json()}")


def search_similar_batteries(collection, query_embedding, num_results=3, filters=None):
    """
    Find batteries with similar behavior to the query embedding.
    
    This is THE KEY FEATURE for the marketplace — it powers queries like:
      "I need a battery that handles high heat like the ones in Arizona"
      "Find me something similar to this Tesla pack but cheaper"
    
    HOW IT WORKS:
      1. We send a query vector (the "behavior fingerprint" we're looking for)
      2. MongoDB compares it against every battery's embedding using cosine similarity
      3. It returns the top N most similar batteries, ranked by similarity score
      
    Args:
        collection: The MongoDB collection to search
        query_embedding: A list of 256 floats (the behavior to match)
        num_results: How many results to return (default 3)
        filters: Optional dict to pre-filter (e.g. {"status": "Certified"})
    
    Returns:
        List of matching battery documents with similarity scores
    """
    
    # Build the $vectorSearch aggregation pipeline
    # This is a MongoDB "aggregation pipeline" — a series of processing steps
    # that transform and filter data. Think of it like a recipe:
    #   Step 1 ($vectorSearch): Find the most similar batteries
    #   Step 2 ($project): Choose which fields to include in results
    
    vector_search_stage = {
        "$vectorSearch": {
            "index": INDEX_NAME,              # The index we created above
            "path": "behavior_embedding",     # Which field contains the vectors
            "queryVector": query_embedding,   # What we're searching for
            "numCandidates": num_results * 10,  # Check 10x more than needed for accuracy
            "limit": num_results,             # Only return this many results
        }
    }
    
    # Add pre-filters if provided
    # Pre-filtering happens BEFORE the vector search, making it faster
    if filters:
        vector_search_stage["$vectorSearch"]["filter"] = filters
    
    pipeline = [
        vector_search_stage,
        {
            # $project controls which fields appear in results
            # 1 = include, 0 = exclude
            "$project": {
                "battery_id": 1,
                "manufacturer": 1,
                "health_grade": 1,
                "health_details.state_of_health_pct": 1,
                "health_details.peak_temp_recorded_c": 1,
                "provenance.climate_zone": 1,
                "listing.title": 1,
                "listing.asking_price_usd": 1,
                "telemetry_summary": 1,
                # This special field adds the similarity score (0.0 to 1.0)
                "similarity_score": {"$meta": "vectorSearchScore"},
            }
        },
    ]
    
    results = list(collection.aggregate(pipeline))
    return results


def demo_similarity_search(collection):
    """
    Run a demo search to verify everything works.
    
    Scenario: A buyer says "I need a battery for a solar farm in Arizona.
    It needs to handle high heat." We find the battery in our database
    that was ACTUALLY used in Arizona (RVX-2024-00002) and use its
    embedding as the query to find similar batteries.
    """
    
    print("\n🔍 Demo: Similarity Search")
    print("-" * 40)
    print('Scenario: "Find batteries similar to our Arizona-tested BYD pack"')
    
    # Get the Arizona battery's embedding to use as our query
    arizona_battery = collection.find_one({"battery_id": "RVX-2024-00002"})
    
    if not arizona_battery:
        print("⚠ Sample data not found. Run 01_schema_and_seed.py first!")
        return
    
    query_embedding = arizona_battery["behavior_embedding"]
    
    # Search for similar batteries (excluding the query battery itself)
    print("\nSearching for similar batteries...")
    print("(Note: This requires the Vector Search index to be active.)")
    print("(If you get an error, create the index using the instructions above.)\n")
    
    try:
        results = search_similar_batteries(
            collection,
            query_embedding=query_embedding,
            num_results=5,
            # Optional: only search among certified batteries
            # filters={"status": "Certified"},
        )
        
        if not results:
            print("⚠ No results — the Vector Search index may still be building.")
            print("  Check the Atlas UI: it takes ~1 minute to activate.")
            return
        
        print(f"Found {len(results)} similar batteries:\n")
        for i, battery in enumerate(results, 1):
            score = battery.get("similarity_score", 0)
            bid = battery.get("battery_id", "?")
            title = battery.get("listing", {}).get("title", "No title")
            grade = battery.get("health_grade", "?")
            price = battery.get("listing", {}).get("asking_price_usd", 0)
            climate = battery.get("provenance", {}).get("climate_zone", "Unknown")
            
            print(f"  #{i} [{score:.3f} similarity] {bid}")
            print(f"     Grade: {grade} | Price: ${price:,.0f}")
            print(f"     Climate: {climate}")
            print(f"     {title}")
            print()
        
    except Exception as e:
        error_msg = str(e)
        if "index not found" in error_msg.lower() or "vectorSearch" in error_msg.lower():
            print("⚠ Vector Search index not yet created!")
            print("  Follow the manual instructions above to create it in the Atlas UI.")
        else:
            print(f"⚠ Error: {e}")


# ============================================
# MAIN
# ============================================
if __name__ == "__main__":
    print("\n🔋 ReVolt Exchange — Sprint 1: Vector Search Setup")
    print("=" * 55)
    
    # Step 1: Print index creation instructions
    print_manual_index_instructions()
    
    # Step 2: Show API alternative
    create_index_via_api()
    
    # Step 3: Connect and run demo search
    print("\n[Testing] Running demo similarity search...")
    collection = get_collection()
    demo_similarity_search(collection)
    
    print("\n" + "=" * 55)
    print("✓ Sprint 1 Step 2 COMPLETE!")
    print("\nNext: Run 03_api_endpoints.py to start the API server")
