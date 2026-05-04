import pandas as pd
import json
import math

# Parse Groups
df_groups = pd.read_csv('groups_dump.csv')
groups = {}
current_group = None

for _, row in df_groups.iterrows():
    val = row['Unnamed: 3']
    if pd.notna(val) and len(str(val)) == 1 and str(val).isalpha():
        current_group = val
        groups[current_group] = []
    elif pd.notna(val) and current_group and str(val) != "Name" and str(val) != "False":
        team_id = row['Unnamed: 1']
        team_name = val
        if pd.notna(team_id):
            groups[current_group].append({
                "id": str(team_id),
                "name": str(team_name)
            })

# Parse Matches
df_matches = pd.read_csv('matches_dump.csv')
matches = []

for _, row in df_matches.iterrows():
    match_no = row['Matches']
    if pd.notna(match_no) and str(match_no).isdigit():
        team1 = str(row['Unnamed: 2']) if pd.notna(row['Unnamed: 2']) else ""
        team2 = str(row['Unnamed: 3']) if pd.notna(row['Unnamed: 3']) else ""
        date = str(row['Unnamed: 4']) if pd.notna(row['Unnamed: 4']) else ""
        venue = str(row['Unnamed: 7']) if pd.notna(row['Unnamed: 7']) else ""
        
        matches.append({
            "id": int(match_no),
            "team1": team1,
            "team2": team2,
            "date": date,
            "venue": venue
        })

output = {
    "groups": groups,
    "matches": matches
}

with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print("Created data.json successfully")
