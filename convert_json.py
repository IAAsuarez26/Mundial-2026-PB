import pandas as pd
import json
import math
import sys
import os
from datetime import datetime, timedelta

# Reconfigure stdout to use UTF-8
sys.stdout.reconfigure(encoding='utf-8')

# Load Excel sheets directly
xl = pd.ExcelFile('WCup_2026.xlsx')
df_groups = xl.parse('Groups')
df_matches = xl.parse('Matches')
df_tz = xl.parse('TimeZone')

# Parse Groups
groups = {}
current_group = None

for _, row in df_groups.iterrows():
    val = row['Unnamed: 3'] if 'Unnamed: 3' in df_groups.columns else None
    if pd.notna(val) and len(str(val)) == 1 and str(val).isalpha():
        current_group = val
        groups[current_group] = []
    elif pd.notna(val) and current_group and str(val) != "Name" and str(val) != "False":
        team_id = row['Unnamed: 1'] if 'Unnamed: 1' in df_groups.columns else None
        team_name = val
        if pd.notna(team_id):
            groups[current_group].append({
                "id": str(team_id),
                "name": str(team_name)
            })

# Parse Venue Timezones
venue_tzs = {}
for _, row in df_tz.iterrows():
    v_no = row['Unnamed: 11'] if 'Unnamed: 11' in df_tz.columns else None
    v_name = row['Unnamed: 12'] if 'Unnamed: 12' in df_tz.columns else None
    tz_str = row['Unnamed: 16'] if 'Unnamed: 16' in df_tz.columns else None
    
    if pd.notna(v_no) and pd.notna(v_name):
        offset = 0
        if pd.notna(tz_str):
            tz_str_clean = str(tz_str).replace(' ', '').upper()
            if tz_str_clean == 'UTC':
                offset = 0
            elif tz_str_clean.startswith('UTC-'):
                offset = -int(tz_str_clean[4:])
            elif tz_str_clean.startswith('UTC+'):
                offset = int(tz_str_clean[4:])
        venue_tzs[str(v_name).strip()] = offset

# Parse Matches
matches = []

for _, row in df_matches.iterrows():
    match_no = row['Matches']
    if pd.notna(match_no) and str(match_no).isdigit():
        team1 = str(row['Unnamed: 2']) if pd.notna(row['Unnamed: 2']) else ""
        team2 = str(row['Unnamed: 3']) if pd.notna(row['Unnamed: 3']) else ""
        date_host = row['Unnamed: 4'] if pd.notna(row['Unnamed: 4']) else ""
        venue = str(row['Unnamed: 7']).strip() if pd.notna(row['Unnamed: 7']) else ""
        
        if str(date_host).strip() != "" and str(date_host).strip() != "None":
            if isinstance(date_host, datetime):
                dt_host = date_host
            else:
                dt_host = datetime.strptime(str(date_host).strip(), '%Y-%m-%d %H:%M:%S')
            # Treat Excel date as Caracas time (UTC-4). Convert to UTC by adding 4 hours.
            dt_utc = dt_host + timedelta(hours=4)
            date_utc_str = dt_utc.strftime('%Y-%m-%d %H:%M:%S')
        else:
            date_utc_str = ""
            
        matches.append({
            "id": int(match_no),
            "team1": team1,
            "team2": team2,
            "date": date_utc_str,
            "venue": venue
        })

output = {
    "groups": groups,
    "matches": matches
}

# Write to root data.json
with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, indent=2, ensure_ascii=False)
print("Created root data.json successfully")

# Write to quiniela-app/src/data.json
app_data_path = os.path.join('quiniela-app', 'src', 'data.json')
if os.path.exists(os.path.dirname(app_data_path)):
    with open(app_data_path, 'w', encoding='utf-8') as f:
        json.dump(output, f, indent=2, ensure_ascii=False)
    print("Created quiniela-app/src/data.json successfully")
