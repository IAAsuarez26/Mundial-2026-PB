import pandas as pd

try:
    df = pd.read_excel('Formato Consolidado-Pronosticos Mundial.xlsx', nrows=20)
    print("--- HEAD ---")
    print(df.head())
    print("\n--- COLUMNS ---")
    print(df.columns.tolist())
    
    # Try to see more sheets if any
    xl = pd.ExcelFile('Formato Consolidado-Pronosticos Mundial.xlsx')
    print("\n--- SHEETS ---")
    print(xl.sheet_names)
    
except Exception as e:
    print(f"Error: {e}")
