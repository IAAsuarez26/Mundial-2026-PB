import pandas as pd
import json
import sys

# Change default encoding to utf-8 for print
sys.stdout.reconfigure(encoding='utf-8')

xl = pd.ExcelFile('WCup_2026.xlsx')

print("Reading Matches:")
df_matches = xl.parse('Matches')
print(df_matches.head())

print("\nReading Groups:")
df_groups = xl.parse('Groups')
print(df_groups.head())

print("\nReading World Cup:")
df_wc = xl.parse('World Cup')
print(df_wc.head(15))

