import openpyxl
from datetime import datetime

wb = openpyxl.load_workbook(r'ListadoParticipantesQuiniela.xlsx')
ws = wb['Hoja1']

rows = []
errors = []
for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
    empresa, nombres, cedula, ingreso, correo = row
    # Skip empty rows
    if not empresa and not nombres:
        continue
    
    # Parse date - format is dd/mm/yy
    try:
        d = datetime.strptime(str(ingreso).strip(), '%d/%m/%y')
        fecha = d.strftime('%Y-%m-%d')
    except Exception as e:
        errors.append(f'Row {i+2}: date parse error for "{ingreso}": {e}')
        fecha = None
    
    # Escape single quotes in strings
    empresa_s = str(empresa).strip().replace("'", "''") if empresa else ''
    nombres_s = str(nombres).strip().replace("'", "''") if nombres else ''
    correo_s = str(correo).strip().replace("'", "''") if correo else ''
    
    rows.append((empresa_s, nombres_s, cedula, fecha, correo_s))

print(f'Valid rows: {len(rows)}')
if errors:
    print(f'Errors:')
    for e in errors:
        print(f'  {e}')

# Build SQL
insert_lines = []
for r in rows:
    empresa_s, nombres_s, cedula, fecha, correo_s = r
    if fecha:
        correo_val = f"'{correo_s}'" if correo_s else 'NULL'
        insert_lines.append(
            f"('{empresa_s}', '{nombres_s}', {cedula}, '{fecha}', {correo_val})"
        )

sql = "INSERT INTO listadoparticipantes (empresa, nombres, cedula, ingreso, correo) VALUES\n"
sql += ",\n".join(insert_lines)
sql += "\nON CONFLICT DO NOTHING;"

with open('insert_participants.sql', 'w', encoding='utf-8') as f:
    f.write(sql)

print(f'\nSQL generated with {len(insert_lines)} rows -> insert_participants.sql')
print('\nFirst 3 values:')
for line in insert_lines[:3]:
    print(' ', line)
