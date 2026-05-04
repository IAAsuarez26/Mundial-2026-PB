import pandas as pd
import json

xl = pd.ExcelFile('WCup_2026.xlsx')
df_wc = xl.parse('World Cup')
df_wc.to_csv('world_cup_dump.csv', index=False)

df_groups = xl.parse('Groups')
df_groups.to_csv('groups_dump.csv', index=False)

df_matches = xl.parse('Matches')
df_matches.to_csv('matches_dump.csv', index=False)
