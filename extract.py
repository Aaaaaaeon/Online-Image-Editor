import json
from bs4 import BeautifulSoup
import re

with open(r"c:\Users\Jessica\Downloads\eXPerience® 8 embroidery software - Compare Levels - eXPerience embroidery software blog.html", "r", encoding="utf-8") as f:
    html = f.read()

soup = BeautifulSoup(html, 'html.parser')

tables = soup.find_all('table')
table = tables[0] # assuming the first one

data = []
current_cat = None
cat_id_counter = 0

for tr in table.find_all('tr'):
    ths = tr.find_all('th')
    if ths:
        continue # skip header
    tds = tr.find_all('td')
    if not tds:
        continue
    
    # Check if category row
    # A category row might have strong text in first td, or empty next tds
    col1 = tds[0]
    has_strong = col1.find('strong') is not None
    
    text = col1.get_text(strip=True)
    if not text:
        continue
    
    # Check if the other tds are empty
    is_cat = False
    if len(tds) >= 4:
        # Check if td 1, 2, 3 have icons
        has_icons = any(td.find('svg') for td in tds[1:])
        if not has_icons and has_strong:
            # Also double check text length or presence of strong
            is_cat = True
        elif not sum(1 for td in tds[1:] if td.find('svg') or td.get_text(strip=True)) > 0:
            is_cat = True
            
    elif len(tds) == 1 or (len(tds) > 1 and not any(td.get_text(strip=True) or td.find('svg') for td in tds[1:])):
        is_cat = True
        
    if is_cat:
        cat_id = f"cat_{cat_id_counter}"
        cat_id_counter += 1
        current_cat = {"cat": cat_id, "label": text, "features": []}
        data.append(current_cat)
        continue
        
    if current_cat is None:
        # Create a default category just in case
        current_cat = {"cat": "misc", "label": "Miscellaneous", "features": []}
        data.append(current_cat)
        
    # parse feature
    pilot = tds[1].find('svg') is not None if len(tds) > 1 else False
    operator = tds[2].find('svg') is not None if len(tds) > 2 else False
    avance = tds[3].find('svg') is not None if len(tds) > 3 else False
    
    current_cat["features"].append({
        "name": text,
        "pilot": pilot,
        "operator": operator,
        "avance": avance
    })

print(json.dumps(data, indent=2, ensure_ascii=False))
