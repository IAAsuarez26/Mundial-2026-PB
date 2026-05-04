import pandas as pd

try:
    df = pd.read_excel('Formato Consolidado-Pronosticos Mundial.xlsx', sheet_name='Qatar 2022', nrows=10)
    print(df.to_string())
except Exception as e:
    print(f"Error: {e}")
